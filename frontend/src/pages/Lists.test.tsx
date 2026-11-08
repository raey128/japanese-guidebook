import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";

import type { Schemas } from "../api/client";
import { groupByCity } from "../components/lists/WantToGoList";
import { getLastCity, setLastCity } from "../lib/lastCity";
import Lists, { parseTab } from "./Lists";

const tokyo = { id: 1, slug: "tokyo", name: "Tokyo", name_ja: "東京", country_code: "JP", lat: 35.68, lng: 139.77 };
const kyoto = { id: 2, slug: "kyoto", name: "Kyoto", name_ja: "京都", country_code: "JP", lat: 35.01, lng: 135.77 };

function json(body: unknown) {
  return new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json" } });
}

function stubApi(user: unknown = null) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(input instanceof Request ? input.url : String(input), "http://localhost");
      switch (url.pathname) {
        case "/api/me":
          return json({ user });
        case "/api/cities":
          return json([{ ...tokyo, locations: [] }, { ...kyoto, locations: [] }]);
        case "/api/subcategories":
          return json([{ id: 1, slug: "ramen", name: "Ramen", top_category: "food" }]);
        default:
          if (url.pathname.startsWith("/api/lists/")) {
            const [, , , city, category] = url.pathname.split("/");
            return json({ title: `${category} in ${city}`, city: tokyo, items: [], total: 0, offset: 0, limit: 50 });
          }
          return new Response("not found", { status: 404 });
      }
    }),
  );
}

function CurrentUrl() {
  const loc = useLocation();
  return <output data-testid="url">{loc.pathname + loc.search}</output>;
}

function renderAt(path: string) {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/lists" element={<><Lists /><CurrentUrl /></>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

test("defaults to the All segment with the last-used city's food list", async () => {
  stubApi();
  setLastCity("kyoto");
  renderAt("/lists");
  expect(screen.getByRole("button", { name: "All" })).toHaveAttribute("aria-pressed", "true");
  expect(await screen.findByRole("heading", { level: 2, name: "food in kyoto" })).toBeInTheDocument();
});

test("switching segments updates the URL without leaving the page", async () => {
  stubApi({ id: 1, username: "rei", is_admin: false });
  renderAt("/lists");
  fireEvent.click(screen.getByRole("button", { name: "Saved" }));
  expect(screen.getByTestId("url")).toHaveTextContent("/lists?tab=want_to_go");
  expect(screen.getByRole("button", { name: "Saved" })).toHaveAttribute("aria-pressed", "true");
  fireEvent.click(screen.getByRole("button", { name: "All" }));
  expect(screen.getByTestId("url")).toHaveTextContent(/^\/lists$/);
});

test.each([
  ["mine", "/sign-in?next=%2Flists%3Ftab%3Dmine"],
  ["want_to_go", "/sign-in?next=%2Flists%3Ftab%3Dwant_to_go"],
])("logged out, the %s segment asks to sign in and comes back", async (tab, href) => {
  stubApi(null);
  renderAt(`/lists?tab=${tab}`);
  const link = await screen.findByRole("link", { name: "Sign in" });
  expect(link).toHaveAttribute("href", href);
  expect(screen.getByText(/to see your lists/)).toBeInTheDocument();
});

test("parseTab falls back to all for unknown values", () => {
  expect(parseTab(null)).toBe("all");
  expect(parseTab("bogus")).toBe("all");
  expect(parseTab("mine")).toBe("mine");
  expect(parseTab("want_to_go")).toBe("want_to_go");
});

test("groupByCity keeps newest-first order inside and across cities", () => {
  const p = (id: number, city: typeof tokyo) => ({ id, city }) as unknown as Schemas["PlaceSummary"];
  const groups = groupByCity([p(1, tokyo), p(2, kyoto), p(3, tokyo)]);
  expect(groups.map((g) => g.city.slug)).toEqual(["tokyo", "kyoto"]);
  expect(groups[0]!.items.map((i) => i.id)).toEqual([1, 3]);
});

test("last-used city falls back to Tokyo when storage is blocked", () => {
  const spy = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
    throw new Error("blocked");
  });
  expect(getLastCity()).toBe("tokyo");
  spy.mockRestore();
});
