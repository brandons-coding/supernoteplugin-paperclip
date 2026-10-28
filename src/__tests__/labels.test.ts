import {KEYWORD_PREFIX, labelFromKeyword, normalizeLabel, toKeyword} from '../labels';

describe('normalizeLabel', () => {
  it('trims, collapses inner whitespace and lowercases', () => {
    expect(normalizeLabel('  Hello ')).toBe('hello');
    expect(normalizeLabel('Hello   World')).toBe('hello world');
  });

  it('gives one label for any casing', () => {
    expect(normalizeLabel('HELLO')).toBe(normalizeLabel('hello'));
  });

  it('returns null when there is nothing to label with', () => {
    expect(normalizeLabel('   ')).toBeNull();
    expect(normalizeLabel('')).toBeNull();
    expect(normalizeLabel(null)).toBeNull();
    expect(normalizeLabel(undefined)).toBeNull();
  });
});

describe('keywords', () => {
  it('round-trips a label through its keyword', () => {
    expect(KEYWORD_PREFIX).toBe('clip:');
    expect(toKeyword('hello')).toBe('clip:hello');
    expect(labelFromKeyword(toKeyword('hello'))).toBe('hello');
  });

  it('folds case on the way back in, since the user can edit keywords by hand', () => {
    expect(labelFromKeyword('clip:Hello')).toBe('hello');
  });

  it('ignores the user\'s own keywords and an empty clip:', () => {
    expect(labelFromKeyword('meeting notes')).toBeNull();
    expect(labelFromKeyword('clip:')).toBeNull();
  });

  it('keeps everything after the first prefix', () => {
    expect(labelFromKeyword('clip:a:b')).toBe('a:b');
  });
});
