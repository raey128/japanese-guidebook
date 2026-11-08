import { render, screen } from "@testing-library/react";

import Badges from "./Badges";
import Score from "./Score";

test("score formats rankers and unranked", () => {
  const { rerender } = render(<Score score={8.44} rankerCount={12} />);
  expect(screen.getByText("8.4 · 12 rankers")).toBeInTheDocument();
  rerender(<Score score={null} rankerCount={0} />);
  expect(screen.getByText("Not yet ranked")).toBeInTheDocument();
});

test("badges render labels", () => {
  render(<Badges badges={["unverified", "reported_closed"]} />);
  expect(screen.getByText("Unverified")).toBeInTheDocument();
  expect(screen.getByText("Reported closed")).toBeInTheDocument();
});
