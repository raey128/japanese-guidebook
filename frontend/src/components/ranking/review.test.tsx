import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";

import ReviewFields, { EMPTY_REVIEW, type ReviewValue } from "./ReviewFields";

function Harness({ onValue }: { onValue?: (v: ReviewValue) => void }) {
  const [v, setV] = useState<ReviewValue>(EMPTY_REVIEW);
  return (
    <ReviewFields
      value={v}
      onChange={(next) => {
        setV(next);
        onValue?.(next);
      }}
    />
  );
}

test("the stars are a labelled radio group", () => {
  const seen: ReviewValue[] = [];
  render(<Harness onValue={(v) => seen.push(v)} />);
  expect(screen.getByRole("group", { name: /your rating/i })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("radio", { name: /4 stars/i }));
  expect(seen.at(-1)?.rating).toBe(4);
  expect(screen.getByRole("radio", { name: /4 stars/i })).toBeChecked();
});

test("the comment becomes required below 3 stars", () => {
  render(<Harness />);
  fireEvent.click(screen.getByRole("radio", { name: /5 stars/i }));
  expect(screen.getByLabelText(/comment \(optional\)/i)).not.toBeRequired();
  fireEvent.click(screen.getByRole("radio", { name: /2 stars/i }));
  const comment = screen.getByRole("textbox", { name: /comment/i });
  expect(comment).toBeRequired();
  expect(screen.queryByLabelText(/optional/i)).toBeNull();
});
