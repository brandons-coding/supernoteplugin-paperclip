// Pure on purpose: no react-native or sn-plugin-lib import. The device scan
// (one getKeyWords call for the whole notebook) lives in the SDK layer and
// hands its rows to buildScan.
import {MAX_LABEL_LENGTH, labelFromKeyword, normalizeLabel} from './labels';

export type PageKeyword = {page: number; index: number; keyword: string};

export type Scan = {
  total: number;
  pageLabel: Map<number, string>;
  labelPages: Map<string, number[]>;
  // Pages whose keywords could not be read. They count as unlabelled; the
  // caller decides whether to tell the user.
  failedPages: number[];
};

export type FloatState =
  | {kind: 'unlabelled'; labelCount: number; stray: boolean}
  | {kind: 'labelled'; label: string; pageCount: number; stickerMissing: boolean}
  | {kind: 'labelList'; labels: {label: string; pageCount: number}[]}
  | {kind: 'confirmReplace'; oldLabel: string; newLabel: string}
  | {kind: 'message'; text: string};

export type ApplyPlan =
  | {kind: 'noText'}
  | {kind: 'tooLong'}
  | {kind: 'same'; label: string}
  | {kind: 'set'; label: string; joinsExisting: boolean}
  | {kind: 'confirmReplace'; oldLabel: string; newLabel: string; joinsExisting: boolean};

export function buildScan(
  keywords: PageKeyword[],
  total: number,
  failedPages: number[] = [],
): Scan {
  const failed = new Set(failedPages);
  const pageLabel = new Map<number, string>();
  const labelPages = new Map<string, number[]>();

  // Sorted so "the first clip: keyword" means lowest index on the page, and
  // page lists come out ascending, whatever order the host returned rows in.
  const ordered = [...keywords].sort((a, b) => a.page - b.page || a.index - b.index);
  for (const {page, keyword} of ordered) {
    const label = labelFromKeyword(keyword);
    if (label === null || failed.has(page) || pageLabel.has(page)) {
      continue;
    }
    pageLabel.set(page, label);
    const pages = labelPages.get(label);
    if (pages) {
      pages.push(page);
    } else {
      labelPages.set(label, [page]);
    }
  }
  return {total, pageLabel, labelPages, failedPages};
}

export function floatStateFor(scan: Scan, page: number, stickerOnPage: boolean): FloatState {
  const label = scan.pageLabel.get(page);
  if (label === undefined) {
    return {kind: 'unlabelled', labelCount: scan.labelPages.size, stray: stickerOnPage};
  }
  return {
    kind: 'labelled',
    label,
    pageCount: scan.labelPages.get(label)?.length ?? 1,
    stickerMissing: !stickerOnPage,
  };
}

export function labelListState(scan: Scan): FloatState {
  const labels = [...scan.labelPages]
    .map(([label, pages]) => ({label, pageCount: pages.length}))
    .sort((a, b) => (a.label < b.label ? -1 : a.label > b.label ? 1 : 0));
  return {kind: 'labelList', labels};
}

export function planApply(scan: Scan, page: number, recognized: string | null): ApplyPlan {
  const label = normalizeLabel(recognized);
  if (label === null) {
    return {kind: 'noText'};
  }
  if (label.length > MAX_LABEL_LENGTH) {
    return {kind: 'tooLong'};
  }
  const current = scan.pageLabel.get(page);
  const joinsExisting = scan.labelPages.has(label);
  if (current === undefined) {
    return {kind: 'set', label, joinsExisting};
  }
  if (current === label) {
    return {kind: 'same', label};
  }
  return {kind: 'confirmReplace', oldLabel: current, newLabel: label, joinsExisting};
}
