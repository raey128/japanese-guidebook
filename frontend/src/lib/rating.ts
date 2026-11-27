import type { Schemas } from "../api/client";

type Bucket = Schemas["MyRanking"]["bucket"];

/** Ratings are numbers from 1 to 10 (R3.6). Mirrors the API. */
export const RATING_MAX = 10;
/**
 * Ratings below this need a comment. 0 = comments are always optional (decided 2026-11-27,
 * "no comment is required for now"); mirrors the API's `comment_required_below` setting.
 */
export const COMMENT_REQUIRED_BELOW = 0;

/** Words for the two ends of the scale, shown under the buttons. */
export const RATING_ENDS = { low: "skip it", high: "must go" } as const;

/** A short word for a rating, used in screen-reader labels and "You gave it 8 · Great". */
export function ratingWord(rating: number): string {
  if (rating >= 9) return "Must go";
  if (rating >= 8) return "Great";
  if (rating >= 6) return "Good";
  if (rating === 5) return "Okay";
  if (rating >= 3) return "Not great";
  return "Skip it";
}

/** 8-10 = Liked, 5-7 = Fine, 1-4 = Disliked (the same split as the API). */
export function bucketForRating(rating: number): Bucket {
  return rating >= 8 ? "liked" : rating >= 5 ? "fine" : "disliked";
}

export function needsComment(rating: number | null): boolean {
  return rating !== null && rating < COMMENT_REQUIRED_BELOW;
}

/** What's missing before a review can be sent, or null when it's fine. */
export function reviewProblem(rating: number | null, note: string): { rating?: string; note?: string } | null {
  if (rating === null) return { rating: "Pick a number from 1 to 10." };
  if (needsComment(rating) && !note.trim()) {
    return { note: "Tell others why: ratings of 4 or lower need a comment." };
  }
  return null;
}
