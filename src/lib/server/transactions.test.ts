import { describe, expect, it, vi } from "vitest";

import { createApiClient } from "./api-client";
import { createTransactionsApi, filtersToSearch, parseTransactionFilters } from "./transactions";

const TX = {
  id: "3f1c2b9e-5d4a-4e8f-b6a1-2c3d4e5f6a7b",
  type: "payment",
  method: "mobile_money",
  status: "succeeded",
  amount: 5000,
  currency: "XOF",
  fee_amount: null,
  service_id: "0b7d8c1a-2f3e-4a5b-9c6d-7e8f9a0b1c2d",
  user_id: "8a6e0f6e-3b1f-4a37-9d43-0e6f7c1b2a11",
  client_reference: "ORDER-1",
  description: null,
  payer: { phone_masked: "229970****00", operator: "mtn", country: "BJ" },
  recipient: null,
  next_action: { type: "none", url: null, expires_at: null },
  failure: null,
  metadata: { order_id: "8822" },
  transfer: null,
  created_at: "2026-11-21T09:00:00Z",
  updated_at: "2026-11-21T09:01:00Z",
  completed_at: "2026-11-21T09:01:00Z",
  service_name: "Boutique",
  provider: { name: "feexpay", transaction_id: "FX-1", external_reference: "abc" },
  history: [
    { status: "pending", source: "api", at: "2026-11-21T09:00:00Z" },
    { status: "succeeded", source: "system", at: "2026-11-21T09:01:00Z" },
  ],
  webhook_deliveries: [
    {
      event_id: "11111111-1111-4111-8111-111111111111",
      url: "https://boutique.example.com/hook",
      status: "delivered",
      attempt: 1,
      response_status: 200,
      delivered_at: "2026-11-21T09:01:02Z",
      next_retry_at: null,
    },
  ],
};

function setup(...bodies: unknown[]) {
  const fetch = vi.fn<typeof globalThis.fetch>();
  for (const body of bodies) {
    fetch.mockResolvedValueOnce(
      new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json" } }),
    );
  }
  const api = createApiClient({
    secrets: async () => ({ apiUrl: "https://api.example.com", adminApiKey: "k".repeat(48) }),
    fetch,
  });
  return { transactions: createTransactionsApi(api), fetch };
}

const url = (fetch: ReturnType<typeof vi.fn>) => String((fetch.mock.calls[0] as [URL])[0]);

describe("API des transactions (admin)", () => {
  it("liste avec les filtres combinés", async () => {
    const meta = { pagination: { page: 1, page_size: 20, total_items: 1, total_pages: 1 } };
    const { transactions, fetch } = setup({ data: [TX], meta });

    const page = await transactions.list({
      status: "succeeded",
      service_id: TX.service_id,
      from: "2026-11-01T00:00:00+01:00",
      sort: "-amount",
      page: 1,
    });

    expect(page.data[0]?.provider.name).toBe("feexpay");
    expect(url(fetch)).toBe(
      `https://api.example.com/v1/admin/transactions?status=succeeded&service_id=${TX.service_id}` +
        "&from=2026-11-01T00%3A00%3A00%2B01%3A00&sort=-amount&page=1&page_size=20",
    );
  });

  it("lit le détail avec l'historique et les notifications", async () => {
    const { transactions } = setup({ data: TX });
    const detail = await transactions.get(TX.id);
    expect(detail.webhook_deliveries[0]?.response_status).toBe(200);
    expect(detail.history).toHaveLength(2);
  });

  it("resynchronise avec le prestataire", async () => {
    const { transactions, fetch } = setup({ data: { ...TX, status: "failed" } });
    await transactions.sync(TX.id);
    expect(url(fetch)).toBe(`https://api.example.com/v1/admin/transactions/${TX.id}/sync`);
    expect((fetch.mock.calls[0] as [URL, RequestInit])[1].method).toBe("POST");
  });

  it("accepte un prestataire autre que celui d'aujourd'hui", async () => {
    const { transactions } = setup({ data: { ...TX, provider: { ...TX.provider, name: "autre" } } });
    await expect(transactions.get(TX.id)).resolves.toMatchObject({ provider: { name: "autre" } });
  });
});

describe("filtres de l'URL", () => {
  it("ne garde que les valeurs valides", () => {
    expect(
      parseTransactionFilters({
        q: "  ORDER-1 ",
        status: "succeeded",
        type: "inconnu",
        method: "card",
        service_id: "pas-un-uuid",
        user_id: TX.user_id,
        sort: "amount",
        page: "3",
      }),
    ).toEqual({
      q: "ORDER-1",
      status: "succeeded",
      method: "card",
      user_id: TX.user_id,
      sort: "amount",
      page: 3,
    });
  });

  it("convertit les dates en bornes à l'heure du Bénin, la fin incluse", () => {
    expect(parseTransactionFilters({ from: "2026-11-01", to: "2026-11-21" })).toMatchObject({
      from: "2026-11-01T00:00:00+01:00",
      to: "2026-11-22T00:00:00+01:00", // borne exclue côté API : le 21 est inclus en entier
      fromDate: "2026-11-01",
      toDate: "2026-11-21",
    });
  });

  it("ignore une date mal formée et une page invalide", () => {
    expect(parseTransactionFilters({ from: "21/11/2026", page: "-2" })).toEqual({ page: 1 });
  });
});

describe("filtres dans l'URL de la console", () => {
  it("gardent les dates saisies et changent de page sans perdre les filtres", () => {
    const filters = parseTransactionFilters({ status: "failed", from: "2026-11-01", to: "2026-11-21", page: "2" });
    expect(filtersToSearch(filters, 3)).toBe("status=failed&from=2026-11-01&to=2026-11-21&page=3");
    expect(parseTransactionFilters(Object.fromEntries(new URLSearchParams(filtersToSearch(filters))))).toEqual(filters);
  });
});
