// Module-scope state shared by the button handlers in main.ts and the grid in
// App.tsx. It lives outside React because the handlers run with no view
// mounted, and the grid picks up what they left when the view opens.
import type {Grid} from './actions';

// `opened` tells two opens of the same label apart, so the grid re-renders
// pages that changed in between.
export type GridRequest = Grid & {opened: number};

let grid: GridRequest | null = null;
const subs = new Set<() => void>();

export const getGrid = (): GridRequest | null => grid;

export function setGrid(next: Grid): void {
  grid = {...next, opened: Date.now()};
  subs.forEach(fn => fn());
}

export function subscribe(fn: () => void): () => void {
  subs.add(fn);
  return () => {
    subs.delete(fn);
  };
}

// Dev builds only, to logcat. Nothing is written to the Nomad: lines carry
// recognised handwriting and note paths, which shouldn't sit in a file.
export function log(line: string): void {
  if (__DEV__) {
    console.log(`[paperclip] ${line}`);
  }
}
