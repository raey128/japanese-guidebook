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

test("the 1-10 numbers are a labelled radio group", () => {
  const seen: ReviewValue[] = [];
  render(<Harness onValue={(v) => seen.push(v)} />);
  expect(screen.getByRole("group", { name: /your rating/i })).toBeInTheDocument();
  expect(screen.getAllByRole("radio")).toHaveLength(10);
  fireEvent.click(screen.getByRole("radio", { name: /^8 out of 10/ }));
  expect(seen.at(-1)?.rating).toBe(8);
  expect(screen.getByRole("radio", { name: /^8 out of 10/ })).toBeChecked();
});

test("the comment stays optional, even for a low rating", () => {
  render(<Harness />);
  fireEvent.click(screen.getByRole("radio", { name: /^2 out of 10/ }));
  expect(screen.getByLabelText(/comment \(optional\)/i)).not.toBeRequired();
});
