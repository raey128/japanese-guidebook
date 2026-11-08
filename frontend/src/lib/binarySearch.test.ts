import { answer, maxComparisons, next, position, start } from "./binarySearch";

/** Oracle: the new item truly belongs at `target` (0..n), i.e. it beats items with index >= target. */
function simulate(n: number, target: number) {
  let st = start(n);
  let asked = 0;
  const seen: number[] = [];
  for (let step = next(st); step !== "done"; step = next(st)) {
    seen.push(step);
    st = answer(st, step >= target);
    asked += 1;
    if (asked > 100) throw new Error("did not terminate");
  }
  return { asked, pos: position(st), seen };
}

test("no comparisons for an empty list", () => {
  expect(next(start(0))).toBe("done");
  expect(position(start(0))).toBe(1);
});

test("at most ceil(log2(n+1)) comparisons and the right position for every insertion point", () => {
  for (let n = 0; n <= 20; n++) {
    for (let target = 0; target <= n; target++) {
      const { asked, pos, seen } = simulate(n, target);
      expect(asked).toBeLessThanOrEqual(maxComparisons(n));
      expect(pos).toBe(target + 1);
      seen.forEach((i) => {
        expect(i).toBeGreaterThanOrEqual(0);
        expect(i).toBeLessThan(n);
      });
    }
  }
});
