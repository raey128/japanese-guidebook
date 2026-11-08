import { ApiError } from "../../api/client";

type Detail = { msg?: unknown };

/** The human-readable part of an API error body (string detail, or FastAPI's 422 list). */
export function detailText(err: unknown): string | null {
  if (!(err instanceof ApiError)) return null;
  const body = err.body as { detail?: unknown } | undefined;
  const d = body?.detail;
  if (typeof d === "string") return d;
  if (Array.isArray(d)) {
    const msgs = d.map((x: Detail) => (typeof x?.msg === "string" ? x.msg : "")).filter(Boolean);
    return msgs.length ? msgs.join("; ") : null;
  }
  return null;
}

/** Message for a failed flag submission. */
export function flagErrorMessage(err: unknown, what: "place" | "note" = "place"): string {
  if (err instanceof ApiError) {
    if (err.status === 409)
      return what === "note"
        ? "You've already flagged this note"
        : "You've already flagged this place for that reason";
    if (err.status === 401) return "Sign in to flag.";
    if (err.status === 403) return detailText(err) ?? "You can't flag this.";
    if (err.status === 422) return detailText(err) ?? "Please check the details and try again.";
    return detailText(err) ?? "Something went wrong. Please try again.";
  }
  return "Something went wrong. Please try again.";
}

/** Message for a failed admin action. */
export function adminErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 401) return "Sign in again to continue.";
    if (err.status === 403) return "Admins only.";
    return detailText(err) ?? `Request failed (${err.status}).`;
  }
  return "Something went wrong. Please try again.";
}
