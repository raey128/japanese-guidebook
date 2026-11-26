import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api, unwrap, type Schemas } from "../api/client";
import { retryUnlessClientError } from "./ranking";

export type VoteList = Schemas["VoteListOut"];
export type VoteItem = Schemas["VoteItemOut"];
export type Choice = "yes" | "maybe" | "no";

export function useVoteList(token: string, voter: string) {
  return useQuery({
    queryKey: ["vote", token, voter],
    retry: retryUnlessClientError,
    queryFn: async () =>
      unwrap(await api.GET("/api/v/{token}", { params: { path: { token }, query: { voter } } })),
  });
}

export async function castVote(token: string, voter: string, itemId: number, choice: Choice) {
  return unwrap(
    await api.PUT("/api/v/{token}/vote", { params: { path: { token } }, body: { voter, item_id: itemId, choice } }),
  );
}

export function useSetName(token: string, voter: string) {
  return useMutation({
    mutationFn: async (name: string) =>
      unwrap(await api.PUT("/api/v/{token}/name", { params: { path: { token } }, body: { voter, name: name.trim() || null } })),
  });
}

export function useDone(token: string, voter: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () =>
      unwrap(await api.POST("/api/v/{token}/done", { params: { path: { token } }, body: { voter } })),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["vote", token] }),
  });
}

/** "3 of 4 have voted" (or "3 people have voted" without a group size). */
export function progressLine(count: number, groupSize: number | null | undefined): string {
  if (groupSize) return `${count} of ${groupSize} ${count === 1 && groupSize === 1 ? "has" : "have"} voted`;
  return `${count} ${count === 1 ? "person has" : "people have"} voted`;
}

/** "Ranked by 5 curators · updated 12 Nov", or null when there's no evidence (never invented). */
export function evidenceLine(curators: number | null | undefined, updated: string | null | undefined): string | null {
  if (!curators) return null;
  const who = `Ranked by ${curators} ${curators === 1 ? "curator" : "curators"}`;
  if (!updated) return who;
  const d = new Date(`${updated}T00:00:00`);
  const when = d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  return `${who} · updated ${when}`;
}
