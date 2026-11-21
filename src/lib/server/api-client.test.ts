import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { ApiError, createApiClient } from "./api-client";

const ADMIN_KEY = "k".repeat(48);
const SECRETS = { apiUrl: "https://api.example.com", adminApiKey: ADMIN_KEY };

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function client(...responses: (Response | Error)[]) {
  const fetch = vi.fn<typeof globalThis.fetch>();
  for (const response of responses) {
    if (response instanceof Error) fetch.mockRejectedValueOnce(response);
    else fetch.mockResolvedValueOnce(response);
  }
  const api = createApiClient({
    secrets: async () => SECRETS,
    fetch,
    uuid: () => "11111111-1111-4111-8111-111111111111",
  });
  return { api, fetch };
}

const Service = z.object({ id: z.string(), name: z.string() });

describe("client de l'API admin (côté serveur)", () => {
  it("authentifie les appels admin et construit l'URL avec les filtres", async () => {
    const { api, fetch } = client(json({ data: [{ id: "s1", name: "Boutique" }] }));

    const services = await api.admin("/admin/services", {
      query: { q: "bou", status: undefined, page: 2, service_id: ["a", "b"] },
      schema: z.object({ data: z.array(Service) }),
    });

    expect(services.data[0]?.name).toBe("Boutique");
    const [url, init] = fetch.mock.calls[0]!;
    expect(String(url)).toBe(
      "https://api.example.com/v1/admin/services?q=bou&page=2&service_id=a&service_id=b",
    );
    const headers = new Headers(init?.headers);
    expect(headers.get("X-Admin-Key")).toBe(ADMIN_KEY);
    expect(headers.get("Accept")).toBe("application/json");
    expect(headers.get("X-Request-Id")).toBe("11111111-1111-4111-8111-111111111111");
    expect(init?.cache).toBe("no-store");
    expect(init?.redirect).toBe("error");
  });

  it("envoie un corps JSON et une clé d'idempotence sur les écritures", async () => {
    const { api, fetch } = client(json({ data: { id: "s1", name: "Boutique" } }, 201));

    await api.admin("/admin/services", {
      method: "POST",
      body: { name: "Boutique" },
      idempotencyKey: "22222222-2222-4222-8222-222222222222",
      schema: z.object({ data: Service }),
    });

    const [, init] = fetch.mock.calls[0]!;
    const headers = new Headers(init?.headers);
    expect(init?.method).toBe("POST");
    expect(init?.body).toBe('{"name":"Boutique"}');
    expect(headers.get("Content-Type")).toBe("application/json");
    expect(headers.get("Idempotency-Key")).toBe("22222222-2222-4222-8222-222222222222");
  });

  it("génère une clé d'idempotence si l'appelant n'en fournit pas", async () => {
    const { api, fetch } = client(json({ data: { id: "s1", name: "B" } }));
    await api.admin("/admin/services/s1/api-key", { method: "POST", schema: z.unknown() });
    const headers = new Headers(fetch.mock.calls[0]![1]?.headers);
    expect(headers.get("Idempotency-Key")).toBe("11111111-1111-4111-8111-111111111111");
  });

  it("appelle les routes publiques sans la clé admin", async () => {
    const { api, fetch } = client(json({ status: "ok", revision: "0123456789ab" }));
    await api.public("/health", { schema: z.object({ status: z.string() }) });
    const headers = new Headers(fetch.mock.calls[0]![1]?.headers);
    expect(headers.get("X-Admin-Key")).toBeNull();
  });

  it("transforme l'enveloppe d'erreur de l'API en ApiError", async () => {
    const { api } = client(
      json(
        {
          error: {
            code: "SERVICE_NAME_TAKEN",
            message: "Ce nom est déjà utilisé.",
            details: [{ field: "name", issue: "taken", message: "Déjà pris." }],
            request_id: "req_123",
          },
        },
        409,
      ),
    );

    const error = await api.admin("/admin/services", { schema: z.unknown() }).catch((e) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      status: 409,
      code: "SERVICE_NAME_TAKEN",
      message: "Ce nom est déjà utilisé.",
      requestId: "req_123",
      details: [{ field: "name", issue: "taken", message: "Déjà pris." }],
    });
  });

  it("signale une réponse d'erreur illisible", async () => {
    const { api } = client(new Response("<html>502</html>", { status: 502 }));
    await expect(api.admin("/admin/services", { schema: z.unknown() })).rejects.toMatchObject({
      status: 502,
      code: "UNEXPECTED_RESPONSE",
    });
  });

  it("signale une réponse qui ne respecte pas le contrat", async () => {
    const { api } = client(json({ data: [{ id: 1 }] }));
    await expect(
      api.admin("/admin/services", { schema: z.object({ data: z.array(Service) }) }),
    ).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  });

  it("distingue panne réseau et délai dépassé", async () => {
    const timeout = new DOMException("délai", "TimeoutError");
    const { api } = client(new TypeError("fetch failed"), timeout);
    await expect(api.admin("/admin/services", { schema: z.unknown() })).rejects.toMatchObject({
      status: 0,
      code: "NETWORK_ERROR",
    });
    await expect(api.admin("/admin/services", { schema: z.unknown() })).rejects.toMatchObject({
      code: "TIMEOUT",
    });
  });

  it("ne laisse jamais apparaître la clé admin dans une erreur", async () => {
    const { api } = client(new TypeError(`échec avec ${ADMIN_KEY}`));
    const error = await api.admin("/admin/services", { schema: z.unknown() }).catch((e) => e);
    expect(JSON.stringify(error)).not.toContain(ADMIN_KEY);
    expect(String(error)).not.toContain(ADMIN_KEY);
    expect(String((error as Error).stack)).not.toContain(ADMIN_KEY);
  });

  it("refuse un chemin qui sortirait de l'API", async () => {
    const { api, fetch } = client();
    await expect(api.admin("https://evil.example.com/x", { schema: z.unknown() })).rejects.toThrow(
      /chemin/i,
    );
    await expect(api.admin("//evil.example.com/x", { schema: z.unknown() })).rejects.toThrow(
      /chemin/i,
    );
    expect(fetch).not.toHaveBeenCalled();
  });
});
