import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";

import { evidenceLine, progressLine } from "../hooks/voting";
import VotePage from "./VotePage";

const tokyo = { id: 1, slug: "tokyo", name: "Tokyo", name_ja: "東京", country_code: "JP", lat: 35.68, lng: 139.77 };

function place(id: number, name: string) {
  return {
    id, name, name_ja: null, address: null, lat: 35.6, lng: 139.7,
    subcategory: { id: 1, slug: "ramen", name: "Ramen", top_category: "food" },
    location: { id: 1, slug: "ebisu", name: "Ebisu", name_ja: null, city_id: 1, is_catch_all: false, lat: null, lng: null },
    city: tokyo, public_score: null, ranker_count: 0, badges: [], status: "live",
  };
}

function list(over: Record<string, unknown> = {}) {
  return {
    title: "Tokyo, early December", organizer_name: "Maya", city: tokyo, is_open: true, group_size: 4,
    item_count: 2, voter_count: 2, me: null,
    items: [
      { item_id: 11, place: place(1, "AFURI Ebisu"), curator_count: 5, evidence_updated: "2026-11-12", my_choice: null, tally: null },
      { item_id: 12, place: place(2, "Fuunji"), curator_count: null, evidence_updated: null, my_choice: "maybe", tally: null },
    ],
    ...over,
  };
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function renderPage() {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={["/v/tok"]}>
        <Routes>
          <Route path="/v/:token" element={<VotePage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

afterEach(() => vi.unstubAllGlobals());

test("text helpers: honest evidence and progress lines", () => {
  expect(evidenceLine(5, "2026-11-12")).toBe("Ranked by 5 curators · updated 12 Nov");
  expect(evidenceLine(1, null)).toBe("Ranked by 1 curator");
  expect(evidenceLine(null, "2026-11-12")).toBeNull();
  expect(progressLine(3, 4)).toBe("3 of 4 have voted");
  expect(progressLine(3, null)).toBe("3 people have voted");
  expect(progressLine(1, null)).toBe("1 person has voted");
});

test("header, cards and saving a tap", async () => {
  const calls: { method: string; path: string; body: unknown }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (req: Request) => {
      const url = new URL(req.url);
      const body = req.method === "GET" ? null : await req.json();
      calls.push({ method: req.method, path: url.pathname, body });
      if (url.pathname === "/api/v/tok") return json(list());
      if (url.pathname === "/api/v/tok/vote") return json({ choice: (body as { choice: string }).choice, voted_count: 2 });
      if (url.pathname === "/api/v/tok/done") return json({ voter_count: 3, group_size: 4 });
      return json({ detail: "nope" }, 404);
    }),
  );
  renderPage();
  expect(await screen.findByRole("heading", { level: 1, name: "Maya picked 2 places for Tokyo." })).toBeInTheDocument();
  expect(screen.getByText("Ranked by 5 curators · updated 12 Nov")).toBeInTheDocument();
  expect(screen.getByLabelText(/Your name, so Maya knows it's you/)).toBeInTheDocument();
  // Fuunji was already "maybe" from this browser.
  const fuunji = screen.getByRole("group", { name: "Fuunji" });
  await waitFor(() => expect(fuunji.querySelector('[aria-pressed="true"]')).toHaveTextContent("Maybe"));
  expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "1");

  const afuri = screen.getByRole("group", { name: "AFURI Ebisu" });
  fireEvent.click(afuri.querySelectorAll("button")[0]!);
  expect(await screen.findByText("Saved")).toBeInTheDocument();
  const vote = calls.find((c) => c.path === "/api/v/tok/vote")!;
  expect(vote.body).toMatchObject({ item_id: 11, choice: "yes" });
  expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "2");

  fireEvent.click(screen.getByRole("button", { name: "Done" }));
  expect(await screen.findByRole("heading", { name: "Thanks. 3 of 4 have voted." })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Start a list" })).toBeInTheDocument();
});

test("a failed save shows Retry, which re-sends", async () => {
  let fail = true;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (req: Request) => {
      const url = new URL(req.url);
      if (url.pathname === "/api/v/tok") return json(list());
      if (url.pathname === "/api/v/tok/vote") {
        if (fail) {
          fail = false;
          return json({ detail: "Internal server error" }, 500);
        }
        return json({ choice: "no", voted_count: 2 });
      }
      return json({}, 404);
    }),
  );
  renderPage();
  const afuri = await screen.findByRole("group", { name: "AFURI Ebisu" });
  fireEvent.click(afuri.querySelectorAll("button")[2]!);
  fireEvent.click(await screen.findByRole("button", { name: "Retry" }));
  expect(await screen.findByText("Saved")).toBeInTheDocument();
});

test("with voting off the link is just recommendations, with the counts so far", async () => {
  const closed = list({
    is_open: false,
    voter_count: 3,
    items: [
      { ...list().items[0], tally: { yes: 2, maybe: 0, no: 1, yes_names: [], maybe_names: [], no_names: [] } },
      { ...list().items[1], tally: { yes: 0, maybe: 0, no: 0, yes_names: [], maybe_names: [], no_names: [] } },
    ],
  });
  vi.stubGlobal("fetch", vi.fn(async () => json(closed)));
  renderPage();
  expect(await screen.findByText(/3 .*voted so far/)).toBeInTheDocument();
  expect(screen.getByLabelText("Votes so far: 2 yes, 0 maybe, 1 no")).toBeInTheDocument();
  expect(screen.getAllByRole("link", { name: /Open in Google Maps/ })).toHaveLength(2);
  expect(screen.getByRole("button", { name: /Save these places/ })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /^✅ Yes/ })).toBeNull();
  expect(screen.queryByRole("button", { name: "Done" })).toBeNull();
});

test("an unknown link explains itself", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => json({ detail: "nope" }, 404)));
  renderPage();
  expect(await screen.findByRole("heading", { name: "This link doesn't work" })).toBeInTheDocument();
});
