// Pure on purpose: file naming for the grid's page previews, under Jest. The
// render itself is sdk.renderPage.

// Every preview file starts with this, so the old set can be cleared by prefix
// before a grid opens.
export const PREVIEW_PREFIX = 'grid_';

// djb2, base 36. Only has to keep two notebooks' previews apart, not be secure.
function hash(text: string): string {
  let h = 5381;
  for (let i = 0; i < text.length; i++) {
    h = (h * 33 + text.charCodeAt(i)) % 4294967296;
  }
  return h.toString(36);
}

// The stamp is per grid open: RN's Image caches by uri, so reusing a name
// would show the page as it looked last time.
export function previewFile(dir: string, notebook: string, page: number, stamp: number): string {
  return `${dir}/${PREVIEW_PREFIX}${hash(notebook)}_p${page}_${stamp}.png`;
}
