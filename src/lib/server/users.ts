import "server-only";

import { z } from "zod";

import { api as defaultApi, type createApiClient } from "./api-client";
import { ListMeta } from "./services";

/** Utilisateurs connus (UUID envoyés par les services) et leurs totaux par service. */

export const PAGE_SIZE = 20;

export const UserSummary = z.object({
  user_id: z.uuid(),
  first_seen_at: z.string(),
  last_seen_at: z.string(),
  services: z.array(
    z.object({
      service_id: z.uuid(),
      service_name: z.string(),
      transactions_count: z.number().int(),
      totals: z.array(
        z.object({ currency: z.string(), paid_amount: z.number(), received_amount: z.number() }),
      ),
    }),
  ),
});
export type UserSummary = z.infer<typeof UserSummary>;

export type UserFilters = { user_id?: string; service_id?: string; page: number };

export function createUsersApi(api: ReturnType<typeof createApiClient>) {
  return {
    list: (filters: UserFilters) =>
      api.admin("/admin/users", {
        query: { ...filters, page_size: PAGE_SIZE },
        schema: z.object({ data: z.array(UserSummary), meta: ListMeta }),
      }),
    get: async (userId: string) => {
      if (!z.uuid().safeParse(userId).success) throw new Error("Identifiant d'utilisateur invalide.");
      return (await api.admin(`/admin/users/${userId}`, { schema: z.object({ data: UserSummary }) })).data;
    },
  };
}

export const users = createUsersApi(defaultApi);

export function parseUserFilters(search: Record<string, string | string[] | undefined>): UserFilters {
  const one = (key: string) => {
    const value = search[key];
    return ((Array.isArray(value) ? value[0] : value) ?? "").trim();
  };
  const uuid = (key: string) => (z.uuid().safeParse(one(key)).success ? one(key) : undefined);
  const filters: UserFilters = {
    user_id: uuid("user_id"),
    service_id: uuid("service_id"),
    page: Math.max(1, Number.parseInt(one("page"), 10) || 1),
  };
  return Object.fromEntries(Object.entries(filters).filter(([, v]) => v !== undefined)) as UserFilters;
}
