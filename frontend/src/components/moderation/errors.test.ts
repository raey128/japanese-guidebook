import { ApiError } from "../../api/client";
import { adminErrorMessage, detailText, flagErrorMessage } from "./errors";

describe("flagErrorMessage", () => {
  it("maps 409 to the already-flagged message", () => {
    expect(flagErrorMessage(new ApiError(409, { detail: "dup" }))).toBe(
      "You've already flagged this place for that reason",
    );
  });
  it("uses the 403 detail", () => {
    expect(flagErrorMessage(new ApiError(403, { detail: "Not allowed" }))).toBe("Not allowed");
  });
  it("joins 422 list messages", () => {
    const err = new ApiError(422, { detail: [{ msg: "a" }, { msg: "b" }] });
    expect(flagErrorMessage(err)).toBe("a; b");
  });
});

describe("adminErrorMessage", () => {
  it("handles 403 and detail", () => {
    expect(adminErrorMessage(new ApiError(403, {}))).toBe("Admins only.");
    expect(adminErrorMessage(new ApiError(409, { detail: "Conflict" }))).toBe("Conflict");
  });
  it("returns null detail for non-API errors", () => {
    expect(detailText(new Error("x"))).toBeNull();
  });
});
