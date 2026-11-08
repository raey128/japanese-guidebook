/**
 * The typed API client, generated from the backend's OpenAPI schema (`make gen-client`).
 * All server calls go through `api`, so frontend and backend can't silently drift apart.
 */
import createClient from "openapi-fetch";

import type { components, paths } from "./schema";

export const api = createClient<paths>({ baseUrl: "", credentials: "include" });

export type Schemas = components["schemas"];

/** Throws an ApiError for non-2xx responses so TanStack Query treats them as errors. */
export class ApiError extends Error {
  constructor(
    public status: number,
    public body: unknown,
  ) {
    super(typeof body === "object" && body && "detail" in body ? String((body as { detail: unknown }).detail) : `HTTP ${status}`);
  }
}

export function unwrap<T>(result: { data?: T; error?: unknown; response: Response }): T {
  if (result.error !== undefined || !result.response.ok) {
    throw new ApiError(result.response.status, result.error);
  }
  return result.data as T;
}
