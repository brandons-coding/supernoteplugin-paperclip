// Thin wrapper over sn-plugin-lib. Most SDK calls are typed as
// Promise<Object | null | undefined> but resolve to an APIResponse, so the
// unwrapping and casting live here and callers just await a value or catch.
// stickers.ts builds its element calls on unwrap from here.
import {Element, PluginCommAPI, PluginFileAPI, PluginManager, PluginNoteAPI} from 'sn-plugin-lib';
import type {KeywordApi} from './keywordStore';
import {Notice} from './notice';
import type {PageKeyword} from './scan';
import {isOurSticker, type Size} from './stickerRule';

type APIResponse = {
  success?: boolean;
  result?: unknown;
  error?: {code?: number; message?: string} | null;
} | null | undefined;

export const PERM_READ = 'plugin.permission.FILE:READ';
export const PERM_WRITE = 'plugin.permission.FILE:WRITE';

export async function unwrap<T>(name: string, call: Promise<unknown>): Promise<T> {
  const res = (await call) as APIResponse;
  if (res == null) {
    throw new Error(`${name}: returned ${String(res)}`);
  }
  if (!res.success) {
    throw new Error(`${name}: code ${res.error?.code ?? '?'} ${res.error?.message ?? '(no message)'}`);
  }
  return res.result as T;
}

// For writes typed APIResponse<boolean>: success with result false is still
// a write that didn't happen.
async function unwrapWrite(name: string, call: Promise<unknown>): Promise<void> {
  if ((await unwrap<unknown>(name, call)) === false) {
    throw new Error(`${name}: returned false`);
  }
}

export const currentFilePath = () => unwrap<string>('getCurrentFilePath', PluginCommAPI.getCurrentFilePath());

export const currentPage = () => unwrap<number>('getCurrentPageNum', PluginCommAPI.getCurrentPageNum());

export const totalPages = (path: string) =>
  unwrap<number>('getNoteTotalPageNum', PluginFileAPI.getNoteTotalPageNum(path));

export const pageSize = (path: string, page: number) =>
  unwrap<Size>('getPageSize', PluginFileAPI.getPageSize(path, page));

export const saveCurrentNote = () => unwrapWrite('saveCurrentNote', PluginNoteAPI.saveCurrentNote());

export const lassoElements = async () =>
  (await unwrap<Element[] | null>('getLassoElements', PluginCommAPI.getLassoElements())) ?? [];

export const recognize = (els: Element[], size: Size) =>
  unwrap<string>('recognizeElements', PluginCommAPI.recognizeElements(els, size));

// Typed text boxes already carry their words; only strokes go through
// recognition. Full page size, not the lasso rect: others have hit "unknown
// pageSize" with the rect, and the full page read "Hello" from 7 strokes.
export async function lassoText(): Promise<string> {
  const els = await lassoElements();
  try {
    const typed = els
      .filter(el => el.type === Element.TYPE_TEXT)
      .map(el => el.textBox?.textContentFull ?? '');
    const strokes = els.filter(el => el.type === Element.TYPE_STROKE);
    const path = await currentFilePath();
    const written = strokes.length > 0 ? await recognize(strokes, await pageSize(path, await currentPage())) : '';
    return [...typed, written].join(' ');
  } finally {
    recycle(els);
  }
}

export async function lassoHasSticker(): Promise<boolean> {
  const els = await lassoElements();
  try {
    return els.some(isOurSticker);
  } finally {
    recycle(els);
  }
}

// times 1 gives a 468x624 PNG on the Nomad, type 1 a white background.
// 223 to 326 ms a page on the Nomad.
export const renderPage = (path: string, page: number, pngPath: string) =>
  unwrapWrite('generateNotePng', PluginFileAPI.generateNotePng({notePath: path, page, times: 1, pngPath, type: 1}));

export const jumpToPage = (page: number) => unwrapWrite('jumpToPage', PluginCommAPI.jumpToPage(page));

export const showView = () => PluginManager.showPluginView();

export const closeView = () => PluginManager.closePluginView();

// getElements reads the saved file, not the live page, so flush the open note
// first or a sticker placed a moment ago won't be in the list.
export async function pageElements(path: string, page: number): Promise<Element[]> {
  await saveCurrentNote();
  return (await unwrap<Element[] | null>('getElements', PluginFileAPI.getElements(page, path))) ?? [];
}

// The host hands back plain objects (transformElement only adds point
// accessors), so el.recycle() is undefined on the device. The static call by
// uuid is the one that exists. el.recycle() doesn't exist.
export function recycle(els: Array<Element | null | undefined>): void {
  els.forEach(el => el && PluginCommAPI.recycleElement(el.uuid));
}

let cachedDir: string | null = null;
// Can't change while the plugin is installed, so one native round trip.
export async function pluginDir(): Promise<string> {
  if (cachedDir) {
    return cachedDir;
  }
  const dir = await PluginManager.getPluginDirPath();
  if (!dir) {
    throw new Error(`getPluginDirPath returned ${String(dir)}`);
  }
  cachedDir = dir;
  return dir;
}

export const NOT_GRANTED = 'File access not granted yet. Allow it, then tap the paperclip again.';

// "Allow this time only" is dropped when the plugin closes, so check on every
// use instead of remembering a grant.
// The answer from requestPermission is not trusted on its own: on the very
// first press on the Nomad it let us through, and the next read still failed
// with 1503 "permission has not been requested". hasPermission is asked again
// afterwards, and only a 1 there counts. The detail logs both answers.
export async function ensurePermission(perm: string): Promise<void> {
  if ((await PluginManager.hasPermission(perm)) === 1) {
    return;
  }
  const answer = await PluginManager.requestPermission(perm);
  const after = await PluginManager.hasPermission(perm);
  if (after !== 1) {
    const name = perm.replace('plugin.permission.', '');
    throw new Notice(NOT_GRANTED, `${name}: requestPermission answered ${answer}, hasPermission after is ${after}`);
  }
}

// Rows are copied field by field so nothing else the host attaches leaks into
// the scan.
export const keywordApi: KeywordApi = {
  async getKeyWords(path, pages) {
    const rows = await unwrap<PageKeyword[] | null>('getKeyWords', PluginFileAPI.getKeyWords(path, pages));
    return (rows ?? []).map(({page, index, keyword}) => ({page, index, keyword}));
  },
  insertKeyWord: (path, page, keyword) => unwrapWrite('insertKeyWord', PluginFileAPI.insertKeyWord(path, page, keyword)),
  deleteKeyWord: (path, page, index) => unwrapWrite('deleteKeyWord', PluginFileAPI.deleteKeyWord(path, page, index)),
};
