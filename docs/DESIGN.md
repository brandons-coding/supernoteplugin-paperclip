# Paperclip -- design

How it works and why, plus what I learned about the Nomad building it. Target device: Supernote Nomad (A6 X2), firmware 3.31.45.

## Words used here

| Word | Meaning |
|---|---|
| label | the one word on a page, lowercase |
| paperclip | all pages in a notebook that share a label |
| sticker | the paperclip drawing placed in the upper right of a labelled page |
| float | the small Android overlay window shown over the page |
| grid | the full-screen view of page previews for one label |

## Goals

- Label a page with a word you already wrote, in two or three taps, without a keyboard.
- See and jump to the other pages with the same label from a small window over the page.
- Look and feel like part of the Nomad, not like an app bolted on.
- Labels travel with their pages when pages are moved.

Not in v1: keyboard entry of labels, more than one label per page, grouping across notebooks, PDF/EPUB documents, starting anything from a pen hold (there is no SDK hook for it), network access.

Never: interfere with writing, or freeze the device. Touch a stroke or any element that isn't ours. End up, after normal use, with a sticker on an unlabelled page or a label on a page with no sticker.

## Entry points

Three buttons. All are registered for `NOTE`.

1. **Toolbar paperclip** opens the float for the current page. Headless (`showType: 0`), so no full-screen view flashes up first.
2. **Lasso toolbar, "Paperclip label"**, for strokes and text boxes (`editDataTypes` 0 and 3). Reads the lassoed words and applies them as the label.
3. **Lasso toolbar, "Paperclip menu"**, for pictures (type 2). Opens the same float as the toolbar button. This is how the sticker "opens" the menu, since the SDK can't report a tap on a page element. It shows for any lassoed picture, not only ours; the float describes the page either way.

## The float, by state

| Page state | Float shows |
|---|---|
| No labels in the notebook | Add label |
| No label on this page, labels exist | `N paperclips` (a list of every label; tap one to put it on this page), Add label |
| Label on this page | the label as the title, `N pages` (opens the grid), Remove |

Every state also has Close. The float takes no pen input, so it needs a way out of its own as well as the toolbar toggle. Pressing the toolbar paperclip while it's up closes it. A finished action closes it. Turning the page closes it: the SDK has no page-change event, so the plugin polls the page number about every 0.6 s while the float is up.

The float holds text rows only. All previews live in the grid, a normal full-screen plugin view, which keeps the native module small. A `?` in the title of the unlabelled float shows a six-second how-to, then puts the float back.

## Applying a label

1. Read the lassoed elements. Typed text boxes already carry their words; strokes go through the SDK's handwriting recognition. Lowercase, collapse whitespace.
2. Nothing recognised: say so, change nothing. More than 35 characters: refuse, since that's a lasso that caught a sentence.
3. Page has no label: store the keyword and place the sticker. If the label already exists in the notebook the page joins it, otherwise it's created.
4. Page has a different label: ask whether to replace. Replace swaps the keyword and leaves the sticker, which marks "has a label" and not which one.
5. Same label as now: say so, change nothing.

If placing the sticker fails, the keyword is rolled back so the two don't drift.

Remove deletes the page's keyword and its sticker.

## When the label and sticker drift apart

Native features can break the pairing: deleting the sticker by hand, editing the `clip:` keyword in Supernote's own keyword list, lasso-copying the sticker onto another page. The rule is **never fix anything silently, only on a user action.** When the float opens it checks the current page only, its keywords and whether our sticker is on it.

- Label but no sticker: the float shows the label as normal plus **Put sticker back**.
- Sticker but no label: **Remove sticker** appears next to Add label.
- The notebook-wide scan reads keywords only, never elements.

## How it's built

