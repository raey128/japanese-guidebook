import { fireEvent, render, screen } from "@testing-library/react";

import type { Schemas } from "../../api/client";
import { usernameProblem } from "../app/InlineSignIn";
import CategoryChips from "./CategoryChips";
import PlacePin, { pinLabel } from "./PlacePin";

const point = (over: Partial<Schemas["MapPoint"]> = {}): Schemas["MapPoint"] => ({
  id: 1,
  lat: 35.7,
  lng: 139.8,
  name: "Ichiran",
  name_ja: null,
  subcategory_slug: "ramen",
  top_category: "food",
  public_score: 8.66,
  ranker_count: 3,
  badges: [],
  saved: false,
  ranked: false,
  ...over,
});

test("pin labels carry the category, score when zoomed in, and personal marks", () => {
  expect(pinLabel(point(), "Ramen", false)).toBe("Ichiran, Ramen");
  expect(pinLabel(point(), "Ramen", true)).toBe("Ichiran, Ramen, score 8.7");
  expect(pinLabel(point({ saved: true, ranked: true, badges: ["pending"] }), "Ramen", false)).toBe(
    "Ichiran, Ramen, saved, ranked by you, pending review",
  );
  expect(pinLabel(point({ public_score: null, ranker_count: 0 }), "Ramen", true)).toBe("Ichiran, Ramen");
});

test("pin shows the score only when asked and selects on click", () => {
  const onSelect = vi.fn();
  const { rerender } = render(<PlacePin point={point()} categoryName="Ramen" selected={false} showScore={false} onSelect={onSelect} />);
  expect(screen.queryByText("8.7")).toBeNull();
  rerender(<PlacePin point={point()} categoryName="Ramen" selected={false} showScore onSelect={onSelect} />);
  expect(screen.getByText("8.7")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /^Ichiran, Ramen/ }));
  expect(onSelect).toHaveBeenCalledOnce();
});

const subs: Schemas["SubcategoryOut"][] = [
  { id: 1, slug: "ramen", name: "Ramen", top_category: "food" },
  { id: 2, slug: "sushi", name: "Sushi", top_category: "food" },
  { id: 3, slug: "temple", name: "Temple", top_category: "sights" },
];

test("category chips: top chip reveals its subcategories; tapping the active chip clears it", () => {
  const onCategory = vi.fn();
  const { rerender } = render(
    <CategoryChips category="" onCategory={onCategory} subcategories={subs} showSaved={false} savedOnly={false} onSavedOnly={() => {}} />,
  );
  expect(screen.queryByRole("button", { name: "Saved" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Food" }));
  expect(onCategory).toHaveBeenLastCalledWith("food");

  rerender(<CategoryChips category="food" onCategory={onCategory} subcategories={subs} showSaved savedOnly={false} onSavedOnly={() => {}} />);
  expect(screen.getByRole("button", { name: "Food" })).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByRole("button", { name: "Ramen" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Temple" })).toBeNull();
  expect(screen.getByRole("button", { name: "Saved" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Food" }));
  expect(onCategory).toHaveBeenLastCalledWith("");

  fireEvent.click(screen.getByRole("button", { name: "Ramen" }));
  expect(onCategory).toHaveBeenLastCalledWith("ramen");
});

test.each([
  ["ab", "Use 3–20 characters."],
  ["Rei", "Use lowercase letters, digits and underscores only."],
  ["rei_tokyo", null],
])("usernameProblem(%s)", (name, problem) => {
  expect(usernameProblem(name)).toBe(problem);
});
