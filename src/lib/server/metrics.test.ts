import { describe, expect, it, vi } from "vitest";

import { createApiClient } from "./api-client";
import { createMetricsApi, parseDashboardFilters } from "./metrics";

const TODAY = new Date("2026-11-21T10:00:00Z");
const A = "0b7d8c1a-2f3e-4a5b-9c6d-7e8f9a0b1c2d";
const B = "1b7d8c1a-2f3e-4a5b-9c6d-7e8f9a0b1c2d";

describe("filtres du tableau de bord", () => {
  it("par défaut : 30 derniers jours à l'heure du Bénin, XOF, encaissé, par jour", () => {
    expect(parseDashboardFilters({}, TODAY)).toEqual({
      range: "30d",
      fromDate: "2026-10-23",
      toDate: "2026-11-21",
      from: "2026-10-23T00:00:00+01:00",
      to: "2026-11-22T00:00:00+01:00",
      currency: "XOF",
      metric: "collected_amount",
      granularity: "day",
      serviceIds: [],
    });
  });

  it("accepte une période personnalisée et jusqu'à 4 services à comparer", () => {
    const filters = parseDashboardFilters(
      { range: "custom", from: "2026-01-01", to: "2026-03-31", service_id: [A, B, "x", A], metric: "success_rate", currency: "EUR", granularity: "week" },
      TODAY,
    );
    expect(filters).toMatchObject({
      from: "2026-01-01T00:00:00+01:00",
      to: "2026-04-01T00:00:00+01:00",
      serviceIds: [A, B],
      metric: "success_rate",
      currency: "EUR",
      granularity: "week",
    });
  });

  it("borne la période à 366 jours et remet les dates dans l'ordre", () => {
    const filters = parseDashboardFilters({ range: "custom", from: "2026-11-21", to: "2024-01-01" }, TODAY);
    expect(filters.fromDate).toBe("2025-11-21");
    expect(filters.toDate).toBe("2026-11-21");
  });

  it("passe au jour si l'heure dépasserait 1 000 points", () => {
    expect(parseDashboardFilters({ range: "90d", granularity: "hour" }, TODAY).granularity).toBe("day");
    expect(parseDashboardFilters({ range: "7d", granularity: "hour" }, TODAY).granularity).toBe("hour");
  });

  it("limite la comparaison à 4 services", () => {
    const ids = ["a", "b", "c", "d", "e"].map((c) => `${c}b7d8c1a-2f3e-4a5b-9c6d-7e8f9a0b1c2d`);
    expect(parseDashboardFilters({ service_id: ids }, TODAY).serviceIds).toHaveLength(4);
  });
});

describe("API des métriques", () => {
  function setup(body: unknown) {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
      new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json" } }),
    );
    const api = createApiClient({
      secrets: async () => ({ apiUrl: "https://api.example.com", adminApiKey: "k".repeat(48) }),
      fetch,
    });
    return { metrics: createMetricsApi(api), url: () => String((fetch.mock.calls[0] as [URL])[0]) };
  }
  const filters = parseDashboardFilters({ service_id: [A, B] }, TODAY);

  it("demande les indicateurs d'un seul service, ou de tous", async () => {
    const summary = {
      period: { from: filters.from, to: filters.to },
      service_id: null,
      by_currency: [{ currency: "XOF", balance: 1, collected_amount: 2, paid_out_amount: 3, fees_amount: 4, payments_count: 5, payouts_count: 6, succeeded_count: 7, failed_count: 8, pending_count: 9, success_rate: null, average_payment_amount: null }],
    };
    const { metrics, url } = setup({ data: summary });
    const result = await metrics.summary(filters);
    expect(result.by_currency[0]?.success_rate).toBeNull();
    expect(url()).toBe(
      "https://api.example.com/v1/admin/metrics/summary?from=2026-10-23T00%3A00%3A00%2B01%3A00&to=2026-11-22T00%3A00%3A00%2B01%3A00",
    );
  });

  it("compare plusieurs services sur une série temporelle", async () => {
    const series = { metric: "collected_amount", currency: "XOF", granularity: "day", series: [{ service_id: A, service_name: "Boutique", points: [{ t: "2026-11-21T00:00:00+01:00", value: 120000 }, { t: "2026-11-22T00:00:00+01:00", value: null }] }] };
    const { metrics, url } = setup({ data: series });
    const result = await metrics.timeseries(filters);
    expect(result.series[0]?.points[1]?.value).toBeNull();
    expect(url()).toContain(`service_id=${A}&service_id=${B}`);
    expect(url()).toContain("granularity=day&metric=collected_amount&currency=XOF&tz=Africa%2FPorto-Novo");
  });
});
