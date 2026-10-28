// Pure on purpose: no react-native or sn-plugin-lib import, so Jest can run it
// without the native runtime.

// Marks our keywords among the user's own in Supernote's keyword list.
export const KEYWORD_PREFIX = 'clip:';

// A label is a word or two. Past this it's a lasso that caught a sentence.
export const MAX_LABEL_LENGTH = 35;

// Recognition returns whatever the handwriting looked like, so "Hello   World"
// and "hello world" have to land on the same label. Nothing else is stripped:
// punctuation the user wrote is part of the word.
export function normalizeLabel(raw: string | null | undefined): string | null {
  const label = (raw ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
  return label === '' ? null : label;
}

export function toKeyword(label: string): string {
  return KEYWORD_PREFIX + label;
}

// Normalises again because keywords can be edited in Supernote's own list.
export function labelFromKeyword(keyword: string): string | null {
  if (!keyword.startsWith(KEYWORD_PREFIX)) {
    return null;
  }
  return normalizeLabel(keyword.slice(KEYWORD_PREFIX.length));
}
