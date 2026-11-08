import { countsSummary, placeActions } from "./FlagGroupCard";

it("summarises counts, skipping zeros", () => {
  expect(countsSummary({ closed: 2, spam: 0, duplicate: 1 })).toBe("Closed ×2, Duplicate ×1");
});

it("derives hide/close state from badges", () => {
  expect(placeActions(["hidden"])).toEqual({ hidden: true, closed: false });
  expect(placeActions(["reported_closed", "unverified"])).toEqual({ hidden: false, closed: true });
});
