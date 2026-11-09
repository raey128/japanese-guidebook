import type { Schemas } from "../api/client";

type Bucket = Schemas["MyRanking"]["bucket"];

/** R3.6: a rating below this needs a comment, so low ratings always say why. Mirrors the API. */
export const COMMENT_REQUIRED_BELOW = 3;

export const RATING_LABELS: Record<number, string> = {
  1: "Awful",
  2: "Not great",
  3: "Okay",
  4: "Good",
  5: "Amazing",
};

/** 4–5 stars = Liked, 3 = Fine, 1–2 = Disliked (the same split as the API). */
export function bucketForRating(rating: number): Bucket {
  return rating >= 4 ? "liked" : rating === 3 ? "fine" : "disliked";
}

export function needsComment(rating: number | null): boolean {
  return rating !== null && rating < COMMENT_REQUIRED_BELOW;
}

/** What's missing before a review can be sent, or null when it's fine. */
export function reviewProblem(rating: number | null, note: string): { rating?: string; note?: string } | null {
  if (rating === null) return { rating: "Pick a star rating." };
  if (needsComment(rating) && !note.trim()) {
    return { note: `Tell others why: ratings below ${COMMENT_REQUIRED_BELOW} stars need a comment.` };
  }
  return null;
}

export function starsText(rating: number): string {
  return "★".repeat(rating) + "☆".repeat(5 - rating);
}
