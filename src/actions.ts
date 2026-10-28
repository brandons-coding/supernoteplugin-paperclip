// What every button press and float row does. Each side effect goes through
// Deps, so this runs under Jest against a fake notebook; main.ts hands in the
// SDK, the native float and the sticker code.
import {HELP_ID, PICK_PREFIX, specFor, type FloatSpec} from './floatSpec';
import {clearLabel, scanNotebook, setLabel, type KeywordApi} from './keywordStore';
import {floatStateFor, labelListState, planApply, type ApplyPlan, type FloatState, type Scan} from './scan';
import {Notice} from './notice';
import type {StickerSlot} from './stickers';

// Everything the grid needs, handed over from the scan the float already did,
// so the full-screen view never rescans or asks for permissions itself.
export type Grid = {path: string; label: string; pages: number[]; current: number};

export type Deps = {
  keywordApi: KeywordApi;
  sticker: {
    place(path: string, page: number): Promise<void>;
    find(path: string, page: number): Promise<StickerSlot | null>;
    // True only when a re-read finds no sticker left.
    remove(path: string, page: number): Promise<boolean>;
  };
  ui: {
    show(spec: FloatSpec): Promise<void>;
    hide(): Promise<void>;
    isShowing(): Promise<boolean>;
    openGrid(grid: Grid): Promise<void>;
  };
  sdk: {
    path(): Promise<string>;
    page(): Promise<number>;
    total(path: string): Promise<number>;
    lassoText(): Promise<string | null>;
    lassoHasSticker(): Promise<boolean>;
    // FILE:READ and FILE:WRITE. "This time only" lapses when the plugin
    // closes, so this runs at the start of every action.
    permit(): Promise<void>;
  };
  log(line: string): void;
  // Injected so tests can step the page watcher by hand.
  sleep(ms: number): Promise<void>;
};

export type Actions = ReturnType<typeof createActions>;

// The page a float was opened on, as it was then. Row taps act on this.
type Here = {path: string; page: number; scan: Scan; stickerOnPage: boolean};

// How often the page is checked while a float is up. Slow enough to cost
// nothing on e-ink, fast enough that the float is gone by the time the page
// has redrawn.
const WATCH_MS = 600;

// How long the how-to stays up before the float it replaced comes back.
const HELP_MS = 6000;
const HELP_TEXT = "Tap Add label, lasso a word, then pick 'Paperclip label' from the lasso menu";

