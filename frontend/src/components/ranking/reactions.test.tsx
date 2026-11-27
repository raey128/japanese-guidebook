import { fireEvent, render, screen } from "@testing-library/react";

import { reactionFor, REACTIONS } from "../../lib/reactions";
import ReactionPicker from "./ReactionPicker";
import { rankLine } from "./ThisOrThat";

test("five reactions, each a hidden 1-10 rating", () => {
  expect(REACTIONS.map((r) => [r.label, r.rating])).toEqual([
    ["Obsessed", 10],
    ["Loved it", 8],
    ["Solid", 6],
    ["Meh", 4],
    ["Skip it", 2],
  ]);
  expect(reactionFor(9)?.key).toBe("obsessed");
  expect(reactionFor(7)?.key).toBe("loved");
  expect(reactionFor(null)).toBeNull();
});

test("one tap on a sticker picks it", () => {
  const picked: string[] = [];
  render(<ReactionPicker value={null} onChange={(r) => picked.push(r.key)} />);
  expect(screen.getAllByRole("radio")).toHaveLength(5);
  fireEvent.click(screen.getByRole("radio", { name: /Loved it/ }));
  expect(picked).toEqual(["loved"]);
});

test("rankLine counts across Liked, Fine and Disliked", () => {
  const item = (place_id: number) => ({ place_id, name: `P${place_id}` });
  const snap = {
    city: { name: "Tokyo" },
    subcategory: { name: "Ramen" },
    buckets: [
      { bucket: "liked", items: [item(1), item(2)] },
      { bucket: "fine", items: [item(3)] },
      { bucket: "disliked", items: [] },
    ],
  } as never;
  expect(rankLine(snap, 3)).toBe("#3 in your Tokyo ramen");
  expect(rankLine(snap, 9)).toBeNull();
});
