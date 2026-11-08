/** The city the user last picked, remembered per browser (R11.7). Storage can be blocked, so every access is guarded. */
const KEY = "jg.lastCity";
export const DEFAULT_CITY = "tokyo";

export function getLastCity(): string {
  try {
    return window.localStorage.getItem(KEY) || DEFAULT_CITY;
  } catch {
    return DEFAULT_CITY;
  }
}

export function setLastCity(slug: string): void {
  try {
    window.localStorage.setItem(KEY, slug);
  } catch {
    // Private mode or blocked storage: the default city is fine.
  }
}
