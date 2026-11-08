import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createLongPress, distanceMetres, groupByTopCategory, mapApiErrors, nudge, roundBbox } from "./geo";

describe("roundBbox", () => {
  it("snaps outward so nearby pans share a key", () => {
    const a = roundBbox({ minLat: 35.001, minLng: 135.001, maxLat: 35.1, maxLng: 135.2 }, 12);
    const b = roundBbox({ minLat: 35.002, minLng: 135.002, maxLat: 35.099, maxLng: 135.199 }, 12);
    expect(a).toEqual(b);
    expect(a.minLat).toBeLessThanOrEqual(35.001);
    expect(a.maxLng).toBeGreaterThanOrEqual(135.2);
  });
  it("clamps to valid ranges", () => {
    const r = roundBbox({ minLat: -95, minLng: -200, maxLat: 95, maxLng: 200 }, 1);
    expect(r).toEqual({ minLat: -90, minLng: -180, maxLat: 90, maxLng: 180 });
  });
});

describe("nudge", () => {
  it("moves about 5 m north", () => {
    const p = { lat: 35, lng: 135 };
    const q = nudge(p, "up", 5);
    expect(q.lng).toBe(135);
    expect(distanceMetres(p, q)).toBeGreaterThan(4.5);
    expect(distanceMetres(p, q)).toBeLessThan(5.5);
  });
  it("moves about 50 m east", () => {
    const p = { lat: 35, lng: 135 };
    expect(distanceMetres(p, nudge(p, "right", 50))).toBeGreaterThan(49);
    expect(distanceMetres(p, nudge(p, "right", 50))).toBeLessThan(51);
  });
});

describe("createLongPress", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());
  it("fires after the delay", () => {
    const fn = vi.fn();
    const lp = createLongPress<string>(fn, 600);
    lp.start(0, 0, "x");
    vi.advanceTimersByTime(599);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(2);
    expect(fn).toHaveBeenCalledWith("x");
  });
  it("cancels when the finger moves or lifts", () => {
    const fn = vi.fn();
    const lp = createLongPress<string>(fn, 600);
    lp.start(0, 0, "x");
    lp.move(30, 0);
    vi.advanceTimersByTime(1000);
    expect(fn).not.toHaveBeenCalled();
    lp.start(0, 0, "y");
    lp.move(2, 2);
    lp.cancel();
    vi.advanceTimersByTime(1000);
    expect(fn).not.toHaveBeenCalled();
  });
});

describe("mapApiErrors", () => {
  it("keys list errors by the last loc element", () => {
    const e = mapApiErrors({
      detail: [
        { loc: ["body", "name"], msg: "English name is required.", type: "value_error" },
        { loc: ["body", "lat"], msg: "bad", type: "x" },
      ],
    });
    expect(e.fields).toEqual({ name: "English name is required.", pin: "bad" });
  });
  it("handles string detail and covered cities", () => {
    const e = mapApiErrors({ detail: "We only cover these cities for now", covered_cities: [{ id: 1, slug: "tokyo", name: "Tokyo" }] });
    expect(e.message).toBe("We only cover these cities for now");
    expect(e.coveredCities).toHaveLength(1);
  });
});

describe("groupByTopCategory", () => {
  it("orders groups and drops empty ones", () => {
    const g = groupByTopCategory([
      { top_category: "stays", n: 1 },
      { top_category: "food", n: 2 },
    ]);
    expect(g.map((x) => x.key)).toEqual(["food", "stays"]);
  });
});
