// The sticker on the page: createElement(picture) with an exact rect, then
// insertPageElements. Inserting at the centre and moving it didn't work,
// because getLastElement returned a stroke instead of the picture.
import {Element, PluginCommAPI} from 'sn-plugin-lib';
import {requireNative} from './native';
import {pageElements, pageSize, pluginDir, recycle, unwrap} from './sdk';
import {isOurSticker, stickerRect} from './stickerRule';
import {STICKER_PNG_BASE64} from './stickerPng';

export {isOurSticker} from './stickerRule';

export type StickerSlot = {numInPage: number; layer: number};

// Layer 0 is the main layer, the one the user writes on by default.
const LAYER = 0;

// Written once per JS lifetime rather than once per install, so a new build
// with new art replaces the old file. 2.5 KB, so the cost is nothing.
let stickerFile: Promise<string> | null = null;

function stickerPath(): Promise<string> {
  stickerFile ??= (async () => {
    const path = `${await pluginDir()}/sticker.png`;
    await requireNative().writeBase64(path, STICKER_PNG_BASE64);
    return path;
  })().catch(e => {
    stickerFile = null;
    throw e;
  });
  return stickerFile;
}

export async function placeSticker(path: string, page: number): Promise<void> {
  const picturePath = await stickerPath();
  const rect = stickerRect(await pageSize(path, page));
  const el = await unwrap<Element>('createElement', PluginCommAPI.createElement(Element.TYPE_PICTURE));
  try {
    // The element carries its own page and layer; left at their defaults they
    // would disagree with the insert arguments.
    el.pageNum = page;
    el.layerNum = LAYER;
    el.picture = {picturePath, rect};
    await unwrap('insertPageElements', PluginCommAPI.insertPageElements([el], page, LAYER));
  } finally {
    recycle([el]);
  }
}

// Plain slots out, so no host-cached element outlives this call.
async function ourStickers(path: string, page: number): Promise<StickerSlot[]> {
  const els = await pageElements(path, page);
  try {
    return els.filter(isOurSticker).map(el => ({numInPage: el.numInPage, layer: el.layerNum}));
  } finally {
    recycle(els);
  }
}

export async function findSticker(path: string, page: number): Promise<StickerSlot | null> {
  return (await ourStickers(path, page))[0] ?? null;
}

// Every match goes, since a lasso copy can leave two on one page. True when
// a re-read shows none left: a remove that silently did nothing would leave
// a label with no sticker, or the reverse. deletePageElements works on the
// Nomad (3.31.45).
export async function removeSticker(path: string, page: number): Promise<boolean> {
  const found = await ourStickers(path, page);
  // Already gone, e.g. deleted by hand while the float was up.
  if (found.length === 0) {
    return true;
  }
  for (const [layer, nums] of groupByLayer(found)) {
    await unwrap('deletePageElements', PluginCommAPI.deletePageElements(nums, page, layer));
  }
  return (await ourStickers(path, page)).length === 0;
}

function groupByLayer(slots: StickerSlot[]): Map<number, number[]> {
  const byLayer = new Map<number, number[]>();
  for (const {layer, numInPage} of slots) {
    byLayer.set(layer, [...(byLayer.get(layer) ?? []), numInPage]);
  }
  return byLayer;
}
