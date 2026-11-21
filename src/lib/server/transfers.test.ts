import { describe, expect, it, vi } from "vitest";

import { createApiClient } from "./api-client";
import { createTransfersApi, parseReason, parseTransferFilters } from "./transfers";

const ID = "5f1c2b9e-5d4a-4e8f-b6a1-2c3d4e5f6a7b";
const LEG = "3f1c2b9e-5d4a-4e8f-b6a1-2c3d4e5f6a7b";
export const TRANSFER = {
  id: ID,
  status: "requires_review",
  amount: 10000,
  currency: "XOF",
  fees_paid_by: "payer",
  fee_amount: 100,
  debit_amount: 10100,
  credit_amount: 10000,
  service_id: "0b7d8c1a-2f3e-4a5b-9c6d-7e8f9a0b1c2d",
  payer: { user_id: "8a6e0f6e-3b1f-4a37-9d43-0e6f7c1b2a11", method: "mobile_money", name: "Jean", phone_masked: "229970****00", operator: "mtn", country: "BJ" },
  beneficiary: { user_id: null, method: "mobile_money", name: "Awa", phone_masked: "229960****00", operator: "moov", country: "BJ" },
  collection: { transaction_id: LEG, status: "succeeded", completed_at: "2026-11-21T09:01:00Z" },
  disbursement: null,
  reversal: null,
  next_action: { type: "none", url: null, expires_at: null },
  failure: { code: "PAYOUT_DECLINED", message: "Refusé." },
  client_reference: "P2P-9",
  description: null,
  metadata: null,
  created_at: "2026-11-21T09:00:00Z",
  updated_at: "2026-11-21T09:05:00Z",
  completed_at: null,
  service_name: "Boutique",
  legs: [{ transaction_id: LEG, role: "collection", attempt: 1, status: "succeeded", amount: 10100, completed_at: "2026-11-21T09:01:00Z" }],
  history: [
    { status: "pending", source: "api", reason: null, at: "2026-11-21T09:00:00Z" },
    { status: "requires_review", source: "system", reason: null, at: "2026-11-21T09:05:00Z" },
  ],
};

function setup(body: unknown) {
  const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
    new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json" } }),
  );
  const api = createApiClient({
    secrets: async () => ({ apiUrl: "https://api.example.com", adminApiKey: "k".repeat(48) }),
    fetch,
  });
  return { transfers: createTransfersApi(api), call: () => fetch.mock.calls[0] as [URL, RequestInit] };
}

describe("API des transferts (admin)", () => {
  it("liste avec filtres", async () => {
    const meta = { pagination: { page: 1, page_size: 20, total_items: 1, total_pages: 1 } };
    const { transfers, call } = setup({ data: [TRANSFER], meta });
    const page = await transfers.list({ status: "requires_review", q: "P2P-9", page: 1 });
    expect(page.data[0]?.legs[0]?.role).toBe("collection");
    expect(String(call()[0])).toBe(
      "https://api.example.com/v1/admin/transfers?status=requires_review&q=P2P-9&page=1&page_size=20",
    );
  });

  it("relance le versement au bénéficiaire", async () => {
    const { transfers, call } = setup({ data: { ...TRANSFER, status: "processing" } });
    await transfers.retryDisbursement(ID, "22222222-2222-4222-8222-222222222222");
    const [url, init] = call();
    expect(String(url)).toBe(`https://api.example.com/v1/admin/transfers/${ID}/retry-disbursement`);
    expect(init.method).toBe("POST");
  });

  it("rembourse le payeur avec un motif", async () => {
    const { transfers, call } = setup({ data: { ...TRANSFER, status: "reversing" } });
    await transfers.reverse(ID, "Bénéficiaire injoignable", "22222222-2222-4222-8222-222222222222");
    const [url, init] = call();
    expect(String(url)).toBe(`https://api.example.com/v1/admin/transfers/${ID}/reverse`);
    expect(init.body).toBe('{"reason":"Bénéficiaire injoignable"}');
  });
});

describe("filtres et motif", () => {
  it("garde les valeurs valides et les dates à l'heure du Bénin", () => {
    expect(
      parseTransferFilters({ status: "requires_review", user_id: "x", from: "2026-11-01", to: "2026-11-21", page: "0" }),
    ).toEqual({
      status: "requires_review",
      fromDate: "2026-11-01",
      toDate: "2026-11-21",
      from: "2026-11-01T00:00:00+01:00",
      to: "2026-11-22T00:00:00+01:00",
      page: 1,
    });
  });

  it("exige un motif de 5 à 500 caractères", () => {
    expect(parseReason("  Bénéficiaire injoignable ")).toEqual({ ok: true, reason: "Bénéficiaire injoignable" });
    expect(parseReason("non")).toMatchObject({ ok: false });
  });
});
