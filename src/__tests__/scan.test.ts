import {buildScan, floatStateFor, labelListState, planApply, PageKeyword} from '../scan';

const kw = (page: number, keyword: string, index = 1): PageKeyword => ({page, index, keyword});

describe('buildScan', () => {
  it('ignores the user\'s own keywords and groups pages by case-folded label', () => {
    const scan = buildScan(
      [kw(0, 'clip:Hello'), kw(0, 'meeting notes', 2), kw(1, 'receipts'), kw(3, 'clip:hello')],
      5,
    );
    expect(scan.labelPages.get('hello')).toEqual([0, 3]);
    expect(scan.labelPages.size).toBe(1);
    expect(scan.pageLabel.has(1)).toBe(false);
  });

  it('takes the first clip: keyword as the page label when there are two', () => {
    const scan = buildScan([kw(2, 'clip:second', 2), kw(2, 'clip:first', 1)], 4);
    expect(scan.pageLabel.get(2)).toBe('first');
    expect(scan.labelPages.has('second')).toBe(false);
  });

  it('passes failed pages through and leaves them unlabelled', () => {
    const scan = buildScan([kw(1, 'clip:x'), kw(2, 'clip:y')], 4, [2]);
    expect(scan.failedPages).toEqual([2]);
    expect(scan.pageLabel.has(2)).toBe(false);
    expect(scan.labelPages.has('y')).toBe(false);
  });
});

describe('floatStateFor', () => {
  it('is unlabelled with no labels in an empty notebook', () => {
    expect(floatStateFor(buildScan([], 3), 0, false)).toEqual({
      kind: 'unlabelled',
      labelCount: 0,
      stray: false,
    });
  });

  it('counts labels that live on other pages, and flags a sticker with no label', () => {
    const scan = buildScan([kw(1, 'clip:a'), kw(2, 'clip:b')], 4);
    expect(floatStateFor(scan, 0, false)).toMatchObject({kind: 'unlabelled', labelCount: 2, stray: false});
    expect(floatStateFor(scan, 0, true)).toMatchObject({kind: 'unlabelled', stray: true});
  });

  it('is labelled with a page count that includes this page', () => {
    const scan = buildScan([kw(0, 'clip:a'), kw(2, 'clip:a'), kw(3, 'clip:a')], 4);
    expect(floatStateFor(scan, 2, true)).toEqual({
      kind: 'labelled',
      label: 'a',
      pageCount: 3,
      stickerMissing: false,
    });
  });

  it('reports a missing sticker on a labelled page', () => {
    const scan = buildScan([kw(0, 'clip:a')], 2);
    expect(floatStateFor(scan, 0, false)).toMatchObject({kind: 'labelled', stickerMissing: true});
  });
});

describe('labelListState', () => {
  it('lists labels alphabetically with their page counts', () => {
    const scan = buildScan([kw(0, 'clip:pear'), kw(1, 'clip:apple'), kw(2, 'clip:pear')], 3);
    expect(labelListState(scan)).toEqual({
      kind: 'labelList',
      labels: [
        {label: 'apple', pageCount: 1},
        {label: 'pear', pageCount: 2},
      ],
    });
  });
});

describe('planApply', () => {
  const scan = buildScan([kw(0, 'clip:hello'), kw(3, 'clip:hello'), kw(1, 'clip:other')], 5);

  it('does nothing when recognition gave no text', () => {
    expect(planApply(scan, 2, null)).toEqual({kind: 'noText'});
    expect(planApply(scan, 2, '   ')).toEqual({kind: 'noText'});
    expect(planApply(scan, 2, 'a'.repeat(36))).toEqual({kind: 'tooLong'});
    expect(planApply(scan, 2, 'a'.repeat(35)).kind).toBe('set');
  });

  it('sets a label on an unlabelled page, and says whether it joins one that exists', () => {
    expect(planApply(scan, 2, 'Hello')).toEqual({kind: 'set', label: 'hello', joinsExisting: true});
    expect(planApply(scan, 2, 'Brand New')).toEqual({kind: 'set', label: 'brand new', joinsExisting: false});
  });

  it('changes nothing when the page already has that label, whatever the case', () => {
    expect(planApply(scan, 0, ' HELLO ')).toEqual({kind: 'same', label: 'hello'});
  });

  it('asks before replacing a different label', () => {
    expect(planApply(scan, 0, 'Other')).toEqual({
      kind: 'confirmReplace',
      oldLabel: 'hello',
      newLabel: 'other',
      joinsExisting: true,
    });
  });
});
