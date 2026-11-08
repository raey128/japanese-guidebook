afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  window.localStorage.clear();
  vi.resetModules();
});

test("browserId is random, stable, and marks the first visit", async () => {
  const { browserId } = await import("./track");
  const first = browserId();
  expect(first.isNew).toBe(true);
  expect(first.id).toMatch(/^[0-9a-f-]{36}$/);
  const again = browserId();
  expect(again).toEqual({ id: first.id, isNew: false });
});

test("events are batched and sent with only the browser id (never a username)", async () => {
  vi.useFakeTimers();
  const sent: string[] = [];
  vi.stubGlobal("navigator", { ...navigator, sendBeacon: undefined });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init: RequestInit) => {
      sent.push(String(init.body));
      return new Response(null, { status: 204 });
    }),
  );
  const { track } = await import("./track");
  track("near_me", "granted");
  track("place_open", "top_pick");
  expect(sent).toHaveLength(0);
  vi.advanceTimersByTime(2100);
  expect(sent).toHaveLength(1);
  const body = JSON.parse(sent[0]!);
  expect(Object.keys(body).sort()).toEqual(["browser_id", "events"]);
  expect(body.events).toEqual([
    { type: "near_me", source: "granted" },
    { type: "place_open", source: "top_pick" },
  ]);
});

test("a failing network never throws", async () => {
  vi.useFakeTimers();
  vi.stubGlobal("navigator", { ...navigator, sendBeacon: undefined });
  vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("offline"))));
  const { track, flush } = await import("./track");
  track("save");
  expect(() => flush()).not.toThrow();
});

test("blocked storage falls back to an in-memory id", async () => {
  const spy = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
    throw new Error("blocked");
  });
  const { browserId } = await import("./track");
  const a = browserId();
  const b = browserId();
  expect(a.isNew).toBe(true);
  expect(b).toEqual({ id: a.id, isNew: false });
  spy.mockRestore();
});
