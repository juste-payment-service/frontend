import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  create: vi.fn(),
  setStatus: vi.fn(),
  remove: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/server/auth", () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/server/docs-links", () => ({
  docsLinks: { create: mocks.create, setStatus: mocks.setStatus, remove: mocks.remove },
}));

import { createDocsLinkAction, deleteDocsLinkAction, setDocsLinkStatusAction } from "./actions";

const ID = "9a1d2c3b-4a5e-4f60-8a7b-9c0d1e2f3a4b";
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

describe("gestion des liens publics", () => {
  it("exige une session admin pour chaque action", async () => {
    mocks.requireAdmin.mockRejectedValue(new Error("Session administrateur requise."));
    await expect(createDocsLinkAction(idle, form({ label: "Partenaire" }))).rejects.toThrow(/Session/);
    await expect(setDocsLinkStatusAction(ID, "disabled")).rejects.toThrow(/Session/);
    await expect(deleteDocsLinkAction(ID)).rejects.toThrow(/Session/);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("crée un lien expirant en fin de journée, heure du Bénin", async () => {
    mocks.create.mockResolvedValue({});
    const state = await createDocsLinkAction(idle, form({ label: " Partenaire X ", expires_on: "2026-12-31", idempotency_key: KEY }));
    expect(state).toEqual({ status: "created", label: "Partenaire X" });
    expect(mocks.create).toHaveBeenCalledWith({ label: "Partenaire X", expires_at: "2026-12-31T23:59:59+01:00" }, KEY);
  });

  it("crée un lien sans expiration", async () => {
    mocks.create.mockResolvedValue({});
    await createDocsLinkAction(idle, form({ label: "Partenaire Y", idempotency_key: KEY }));
    expect(mocks.create).toHaveBeenCalledWith({ label: "Partenaire Y" }, KEY);
  });

  it("valide le libellé et la date sans appeler l'API", async () => {
    expect(await createDocsLinkAction(idle, form({ label: "x" }))).toMatchObject({ status: "error", error: { fieldErrors: { label: expect.any(String) } } });
    expect(await createDocsLinkAction(idle, form({ label: "Partenaire", expires_on: "31/12/2026" }))).toMatchObject({ status: "error" });
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("active, désactive et supprime", async () => {
    mocks.setStatus.mockResolvedValue({});
    mocks.remove.mockResolvedValue(undefined);
    await expect(setDocsLinkStatusAction(ID, "disabled")).resolves.toEqual({ status: "done" });
    expect(mocks.setStatus).toHaveBeenCalledWith(ID, "disabled");
    await expect(deleteDocsLinkAction(ID)).resolves.toEqual({ status: "done" });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/api-explorer/links");
  });
});
