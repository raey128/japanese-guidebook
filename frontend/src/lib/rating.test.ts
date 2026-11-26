import { bucketForRating, needsComment, ratingWord, reviewProblem } from "./rating";

test("8-10 are Liked, 5-7 Fine, 1-4 Disliked", () => {
  expect([1, 4, 5, 7, 8, 10].map(bucketForRating)).toEqual(["disliked", "disliked", "fine", "fine", "liked", "liked"]);
});

test("a comment is required at 4 or lower", () => {
  expect(needsComment(null)).toBe(false);
  expect(needsComment(1)).toBe(true);
  expect(needsComment(4)).toBe(true);
  expect(needsComment(5)).toBe(false);
});

test("reviewProblem: rating is mandatory, comment is mandatory when low", () => {
  expect(reviewProblem(null, "great")).toEqual({ rating: expect.any(String) });
  expect(reviewProblem(4, "   ")).toEqual({ note: expect.stringMatching(/comment/) });
  expect(reviewProblem(3, "Cold food")).toBeNull();
  expect(reviewProblem(9, "")).toBeNull();
});

test("rating words", () => {
  expect([10, 8, 6, 5, 3, 1].map(ratingWord)).toEqual(["Must go", "Great", "Good", "Okay", "Not great", "Skip it"]);
});
