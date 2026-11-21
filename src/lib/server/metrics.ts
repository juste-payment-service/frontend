import "server-only";

import { z } from "zod";

import { api as defaultApi, type createApiClient } from "./api-client";

/** Tableau de bord : indicateurs par devise et séries temporelles (`/admin/metrics/*`). */

export const METRICS = [
  "collected_amount",
  "paid_out_amount",
  "net_amount",
  "balance",
  "payments_count",
  "payouts_count",
  "success_rate",
] as const;
export const GRANULARITIES = ["hour", "day", "week", "month"] as const;
export const CURRENCIES = ["XOF", "XAF", "EUR", "USD"] as const;
export const RANGES = ["7d", "30d", "90d", "12m", "custom"] as const;
export const MAX_COMPARED_SERVICES = 4; // palette validée pour 4 séries
export const TIME_ZONE = "Africa/Porto-Novo";
const BENIN_OFFSET = "+01:00";
const MAX_DAYS = 366;
const MAX_POINTS = 1000;

export type Metric = (typeof METRICS)[number];
export type Granularity = (typeof GRANULARITIES)[number];

export type DashboardFilters = {
  range: (typeof RANGES)[number];
  fromDate: string;
  toDate: string;
  /** Bornes envoyées à l'API (`to` exclue : le dernier jour est inclus en entier). */
  from: string;
  to: string;
  currency: (typeof CURRENCIES)[number];
  metric: Metric;
  granularity: Granularity;
  serviceIds: string[];
};

const CurrencySummary = z.object({
  currency: z.string(),
  balance: z.number(),
  collected_amount: z.number(),
  paid_out_amount: z.number(),
  fees_amount: z.number(),
  payments_count: z.number(),
  payouts_count: z.number(),
  succeeded_count: z.number(),
  failed_count: z.number(),
  pending_count: z.number(),
  success_rate: z.number().nullable(),
  average_payment_amount: z.number().nullable(),
});
export type CurrencySummary = z.infer<typeof CurrencySummary>;

const Summary = z.object({
  data: z.object({
    period: z.object({ from: z.string(), to: z.string() }),
    service_id: z.string().nullable(),
    by_currency: z.array(CurrencySummary),
  }),
});

const Timeseries = z.object({
  data: z.object({
    metric: z.string(),
    currency: z.string(),
    granularity: z.string(),
    series: z.array(
      z.object({
        service_id: z.string().nullable(),
        service_name: z.string(),
        points: z.array(z.object({ t: z.string(), value: z.number().nullable() })),
      }),
    ),
  }),
});
export type Timeseries = z.infer<typeof Timeseries>["data"];

export function createMetricsApi(api: ReturnType<typeof createApiClient>) {
  return {
    /** Indicateurs d'un seul service, ou de tous (aucun ou plusieurs services sélectionnés). */
    summary: async (filters: DashboardFilters) =>
      (
        await api.admin("/admin/metrics/summary", {
          query: {
            service_id: filters.serviceIds.length === 1 ? filters.serviceIds[0] : undefined,
            from: filters.from,
            to: filters.to,
          },
          schema: Summary,
        })
      ).data,
    timeseries: async (filters: DashboardFilters) =>
      (
        await api.admin("/admin/metrics/timeseries", {
          query: {
            service_id: filters.serviceIds,
            from: filters.from,
            to: filters.to,
            granularity: filters.granularity,
            metric: filters.metric,
            currency: filters.currency,
            tz: TIME_ZONE,
          },
          schema: Timeseries,
        })
      ).data,
  };
}

export const metrics = createMetricsApi(defaultApi);

// ------------------------------------------------------------------ filtres d'URL
const DAY_MS = 86_400_000;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const PRESET_DAYS: Record<string, number> = { "7d": 7, "30d": 30, "90d": 90, "12m": 365 };

const toDate = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const dateMs = (value: string) => Date.parse(`${value}T00:00:00Z`);

function validDate(value: string): boolean {
  return DATE_RE.test(value) && !Number.isNaN(dateMs(value)) && toDate(dateMs(value)) === value;
}

/** Jour calendaire au Bénin (UTC+1, sans heure d'été). */
function beninToday(now: Date): string {
  return toDate(now.getTime() + 60 * 60_000);
}

type Search = Record<string, string | string[] | undefined>;

export function parseDashboardFilters(search: Search, now: Date = new Date()): DashboardFilters {
  const one = (key: string) => {
    const value = search[key];
    return ((Array.isArray(value) ? value[0] : value) ?? "").trim();
  };
  const pick = <T extends string>(key: string, values: readonly T[], fallback: T): T =>
    values.includes(one(key) as T) ? (one(key) as T) : fallback;

  const requested = pick("range", RANGES, "30d");
  const customValid = validDate(one("from")) && validDate(one("to"));
  const range = requested === "custom" && !customValid ? "30d" : requested;
  const today = beninToday(now);
  let fromDate: string;
  let lastDate: string;
  if (range === "custom") {
    [fromDate, lastDate] = [one("from"), one("to")].sort() as [string, string];
  } else {
    lastDate = today;
    fromDate = toDate(dateMs(today) - ((PRESET_DAYS[range] ?? 30) - 1) * DAY_MS);
  }
  // 366 jours au maximum (limite de l'API) : on garde la fin, on rapproche le début.
  if ((dateMs(lastDate) - dateMs(fromDate)) / DAY_MS + 1 > MAX_DAYS) {
    fromDate = toDate(dateMs(lastDate) - (MAX_DAYS - 1) * DAY_MS);
  }
  const days = (dateMs(lastDate) - dateMs(fromDate)) / DAY_MS + 1;

  let granularity = pick("granularity", GRANULARITIES, days <= 2 ? "hour" : days <= 92 ? "day" : "week");
  if (granularity === "hour" && days * 24 > MAX_POINTS) granularity = "day";

  const ids = search.service_id;
  const serviceIds = [...new Set((Array.isArray(ids) ? ids : ids ? [ids] : []).map((id) => id.trim()))]
    .filter((id) => z.uuid().safeParse(id).success)
    .slice(0, MAX_COMPARED_SERVICES);

  return {
    range,
    fromDate,
    toDate: lastDate,
    from: `${fromDate}T00:00:00${BENIN_OFFSET}`,
    to: `${toDate(dateMs(lastDate) + DAY_MS)}T00:00:00${BENIN_OFFSET}`,
    currency: pick("currency", CURRENCIES, "XOF"),
    metric: pick("metric", METRICS, "collected_amount"),
    granularity,
    serviceIds,
  };
}
