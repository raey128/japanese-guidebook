/**
 * The voter's random id on a vote link (V1.3): kept in this browser so the same person keeps
 * their votes; another device is another voter. If storage is blocked (private mode, strict
 * settings) the page still works: the id lives in memory for this visit and every tap is
 * saved to the server anyway.
 */
const KEY = "jg.voterId";
let memoryId: string | null = null;

function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  // RFC 4122 v4 from Math.random (only for very old browsers; not security-sensitive).
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export function voterId(): string {
  try {
    const existing = window.localStorage.getItem(KEY);
    if (existing) return existing;
    const id = newId();
    window.localStorage.setItem(KEY, id);
    return id;
  } catch {
    memoryId ??= newId();
    return memoryId;
  }
}
