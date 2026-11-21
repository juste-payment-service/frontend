import "server-only";

import { z } from "zod";

import { api as defaultApi, type createApiClient } from "./api-client";
import { ListMeta } from "./services";

/** Transactions (supervision admin) : schémas du contrat, filtres d'URL et appels. */

const Iso = z.string();
export const STATUSES = ["pending", "succeeded", "failed", "expired"] as const;
export const TYPES = ["payment", "payout"] as const;
export const METHODS = ["mobile_money", "card"] as const;
export const SORTS = ["-created_at", "created_at", "-amount", "amount"] as const;
export const PAGE_SIZE = 20;

const Party = z.object({
  name: z.string().nullable().optional(),
  phone_masked: z.string(),
  operator: z.string(),
  country: z.string(),
});

export const Transaction = z.object({
  id: z.uuid(),
  type: z.enum(TYPES),
  method: z.enum(METHODS),
  status: z.enum(STATUSES),
  amount: z.number().int(),
  currency: z.string(),
  fee_amount: z.number().int().nullable(),
  service_id: z.uuid(),
  user_id: z.uuid(),
  client_reference: z.string().nullable(),
  description: z.string().nullable(),
  payer: Party.nullable(),
  recipient: Party.nullable(),
  next_action: z.object({
    type: z.enum(["none", "redirect"]),
    url: z.string().nullable(),
    expires_at: Iso.nullable().optional(),
  }),
  failure: z.object({ code: z.string(), message: z.string() }).nullable(),
  metadata: z.record(z.string(), z.string()).nullable(),
  transfer: z
    .object({ transfer_id: z.uuid(), role: z.enum(["collection", "disbursement", "reversal"]) })
    .nullable()
    .optional()
    .default(null),
  created_at: Iso,
  updated_at: Iso,
  completed_at: Iso.nullable(),
});

export const AdminTransaction = Transaction.extend({
  service_name: z.string(),
  // Prestataire non figé : la console affiche ce que l'API renvoie.
  provider: z.object({
    name: z.string(),
    transaction_id: z.string().nullable(),
    external_reference: z.string(),
  }),
  history: z.array(z.object({ status: z.enum(STATUSES), source: z.string(), at: Iso })),
  webhook_deliveries: z.array(
    z.object({
      event_id: z.uuid(),
      url: z.string(),
      status: z.enum(["pending", "delivered", "failed"]),
      attempt: z.number().int(),
      response_status: z.number().int().nullable(),
      delivered_at: Iso.nullable(),
      next_retry_at: Iso.nullable(),
    }),
  ),
});
export type AdminTransaction = z.infer<typeof AdminTransaction>;

const List = z.object({ data: z.array(AdminTransaction), meta: ListMeta });
const Envelope = z.object({ data: AdminTransaction });

export type TransactionFilters = {
  q?: string;
  transaction_id?: string;
  transfer_id?: string;
  user_id?: string;
  service_id?: string;
  status?: (typeof STATUSES)[number];
  type?: (typeof TYPES)[number];
  method?: (typeof METHODS)[number];
  /** Bornes envoyées à l'API (ISO, heure du Bénin) ; `to` exclue. */
  from?: string;
  to?: string;
  /** Dates saisies (AAAA-MM-JJ), pour réafficher le formulaire. */
  fromDate?: string;
  toDate?: string;
  sort?: (typeof SORTS)[number];
  page: number;
};

function transactionId(id: string): string {
  if (!z.uuid().safeParse(id).success) throw new Error("Identifiant de transaction invalide.");
  return id;
}

export function createTransactionsApi(api: ReturnType<typeof createApiClient>) {
  return {
    list: (filters: Omit<TransactionFilters, "fromDate" | "toDate">) =>
      api.admin("/admin/transactions", {
        query: { ...filters, page_size: PAGE_SIZE },
        schema: List,
      }),
    get: async (id: string) =>
      (await api.admin(`/admin/transactions/${transactionId(id)}`, { schema: Envelope })).data,
    sync: async (id: string) =>
      (
        await api.admin(`/admin/transactions/${transactionId(id)}/sync`, {
          method: "POST",
          schema: Envelope,
        })
      ).data,
  };
}

export const transactions = createTransactionsApi(defaultApi);

// ------------------------------------------------------------------ filtres d'URL
const BENIN_OFFSET = "+01:00"; // Afrique de l'Ouest (UTC+1), sans heure d'été
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function validDate(value: string): boolean {
  if (!DATE_RE.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
}

function nextDay(value: string): string {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

/** Dates saisies (AAAA-MM-JJ) → bornes ISO à l'heure du Bénin ; `to` exclue, jour de fin inclus. */
export function dateRange(fromRaw: string, toRaw: string) {
  const range: { fromDate?: string; toDate?: string; from?: string; to?: string } = {};
  if (validDate(fromRaw)) {
    range.fromDate = fromRaw;
    range.from = `${fromRaw}T00:00:00${BENIN_OFFSET}`;
  }
  if (validDate(toRaw)) {
    range.toDate = toRaw;
    range.to = `${nextDay(toRaw)}T00:00:00${BENIN_OFFSET}`;
  }
  return range;
}

type Search = Record<string, string | string[] | undefined>;

/** Paramètres d'URL → filtres valides (toute valeur inconnue ou mal formée est ignorée). */
export function parseTransactionFilters(search: Search): TransactionFilters {
  const one = (key: string) => {
    const value = search[key];
    return ((Array.isArray(value) ? value[0] : value) ?? "").trim();
  };
  const uuid = (key: string) => (z.uuid().safeParse(one(key)).success ? one(key) : undefined);
  const pick = <T extends string>(key: string, values: readonly T[]) =>
    values.includes(one(key) as T) ? (one(key) as T) : undefined;

  const filters: TransactionFilters = {
    q: one("q").slice(0, 255) || undefined,
    transaction_id: uuid("transaction_id"),
    transfer_id: uuid("transfer_id"),
    user_id: uuid("user_id"),
    service_id: uuid("service_id"),
    status: pick("status", STATUSES),
    type: pick("type", TYPES),
    method: pick("method", METHODS),
    sort: pick("sort", SORTS),
    page: Math.max(1, Number.parseInt(one("page"), 10) || 1),
  };
  Object.assign(filters, dateRange(one("from"), one("to")));
  return Object.fromEntries(
    Object.entries(filters).filter(([, value]) => value !== undefined),
  ) as TransactionFilters;
}

/** Filtres → paramètres d'URL de la console (dates saisies, pas les bornes ISO). */
export function filtersToSearch(filters: TransactionFilters, page?: number): string {
  const search = new URLSearchParams();
  const { fromDate, toDate, page: current, ...rest } = filters;
  for (const [key, value] of Object.entries(rest)) {
    // `from` / `to` sont les bornes ISO de l'API : l'URL garde les dates saisies.
    if (value && key !== "from" && key !== "to") search.set(key, String(value));
  }
  if (fromDate) search.set("from", fromDate);
  if (toDate) search.set("to", toDate);
  search.set("page", String(page ?? current));
  return search.toString();
}
