import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  rotateApiKey: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/server/auth", () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/server/services", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/server/services")>();
  return {
    ...original,
    services: { create: mocks.create, update: mocks.update, rotateApiKey: mocks.rotateApiKey },
  };
});

import { ApiError } from "@/lib/server/api-client";

import { createServiceAction, rotateApiKeyAction, setServiceStatusAction } from "./actions";

const ID = "0b7d8c1a-2f3e-4a5b-9c6d-7e8f9a0b1c2d";
const KEY = "22222222-2222-4222-8222-222222222222";
const idle = { status: "idle" } as const;

function form(entries: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) data.append(key, value);
  return data;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireAdmin.mockResolvedValue({ user: { email: "admin@example.com" } });
});

describe("actions serveur des services", () => {
  it("refusent tout appel sans session admin", async () => {
    mocks.requireAdmin.mockRejectedValue(new Error("Session administrateur requise."));
    await expect(createServiceAction(idle, form({ name: "Boutique" }))).rejects.toThrow(/Session/);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("créent le service avec la clé d'idempotence du formulaire, sans champs nuls", async () => {
    mocks.create.mockResolvedValue({ id: ID, name: "Boutique", api_key: "sk_svc_x", webhook_secret: "whsec_x" });

    const state = await createServiceAction(idle, form({ name: "Boutique", description: "", idempotency_key: KEY }));

    expect(mocks.create).toHaveBeenCalledWith(
      expect.not.objectContaining({ description: null, default_callback_url: null }),
      KEY,
    );
    expect(state).toEqual({ status: "created", id: ID, name: "Boutique", apiKey: "sk_svc_x", webhookSecret: "whsec_x" });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/services");
  });

  it("renvoient les erreurs de saisie sans appeler l'API", async () => {
    const state = await createServiceAction(idle, form({ name: "B" }));
    expect(state).toMatchObject({ status: "error", error: { fieldErrors: { name: expect.any(String) } } });
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("traduisent les erreurs de l'API", async () => {
    mocks.create.mockRejectedValue(new ApiError(409, "SERVICE_NAME_TAKEN", "x", [], "req_9"));
    const state = await createServiceAction(idle, form({ name: "Boutique" }));
    expect(state).toEqual({
      status: "error",
      error: { message: "Un service porte déjà ce nom.", fieldErrors: {}, requestId: "req_9" },
    });
  });

  it("n'acceptent qu'un statut connu", async () => {
    const state = await setServiceStatusAction(ID, idle, form({ status: "deleted" }));
    expect(state.status).toBe("error");
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("bornent la période de grâce de la clé API (0 à 72 h)", async () => {
    expect((await rotateApiKeyAction(ID, idle, form({ grace_period_hours: "500" }))).status).toBe("error");
    mocks.rotateApiKey.mockResolvedValue({ api_key: "sk_svc_new", api_key_prefix: "sk_svc_9L", previous_key_expires_at: null });
    const state = await rotateApiKeyAction(ID, idle, form({ grace_period_hours: "0", idempotency_key: KEY }));
    expect(mocks.rotateApiKey).toHaveBeenCalledWith(ID, 0, KEY);
    expect(state).toMatchObject({ status: "done", secret: "sk_svc_new" });
  });
});
