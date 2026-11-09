import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";

import SearchBar from "./SearchBar";

const tokyo = {
  id: 1, slug: "tokyo", name: "Tokyo", name_ja: "東京", country_code: "JP", lat: 35.68, lng: 139.77, locations: [],
};

function json(body: unknown) {
  return new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json" } });
}

afterEach(() => vi.unstubAllGlobals());

// R12.7: a neighbourhood or station that isn't one of our areas still flies the map there.
test("typing an area name offers it from the map and picking it flies there", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(input instanceof Request ? input.url : String(input), "http://localhost");
      if (url.pathname === "/api/geo/areas") {
        return json({
          results: [{ name: "Shimbashi", detail: "Minato, Tokyo", kind: "station", lat: 35.666, lng: 139.758, zoom: 16 }],
        });
      }
      if (url.pathname === "/api/suggest") return json({ areas: [], subcategories: [], on_map: [], elsewhere: [] });
      return new Response("not found", { status: 404 });
    }),
  );
  const onPickSpot = vi.fn();
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <SearchBar
        cities={[tokyo]}
        city="tokyo"
        onCity={() => {}}
        category=""
        bbox={null}
        onPickArea={() => {}}
        onPickSubcategory={() => {}}
        onPickPlace={() => {}}
        onPickSpot={onPickSpot}
        onAddManually={() => {}}
      />
    </QueryClientProvider>,
  );
  const box = screen.getByRole("combobox", { name: "Search places and areas" });
  fireEvent.focus(box);
  fireEvent.change(box, { target: { value: "shimbashi" } });
  const option = await screen.findByRole("option", { name: /Shimbashi.*Station · Minato, Tokyo/ });
  fireEvent.mouseDown(option);
  fireEvent.click(option);
  expect(onPickSpot).toHaveBeenCalledWith(expect.objectContaining({ name: "Shimbashi", lat: 35.666, lng: 139.758, zoom: 16 }));
});
