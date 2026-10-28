// Pure on purpose: the SDK comes in as a KeywordApi (sdk.ts has the real
// one), so the scan fallback and the delete order run under Jest.
import {KEYWORD_PREFIX, toKeyword} from './labels';
import {buildScan, type PageKeyword, type Scan} from './scan';

// Each call throws on a failed APIResponse. Indexes are per page, from 1 on
// the Nomad (the SDK's own doc comment says 0; the device disagrees).
export type KeywordApi = {
  getKeyWords(path: string, pages: number[]): Promise<PageKeyword[]>;
  insertKeyWord(path: string, page: number, keyword: string): Promise<void>;
  deleteKeyWord(path: string, page: number, index: number): Promise<void>;
};

const isOurs = (row: PageKeyword) => row.keyword.startsWith(KEYWORD_PREFIX);

// One call for the whole notebook took 43 to 99 ms on the device. If it is
// rejected, page by page tells us which page is the problem instead of
// losing every label in the notebook to one bad page.
export async function scanNotebook(api: KeywordApi, path: string, total: number): Promise<Scan> {
  const pages = Array.from({length: total}, (_, i) => i);
  try {
    return buildScan(await api.getKeyWords(path, pages), total);
  } catch {
    return scanPageByPage(api, path, pages, total);
  }
}

async function scanPageByPage(api: KeywordApi, path: string, pages: number[], total: number): Promise<Scan> {
  const rows: PageKeyword[] = [];
  const failed: number[] = [];
  for (const page of pages) {
    try {
      rows.push(...(await api.getKeyWords(path, [page])));
    } catch {
      failed.push(page);
    }
  }
  return buildScan(rows, total, failed);
}

// Clears before inserting, so a page never ends up with two labels even if
// the insert is what fails.
export async function setLabel(api: KeywordApi, path: string, page: number, label: string): Promise<void> {
  await clearLabel(api, path, page);
  await api.insertKeyWord(path, page, toKeyword(label));
}

// Highest index first: if the host renumbers rows after a delete (unproven
// either way), the lower indexes still to go stay valid.
export async function clearLabel(api: KeywordApi, path: string, page: number): Promise<void> {
  const ours = (await api.getKeyWords(path, [page]))
    .filter(row => row.page === page && isOurs(row))
    .sort((a, b) => b.index - a.index);
  for (const row of ours) {
    await api.deleteKeyWord(path, page, row.index);
  }
}
