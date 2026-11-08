/**
 * Anonymous usage events (R18). A random per-browser ID is the only identifier: it is never sent
 * with, or linked to, the username. Sending is fire-and-forget; failures never touch the UI.
 */
export type EventType =
  | "app_open"
  | "place_open"
  | "save"
  | "rank"
  | "add"
  | "search_no_result"
  | "near_me"
  | "directions";

const KEY = "jg.browserId";
let memoryId: string | null = null;
let queue: { type: EventType; source?: string }[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;

function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  // RFC 4122 v4 fallback.
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

/** The browser ID, plus whether it was just created (= first visit). */
export function browserId(): { id: string; isNew: boolean } {
  try {
    const existing = window.localStorage.getItem(KEY);
    if (existing) return { id: existing, isNew: false };
    const id = newId();
    window.localStorage.setItem(KEY, id);
    return { id, isNew: true };
  } catch {
    if (memoryId) return { id: memoryId, isNew: false };
    memoryId = newId();
    return { id: memoryId, isNew: true };
  }
}

function send(events: typeof queue) {
  if (events.length === 0) return;
  const body = JSON.stringify({ browser_id: browserId().id, events });
  try {
    if (typeof navigator !== "undefined" && navigator.sendBeacon) {
      const ok = navigator.sendBeacon("/api/events", new Blob([body], { type: "application/json" }));
      if (ok) return;
    }
    void fetch("/api/events", { method: "POST", body, keepalive: true, headers: { "Content-Type": "application/json" } }).catch(
      () => undefined,
    );
  } catch {
    // Never let analytics break the app.
  }
}

export function flush() {
  if (timer) clearTimeout(timer);
  timer = null;
  while (queue.length) send(queue.splice(0, 20));
}

export function track(type: EventType, source?: string) {
  queue.push(source ? { type, source } : { type });
  if (queue.length >= 20) flush();
  else if (!timer) timer = setTimeout(flush, 2000);
}

let opened = false;
/** Once per page load: app_open with first/returning. */
export function trackAppOpen() {
  if (opened) return;
  opened = true;
  const { isNew } = browserId();
  track("app_open", isNew ? "first" : "returning");
}

if (typeof window !== "undefined") {
  window.addEventListener("pagehide", flush);
}
