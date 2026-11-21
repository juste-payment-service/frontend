import { describe, expect, it, vi } from "vitest";

import { createApiClient } from "./api-client";
import { createDocsLinksApi, isDocsToken, publicDocsUrl } from "./docs-links";

const LINK = {
  id: "9a1d2c3b-4a5e-4f60-8a7b-9c0d1e2f3a4b",
  label: "Partenaire X",
  token: "A".repeat(43),
  status: "active",
  usable: true,
  expires_at: null,
  view_count: 3,
  last_viewed_at: "2026-11-21T10:00:00Z",
  created_at: "2026-11-21T09:00:00Z",
  updated_at: "2026-11-21T09:00:00Z",
};

function setup(body: unknown, status = 200) {
  const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
    new Response(status === 204 ? null : JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }),
  );
  const api = createApiClient({
    secrets: async () => ({ apiUrl: "https://api.example.com", adminApiKey: "k".repeat(48) }),
    fetch,
  });
  const call = () => fetch.mock.calls[0] as [URL, RequestInit];
  return { links: createDocsLinksApi(api), call };
}

describe("liens publics de l'explorateur", () => {
  it("liste les liens (admin)", async () => {
    const meta = { pagination: { page: 1, page_size: 50, total_items: 1, total_pages: 1 } };
    const { links, call } = setup({ data: [LINK], meta });
    const page = await links.list();
    expect(page.data[0]?.view_count).toBe(3);
    expect(String(call()[0])).toBe("https://api.example.com/v1/admin/docs-links?page=1&page_size=50");
    expect(new Headers(call()[1].headers).get("X-Admin-Key")).toBe("k".repeat(48));
  });

  it("crée un lien avec une expiration facultative", async () => {
    const { links, call } = setup({ data: LINK }, 201);
    await links.create({ label: "Partenaire X", expires_at: "2026-12-31T23:59:59+01:00" }, "22222222-2222-4222-8222-222222222222");
    expect(call()[1].body).toBe('{"label":"Partenaire X","expires_at":"2026-12-31T23:59:59+01:00"}');
  });

  it("active, désactive et supprime", async () => {
    const { links, call } = setup({ data: { ...LINK, status: "disabled", usable: false } });
    await links.setStatus(LINK.id, "disabled");
    expect(call()[1].method).toBe("PATCH");
    expect(call()[1].body).toBe('{"status":"disabled"}');
    const deleted = setup(null, 204);
    await deleted.links.remove(LINK.id);
    expect(deleted.call()[1].method).toBe("DELETE");
  });

  it("vérifie un lien public sans la clé admin", async () => {
    const { links, call } = setup({ data: { label: "Partenaire X", expires_at: null } });
    await expect(links.resolve(LINK.token)).resolves.toEqual({ label: "Partenaire X", expires_at: null });
    expect(String(call()[0])).toBe(`https://api.example.com/v1/meta/docs-links/${LINK.token}`);
    expect(new Headers(call()[1].headers).get("X-Admin-Key")).toBeNull();
  });
});

describe("jetons et adresses", () => {
  it("reconnaît un jeton bien formé", () => {
    expect(isDocsToken("A".repeat(43))).toBe(true);
    expect(isDocsToken("../admin")).toBe(false);
    expect(isDocsToken("A".repeat(42))).toBe(false);
  });

  it("construit l'adresse publique sur le domaine de la console", () => {
    expect(publicDocsUrl("A".repeat(43), "https://payment-service.mrjuste.online/")).toBe(
      `https://payment-service.mrjuste.online/docs/${"A".repeat(43)}`,
    );
  });
});
