import { describe, expect, it, vi } from "vitest";

import { createSecretStore, SecretsError } from "./secrets";

const TOKEN = "dp.st.stg.abcdefghijklmnop";
const SECRETS = {
  PAYMENT_API_URL: "https://payment-service-api.mrjuste.online",
  ADMIN_API_KEY: "k".repeat(48),
  AUTH_SECRET: "s".repeat(48),
  AUTH_GOOGLE_ID: "1234-abc.apps.googleusercontent.com",
  AUTH_GOOGLE_SECRET: "GOCSPX-abcdefghijkl",
  ADMIN_EMAILS: " Admin@MrJuste.online, ops@mrjuste.online ,",
};
const AUTH = {
  secret: "s".repeat(48),
  googleId: "1234-abc.apps.googleusercontent.com",
  googleSecret: "GOCSPX-abcdefghijkl",
  adminEmails: ["admin@mrjuste.online", "ops@mrjuste.online"],
};

function dopplerResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function store(options: {
  env?: Record<string, string | undefined>;
  responses?: Response[];
  now?: () => number;
}) {
  const fetch = vi.fn<typeof globalThis.fetch>();
  for (const response of options.responses ?? [dopplerResponse(SECRETS)]) {
    fetch.mockResolvedValueOnce(response);
  }
  const secrets = createSecretStore({
    env: options.env ?? { DOPPLER_TOKEN: TOKEN, NODE_ENV: "production" },
    fetch,
    now: options.now,
    retryDelayMs: 0,
  });
  return { secrets, fetch };
}

describe("lecture des secrets depuis Doppler", () => {
  it("télécharge la config avec le jeton de service", async () => {
    const { secrets, fetch } = store({});

    await expect(secrets.get()).resolves.toEqual({
      apiUrl: "https://payment-service-api.mrjuste.online",
      adminApiKey: "k".repeat(48),
      auth: AUTH, // adresses normalisées : minuscules, sans espaces ni entrées vides
    });

    const [url, init] = fetch.mock.calls[0]!;
    expect(String(url)).toBe(
      "https://api.doppler.com/v3/configs/config/secrets/download?format=json&include_dynamic_secrets=false",
    );
    expect(new Headers(init?.headers).get("Authorization")).toBe(`Bearer ${TOKEN}`);
    expect(init?.cache).toBe("no-store");
  });

  it("garde les secrets en cache, puis les relit pour suivre une rotation", async () => {
    let now = 0;
    const { secrets, fetch } = store({
      now: () => now,
      responses: [dopplerResponse(SECRETS), dopplerResponse(SECRETS)],
    });

    await Promise.all([secrets.get(), secrets.get()]); // appels simultanés : une seule requête
    now = 4 * 60_000;
    await secrets.get();
    expect(fetch).toHaveBeenCalledTimes(1);

    now = 6 * 60_000;
    await secrets.get();
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("réessaie une erreur temporaire de Doppler", async () => {
    const { secrets, fetch } = store({
      responses: [new Response("", { status: 503 }), dopplerResponse(SECRETS)],
    });
    await expect(secrets.get()).resolves.toMatchObject({ apiUrl: SECRETS.PAYMENT_API_URL });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("signale un jeton refusé sans le réessayer", async () => {
    const { secrets, fetch } = store({ responses: [new Response("", { status: 401 })] });
    await expect(secrets.get()).rejects.toThrow(/Accès Doppler refusé \(HTTP 401\)/);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("refuse un jeton absent ou mal formé, sans jamais l'afficher", async () => {
    const { secrets } = store({ env: { DOPPLER_TOKEN: "mauvais-jeton", NODE_ENV: "production" } });
    const error = await secrets.get().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(SecretsError);
    expect(String(error)).toMatch(/DOPPLER_TOKEN/);
    expect(String(error)).not.toContain("mauvais-jeton");
  });

  it("nomme les secrets invalides sans jamais révéler leur valeur", async () => {
    const { secrets } = store({
      responses: [dopplerResponse({ PAYMENT_API_URL: "ftp://x", ADMIN_API_KEY: "trop-courte" })],
    });
    const error = await secrets.get().catch((e: unknown) => e);
    expect(String(error)).toMatch(/PAYMENT_API_URL/);
    expect(String(error)).toMatch(/ADMIN_API_KEY/);
    expect(String(error)).not.toContain("trop-courte");
  });

  it("exige une API en https en production", async () => {
    const { secrets } = store({
      responses: [dopplerResponse({ ...SECRETS, PAYMENT_API_URL: "http://api.example.com" })],
    });
    await expect(secrets.get()).rejects.toThrow(/PAYMENT_API_URL/);
  });

  it("retire la barre finale de l'URL de l'API", async () => {
    const { secrets } = store({
      responses: [dopplerResponse({ ...SECRETS, PAYMENT_API_URL: `${SECRETS.PAYMENT_API_URL}/` })],
    });
    await expect(secrets.get()).resolves.toMatchObject({ apiUrl: SECRETS.PAYMENT_API_URL });
  });
});

describe("secrets de connexion", () => {
  it.each([
    ["AUTH_SECRET", "court"],
    ["AUTH_GOOGLE_ID", "pas-un-client-google"],
    ["ADMIN_EMAILS", "pas-une-adresse"],
    ["ADMIN_EMAILS", " , "],
  ])("refuse %s invalide", async (name, value) => {
    const { secrets } = store({ responses: [dopplerResponse({ ...SECRETS, [name]: value })] });
    const error = await secrets.get().catch((e: unknown) => e);
    expect(String(error)).toMatch(new RegExp(name));
    expect(String(error)).not.toContain(value.trim() || "§");
  });
});

describe("développement local (doppler run)", () => {
  it("lit les secrets injectés par la CLI Doppler, API locale en http admise", async () => {
    const { secrets, fetch } = store({
      env: {
        NODE_ENV: "development",
        DOPPLER_CONFIG: "dev",
        ...SECRETS,
        PAYMENT_API_URL: "http://localhost:8000",
      },
    });
    await expect(secrets.get()).resolves.toMatchObject({ apiUrl: "http://localhost:8000" });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("n'accepte jamais de variables d'environnement brutes en production", async () => {
    const { secrets } = store({
      env: { NODE_ENV: "production", DOPPLER_CONFIG: "prd", ...SECRETS },
    });
    await expect(secrets.get()).rejects.toThrow(/DOPPLER_TOKEN/);
  });

  it("refuse les variables d'environnement sans doppler run", async () => {
    const { secrets } = store({ env: { NODE_ENV: "development", ...SECRETS } });
    await expect(secrets.get()).rejects.toThrow(/doppler run/);
  });
});
