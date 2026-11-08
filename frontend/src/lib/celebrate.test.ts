import { ordinal, rankingMessage } from "./celebrate";

test.each([
  [1, "1st"],
  [2, "2nd"],
  [3, "3rd"],
  [4, "4th"],
  [11, "11th"],
  [12, "12th"],
  [13, "13th"],
  [21, "21st"],
  [22, "22nd"],
  [101, "101st"],
  [111, "111th"],
])("ordinal(%d) = %s", (n, s) => {
  expect(ordinal(n)).toBe(s);
});

test("regular counts get the progress line", () => {
  expect(rankingMessage(7, "Tokyo")).toEqual({ title: "Nice! That's your 7th place in Tokyo!", big: false });
});

test.each([1, 5, 10, 25, 50])("milestone %d is a big celebration naming the city", (n) => {
  const m = rankingMessage(n, "Kyoto");
  expect(m.big).toBe(true);
  expect(m.title).toContain("Kyoto");
  expect(m.title).not.toContain("{city}");
});