type Replace = Extract<ApplyPlan, {kind: 'confirmReplace'}>;

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function createActions(deps: Deps) {
  const {keywordApi: api, sticker, ui, sdk, log, sleep} = deps;

  let here: Here | null = null;
  let pending: Replace | null = null;
  // E-ink taps land late and get repeated. A second tap while a write is in
  // flight would act on a scan that is already stale.
  let busy: string | null = null;
  // Identifies the help message on screen; anything that replaces the float
  // makes the pending restore a no-op.
  let helpToken: object | null = null;

  const show = async (state: FloatState) => {
    helpToken = null;
    await ui.show(specFor(state));
    void watchPage();
  };
  const say = (text: string) => show({kind: 'message', text});

  async function finish(result: string) {
    log(`[Result] ${result}`);
    pending = null;
    await ui.hide();
  }

  // There is no page-change event (event_pen_up is the only one), so poll
  // while a float is up and drop it when the user turns the page. One loop at
  // a time: a float re-shown between ticks is picked up by the running loop.
  let watching = false;
  async function watchPage() {
    if (watching) {
      return;
    }
    watching = true;
    try {
      for (;;) {
        await sleep(WATCH_MS);
        if (!(await ui.isShowing())) {
          return;
        }
        // An action in flight owns the float; its own result replaces it.
        if (busy || !here) {
          continue;
        }
        const [path, page] = [await sdk.path(), await sdk.page()];
        if (path !== here.path || page !== here.page) {
          log(`[Moved] page ${here.page} -> ${page}, float closed`);
          pending = null;
          await ui.hide();
          return;
        }
      }
    } catch (e) {
      // Most likely the user left the note, so the page can't be read. The
      // float would sit over whatever app is up with nothing left to close it.
      log(`[Watch] stopped: ${errorText(e)}`);
      pending = null;
      await ui.hide().catch(() => {});
    } finally {
      watching = false;
    }
  }

  async function guarded(name: string, fn: () => Promise<void>) {
    if (busy) {
      log(`[${name}] ignored, ${busy} still running`);
      return;
    }
    busy = name;
    const t0 = Date.now();
    try {
      await fn();
      log(`[${name}] done in ${Date.now() - t0} ms`);
    } catch (e) {
      const notice = e instanceof Notice;
      log(`[${name}] ERROR ${notice ? e.detail : errorText(e)}`);
      try {
        await say(notice ? e.message : `Paperclip hit an error: ${errorText(e).slice(0, 120)}`);
      } catch (shown) {
        log(`[${name}] could not show the error either: ${errorText(shown)}`);
      }
    } finally {
      busy = null;
    }
  }

  // Callers run sdk.permit() first. look() saves the note (sticker.find needs
  // the saved file), and saving ends any lasso, so a lasso read has to come
  // between the permit and this.
  async function look(): Promise<Here> {
    const path = await sdk.path();
    const page = await sdk.page();
    const t0 = Date.now();
    const scan = await scanNotebook(api, path, await sdk.total(path));
    const stickerOnPage = (await sticker.find(path, page)) !== null;
    log(
      `[Scan] page ${page} of ${scan.total}, ${scan.labelPages.size} labels, ` +
        `failed [${scan.failedPages.join(',')}], sticker ${stickerOnPage}, ${Date.now() - t0} ms`,
    );
    return {path, page, scan, stickerOnPage};
  }

  async function showHere() {
    here = await look();
    pending = null;
    await show(floatStateFor(here.scan, here.page, here.stickerOnPage));
  }

  // There is no page-change event, so a float can outlive its page. Before a
  // write, check the user is still where the float was opened; if not, show
  // the float for where they are now instead of labelling a page they can't
  // see.
  async function stillHere(): Promise<Here | null> {
    await sdk.permit();
    const [path, page] = [await sdk.path(), await sdk.page()];
    if (here && here.path === path && here.page === page) {
      return here;
    }
    log(`[Moved] float was for page ${here?.page ?? '?'}, now on ${page}; reopening`);
    await showHere();
    return null;
  }

  async function label(at: Here, name: string, joinsExisting: boolean) {
    await setLabel(api, at.path, at.page, name);
    if (at.stickerOnPage) {
      return finish(`labelled page ${at.page} "${name}" (joins existing: ${joinsExisting}), sticker already there`);
    }
    try {
      await sticker.place(at.path, at.page);
    } catch (e) {
      // A label with no sticker is the drift we don't allow, so the keyword
      // goes too and the page is left as it was.
      log(`[Sticker] place failed on page ${at.page}: ${errorText(e)}; rolling back the label`);
      await clearLabel(api, at.path, at.page);
      await say(`Couldn't place the sticker, so "${name}" was not saved`);
      return;
    }
    await finish(`labelled page ${at.page} "${name}" (joins existing: ${joinsExisting}), sticker placed`);
  }

  async function follow(at: Here, plan: ApplyPlan) {
    log(`[Plan] ${JSON.stringify(plan)}`);
    switch (plan.kind) {
      case 'noText':
        return say("Couldn't read a word in the lasso");
      case 'tooLong':
        return say('That is more than a label. Lasso one or two words.');
      case 'same':
        return say(`This page is already "${plan.label}"`);
      case 'set':
        return label(at, plan.label, plan.joinsExisting);
      case 'confirmReplace':
        pending = plan;
        return show({kind: 'confirmReplace', oldLabel: plan.oldLabel, newLabel: plan.newLabel});
    }
  }

  async function removeStickerFrom(at: Here, what: string) {
    if (!at.stickerOnPage || (await sticker.remove(at.path, at.page))) {
      return finish(what);
    }
    log(`[Sticker] remove reported a sticker still on page ${at.page}`);
    await say('The sticker would not delete. Lasso it and delete it by hand.');
  }

  // Shows the how-to, then puts the float back unless the user closed it or
  // something else took its place in the meantime.
  async function showHelp() {
    const back = here && floatStateFor(here.scan, here.page, here.stickerOnPage);
    if (!back) {
      return;
    }
    await say(HELP_TEXT);
    const shown = {};
    helpToken = shown;
    void sleep(HELP_MS).then(async () => {
      if (helpToken !== shown || busy || !(await ui.isShowing())) {
        return;
      }
      // A toolbar press can land while isShowing is in flight.
      if (helpToken !== shown || busy) {
        return;
      }
      await show(back).catch(e => log(`[Help] could not restore the float: ${errorText(e)}`));
    });
  }

  async function tap(id: string) {
    if (id === HELP_ID) {
      return showHelp();
    }
    if (id === 'add' || id === 'cancel') {
      // Add closes the float so the user can lasso a word; nothing to undo.
      return finish(id === 'add' ? 'add: float closed for lasso' : 'replace cancelled');
    }
    if (id === 'labels') {
      if (here) {
        return show(labelListState(here.scan));
      }
      await sdk.permit();
      return showHere();
    }
    if (id === 'pages') {
      const name = here?.scan.pageLabel.get(here.page);
      if (!here || name === undefined) {
        await sdk.permit();
        return showHere();
      }
      await ui.hide();
      const grid = {path: here.path, label: name, pages: here.scan.labelPages.get(name) ?? [here.page], current: here.page};
      log(`[Grid] "${name}" pages [${grid.pages.join(',')}]`);
      return ui.openGrid(grid);
    }

    const at = await stillHere();
    if (!at) {
      return;
    }
    if (id.startsWith(PICK_PREFIX)) {
      return follow(at, planApply(at.scan, at.page, id.slice(PICK_PREFIX.length)));
    }
    switch (id) {
      case 'replace':
        if (!pending) {
          return finish('replace tapped with nothing pending');
        }
        // The sticker stays: it marks "has a label", not which one.
        await setLabel(api, at.path, at.page, pending.newLabel);
        return finish(`replaced "${pending.oldLabel}" with "${pending.newLabel}" on page ${at.page}`);
      case 'remove':
        await clearLabel(api, at.path, at.page);
        return removeStickerFrom(at, `removed label and sticker from page ${at.page}`);
      case 'restoreSticker':
        await sticker.place(at.path, at.page);
        return finish(`sticker put back on page ${at.page}`);
      case 'removeSticker':
        return removeStickerFrom(at, `stray sticker removed from page ${at.page}`);
      default:
        log(`[RowTap] no handler for "${id}"`);
    }
  }

  return {
    // The toolbar paperclip toggles: the float takes no pen input, so this
    // button is one of the two ways to get rid of it.
    openFloat: () =>
      guarded('openFloat', async () => {
        if (await ui.isShowing()) {
          return finish('toolbar pressed with float up: hidden');
        }
        await sdk.permit();
        await showHere();
      }),

    applyLabelFromLasso: () =>
      guarded('applyLabel', async () => {
        await sdk.permit();
        // Lasso first: look() saves the note, and a save ends the lasso. The
        // first device run read it second and got 904 "No lasso action".
        const t0 = Date.now();
        const text = await sdk.lassoText();
        log(`[Lasso] recognised ${JSON.stringify(text)} in ${Date.now() - t0} ms`);
        const at = (here = await look());
        await follow(at, planApply(at.scan, at.page, text));
      }),

    // "Paperclip menu" shows for any lassoed picture, not only ours. The float
    // describes the page either way, so this only logs which it was.
    openMenuFromSticker: () =>
      guarded('openMenu', async () => {
        await sdk.permit();
        // Before showHere, which saves the note and so ends the lasso.
        log(`[Lasso] picture is our sticker: ${await sdk.lassoHasSticker()}`);
        await showHere();
      }),

    onRowTap: (id: string) => guarded(`row ${id}`, () => tap(id)),
  };
}
