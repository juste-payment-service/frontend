import "server-only";

import { z } from "zod";

import { api as defaultApi, type createApiClient } from "./api-client";
import { ListMeta } from "./services";
import { dateRange } from "./transactions";

/** Transferts entre clients (supervision admin et reprise des transferts en revue). */

export const STATUSES = ["pending", "processing", "succeeded", "failed", "reversing", "reversed", "requires_review"] as const;
export const PAGE_SIZE = 20;

const Party = z.object({
  user_id: z.uuid().nullable(),
  method: z.string(),
  name: z.string().nullable(),
  phone_masked: z.string().nullable(),
  operator: z.string().nullable(),
  country: z.string().nullable(),
});
const Leg = z.object({ transaction_id: z.uuid(), status: z.string(), completed_at: z.string().nullable() }).nullable();

export const AdminTransfer = z.object({
  id: z.uuid(),
  status: z.string(),
  amount: z.number().int(),
  currency: z.string(),
  fees_paid_by: z.string(),
  fee_amount: z.number().int(),
  debit_amount: z.number().int(),
  credit_amount: z.number().int(),
  service_id: z.uuid(),
  payer: Party,
  beneficiary: Party,
  collection: Leg,
  disbursement: Leg,
  reversal: Leg,
  failure: z.object({ code: z.string(), message: z.string() }).nullable(),
  client_reference: z.string().nullable(),
  description: z.string().nullable(),
  metadata: z.record(z.string(), z.string()).nullable(),
  created_at: z.string(),
  updated_at: z.string(),
  completed_at: z.string().nullable(),
  service_name: z.string(),
  legs: z.array(
    z.object({
      transaction_id: z.uuid(),
      role: z.string(),
      attempt: z.number().int(),
      status: z.string(),
      amount: z.number().int(),
      completed_at: z.string().nullable(),
    }),
  ),
  history: z.array(
    z.object({ status: z.string(), source: z.string(), reason: z.string().nullable(), at: z.string() }),
  ),
});
export type AdminTransfer = z.infer<typeof AdminTransfer>;

const Envelope = z.object({ data: AdminTransfer });

export type TransferFilters = {
  q?: string;
  status?: (typeof STATUSES)[number];
  service_id?: string;
  user_id?: string;
  from?: string;
  to?: string;
  fromDate?: string;
  toDate?: string;
  page: number;
};

function transferId(id: string): string {
  if (!z.uuid().safeParse(id).success) throw new Error("Identifiant de transfert invalide.");
  return id;
}

export function createTransfersApi(api: ReturnType<typeof createApiClient>) {
  return {
    list: (filters: Omit<TransferFilters, "fromDate" | "toDate">) =>
      api.admin("/admin/transfers", {
        query: { ...filters, page_size: PAGE_SIZE },
        schema: z.object({ data: z.array(AdminTransfer), meta: ListMeta }),
      }),
    get: async (id: string) => (await api.admin(`/admin/transfers/${transferId(id)}`, { schema: Envelope })).data,
    /** Nouveau versement au bénéficiaire (transfert en revue, encaissement confirmé). */
    retryDisbursement: async (id: string, idempotencyKey: string) =>
      (
        await api.admin(`/admin/transfers/${transferId(id)}/retry-disbursement`, {
          method: "POST",
          idempotencyKey,
          schema: Envelope,
        })
      ).data,
    /** Remboursement intégral du payeur, motif conservé dans l'historique. */
    reverse: async (id: string, reason: string, idempotencyKey: string) =>
      (
        await api.admin(`/admin/transfers/${transferId(id)}/reverse`, {
          method: "POST",
          body: { reason },
          idempotencyKey,
          schema: Envelope,
        })
      ).data,
  };
}

export const transfers = createTransfersApi(defaultApi);

export function parseTransferFilters(search: Record<string, string | string[] | undefined>): TransferFilters {
  const one = (key: string) => {
    const value = search[key];
    return ((Array.isArray(value) ? value[0] : value) ?? "").trim();
  };
  const uuid = (key: string) => (z.uuid().safeParse(one(key)).success ? one(key) : undefined);
  const status = one("status");
  const filters: TransferFilters = {
    q: one("q").slice(0, 255) || undefined,
    status: STATUSES.includes(status as (typeof STATUSES)[number]) ? (status as TransferFilters["status"]) : undefined,
    service_id: uuid("service_id"),
    user_id: uuid("user_id"),
    ...dateRange(one("from"), one("to")),
    page: Math.max(1, Number.parseInt(one("page"), 10) || 1),
  };
  return Object.fromEntries(Object.entries(filters).filter(([, v]) => v !== undefined)) as TransferFilters;
}

export function parseReason(raw: unknown): { ok: true; reason: string } | { ok: false; error: string } {
  const reason = typeof raw === "string" ? raw.trim() : "";
  return reason.length < 5 || reason.length > 500
    ? { ok: false, error: "Motif obligatoire (5 à 500 caractères)." }
    : { ok: true, reason };
}
