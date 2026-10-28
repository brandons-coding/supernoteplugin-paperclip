import {clearLabel, scanNotebook, setLabel, type KeywordApi} from '../keywordStore';

const PATH = '/storage/emulated/0/Note/test.note';

// Behaves like the Nomad as far as the store can tell: per-page indexes from
// 1, renumbered after a delete, and a whole call rejected if any page in it
// is unreadable.
function fakeApi(pages: Record<number, string[]>, broken: number[] = []): KeywordApi & {
  pages: Record<number, string[]>;
} {
  const rowsOf = (page: number) => pages[page] ?? [];
  return {
    pages,
    async getKeyWords(_path, list) {
      if (list.some(p => broken.includes(p))) {
        throw new Error(`getKeyWords: page ${list.find(p => broken.includes(p))} unreadable`);
      }
      return list.flatMap(page => rowsOf(page).map((keyword, i) => ({page, index: i + 1, keyword})));
    },
    async insertKeyWord(_path, page, keyword) {
      pages[page] = [...rowsOf(page), keyword];
    },
    async deleteKeyWord(_path, page, index) {
      const rows = rowsOf(page);
      if (index < 1 || index > rows.length) {
        throw new Error(`deleteKeyWord: no index ${index} on page ${page}`);
      }
      pages[page] = rows.filter((_, i) => i !== index - 1);
    },
  };
}

describe('scanNotebook', () => {
  it('reads labels from clip: rows and leaves the user keywords alone', async () => {
    const api = fakeApi({0: ['meeting', 'clip:Hello'], 1: ['meeting'], 3: ['clip:hello']});

    const scan = await scanNotebook(api, PATH, 4);

    expect(scan.labelPages.get('hello')).toEqual([0, 3]);
    expect(scan.pageLabel.has(1)).toBe(false);
    expect([...scan.labelPages.keys()]).toEqual(['hello']);
    expect(scan.failedPages).toEqual([]);
  });

  it('finishes when one page cannot be read, and names that page', async () => {
    const api = fakeApi({0: ['clip:a', 'meeting'], 2: ['clip:b'], 3: ['clip:a']}, [2]);

    const scan = await scanNotebook(api, PATH, 4);

    expect(scan.failedPages).toEqual([2]);
    expect(scan.labelPages.get('a')).toEqual([0, 3]);
    expect(scan.pageLabel.has(2)).toBe(false);
    expect(scan.total).toBe(4);
  });
});

describe('setLabel', () => {
  it('swaps our keyword and keeps the user keyword next to it', async () => {
    const api = fakeApi({1: ['clip:old', 'meeting']});

    await setLabel(api, PATH, 1, 'new');

    expect(api.pages[1]).toEqual(['meeting', 'clip:new']);
  });

  it('clears every stale clip: row on the page, whatever the order', async () => {
    // Two clip: rows happen when a label was set twice by an older build or
    // edited by hand. Deleting low index first would hit the wrong row once
    // the host renumbers.
    const api = fakeApi({0: ['clip:a', 'meeting', 'clip:b', 'todo']});

    await setLabel(api, PATH, 0, 'c');

    expect(api.pages[0]).toEqual(['meeting', 'todo', 'clip:c']);
  });
});

describe('clearLabel', () => {
  it('deletes only clip: rows', async () => {
    const api = fakeApi({0: ['clip:a'], 2: ['todo', 'clip:x', 'meeting', 'clip:y']});

    await clearLabel(api, PATH, 2);

    expect(api.pages[2]).toEqual(['todo', 'meeting']);
    expect(api.pages[0]).toEqual(['clip:a']);
  });
});
