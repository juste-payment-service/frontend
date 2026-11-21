import { describe, expect, it, vi } from "vitest";

import { createApiClient } from "./api-client";
import { curlExample, createCatalogApi, filterCatalog, type Catalog } from "./catalog";

const ENDPOINT = {
  operation_id: "createMobileMoneyPayment",
  method: "POST",
  path: "/v1/payments/mobile-money",
  summary: "Payer via mobile money",
  description: "Initie un encaissement.",
  status: "available",
  auth: "public",
  idempotent: true,
  headers: [
    { name: "X-Service-Id", required: true, description: "UUID du service." },
    { name: "Idempotency-Key", required: true, description: "UUID v4." },
  ],
  parameters: [],
  request: { schema: { type: "object", properties: { amount: { type: "integer" } } }, example: { amount: 5000, currency: "XOF" } },
  responses: [{ status: 201, description: "Créé.", example: null }],
};
const CATALOG: Catalog = {
  version: "0.1.0",
  contract_version: "1.5.0-contract",
  groups: [
    { tag: "Payments", description: "Encaissements.", endpoints: [ENDPOINT] },
    {
      tag: "Admin - Services",
      description: "Services.",
      endpoints: [{ ...ENDPOINT, operation_id: "adminListServices", method: "GET", path: "/v1/admin/services", summary: "Lister les services", auth: "admin_key", idempotent: false, headers: [], request: null, parameters: [{ name: "q", in: "query", required: false, description: "", schema: { type: "string" } }] }],
    },
  ],
};

describe("catalogue des endpoints", () => {
  it("lit le catalogue complet avec la clé admin (console)", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
      new Response(JSON.stringify({ data: CATALOG }), { headers: { "Content-Type": "application/json" } }),
    );
    const api = createApiClient({ secrets: async () => ({ apiUrl: "https://api.example.com", adminApiKey: "k".repeat(48) }), fetch });
    await createCatalogApi(api).full();
    expect(new Headers((fetch.mock.calls[0] as [URL, RequestInit])[1].headers).get("X-Admin-Key")).toBe("k".repeat(48));
  });

  it("lit le catalogue public de l'API, sans clé admin", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
      new Response(JSON.stringify({ data: CATALOG }), { headers: { "Content-Type": "application/json" } }),
    );
    const api = createApiClient({ secrets: async () => ({ apiUrl: "https://api.example.com", adminApiKey: "k".repeat(48) }), fetch });
    const catalog = await createCatalogApi(api).integration();
    expect(catalog.groups).toHaveLength(2);
    const [url, init] = fetch.mock.calls[0] as [URL, RequestInit];
    expect(String(url)).toBe("https://api.example.com/v1/meta/endpoints");
    expect(new Headers(init.headers).get("X-Admin-Key")).toBeNull();
  });

  it("filtre par texte (chemin, résumé, groupe) en gardant les groupes non vides", () => {
    expect(filterCatalog(CATALOG, "mobile").groups.map((g) => g.tag)).toEqual(["Payments"]);
    expect(filterCatalog(CATALOG, "SERVICES").groups.map((g) => g.endpoints.length)).toEqual([1]);
    expect(filterCatalog(CATALOG, "").groups).toHaveLength(2);
  });
});

describe("exemple curl", () => {
  it("utilise des emplacements pour les secrets, jamais une vraie clé", () => {
    const curl = curlExample("https://api.example.com", ENDPOINT);
    expect(curl).toBe(
      "curl -X POST 'https://api.example.com/v1/payments/mobile-money' \\\n" +
        "  -H 'Content-Type: application/json' \\\n" +
        "  -H 'X-Service-Id: <X-Service-Id>' \\\n" +
        "  -H 'Idempotency-Key: <UUID v4>' \\\n" +
        `  -d '{"amount":5000,"currency":"XOF"}'`,
    );
  });

  it("ajoute la clé du service ou la mention de la clé admin selon l'authentification", () => {
    expect(curlExample("https://api.example.com", { ...ENDPOINT, auth: "service_api_key" })).toContain("-H 'X-Api-Key: <clé API du service>'");
    const admin = curlExample("https://api.example.com", CATALOG.groups[1]!.endpoints[0]!);
    expect(admin).toContain("-H 'X-Admin-Key: <clé admin, côté serveur uniquement>'");
    expect(admin).not.toContain("Content-Type");
  });

  it("échappe une apostrophe de l'exemple", () => {
    expect(curlExample("https://api.example.com", { ...ENDPOINT, request: { schema: {}, example: { note: "l'URL" } } })).toContain(`'{"note":"l'\\''URL"}'`);
  });
});
