import { bucketForRating, needsComment, ratingWord, reviewProblem } from "./rating";

test("8-10 are Liked, 5-7 Fine, 1-4 Disliked", () => {
  expect([1, 4, 5, 7, 8, 10].map(bucketForRating)).toEqual(["disliked", "disliked", "fine", "fine", "liked", "liked"]);
});

test("comments are optional for every rating (for now)", () => {
  expect([null, 1, 4, 5, 10].map(needsComment)).toEqual([false, false, false, false, false]);
});

test("reviewProblem: a rating is mandatory, a comment never is", () => {
  expect(reviewProblem(null, "great")).toEqual({ rating: expect.any(String) });
  expect(reviewProblem(2, "   ")).toBeNull();
  expect(reviewProblem(9, "")).toBeNull();
});

test("rating words", () => {
  expect([10, 8, 6, 5, 3, 1].map(ratingWord)).toEqual(["Must go", "Great", "Good", "Okay", "Not great", "Skip it"]);
});
