import { bucketForRating, needsComment, reviewProblem, starsText } from "./rating";

test("4–5 stars are Liked, 3 Fine, 1–2 Disliked", () => {
  expect([1, 2, 3, 4, 5].map(bucketForRating)).toEqual(["disliked", "disliked", "fine", "liked", "liked"]);
});

test("a comment is required only below 3 stars", () => {
  expect(needsComment(null)).toBe(false);
  expect(needsComment(1)).toBe(true);
  expect(needsComment(2)).toBe(true);
  expect(needsComment(3)).toBe(false);
});

test("reviewProblem: rating is mandatory, comment is mandatory when low", () => {
  expect(reviewProblem(null, "great")).toEqual({ rating: expect.any(String) });
  expect(reviewProblem(2, "   ")).toEqual({ note: expect.stringMatching(/comment/) });
  expect(reviewProblem(2, "Cold food")).toBeNull();
  expect(reviewProblem(5, "")).toBeNull();
});

test("starsText", () => {
  expect(starsText(3)).toBe("★★★☆☆");
});
