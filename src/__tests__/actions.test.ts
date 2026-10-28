import {createActions, type Deps} from '../actions';
import type {FloatSpec} from '../floatSpec';
import type {KeywordApi} from '../keywordStore';

const PATH = '/storage/emulated/0/Note/test.note';

type World = {
  keywords: Record<number, string[]>;
  stickers: Set<number>;
  page: number;
  total: number;
  lasso: string | null;
  showing: FloatSpec | null;
  calls: string[];
  // Reads and saves in the order they happened, for the lasso ordering test.
  order: string[];
  permitted: boolean;
  // The Nomad ends the lasso when the note is saved.
  lassoGone: boolean;
  placeFails: boolean;
};

// One fake notebook behind every Deps field, so a test reads like the device:
// keywords and stickers per page, a float that is up or not, and a call list
// for the order of writes.
function setup(start: Partial<World> = {}) {
  const w: World = {
    keywords: {},
    stickers: new Set(),
    page: 0,
    total: 4,
    lasso: null,
    showing: null,
    calls: [],
    order: [],
    permitted: false,
    lassoGone: false,
    placeFails: false,
    ...start,
  };
  const rows = (page: number) => w.keywords[page] ?? [];
  const keywordApi: KeywordApi = {
    async getKeyWords(_path, pages) {
      return pages.flatMap(page => rows(page).map((keyword, i) => ({page, index: i + 1, keyword})));
    },
    async insertKeyWord(_path, page, keyword) {
      w.calls.push(`insert ${page} ${keyword}`);
      w.keywords[page] = [...rows(page), keyword];
    },
    async deleteKeyWord(_path, page, index) {
      w.calls.push(`delete ${page} ${rows(page)[index - 1]}`);
      w.keywords[page] = rows(page).filter((_, i) => i !== index - 1);
    },
  };
  // Fails the way the device does, so a wrong order fails the test.
  const readLasso = () => {
    w.order.push('lasso');
    if (!w.permitted) {
      throw new Error('getLassoElements: code 1503 File read permission has not been requested');
    }
    if (w.lassoGone) {
      throw new Error('getLassoElements: code 904 No lasso action has been performed');
    }
  };
  const deps: Deps = {
    keywordApi,
    sticker: {
      async place(_path, page) {
        w.calls.push(`place ${page}`);
        if (w.placeFails) {
          throw new Error('insertPageElements: code 101 no');
        }
        w.stickers.add(page);
      },
      async find(_path, page) {
        // The real find saves the note before reading the page's elements.
        w.order.push('save');
        w.lassoGone = true;
        return w.stickers.has(page) ? {numInPage: 1, layer: 0} : null;
      },
      async remove(_path, page) {
        w.calls.push(`unstick ${page}`);
        w.stickers.delete(page);
        return true;
      },
    },
    ui: {
      show: jest.fn(async (spec: FloatSpec) => {
        w.showing = spec;
      }),
      hide: jest.fn(async () => {
        w.showing = null;
      }),
      isShowing: async () => w.showing !== null,
      openGrid: jest.fn(async () => {}),
    },
    sdk: {
      path: async () => PATH,
      page: async () => w.page,
      total: async () => {
        if (!w.permitted) {
          throw new Error('getNoteTotalPageNum: code 1503 File read permission has not been requested');
        }
        return w.total;
      },
      lassoText: async () => {
        readLasso();
        return w.lasso;
      },
      lassoHasSticker: async () => {
        readLasso();
        return w.stickers.has(w.page);
      },
      permit: async () => {
        w.order.push('permit');
        w.permitted = true;
      },
    },
    log: () => {},
    // Each tick() lets the page watcher run one poll.
    sleep: () => new Promise<void>(resolve => ticks.push(resolve)),
  };
  const ticks: Array<() => void> = [];
  const tick = async () => {
    ticks.splice(0).forEach(resolve => resolve());
    await new Promise(resolve => setImmediate(resolve));
  };
  const rowIds = () => w.showing?.rows.map(r => r.id);
  return {w, deps, actions: createActions(deps), rowIds, tick};
}

