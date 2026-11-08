import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";

import Button, { ButtonLink, buttonClass } from "./Button";
import Chip from "./Chip";
import EmptyState from "./EmptyState";

test("Button renders a chunky button and blocks clicks when disabled", () => {
  const onClick = vi.fn();
  render(
    <Button disabled onClick={onClick}>
      Save
    </Button>,
  );
  const btn = screen.getByRole("button", { name: "Save" });
  expect(btn).toHaveClass("btn", "btn-primary");
  expect(btn).toHaveAttribute("type", "button");
  fireEvent.click(btn);
  expect(onClick).not.toHaveBeenCalled();
});

test("ButtonLink renders a router link styled as a button", () => {
  render(
    <MemoryRouter>
      <ButtonLink to="/lists" variant="secondary" size="sm">
        Lists
      </ButtonLink>
    </MemoryRouter>,
  );
  const link = screen.getByRole("link", { name: "Lists" });
  expect(link).toHaveAttribute("href", "/lists");
  expect(link).toHaveClass("btn", "btn-secondary", "btn-sm");
});

test("buttonClass composes variants", () => {
  expect(buttonClass({ variant: "danger", icon: true })).toBe("btn btn-danger btn-icon");
});

test("Chip exposes pressed state and hides its emoji from screen readers", () => {
  const onClick = vi.fn();
  render(
    <Chip pressed={false} emoji="🍜" color="red" onClick={onClick}>
      Food
    </Chip>,
  );
  const chip = screen.getByRole("button", { name: "Food" });
  expect(chip).toHaveAttribute("aria-pressed", "false");
  expect(chip.querySelector("[aria-hidden='true']")).toHaveTextContent("🍜");
  expect(chip.style.getPropertyValue("--chip")).toBe("red");
  fireEvent.click(chip);
  expect(onClick).toHaveBeenCalledOnce();
});

test("EmptyState shows a headline and its action", () => {
  render(<EmptyState emoji="🌱" title="Nothing here yet" action={<button type="button">Add</button>} />);
  expect(screen.getByText("Nothing here yet")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Add" })).toBeInTheDocument();
});
