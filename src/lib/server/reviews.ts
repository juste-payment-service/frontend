import "server-only";

import { z } from "zod";

import { api as defaultApi, type createApiClient } from "./api-client";
import { ListMeta } from "./services";

/**
 * Dossiers « à régulariser » : anomalies d'argent qui exigent une action humaine. La console lit le
 * libellé fourni par l'API (`label`) et accepte un type futur sans modification.
 */

export const KINDS = ["late_approval", "amount_mismatch", "payout_stuck"] as const;
export const PAGE_SIZE = 20;

export const ReviewCase = z.object({
  id: z.uuid(),
  kind: z.string(),
  label: z.string(),
  status: z.enum(["open", "resolved"]),
  transaction_id: z.uuid(),
  service_id: z.uuid(),
  details: z.record(z.string(), z.unknown()),
  occurrences: z.number().int(),
  opened_at: z.string(),
  last_seen_at: z.string(),
  resolved_at: z.string().nullable(),
  resolution_note: z.string().nullable(),
});
export type ReviewCase = z.infer<typeof ReviewCase>;

const List = z.object({ data: z.array(ReviewCase), meta: ListMeta });
const Envelope = z.object({ data: ReviewCase });

export type ReviewFilters = {
  status?: "open" | "resolved";
  kind?: (typeof KINDS)[number];
  service_id?: string;
  transaction_id?: string;
  page: number;
};

function reviewId(id: string): string {
  if (!z.uuid().safeParse(id).success) throw new Error("Identifiant de dossier invalide.");
  return id;
}

export function createReviewsApi(api: ReturnType<typeof createApiClient>) {
  return {
    list: (filters: ReviewFilters) =>
      api.admin("/admin/reviews", { query: { ...filters, page_size: PAGE_SIZE }, schema: List }),
    /** Nombre de dossiers ouverts (badge de la navigation) : une seule ligne demandée. */
    openCount: async () =>
      (
        await api.admin("/admin/reviews", {
          query: { status: "open", page: 1, page_size: 1 },
          schema: List,
          timeoutMs: 3_000,
        })
      ).meta.pagination.total_items,
    get: async (id: string) =>
      (await api.admin(`/admin/reviews/${reviewId(id)}`, { schema: Envelope })).data,
    resolve: async (id: string, note: string, idempotencyKey: string) =>
      (
        await api.admin(`/admin/reviews/${reviewId(id)}/resolve`, {
          method: "POST",
          body: { note },
          idempotencyKey,
          schema: Envelope,
        })
      ).data,
  };
}

export const reviews = createReviewsApi(defaultApi);

type Search = Record<string, string | string[] | undefined>;

/** Ouvre par défaut sur les dossiers ouverts ; `status=all` montre aussi les dossiers clos. */
export function parseReviewFilters(search: Search): ReviewFilters {
  const one = (key: string) => {
    const value = search[key];
    return ((Array.isArray(value) ? value[0] : value) ?? "").trim();
  };
  const uuid = (key: string) => (z.uuid().safeParse(one(key)).success ? one(key) : undefined);
  const status = one("status");
  const kind = one("kind");
  const filters: ReviewFilters = {
    status: status === "all" ? undefined : status === "resolved" ? "resolved" : "open",
    kind: KINDS.includes(kind as (typeof KINDS)[number]) ? (kind as ReviewFilters["kind"]) : undefined,
    service_id: uuid("service_id"),
    transaction_id: uuid("transaction_id"),
    page: Math.max(1, Number.parseInt(one("page"), 10) || 1),
  };
  return Object.fromEntries(Object.entries(filters).filter(([, v]) => v !== undefined)) as ReviewFilters;
}

export function parseResolveNote(raw: unknown): { ok: true; note: string } | { ok: false; error: string } {
  const note = typeof raw === "string" ? raw.trim() : "";
  if (note.length < 5 || note.length > 500) {
    return { ok: false, error: "Décrivez l'action menée (5 à 500 caractères)." };
  }
  return { ok: true, note };
}
