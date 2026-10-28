import {specFor, type FloatSpec} from '../floatSpec';

const ids = (spec: FloatSpec) => spec.rows.map(r => r.id);
const row = (spec: FloatSpec, id: string) => spec.rows.find(r => r.id === id);

describe('specFor', () => {
  it('shows only + on a notebook with no labels', () => {
    expect(ids(specFor({kind: 'unlabelled', labelCount: 0, stray: false}))).toEqual(['add', 'close']);
  });

  it('marks each label in the list as an add', () => {
    const spec = specFor({kind: 'labelList', labels: [{label: 'hello', pageCount: 2}]});
    expect(row(spec, 'pick:hello')?.icon).toBe('plus');
  });

  it('carries a ? only where + is offered', () => {
    expect(specFor({kind: 'unlabelled', labelCount: 0, stray: false}).help).toBe(true);
    expect(specFor({kind: 'labelled', label: 'a', pageCount: 1, stickerMissing: false}).help).toBeUndefined();
  });

  it('offers the existing paperclips before + on an unlabelled page', () => {
    const spec = specFor({kind: 'unlabelled', labelCount: 2, stray: false});
    expect(ids(spec)).toEqual(['labels', 'add', 'close']);
    expect(row(spec, 'labels')?.text).toContain('2 paperclips');
  });

  it('offers to remove a stray sticker', () => {
    expect(ids(specFor({kind: 'unlabelled', labelCount: 1, stray: true}))).toContain('removeSticker');
  });

  it('titles a labelled page with its label and counts pages', () => {
    const one = specFor({kind: 'labelled', label: 'hello', pageCount: 1, stickerMissing: false});
    expect(one.title).toBe('hello');
    expect(ids(one)).toEqual(['pages', 'remove', 'close']);
    expect(row(one, 'pages')?.text).toBe('1 page');

    const three = specFor({kind: 'labelled', label: 'hello', pageCount: 3, stickerMissing: false});
    expect(row(three, 'pages')?.text).toBe('3 pages');
  });

  it('offers to put a missing sticker back', () => {
    const spec = specFor({kind: 'labelled', label: 'hello', pageCount: 2, stickerMissing: true});
    expect(ids(spec)).toContain('restoreSticker');
  });

  it('lists one pick row per label with its page count', () => {
    const spec = specFor({
      kind: 'labelList',
      labels: [
        {label: 'hello', pageCount: 3},
        {label: 'work', pageCount: 1},
      ],
    });
    expect(ids(spec)).toEqual(['pick:hello', 'pick:work', 'close']);
    expect(row(spec, 'pick:hello')?.detail).toBe('3 pages');
    expect(row(spec, 'pick:work')?.detail).toBe('1 page');
  });

  it('asks before replacing, naming both labels', () => {
    const spec = specFor({kind: 'confirmReplace', oldLabel: 'old', newLabel: 'new'});
    expect(spec.title).toContain('old');
    expect(spec.title).toContain('new');
    expect(ids(spec)).toEqual(['replace', 'cancel']);
  });

  it('shows a message with a single way out', () => {
    const spec = specFor({kind: 'message', text: 'No words found in the lasso'});
    expect(spec.title).toBe('No words found in the lasso');
    expect(ids(spec)).toEqual(['close']);
  });
});
