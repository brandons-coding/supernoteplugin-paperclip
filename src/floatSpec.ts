// Pure on purpose: what the float says for each state lives here, under
// Jest. The native module only draws whatever spec it is handed.
import type {FloatState} from './scan';

export type FloatIcon = 'plus' | 'list' | 'clip' | 'trash' | 'check' | 'close';

export type FloatRow = {id: string; text: string; detail?: string; icon?: FloatIcon};

// help: draws a small ? in the title bar; tapping it sends the row id HELP_ID.
export type FloatSpec = {title: string; rows: FloatRow[]; help?: boolean};

export const PICK_PREFIX = 'pick:';
export const HELP_ID = 'help';

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const pageCount = (n: number) => plural(n, 'page', 'pages');

// The float takes no pen input, so it needs a way out of its own, not only
// the toolbar toggle. Every state carries one. The native module handles the
// `close` id itself (removes the float, emits paperclipFloatClosed) so it
// works even with JS suspended; keep the id in step with CLOSE_ROW_ID there.
const CLOSE: FloatRow = {id: 'close', text: 'Close', icon: 'close'};

export function specFor(state: FloatState): FloatSpec {
  switch (state.kind) {
    case 'unlabelled':
      return {
        title: 'Paperclip',
        help: true,
        rows: [
          ...(state.labelCount > 0
            ? [{id: 'labels', text: plural(state.labelCount, 'paperclip', 'paperclips'), icon: 'list' as const}]
            : []),
          {id: 'add', text: 'Add label', icon: 'plus'},
          ...(state.stray ? [{id: 'removeSticker', text: 'Remove sticker', icon: 'trash' as const}] : []),
          CLOSE,
        ],
      };
    case 'labelled':
      return {
        title: state.label,
        rows: [
          {id: 'pages', text: pageCount(state.pageCount), icon: 'list'},
          ...(state.stickerMissing ? [{id: 'restoreSticker', text: 'Put sticker back', icon: 'clip' as const}] : []),
          {id: 'remove', text: 'Remove', icon: 'trash'},
          CLOSE,
        ],
      };
    case 'labelList':
      return {
        title: 'Paperclips',
        rows: [
          ...state.labels.map(({label, pageCount: n}) => ({
            id: PICK_PREFIX + label,
            text: label,
            detail: pageCount(n),
            // Tapping a row adds that label to this page, and the list only
            // opens on an unlabelled page, so the row reads as an add.
            icon: 'plus' as const,
          })),
          CLOSE,
        ],
      };
    case 'confirmReplace':
      // Cancel is the way out here; a Close row next to it would say the
      // same thing twice.
      return {
        title: `Replace "${state.oldLabel}" with "${state.newLabel}"?`,
        rows: [
          {id: 'replace', text: 'Replace', icon: 'check'},
          {id: 'cancel', text: 'Cancel', icon: 'close'},
        ],
      };
    case 'message':
      return {title: state.text, rows: [CLOSE]};
  }
}
