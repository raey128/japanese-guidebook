import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";

import { photoProblem, PHOTO_MAX_BYTES } from "../../hooks/photos";
import PhotoPicker from "./PhotoPicker";

function file(name: string, size = 10): File {
  const f = new File(["x"], name, { type: "image/jpeg" });
  Object.defineProperty(f, "size", { value: size });
  return f;
}

beforeEach(() => {
  let n = 0;
  vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: () => `blob:${n++}`, revokeObjectURL: () => {} }));
});

test("photoProblem: at most 4 per review and 12 MB each", () => {
  expect(photoProblem([file("a")], 0)).toBeNull();
  expect(photoProblem([file("a"), file("b")], 3)).toMatch(/up to 4/);
  expect(photoProblem([file("big", PHOTO_MAX_BYTES + 1)], 0)).toMatch(/12 MB/);
});

function Harness({ have = 0 }: { have?: number }) {
  const [files, setFiles] = useState<File[]>([file("one.jpg"), file("two.jpg")]);
  return <PhotoPicker files={files} onChange={setFiles} alreadyHave={have} />;
}

test("previews can be removed, and the add button hides when full", () => {
  render(<Harness />);
  expect(screen.getAllByRole("img", { name: /New photo/ })).toHaveLength(2);
  expect(screen.getByRole("button", { name: /Add photo/ })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Remove new photo 1" }));
  expect(screen.getAllByRole("img", { name: /New photo/ })).toHaveLength(1);
});

test("no add button once the review has 4 photos", () => {
  render(<Harness have={2} />);
  expect(screen.queryByRole("button", { name: /Add photo/ })).toBeNull();
});