- **Labels are page keywords**, stored as `clip:<label>`. Keywords without the prefix are the user's and are ignored. Side effect I like: labels show up in the native keyword search.
- **No label registry.** The set of labels in a notebook is whatever the `clip:` keywords say. Nothing separate to fall out of sync, and a label disappears when its last page loses it.
- **The float is a native overlay** (`WindowManager`, `TYPE_APPLICATION_OVERLAY`, not focusable, so key and pen focus stay on the note). JS decides what every row means; the native side draws and reports taps. The Close row is handled natively so it works even when PluginHost has suspended JS.
- **The sticker is built directly:** `createElement` for a picture, set `picture.picturePath` and `picture.rect`, `insertPageElements`. 84x98 px, 40 px from the right edge and 95 from the top of the 1404x1872 page. The host only takes a picture path on disk, so the PNG is embedded as base64 (`scripts/embed-sticker.js`) and written into the plugin dir.
- **Our sticker is recognised by size** (84x98 within 2 px), not by path or uuid, because the host rewrites `picturePath` and hands out new uuids on every read. A user picture of exactly that size would be taken for ours.
- **State lives in module scope.** JS survives the plugin view closing, and button handlers and float taps arrive with no view mounted. The notebook is rescanned each time the float opens.
- **Side effects go through `Deps`** (`actions.ts`), which is why the action logic runs under Jest against a fake notebook.

## What I found on the device (3.31.45)

I built a throwaway probe plugin first to find these out.

| Thing | Result |
|---|---|
| Keywords: `insertKeyWord`, `getKeyWords`, `deleteKeyWord(path, page, index)` | Work. Delete takes an index. Need FILE:WRITE. Indexes are per page, from 1, though the SDK's own doc comment says 0. `page` is 0-based |
| One `getKeyWords` call for the whole notebook | 43 to 99 ms for 3 to 8 pages |
| A `clip:` keyword | Follows its page when pages are moved, copied and pasted, or copied from manage pages. Sits next to the user's own keywords |
| Floating overlay | Works, stays over the page after the plugin view closes |
| Module-scope JS after `closePluginView` | Keeps running; headless button handlers fire; float taps reach JS |
| Pen through the float | Strokes land on the page under it, and writing over the float draws on the page. It never blocks the pen |
| `recognizeElements(els, fullPageSize)` | "Hello" from 7 strokes, 604 ms. Pass the full page size, not the lasso rect |
| `generateNotePng({times: 1, type: 1})` | 468x624 PNG, 223-326 ms per page, loads in `<Image file://...>` |
| `createElement` + `insertPageElements` for a picture | Lands exactly on the rect. `insertImage` lands in the centre with no position argument, and `getLastElement` afterwards returns a stroke, not the picture |
| `deletePageElements` | Works |
| Elements from the host | Plain objects. `el.recycle()` doesn't exist; use `PluginCommAPI.recycleElement(uuid)` |
| `getElements` | Reads the saved file, not the live page, so `saveCurrentNote` first. A save also ends any lasso, so read the lasso before it |
| `requestPermission` | Can answer "granted" and the next read still fails with 1503. Ask `hasPermission` again afterwards |
| "Allow this time only" | Lapses when the plugin closes, so check on every use |

Still open: what happens after a firmware update. Nothing here can know until one ships.

## Look and feel

Matched to `reference/native-menu.png`, a screenshot of the Nomad's own menu (mirrored to a browser, so close but not pixel exact):

- White background, no colour, no shadow, a thin black outline on the panel edge.
- A title row with a heavier rule underneath, then rows separated by hairlines.
- Each row an outline icon (thick stroke, round caps) then plain regular sans text, left aligned, generous row height.
- No boxes around items, no filled buttons. Large touch targets.
- E-ink: no animation, no spinners, no pressed states, no transitions. Animation shows up as smear.

Icons are drawn as paths in code, and the whole float is built in code rather than from layout XML, because PluginHost loads our APK and our R ids aren't guaranteed to resolve in there.

## Constraints

- React Native 0.79.2, exactly: the host runtime is locked to it. `sn-plugin-lib` 0.2.3 (the template's default 0.1.65 is older). TypeScript.
- One native Android module, listed in `PluginConfig.json` under `reactPackages`. `buildPlugin.sh` finds `PaperclipPackage` through the `add(PaperclipPackage())` line in `MainApplication.kt`.
- Permissions: `FILE:READ` and `FILE:WRITE`. Declare no more than a real call site needs.
- `pluginKey` equals the `registerComponent` name. Bump `versionCode` on every reinstall.
- Code comments say why, not what.
