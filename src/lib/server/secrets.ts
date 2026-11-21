import "server-only";

import { z } from "zod";

/**
 * Secrets de la console, lus depuis Doppler (projet dédié à la console, distinct du backend).
 *
 * - En déploiement : seul `DOPPLER_TOKEN` (jeton de service en lecture seule, une config) est
 *   présent dans l'environnement ; les secrets sont téléchargés par l'API Doppler.
 * - En local : `doppler run -- npm run dev` injecte les secrets ; reconnus grâce à `DOPPLER_CONFIG`,
 *   jamais en production.
 *
 * Gardés 5 minutes en mémoire (une rotation est prise en compte sans redéploiement), un seul
 * téléchargement à la fois. Aucune erreur ne contient la valeur d'un secret ou du jeton.
 */

export const DOPPLER_DOWNLOAD_URL =
  "https://api.doppler.com/v3/configs/config/secrets/download?format=json&include_dynamic_secrets=false";
const TOKEN_RE = /^dp\.[a-z]+\.[A-Za-z0-9._-]{8,}$/;
const CACHE_MS = 5 * 60_000;
const MAX_ATTEMPTS = 3;
const TIMEOUT_MS = 5_000;
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

export type AuthSecrets = {
  /** Signature et chiffrement des sessions (≥ 32 caractères). */
  secret: string;
  googleId: string;
  googleSecret: string;
  /** Liste blanche : adresses Google autorisées, en minuscules. */
  adminEmails: string[];
};

export type ConsoleSecrets = {
  /** URL de base de l'API, sans `/v1` ni barre finale. */
  apiUrl: string;
  /** Clé admin de l'API : uniquement côté serveur, jamais transmise au navigateur. */
  adminApiKey: string;
  auth: AuthSecrets;
};

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export class SecretsError extends Error {
  override name = "SecretsError";
}

type Env = Record<string, string | undefined>;

function secretsSchema(production: boolean) {
  return z.object({
    PAYMENT_API_URL: z
      .string()
      .refine((value) => {
        try {
          const url = new URL(value);
          if (url.protocol === "https:") return true;
          return !production && url.protocol === "http:" && LOCAL_HOSTS.has(url.hostname);
        } catch {
          return false;
        }
      }, "URL https attendue (http autorisé seulement vers localhost hors production)")
      .transform((value) => value.replace(/\/+$/, "")),
    ADMIN_API_KEY: z.string().min(32, "32 caractères au moins"),
    AUTH_SECRET: z.string().min(32, "32 caractères au moins"),
    AUTH_GOOGLE_ID: z
      .string()
      .regex(/^[\w-]+\.apps\.googleusercontent\.com$/, "identifiant client OAuth Google attendu"),
    AUTH_GOOGLE_SECRET: z.string().min(10, "secret client OAuth Google attendu"),
    ADMIN_EMAILS: z
      .string()
      .transform((value) =>
        value
          .split(",")
          .map((email) => email.trim().toLowerCase())
          .filter(Boolean),
      )
      .refine(
        (emails) => emails.length > 0 && emails.every((email) => EMAIL_RE.test(email)),
        "liste d'adresses séparées par des virgules attendue",
      ),
  });
}

function validate(raw: Record<string, unknown>, production: boolean): ConsoleSecrets {
  const parsed = secretsSchema(production).safeParse(raw);
  if (!parsed.success) {
    // Noms des secrets fautifs et règle enfreinte seulement : jamais la valeur reçue.
    const problems = parsed.error.issues.map((issue) => {
      const name = issue.path.join(".");
      return issue.code === "invalid_type" ? `${name} (absent)` : `${name} (${issue.message})`;
    });
    throw new SecretsError(`Secrets Doppler invalides : ${problems.join(", ")}.`);
  }
  const data = parsed.data;
  return {
    apiUrl: data.PAYMENT_API_URL,
    adminApiKey: data.ADMIN_API_KEY,
    auth: {
      secret: data.AUTH_SECRET,
      googleId: data.AUTH_GOOGLE_ID,
      googleSecret: data.AUTH_GOOGLE_SECRET,
      adminEmails: data.ADMIN_EMAILS,
    },
  };
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function download(
  token: string,
  fetchImpl: typeof fetch,
  retryDelayMs: number,
): Promise<Record<string, unknown>> {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    let response: Response | undefined;
    try {
      response = await fetchImpl(DOPPLER_DOWNLOAD_URL, {
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
        cache: "no-store",
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch {
      response = undefined; // réseau ou délai : réessayé
    }
    if (response) {
      if (response.status === 401 || response.status === 403) {
        throw new SecretsError(
          `Accès Doppler refusé (HTTP ${response.status}) : vérifier le jeton de service et sa config.`,
        );
      }
      if (response.ok) {
        const payload: unknown = await response.json().catch(() => null);
        if (
          !payload ||
          typeof payload !== "object" ||
          Object.values(payload).some((v) => typeof v !== "string")
        ) {
          throw new SecretsError("Réponse Doppler invalide (objet JSON de chaînes attendu).");
        }
        return payload as Record<string, unknown>;
      }
      const retryable = response.status >= 500 || [408, 425, 429].includes(response.status);
      if (!retryable) throw new SecretsError(`Requête Doppler refusée (HTTP ${response.status}).`);
    }
    if (attempt < MAX_ATTEMPTS) await sleep(retryDelayMs * 2 ** (attempt - 1));
  }
  throw new SecretsError(`Doppler indisponible après ${MAX_ATTEMPTS} tentatives.`);
}

export function createSecretStore(options: {
  env?: Env;
  fetch?: typeof fetch;
  now?: () => number;
  retryDelayMs?: number;
}) {
  const env = options.env ?? process.env;
  const fetchImpl = options.fetch ?? fetch;
  const now = options.now ?? Date.now;
  const retryDelayMs = options.retryDelayMs ?? 500;
  let cached: { value: ConsoleSecrets; expiresAt: number } | undefined;
  let inflight: Promise<ConsoleSecrets> | undefined;

  async function load(): Promise<ConsoleSecrets> {
    const production = env.NODE_ENV === "production";
    const token = env.DOPPLER_TOKEN;
    if (token !== undefined && token !== "") {
      if (!TOKEN_RE.test(token)) {
        throw new SecretsError("DOPPLER_TOKEN mal formé (jeton de service attendu : dp.st.…).");
      }
      return validate(await download(token, fetchImpl, retryDelayMs), production);
    }
    if (production) {
      throw new SecretsError("DOPPLER_TOKEN absent : impossible de lire les secrets.");
    }
    if (!env.DOPPLER_CONFIG) {
      throw new SecretsError(
        "Secrets introuvables : lancer la console avec `doppler run -- npm run dev`.",
      );
    }
    return validate(env, production);
  }

  return {
    async get(): Promise<ConsoleSecrets> {
      if (cached && now() < cached.expiresAt) return cached.value;
      inflight ??= load()
        .then((value) => {
          cached = { value, expiresAt: now() + CACHE_MS };
          return value;
        })
        .finally(() => {
          inflight = undefined;
        });
      return inflight;
    },
  };
}

const defaultStore = createSecretStore({});

/** Secrets de la console (cache 5 min). À n'appeler que dans du code serveur. */
export const getSecrets = () => defaultStore.get();