describe('opening the float', () => {
  it('shows only Add on a notebook with no labels, and Add just closes it', async () => {
    const {w, actions, rowIds} = setup();

    await actions.openFloat();
    expect(rowIds()).toEqual(['add', 'close']);

    await actions.onRowTap('add');
    expect(w.showing).toBeNull();
    expect(w.calls).toEqual([]);
  });

  it('toggles: a second toolbar press hides the float', async () => {
    const {w, actions} = setup();

    await actions.openFloat();
    await actions.openFloat();

    expect(w.showing).toBeNull();
  });

  it('opens the same float from the sticker lasso as from the toolbar', async () => {
    const start = {keywords: {0: ['clip:hello'], 2: ['clip:hello']}, stickers: new Set([0, 2])};
    const fromToolbar = setup(start);
    await fromToolbar.actions.openFloat();
    const fromSticker = setup(start);
    await fromSticker.actions.openMenuFromSticker();

    expect(fromSticker.w.showing).toEqual(fromToolbar.w.showing);
    expect(fromSticker.w.showing?.title).toBe('hello');
    expect(fromSticker.w.showing?.rows[0].text).toBe('2 pages');
  });
});

describe('applying a label from the lasso', () => {
  it('lowercases the word, stores it, then places the sticker once, and closes the float', async () => {
    const {w, actions} = setup({lasso: 'Hello'});

    await actions.applyLabelFromLasso();

    expect(w.calls).toEqual(['insert 0 clip:hello', 'place 0']);
    expect(w.showing).toBeNull();
  });

  it('joins a label another page already has instead of making a second one', async () => {
    const {w, actions} = setup({keywords: {2: ['clip:hello']}, stickers: new Set([2]), lasso: 'HELLO'});

    await actions.applyLabelFromLasso();
    await actions.openFloat();

    expect(w.keywords[0]).toEqual(['clip:hello']);
    expect(w.calls).toContain('place 0');
    expect(w.showing?.title).toBe('hello');
    expect(w.showing?.rows[0].text).toBe('2 pages');
  });

  it('asks before replacing, and writes nothing until Replace', async () => {
    const {w, actions, rowIds} = setup({keywords: {0: ['clip:old']}, stickers: new Set([0]), lasso: 'new'});

    await actions.applyLabelFromLasso();
    expect(rowIds()).toEqual(['replace', 'cancel']);
    expect(w.calls).toEqual([]);

    await actions.onRowTap('replace');
    expect(w.keywords[0]).toEqual(['clip:new']);
    // Replace swaps the keyword and leaves the sticker where it is.
    expect(w.calls).not.toContain('place 0');
    expect(w.showing).toBeNull();
  });

  it('writes nothing on Cancel', async () => {
    const {w, actions} = setup({keywords: {0: ['clip:old']}, stickers: new Set([0]), lasso: 'new'});

    await actions.applyLabelFromLasso();
    await actions.onRowTap('cancel');

    expect(w.calls).toEqual([]);
    expect(w.showing).toBeNull();
  });

  it('says so and writes nothing when recognition comes back empty', async () => {
    const {w, actions, rowIds} = setup({lasso: '   '});

    await actions.applyLabelFromLasso();

    expect(rowIds()).toEqual(['close']);
    expect(w.calls).toEqual([]);
  });

  it('rolls the keyword back when the sticker cannot be placed', async () => {
    const {w, actions, rowIds} = setup({lasso: 'hello', placeFails: true});

    await actions.applyLabelFromLasso();

    expect(w.keywords[0] ?? []).toEqual([]);
    expect(w.calls).toEqual(['insert 0 clip:hello', 'place 0', 'delete 0 clip:hello']);
    expect(rowIds()).toEqual(['close']);
  });
});

describe('lasso reads', () => {
  it('read the lasso after the permission and before anything saves the note', async () => {
    const label = setup({lasso: 'hello'});
    await label.actions.applyLabelFromLasso();
    const menu = setup({stickers: new Set([0])});
    await menu.actions.openMenuFromSticker();

    for (const {w} of [label, menu]) {
      expect(w.order.slice(0, 3)).toEqual(['permit', 'lasso', 'save']);
    }
    expect(label.w.stickers.has(0)).toBe(true);
    expect(menu.w.showing?.rows.map(r => r.id)).toContain('removeSticker');
  });
});

