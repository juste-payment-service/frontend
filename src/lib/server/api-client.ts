import "server-only";

import type { z } from "zod";

import { type ConsoleSecrets, getSecrets } from "./secrets";

/**
 * Client de l'API Payment Service, **côté serveur uniquement** (server components, server actions,
 * route handlers) : la clé admin ne quitte jamais le serveur Next.js.
 *
 * - chemins relatifs à `/v1` seulement (aucune URL absolue : pas de fuite de la clé vers un tiers),
 *   redirections refusées ;
 * - `Idempotency-Key` sur toute écriture (fournie par l'appelant pour réessayer, sinon générée) ;
 * - réponse validée par un schéma zod : un écart avec le contrat est une erreur explicite ;
 * - erreurs normalisées en `ApiError` (code du contrat, message, détails, `request_id`).
 */

export type ErrorDetail = { field?: string; issue?: string; message?: string };

export class ApiError extends Error {
  override name = "ApiError";

  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details: ErrorDetail[] = [],
    readonly requestId: string | null = null,
  ) {
    super(message);
  }

  toJSON() {
    return {
      status: this.status,
      code: this.code,
      message: this.message,
      details: this.details,
      requestId: this.requestId,
    };
  }
}

type QueryValue = string | number | boolean | null | undefined;
type Method = "GET" | "POST" | "PATCH" | "DELETE";

export type RequestOptions<S extends z.ZodType> = {
  schema: S;
  method?: Method;
  query?: Record<string, QueryValue | QueryValue[]>;
  body?: unknown;
  /** À réutiliser pour réessayer la même opération (même intention métier). */
  idempotencyKey?: string;
  timeoutMs?: number;
};

const DEFAULT_TIMEOUT_MS = 10_000;

function buildUrl(apiUrl: string, path: string, query: RequestOptions<z.ZodType>["query"]) {
  if (!path.startsWith("/") || path.startsWith("//") || path.includes("..")) {
    throw new Error(`Chemin d'API invalide : relatif à /v1 attendu (${path.slice(0, 40)}).`);
  }
  const url = new URL(`${apiUrl}/v1${path}`);
  for (const [key, raw] of Object.entries(query ?? {})) {
    for (const value of Array.isArray(raw) ? raw : [raw]) {
      if (value !== undefined && value !== null && value !== "") {
        url.searchParams.append(key, String(value));
      }
    }
  }
  return url;
}

async function errorFrom(response: Response): Promise<ApiError> {
  const payload: unknown = await response.json().catch(() => null);
  const error =
    payload && typeof payload === "object" && "error" in payload
      ? (payload as { error: Record<string, unknown> }).error
      : null;
  if (error && typeof error.code === "string") {
    return new ApiError(
      response.status,
      error.code,
      typeof error.message === "string" ? error.message : "Erreur de l'API.",
      Array.isArray(error.details) ? (error.details as ErrorDetail[]) : [],
      typeof error.request_id === "string" ? error.request_id : null,
    );
  }
  return new ApiError(response.status, "UNEXPECTED_RESPONSE", `Réponse inattendue de l'API.`);
}

export function createApiClient(deps: {
  secrets?: () => Promise<Pick<ConsoleSecrets, "apiUrl" | "adminApiKey">>;
  fetch?: typeof fetch;
  uuid?: () => string;
}) {
  const secrets = deps.secrets ?? getSecrets;
  const fetchImpl = deps.fetch ?? fetch;
  const uuid = deps.uuid ?? (() => crypto.randomUUID());

  async function request<S extends z.ZodType>(
    path: string,
    options: RequestOptions<S>,
    asAdmin: boolean,
  ): Promise<z.infer<S>> {
    const { apiUrl, adminApiKey } = await secrets();
    const method = options.method ?? "GET";
    const url = buildUrl(apiUrl, path, options.query);
    const headers = new Headers({ Accept: "application/json", "X-Request-Id": uuid() });
    if (asAdmin) headers.set("X-Admin-Key", adminApiKey);
    if (method !== "GET") headers.set("Idempotency-Key", options.idempotencyKey ?? uuid());
    if (options.body !== undefined) headers.set("Content-Type", "application/json");

    let response: Response;
    try {
      response = await fetchImpl(url, {
        method,
        headers,
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        cache: "no-store",
        redirect: "error",
        signal: AbortSignal.timeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS),
      });
    } catch (cause) {
      // Le message d'origine n'est jamais repris : il pourrait contenir des en-têtes.
      const timeout = cause instanceof DOMException && cause.name === "TimeoutError";
      throw timeout
        ? new ApiError(0, "TIMEOUT", "L'API n'a pas répondu à temps.")
        : new ApiError(0, "NETWORK_ERROR", "API injoignable.");
    }

    if (!response.ok) throw await errorFrom(response);
    const payload: unknown = response.status === 204 ? null : await response.json().catch(() => {
      throw new ApiError(response.status, "INVALID_RESPONSE", "Réponse JSON invalide.");
    });
    const parsed = options.schema.safeParse(payload);
    if (!parsed.success) {
      throw new ApiError(
        response.status,
        "INVALID_RESPONSE",
        `Réponse non conforme au contrat (${parsed.error.issues[0]?.path.join(".") || "racine"}).`,
      );
    }
    return parsed.data;
  }

  return {
    /** Route `/admin/*` : authentifiée par la clé admin. */
    admin: <S extends z.ZodType>(path: string, options: RequestOptions<S>) =>
      request(path, options, true),
    /** Route publique (`/health`, `/ready`, `/meta/*`, `/reference/*`) : sans clé. */
    public: <S extends z.ZodType>(path: string, options: RequestOptions<S>) =>
      request(path, options, false),
  };
}

/** Client partagé de la console (secrets Doppler, `fetch` natif). */
export const api = createApiClient({});
