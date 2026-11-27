/**
 * "Been there" reactions (decided 2026-11-27): one tap on a sticker instead of a number. Each
 * stands for a hidden 1-10 rating, which decides the list and the starting spot.
 */
export type ReactionKey = "obsessed" | "loved" | "solid" | "meh" | "skip";

export interface Reaction {
  key: ReactionKey;
  label: string;
  emoji: string;
  rating: number;
  /** Sticker colours (text on these is ≥ 4.5:1). */
  bg: string;
  border: string;
}

export const REACTIONS: Reaction[] = [
  { key: "obsessed", label: "Obsessed", emoji: "🤩", rating: 10, bg: "#be185d", border: "#831843" },
  { key: "loved", label: "Loved it", emoji: "😍", rating: 8, bg: "#c2410c", border: "#7c2d12" },
  { key: "solid", label: "Solid", emoji: "👍", rating: 6, bg: "#0f766e", border: "#134e4a" },
  { key: "meh", label: "Meh", emoji: "😐", rating: 4, bg: "#57534e", border: "#292524" },
  { key: "skip", label: "Skip it", emoji: "🙅", rating: 2, bg: "#1e293b", border: "#020617" },
];

/** The reaction a stored rating corresponds to (for showing a past choice). */
export function reactionFor(rating: number | null | undefined): Reaction | null {
  if (rating == null) return null;
  return REACTIONS.reduce((best, r) => (Math.abs(r.rating - rating) < Math.abs(best.rating - rating) ? r : best));
}
