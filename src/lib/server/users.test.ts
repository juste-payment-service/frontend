import { describe, expect, it, vi } from "vitest";

import { createApiClient } from "./api-client";
import { createUsersApi, parseUserFilters } from "./users";

const USER = {
  user_id: "8a6e0f6e-3b1f-4a37-9d43-0e6f7c1b2a11",
  first_seen_at: "2026-10-01T09:00:00Z",
  last_seen_at: "2026-11-21T09:00:00Z",
  services: [
    {
      service_id: "0b7d8c1a-2f3e-4a5b-9c6d-7e8f9a0b1c2d",
      service_name: "Boutique",
      transactions_count: 12,
      totals: [{ currency: "XOF", paid_amount: 50000, received_amount: 3000 }],
    },
  ],
};

function setup(body: unknown) {
  const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
    new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json" } }),
  );
  const api = createApiClient({
    secrets: async () => ({ apiUrl: "https://api.example.com", adminApiKey: "k".repeat(48) }),
    fetch,
  });
  return { users: createUsersApi(api), url: () => String((fetch.mock.calls[0] as [URL])[0]) };
}

describe("API des utilisateurs", () => {
  it("liste les utilisateurs d'un service", async () => {
    const meta = { pagination: { page: 1, page_size: 20, total_items: 1, total_pages: 1 } };
    const { users, url } = setup({ data: [USER], meta });
    const page = await users.list({ service_id: USER.services[0]!.service_id, page: 1 });
    expect(page.data[0]?.services[0]?.totals[0]?.paid_amount).toBe(50000);
    expect(url()).toBe(
      `https://api.example.com/v1/admin/users?service_id=${USER.services[0]!.service_id}&page=1&page_size=20`,
    );
  });

  it("lit le détail d'un utilisateur", async () => {
    const { users, url } = setup({ data: USER });
    await expect(users.get(USER.user_id)).resolves.toMatchObject({ user_id: USER.user_id });
    expect(url()).toBe(`https://api.example.com/v1/admin/users/${USER.user_id}`);
  });

  it("ne garde que des identifiants valides", () => {
    expect(parseUserFilters({ user_id: " " + USER.user_id, service_id: "x", page: "2" })).toEqual({
      user_id: USER.user_id,
      page: 2,
    });
  });
});
