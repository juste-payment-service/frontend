import "server-only";

import { z } from "zod";

import { api as defaultApi, createApiClient } from "./api-client";

/** Services (applications intégratrices) : schémas du contrat et appels `/admin/services`. */

const Iso = z.string();
const Limit = z.number().int().positive().nullable();

export const TransferLimits = z.object({
  max_amount: Limit.optional().default(null),
  daily_max_amount_per_payer: Limit.optional().default(null),
  daily_max_count_per_payer: Limit.optional().default(null),
});

export const Service = z.object({
  id: z.uuid(),
  name: z.string(),
  description: z.string().nullable().optional().default(null),
  status: z.enum(["active", "disabled"]),
  default_callback_url: z.string().nullable().optional().default(null),
  allowed_redirect_hosts: z.array(z.string()).default([]),
  transfers_enabled: z.boolean().default(false),
  transfer_limits: TransferLimits.default({
    max_amount: null,
    daily_max_amount_per_payer: null,
    daily_max_count_per_payer: null,
  }),
  api_key_prefix: z.string(),
  api_key_last_used_at: Iso.nullable().optional().default(null),
  stats: z
    .object({
      users_count: z.number().int(),
      transactions_count: z.number().int(),
      last_transaction_at: Iso.nullable(),
    })
    .default({ users_count: 0, transactions_count: 0, last_transaction_at: null }),
  created_at: Iso,
  updated_at: Iso,
});
export type Service = z.infer<typeof Service>;

export const ListMeta = z.object({
  pagination: z.object({
    page: z.number().int(),
    page_size: z.number().int(),
    total_items: z.number().int(),
    total_pages: z.number().int(),
  }),
});

const ServiceList = z.object({ data: z.array(Service), meta: ListMeta });
const ServiceEnvelope = z.object({ data: Service });
const CreatedEnvelope = z.object({
  data: Service.extend({ api_key: z.string(), webhook_secret: z.string() }),
});
const ApiKeyRotated = z.object({
  data: z.object({
    api_key: z.string(),
    api_key_prefix: z.string(),
    previous_key_expires_at: Iso.nullable(),
  }),
});
const WebhookSecretRotated = z.object({
  data: z.object({ webhook_secret: z.string(), previous_secret_expires_at: Iso }),
});

export type ServicePayload = {
  name: string;
  description: string | null;
  default_callback_url: string | null;
  allowed_redirect_hosts: string[];
  transfers_enabled: boolean;
  transfer_limits: z.infer<typeof TransferLimits>;
};

export const PAGE_SIZE = 20;

function serviceId(id: string): string {
  if (!z.uuid().safeParse(id).success) throw new Error("Identifiant de service invalide.");
  return id;
}

export function createServicesApi(api: ReturnType<typeof createApiClient>) {
  return {
    list: (filters: { q?: string; status?: "active" | "disabled"; page?: number; pageSize?: number }) =>
      api.admin("/admin/services", {
        query: {
          q: filters.q,
          status: filters.status,
          page: filters.page ?? 1,
          page_size: filters.pageSize ?? PAGE_SIZE,
        },
        schema: ServiceList,
      }),

    get: async (id: string) =>
      (await api.admin(`/admin/services/${serviceId(id)}`, { schema: ServiceEnvelope })).data,

    create: async (payload: Partial<ServicePayload>, idempotencyKey: string) =>
      (
        await api.admin("/admin/services", {
          method: "POST",
          body: payload,
          idempotencyKey,
          schema: CreatedEnvelope,
        })
      ).data,

    update: async (id: string, changes: Partial<ServicePayload> & { status?: Service["status"] }) =>
      (
        await api.admin(`/admin/services/${serviceId(id)}`, {
          method: "PATCH",
          body: changes,
          schema: ServiceEnvelope,
        })
      ).data,

    rotateApiKey: async (id: string, gracePeriodHours: number, idempotencyKey: string) =>
      (
        await api.admin(`/admin/services/${serviceId(id)}/api-key`, {
          method: "POST",
          body: { grace_period_hours: gracePeriodHours },
          idempotencyKey,
          schema: ApiKeyRotated,
        })
      ).data,

    rotateWebhookSecret: async (id: string, idempotencyKey: string) =>
      (
        await api.admin(`/admin/services/${serviceId(id)}/webhook-secret`, {
          method: "POST",
          idempotencyKey,
          schema: WebhookSecretRotated,
        })
      ).data,
  };
}

export const services = createServicesApi(defaultApi);

// ------------------------------------------------------------------ formulaire
const optionalLimit = z
  .string()
  .trim()
  .transform((value) => (value === "" ? null : Number(value)))
  .refine((value) => value === null || (Number.isInteger(value) && value > 0), {
    message: "Entier positif attendu (vide = pas de plafond).",
  });

const FormSchema = z.object({
  name: z.string().trim().min(2, "2 à 100 caractères.").max(100, "2 à 100 caractères."),
  description: z
    .string()
    .trim()
    .max(500, "500 caractères au maximum.")
    .transform((value) => value || null),
  default_callback_url: z
    .string()
    .trim()
    .refine((value) => value === "" || /^https:\/\/[^\s]+$/.test(value), {
      message: "URL https:// attendue.",
    })
    .transform((value) => value || null),
  allowed_redirect_hosts: z
    .string()
    .transform((value) =>
      value
        .split(/[\n,]/)
        .map((host) => host.trim().toLowerCase())
        .filter(Boolean),
    )
    .refine((hosts) => hosts.length <= 20, { message: "20 hôtes au maximum." }),
  transfers_enabled: z.string().transform((value) => value === "on"),
  max_amount: optionalLimit,
  daily_max_amount_per_payer: optionalLimit,
  daily_max_count_per_payer: optionalLimit,
});

export type FormResult =
  | { ok: true; value: ServicePayload }
  | { ok: false; errors: Record<string, string> };

/** Champs du formulaire → charge utile de l'API (validation de confort ; l'API fait foi). */
export function parseServiceForm(form: FormData): FormResult {
  const text = (name: string) => {
    const value = form.get(name);
    return typeof value === "string" ? value : "";
  };
  const parsed = FormSchema.safeParse({
    name: text("name"),
    description: text("description"),
    default_callback_url: text("default_callback_url"),
    allowed_redirect_hosts: text("allowed_redirect_hosts"),
    transfers_enabled: text("transfers_enabled"),
    max_amount: text("max_amount"),
    daily_max_amount_per_payer: text("daily_max_amount_per_payer"),
    daily_max_count_per_payer: text("daily_max_count_per_payer"),
  });
  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const field = String(issue.path[0]);
      errors[field] ??= issue.message;
    }
    return { ok: false, errors };
  }
  const { max_amount, daily_max_amount_per_payer, daily_max_count_per_payer, ...rest } = parsed.data;
  return {
    ok: true,
    value: {
      ...rest,
      transfer_limits: { max_amount, daily_max_amount_per_payer, daily_max_count_per_payer },
    },
  };
}
