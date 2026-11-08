/**
 * Binary insertion of a new item into a best-first list of n existing items.
 * State is the half-open range of candidate insertion points [lo, hi] (0..n):
 * inserting at index i means "after i items, before item i". At most ceil(log2(n+1)) questions.
 */
export interface SearchState {
  lo: number;
  hi: number;
}

export function start(n: number): SearchState {
  return { lo: 0, hi: Math.max(0, n) };
}

/** Index of the existing item to compare the new one against, or "done". */
export function next(state: SearchState): number | "done" {
  if (state.lo >= state.hi) return "done";
  return Math.floor((state.lo + state.hi) / 2);
}

/** Record whether the new item beat the item at next(state). */
export function answer(state: SearchState, newIsBetter: boolean): SearchState {
  const mid = next(state);
  if (mid === "done") return state;
  return newIsBetter ? { lo: state.lo, hi: mid } : { lo: mid + 1, hi: state.hi };
}

/** 1-based position among the other items once next(state) is "done". */
export function position(state: SearchState): number {
  return state.lo + 1;
}

export function maxComparisons(n: number): number {
  return Math.ceil(Math.log2(n + 1));
}
