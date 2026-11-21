import { describe, expect, it, vi } from "vitest";

import { createApiClient } from "./api-client";
import { createServicesApi, parseServiceForm } from "./services";

const SERVICE = {
  id: "0b7d8c1a-2f3e-4a5b-9c6d-7e8f9a0b1c2d",
  name: "Boutique",
  description: null,
  status: "active",
  default_callback_url: "https://boutique.example.com/hook",
  allowed_redirect_hosts: ["boutique.example.com"],
  transfers_enabled: false,
  transfer_limits: { max_amount: null, daily_max_amount_per_payer: null, daily_max_count_per_payer: 5 },
  api_key_prefix: "sk_svc_7H",
  api_key_last_used_at: null,
  stats: { users_count: 2, transactions_count: 3, last_transaction_at: "2026-11-21T10:02:00Z" },
  created_at: "2026-11-21T09:00:00Z",
  updated_at: "2026-11-21T09:00:00Z",
};

function setup(...bodies: [unknown, number?][]) {
  const fetch = vi.fn<typeof globalThis.fetch>();
  for (const [body, status] of bodies) {
    fetch.mockResolvedValueOnce(
      new Response(JSON.stringify(body), {
        status: status ?? 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
  }
  const api = createApiClient({
    secrets: async () => ({ apiUrl: "https://api.example.com", adminApiKey: "k".repeat(48) }),
    fetch,
    uuid: () => "11111111-1111-4111-8111-111111111111",
  });
  return { services: createServicesApi(api), fetch };
}

const call = (fetch: ReturnType<typeof vi.fn>, index = 0) => {
  const [url, init] = fetch.mock.calls[index] as [URL, RequestInit];
  return { url: String(url), method: init.method, body: init.body ? JSON.parse(String(init.body)) : undefined };
};

describe("API des services", () => {
  it("liste avec recherche, statut et pagination", async () => {
    const meta = { pagination: { page: 2, page_size: 20, total_items: 21, total_pages: 2 } };
    const { services, fetch } = setup([{ data: [SERVICE], meta }]);

    const page = await services.list({ q: "bou", status: "active", page: 2 });

    expect(page.data[0]?.stats.transactions_count).toBe(3);
    expect(page.meta.pagination.total_pages).toBe(2);
    expect(call(fetch).url).toBe(
      "https://api.example.com/v1/admin/services?q=bou&status=active&page=2&page_size=20",
    );
  });

  it("crée un service et récupère la clé et le secret affichés une seule fois", async () => {
    const created = { ...SERVICE, api_key: "sk_svc_secret", webhook_secret: "whsec_secret" };
    const { services, fetch } = setup([{ data: created }, 201]);

    const result = await services.create({ name: "Boutique" }, "22222222-2222-4222-8222-222222222222");

    expect(result.api_key).toBe("sk_svc_secret");
    expect(call(fetch)).toMatchObject({ method: "POST", body: { name: "Boutique" } });
  });

  it("modifie, active ou désactive un service", async () => {
    const { services, fetch } = setup([{ data: { ...SERVICE, status: "disabled" } }]);
    const updated = await services.update(SERVICE.id, { status: "disabled" });
    expect(updated.status).toBe("disabled");
    expect(call(fetch)).toMatchObject({
      method: "PATCH",
      url: `https://api.example.com/v1/admin/services/${SERVICE.id}`,
      body: { status: "disabled" },
    });
  });

  it("régénère la clé API avec une période de grâce", async () => {
    const rotated = {
      api_key: "sk_svc_new",
      api_key_prefix: "sk_svc_9L",
      previous_key_expires_at: "2026-11-22T10:00:00Z",
    };
    const { services, fetch } = setup([{ data: rotated }]);
    await expect(services.rotateApiKey(SERVICE.id, 24, "k-1")).resolves.toEqual(rotated);
    expect(call(fetch)).toMatchObject({
      url: `https://api.example.com/v1/admin/services/${SERVICE.id}/api-key`,
      body: { grace_period_hours: 24 },
    });
  });

  it("refuse un identifiant de service qui n'est pas un UUID", async () => {
    const { services, fetch } = setup();
    await expect(services.get("../transactions")).rejects.toThrow(/identifiant/i);
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("formulaire de service", () => {
  const form = (entries: Record<string, string | string[]>) => {
    const data = new FormData();
    for (const [key, value] of Object.entries(entries)) {
      for (const v of Array.isArray(value) ? value : [value]) data.append(key, v);
    }
    return data;
  };

  it("convertit les champs saisis en charge utile de l'API", () => {
    const parsed = parseServiceForm(
      form({
        name: "  Boutique  ",
        description: "",
        default_callback_url: "https://boutique.example.com/hook",
        allowed_redirect_hosts: "boutique.example.com\n www.boutique.example.com \n\n",
        transfers_enabled: "on",
        max_amount: "100000",
        daily_max_amount_per_payer: "",
        daily_max_count_per_payer: "5",
      }),
    );
    expect(parsed).toEqual({
      ok: true,
      value: {
        name: "Boutique",
        description: null,
        default_callback_url: "https://boutique.example.com/hook",
        allowed_redirect_hosts: ["boutique.example.com", "www.boutique.example.com"],
        transfers_enabled: true,
        transfer_limits: {
          max_amount: 100000,
          daily_max_amount_per_payer: null,
          daily_max_count_per_payer: 5,
        },
      },
    });
  });

  it("signale les champs invalides par nom", () => {
    const parsed = parseServiceForm(
      form({ name: "B", default_callback_url: "http://boutique.example.com", max_amount: "-1" }),
    );
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(Object.keys(parsed.errors).sort()).toEqual([
        "default_callback_url",
        "max_amount",
        "name",
      ]);
    }
  });
});
