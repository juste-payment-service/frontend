import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ requireAdmin: vi.fn(), retry: vi.fn(), reverse: vi.fn(), revalidatePath: vi.fn() }));

vi.mock("@/lib/server/auth", () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/server/transfers", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/server/transfers")>()),
  transfers: { retryDisbursement: mocks.retry, reverse: mocks.reverse },
}));

import { ApiError } from "@/lib/server/api-client";

import { retryDisbursementAction, reverseTransferAction } from "./actions";

const ID = "5f1c2b9e-5d4a-4e8f-b6a1-2c3d4e5f6a7b";
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

describe("reprise d'un transfert en revue", () => {
  it("exige une session admin", async () => {
    mocks.requireAdmin.mockRejectedValue(new Error("Session administrateur requise."));
    await expect(retryDisbursementAction(ID, idle, form({}))).rejects.toThrow(/Session/);
    await expect(reverseTransferAction(ID, idle, form({ reason: "Motif valable" }))).rejects.toThrow(/Session/);
    expect(mocks.retry).not.toHaveBeenCalled();
    expect(mocks.reverse).not.toHaveBeenCalled();
  });

  it("relance le versement avec la clé du formulaire", async () => {
    mocks.retry.mockResolvedValue({ status: "processing" });
    await expect(retryDisbursementAction(ID, idle, form({ idempotency_key: KEY }))).resolves.toMatchObject({ status: "done" });
    expect(mocks.retry).toHaveBeenCalledWith(ID, KEY);
  });

  it("exige un motif pour rembourser", async () => {
    await expect(reverseTransferAction(ID, idle, form({ reason: "non" }))).resolves.toMatchObject({
      status: "error",
      error: { fieldErrors: { reason: expect.any(String) } },
    });
    expect(mocks.reverse).not.toHaveBeenCalled();
    mocks.reverse.mockResolvedValue({ status: "reversing" });
    await reverseTransferAction(ID, idle, form({ reason: " Bénéficiaire injoignable ", idempotency_key: KEY }));
    expect(mocks.reverse).toHaveBeenCalledWith(ID, "Bénéficiaire injoignable", KEY);
  });

  it("explique une action impossible dans l'état actuel", async () => {
    mocks.retry.mockRejectedValue(new ApiError(409, "TRANSFER_NOT_ACTIONABLE", "x", [], "req_5"));
    await expect(retryDisbursementAction(ID, idle, form({}))).resolves.toMatchObject({
      status: "error",
      error: { message: "Action impossible dans l'état actuel du transfert.", requestId: "req_5" },
    });
  });
});
