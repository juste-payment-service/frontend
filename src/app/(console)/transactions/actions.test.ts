import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ requireAdmin: vi.fn(), sync: vi.fn(), revalidatePath: vi.fn() }));

vi.mock("@/lib/server/auth", () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/server/transactions", () => ({ transactions: { sync: mocks.sync } }));

import { ApiError } from "@/lib/server/api-client";

import { syncTransactionAction } from "./actions";

const ID = "3f1c2b9e-5d4a-4e8f-b6a1-2c3d4e5f6a7b";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireAdmin.mockResolvedValue({ user: { email: "admin@example.com" } });
});

describe("resynchronisation d'une transaction", () => {
  it("exige une session admin", async () => {
    mocks.requireAdmin.mockRejectedValue(new Error("Session administrateur requise."));
    await expect(syncTransactionAction(ID, "pending")).rejects.toThrow(/Session/);
    expect(mocks.sync).not.toHaveBeenCalled();
  });

  it("indique si le statut confirmé a changé", async () => {
    mocks.sync.mockResolvedValue({ status: "succeeded" });
    await expect(syncTransactionAction(ID, "pending")).resolves.toEqual({
      status: "done",
      transactionStatus: "succeeded",
      changed: true,
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith(`/transactions/${ID}`);
  });

  it("traduit l'indisponibilité du prestataire", async () => {
    mocks.sync.mockRejectedValue(new ApiError(503, "PROVIDER_UNAVAILABLE", "x", [], "req_7"));
    await expect(syncTransactionAction(ID, "pending")).resolves.toMatchObject({
      status: "error",
      error: { message: "Le prestataire de paiement est momentanément indisponible.", requestId: "req_7" },
    });
  });
});
