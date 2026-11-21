import "server-only";

import { z } from "zod";

import { api as defaultApi, type createApiClient } from "./api-client";

/** Catalogue des endpoints (`GET /v1/meta/endpoints`) pour l'explorateur d'API. */

const Endpoint = z.object({
  operation_id: z.string().nullable(),
  method: z.string(),
  path: z.string(),
  summary: z.string(),
  description: z.string(),
  status: z.string(),
  auth: z.string(),
  idempotent: z.boolean(),
  headers: z.array(z.object({ name: z.string(), required: z.boolean(), description: z.string() })),
  parameters: z.array(z.object({ name: z.string(), in: z.string(), required: z.boolean(), description: z.string(), schema: z.record(z.string(), z.unknown()) })),
  request: z.object({ schema: z.unknown(), example: z.unknown() }).nullable(),
  responses: z.array(z.object({ status: z.number(), description: z.string(), example: z.unknown() })),
});
export type Endpoint = z.infer<typeof Endpoint>;

const CatalogSchema = z.object({
  version: z.string(),
  contract_version: z.string().nullable().optional().default(null),
  groups: z.array(z.object({ tag: z.string(), description: z.string(), endpoints: z.array(Endpoint) })),
});
export type Catalog = z.infer<typeof CatalogSchema>;

export function createCatalogApi(api: ReturnType<typeof createApiClient>) {
  return {
    get: async () => (await api.public("/meta/endpoints", { schema: z.object({ data: CatalogSchema }) })).data,
  };
}

export const catalog = createCatalogApi(defaultApi);

export function filterCatalog(source: Catalog, query: string): Catalog {
  const q = query.trim().toLowerCase();
  if (!q) return source;
  const groups = source.groups
    .map((g) => ({
      ...g,
      endpoints: g.endpoints.filter((e) =>
        [g.tag, e.path, e.summary, e.method, e.operation_id ?? ""].some((v) => v.toLowerCase().includes(q)),
      ),
    }))
    .filter((g) => g.endpoints.length > 0);
  return { ...source, groups };
}

const quote = (value: string) => `'${value.replace(/'/g, "'\\''")}'`;
const PLACEHOLDERS: Record<string, string> = { "Idempotency-Key": "<UUID v4>" };

/** Exemple curl : emplacements pour les identifiants et clés, jamais de vraie valeur. */
export function curlExample(apiUrl: string, endpoint: Endpoint): string {
  const lines = [`curl -X ${endpoint.method} ${quote(`${apiUrl}${endpoint.path}`)}`];
  const body = endpoint.request?.example;
  if (endpoint.request) lines.push(`-H ${quote("Content-Type: application/json")}`);
  for (const h of endpoint.headers) lines.push(`-H ${quote(`${h.name}: ${PLACEHOLDERS[h.name] ?? `<${h.name}>`}`)}`);
  if (endpoint.auth === "service_api_key") lines.push(`-H ${quote("X-Api-Key: <clé API du service>")}`);
  if (endpoint.auth === "admin_key") lines.push(`-H ${quote("X-Admin-Key: <clé admin, côté serveur uniquement>")}`);
  if (body !== undefined && body !== null) lines.push(`-d ${quote(JSON.stringify(body))}`);
  return lines.join(" \\\n  ");
}