describe('float rows', () => {
  const twoLabels = () => ({keywords: {1: ['clip:hello'], 2: ['clip:world']}, stickers: new Set([1, 2])});

  it('lists the paperclips, and picking one labels the page and places the sticker', async () => {
    const {w, actions, rowIds} = setup(twoLabels());

    await actions.openFloat();
    expect(rowIds()).toEqual(['labels', 'add', 'close']);

    await actions.onRowTap('labels');
    expect(rowIds()).toEqual(['pick:hello', 'pick:world', 'close']);

    await actions.onRowTap('pick:hello');
    expect(w.keywords[0]).toEqual(['clip:hello']);
    expect(w.stickers.has(0)).toBe(true);
    expect(w.showing).toBeNull();
  });

  it('Remove clears the label and the sticker', async () => {
    const {w, actions} = setup({page: 1, ...twoLabels()});

    await actions.openFloat();
    await actions.onRowTap('remove');

    expect(w.keywords[1]).toEqual([]);
    expect(w.stickers.has(1)).toBe(false);
    expect(w.showing).toBeNull();
  });

  it('Put sticker back places it without touching keywords', async () => {
    const {w, actions, rowIds} = setup({page: 1, keywords: {1: ['clip:hello']}});

    await actions.openFloat();
    expect(rowIds()).toContain('restoreSticker');
    await actions.onRowTap('restoreSticker');

    expect(w.calls).toEqual(['place 1']);
    expect(w.showing).toBeNull();
  });

  it('Remove sticker removes a stray sticker without touching keywords', async () => {
    const {w, actions, rowIds} = setup({stickers: new Set([0])});

    await actions.openFloat();
    expect(rowIds()).toContain('removeSticker');
    await actions.onRowTap('removeSticker');

    expect(w.calls).toEqual(['unstick 0']);
  });

  it('the page count opens the grid for that label', async () => {
    const {deps, actions} = setup({page: 1, keywords: {1: ['clip:hello'], 3: ['clip:hello']}, stickers: new Set([1])});

    await actions.openFloat();
    await actions.onRowTap('pages');

    expect(deps.ui.openGrid).toHaveBeenCalledWith({path: PATH, label: 'hello', pages: [1, 3], current: 1});
  });

  it('reopens for the new page instead of writing when the user turned the page', async () => {
    const {w, actions} = setup(twoLabels());

    await actions.openFloat();
    w.page = 2;
    await actions.onRowTap('labels');
    await actions.onRowTap('pick:hello');

    expect(w.calls).toEqual([]);
    expect(w.showing?.title).toBe('world');
  });
});

describe('long lasso', () => {
  it('writes nothing when the lasso recognises more than a label', async () => {
    const {w, actions} = setup({lasso: 'this is a whole sentence the pen caught by mistake'});

    await actions.applyLabelFromLasso();
    expect(w.calls).toEqual([]);
    expect(w.showing?.title).toMatch(/more than a label/);
  });
});

describe('page watcher', () => {
  it('hides the float when the page can no longer be read', async () => {
    const {w, deps, actions, tick} = setup();

    await actions.openFloat();
    deps.sdk.page = async () => {
      throw new Error('getCurrentPageNum: no note open');
    };
    await tick();
    expect(w.showing).toBeNull();
  });

  it('closes the float when the user turns the page', async () => {
    const {w, actions, tick} = setup({keywords: {0: ['clip:a']}});

    await actions.openFloat();
    await tick();
    expect(w.showing).not.toBeNull();

    w.page = 1;
    await tick();
    expect(w.showing).toBeNull();
  });

  it('leaves the float alone while the user stays on the page', async () => {
    const {w, actions, tick} = setup();

    await actions.openFloat();
    await tick();
    await tick();
    expect(w.showing).not.toBeNull();
  });
});

describe('help', () => {
  it('shows the how-to, then puts the float back', async () => {
    const {w, actions, rowIds, tick} = setup();

    await actions.openFloat();
    await actions.onRowTap('help');
    expect(w.showing?.title).toMatch(/lasso a word/);
    expect(rowIds()).toEqual(['close']);

    await tick();
    expect(rowIds()).toEqual(['add', 'close']);
  });

  it('does not bring the float back after the user closed it', async () => {
    const {w, actions, tick} = setup();

    await actions.openFloat();
    await actions.onRowTap('help');
    await actions.onRowTap('close');
    w.showing = null;
    await tick();
    expect(w.showing).toBeNull();
  });
});
