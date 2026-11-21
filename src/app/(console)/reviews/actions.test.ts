import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ requireAdmin: vi.fn(), resolve: vi.fn(), revalidatePath: vi.fn() }));

vi.mock("@/lib/server/auth", () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/server/reviews", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/server/reviews")>()),
  reviews: { resolve: mocks.resolve },
}));

import { ApiError } from "@/lib/server/api-client";

import { resolveReviewAction } from "./actions";

const ID = "6f1d2c3b-4a5e-4f60-8a7b-9c0d1e2f3a4b";
const KEY = "22222222-2222-4222-8222-222222222222";
const idle = { status: "idle" } as const;
const form = (entries: Record<string, string>) => {
  const data = new FormData();
  for (const [k, v] of Object.entries(entries)) data.append(k, v);
  return data;
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireAdmin.mockResolvedValue({ user: { email: "admin@example.com" } });
});

describe("clôture d'un dossier", () => {
  it("exige une session admin", async () => {
    mocks.requireAdmin.mockRejectedValue(new Error("Session administrateur requise."));
    await expect(resolveReviewAction(ID, idle, form({ note: "Remboursé" }))).rejects.toThrow(/Session/);
    expect(mocks.resolve).not.toHaveBeenCalled();
  });

  it("refuse une note trop courte sans appeler l'API", async () => {
    const state = await resolveReviewAction(ID, idle, form({ note: "ok" }));
    expect(state).toMatchObject({ status: "error", error: { fieldErrors: { note: expect.any(String) } } });
    expect(mocks.resolve).not.toHaveBeenCalled();
  });

  it("clôt avec la note et la clé du formulaire, puis rafraîchit le badge", async () => {
    mocks.resolve.mockResolvedValue({ status: "resolved" });
    await expect(resolveReviewAction(ID, idle, form({ note: " Client remboursé ", idempotency_key: KEY }))).resolves.toEqual({ status: "resolved" });
    expect(mocks.resolve).toHaveBeenCalledWith(ID, "Client remboursé", KEY);
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/", "layout");
  });

  it("signale un dossier déjà clos par quelqu'un d'autre", async () => {
    mocks.resolve.mockRejectedValue(new ApiError(409, "REVIEW_ALREADY_RESOLVED", "x", [], "req_3"));
    await expect(resolveReviewAction(ID, idle, form({ note: "Client remboursé" }))).resolves.toMatchObject({
      status: "error",
      error: { message: "Ce dossier a déjà été clos : rechargez la page.", requestId: "req_3" },
    });
  });
});
