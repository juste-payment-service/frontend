import "server-only";

import { z } from "zod";

import { api as defaultApi, type createApiClient } from "./api-client";
import { ListMeta } from "./services";

/** Liens publics vers l'explorateur d'API : gestion (admin) et vérification (page publique). */

export const DocsLink = z.object({
  id: z.uuid(),
  label: z.string(),
  token: z.string(),
  status: z.enum(["active", "disabled"]),
  usable: z.boolean(),
  expires_at: z.string().nullable(),
  view_count: z.number().int(),
  last_viewed_at: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});
export type DocsLink = z.infer<typeof DocsLink>;

const Envelope = z.object({ data: DocsLink });
const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

export const isDocsToken = (value: string) => TOKEN_RE.test(value);

/** Adresse publique sur le domaine de la console (NEXTAUTH_URL). */
export function publicDocsUrl(token: string, consoleUrl = process.env.NEXTAUTH_URL ?? ""): string {
  return `${consoleUrl.replace(/\/+$/, "")}/docs/${token}`;
}

function linkId(id: string): string {
  if (!z.uuid().safeParse(id).success) throw new Error("Identifiant de lien invalide.");
  return id;
}

export function createDocsLinksApi(api: ReturnType<typeof createApiClient>) {
  return {
    list: () =>
      api.admin("/admin/docs-links", {
        query: { page: 1, page_size: 50 },
        schema: z.object({ data: z.array(DocsLink), meta: ListMeta }),
      }),
    create: async (body: { label: string; expires_at?: string }, idempotencyKey: string) =>
      (await api.admin("/admin/docs-links", { method: "POST", body, idempotencyKey, schema: Envelope })).data,
    setStatus: async (id: string, status: "active" | "disabled") =>
      (await api.admin(`/admin/docs-links/${linkId(id)}`, { method: "PATCH", body: { status }, schema: Envelope }))
        .data,
    remove: async (id: string) => {
      await api.admin(`/admin/docs-links/${linkId(id)}`, { method: "DELETE", schema: z.null() });
    },
    /** Page publique : jeton vérifié par l'API (lien actif et non expiré), visite comptée. */
    resolve: async (token: string) => {
      if (!isDocsToken(token)) throw new Error("Jeton de lien invalide.");
      return (
        await api.public(`/meta/docs-links/${token}`, {
          schema: z.object({ data: z.object({ label: z.string(), expires_at: z.string().nullable() }) }),
        })
      ).data;
    },
  };
}

export const docsLinks = createDocsLinksApi(defaultApi);
