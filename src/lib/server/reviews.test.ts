import { describe, expect, it, vi } from "vitest";

import { createApiClient } from "./api-client";
import { createReviewsApi, parseResolveNote, parseReviewFilters } from "./reviews";

const CASE = {
  id: "6f1d2c3b-4a5e-4f60-8a7b-9c0d1e2f3a4b",
  kind: "late_approval",
  label: "Paiement confirmé après expiration : rembourser ou valider",
  status: "open",
  transaction_id: "3f1c2b9e-5d4a-4e8f-b6a1-2c3d4e5f6a7b",
  service_id: "0b7d8c1a-2f3e-4a5b-9c6d-7e8f9a0b1c2d",
  details: { confirmed_amount: 5000, confirmed_currency: "XOF", expired_at: null },
  occurrences: 2,
  opened_at: "2026-11-21T10:42:00Z",
  last_seen_at: "2026-11-21T10:47:00Z",
  resolved_at: null,
  resolution_note: null,
};
const META = { pagination: { page: 1, page_size: 20, total_items: 3, total_pages: 1 } };

function setup(...bodies: unknown[]) {
  const fetch = vi.fn<typeof globalThis.fetch>();
  for (const body of bodies) {
    fetch.mockResolvedValueOnce(new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json" } }));
  }
  const api = createApiClient({
    secrets: async () => ({ apiUrl: "https://api.example.com", adminApiKey: "k".repeat(48) }),
    fetch,
  });
  const call = (i = 0) => fetch.mock.calls[i] as [URL, RequestInit];
  return { reviews: createReviewsApi(api), call };
}

describe("API des dossiers à régulariser", () => {
  it("liste les dossiers filtrés", async () => {
    const { reviews, call } = setup({ data: [CASE], meta: META });
    const page = await reviews.list({ status: "open", kind: "late_approval", page: 1 });
    expect(page.data[0]?.details).toEqual(CASE.details);
    expect(String(call()[0])).toBe(
      "https://api.example.com/v1/admin/reviews?status=open&kind=late_approval&page=1&page_size=20",
    );
  });

  it("compte les dossiers ouverts pour le badge (une seule ligne demandée)", async () => {
    const { reviews, call } = setup({ data: [CASE], meta: META });
    await expect(reviews.openCount()).resolves.toBe(3);
    expect(String(call()[0])).toBe("https://api.example.com/v1/admin/reviews?status=open&page=1&page_size=1");
  });

  it("clôt un dossier avec la note et la clé d'idempotence du formulaire", async () => {
    const { reviews, call } = setup({ data: { ...CASE, status: "resolved", resolution_note: "Remboursé", resolved_at: "2026-11-21T11:00:00Z" } });
    const resolved = await reviews.resolve(CASE.id, "Remboursé", "22222222-2222-4222-8222-222222222222");
    expect(resolved.status).toBe("resolved");
    const [url, init] = call();
    expect(String(url)).toBe(`https://api.example.com/v1/admin/reviews/${CASE.id}/resolve`);
    expect(init.body).toBe('{"note":"Remboursé"}');
    expect(new Headers(init.headers).get("Idempotency-Key")).toBe("22222222-2222-4222-8222-222222222222");
  });

  it("accepte un type de dossier ajouté plus tard par l'API", async () => {
    const { reviews } = setup({ data: { ...CASE, kind: "nouveau_type", label: "Nouveau" } });
    await expect(reviews.get(CASE.id)).resolves.toMatchObject({ kind: "nouveau_type" });
  });
});

describe("filtres et note", () => {
  it("ouvre par défaut sur les dossiers ouverts", () => {
    expect(parseReviewFilters({})).toEqual({ status: "open", page: 1 });
    expect(parseReviewFilters({ status: "all" })).toEqual({ page: 1 });
    expect(parseReviewFilters({ status: "resolved", kind: "payout_stuck", service_id: "x" })).toEqual({
      status: "resolved",
      kind: "payout_stuck",
      page: 1,
    });
  });

  it("exige une note de 5 à 500 caractères", () => {
    expect(parseResolveNote("  Remboursé  ")).toEqual({ ok: true, note: "Remboursé" });
    expect(parseResolveNote("ok")).toMatchObject({ ok: false });
    expect(parseResolveNote("x".repeat(501))).toMatchObject({ ok: false });
  });
});
