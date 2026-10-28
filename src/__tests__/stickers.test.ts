import {isOurSticker, stickerRect} from '../stickerRule';

const PICTURE = 200;
const STROKE = 0;

const picture = (left: number, top: number, width: number, height: number) => ({
  type: PICTURE,
  picture: {rect: {left, top, right: left + width, bottom: top + height}},
});

describe('isOurSticker', () => {
  it('matches an 84x98 picture wherever the user dragged it', () => {
    expect(isOurSticker(picture(1280, 55, 84, 98))).toBe(true);
    expect(isOurSticker(picture(300, 900, 85, 97))).toBe(true);
  });

  it('ignores other pictures and strokes', () => {
    expect(isOurSticker(picture(1280, 55, 200, 200))).toBe(false);
    expect(isOurSticker({type: STROKE})).toBe(false);
    expect(isOurSticker({type: PICTURE})).toBe(false);
  });

  it('agrees with the rect the sticker is placed at', () => {
    const rect = stickerRect({width: 1404, height: 1872});
    expect(isOurSticker({type: PICTURE, picture: {rect}})).toBe(true);
    expect(rect.right).toBe(1404 - 40);
  });
});
