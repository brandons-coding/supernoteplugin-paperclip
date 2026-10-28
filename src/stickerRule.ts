// Pure on purpose: the size rule that says which picture is our sticker,
// and where a new one goes. stickers.ts does the SDK side.

export type Rect = {left: number; top: number; right: number; bottom: number};
export type Size = {width: number; height: number};

// Element.TYPE_PICTURE in sn-plugin-lib, repeated so this file stays free of it.
const TYPE_PICTURE = 200;

// The artwork is 150x175; placed at 84 wide, the height follows that ratio.
export const STICKER_W = 84;
export const STICKER_H = Math.round((STICKER_W * 175) / 150);
// 40 px from the right edge. 95 from the top: the Nomad's toolbar covered it
// at 40, and at 55 it still sat too high.
const MARGIN_RIGHT = 40;
const MARGIN_TOP = 95;
// The host may round the rect it stores; this only has to tell 84x98 from
// any picture the user put on the page.
const SIZE_TOLERANCE_PX = 2;

export function stickerRect(page: Size): Rect {
  const right = page.width - MARGIN_RIGHT;
  return {left: right - STICKER_W, top: MARGIN_TOP, right, bottom: MARGIN_TOP + STICKER_H};
}

// Size only. The host rewrites picturePath and hands out a new uuid on every
// read, and position is free so the sticker survives being dragged. A user
// picture of exactly this size would be taken for ours; resizing ours would
// orphan it.
export function isOurSticker(el: {type: number; picture?: {rect?: Rect} | null}): boolean {
  const rect = el.picture?.rect;
  if (el.type !== TYPE_PICTURE || !rect) {
    return false;
  }
  const near = (actual: number, want: number) => Math.abs(actual - want) <= SIZE_TOLERANCE_PX;
  return near(rect.right - rect.left, STICKER_W) && near(rect.bottom - rect.top, STICKER_H);
}
