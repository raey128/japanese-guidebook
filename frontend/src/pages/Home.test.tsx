import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";

import Home from "./Home";

test("shows the API health fetched through the generated client", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify({ status: "ok", database: "ok" }), {
      headers: { "Content-Type": "application/json" },
    })),
  );
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>
        <Home />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  expect(await screen.findByText(/API status: ok/)).toBeInTheDocument();
  vi.unstubAllGlobals();
});
