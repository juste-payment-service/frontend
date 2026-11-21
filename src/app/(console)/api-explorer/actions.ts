"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { type ActionError, toActionError } from "@/lib/api-errors";
import { requireAdmin } from "@/lib/server/auth";
import { docsLinks } from "@/lib/server/docs-links";

export type LinkFormState =
  | { status: "idle" }
  | { status: "error"; error: ActionError }
  | { status: "created"; label: string };

export type LinkActionState = { status: "idle" } | { status: "error"; error: ActionError } | { status: "done" };

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const invalid = (field: string, message: string): LinkFormState => ({
  status: "error",
  error: { message, fieldErrors: { [field]: message }, requestId: null },
});

/** Crée un lien ; une date d'expiration saisie vaut jusqu'à la fin du jour, heure du Bénin. */
export async function createDocsLinkAction(_previous: LinkFormState, form: FormData): Promise<LinkFormState> {
  await requireAdmin();
  const label = String(form.get("label") ?? "").trim();
  if (label.length < 2 || label.length > 100) return invalid("label", "Libellé de 2 à 100 caractères.");
  const expires = String(form.get("expires_on") ?? "").trim();
  if (expires && !DATE_RE.test(expires)) return invalid("expires_on", "Date invalide.");
  const key = form.get("idempotency_key");
  const idempotencyKey = typeof key === "string" && z.uuid().safeParse(key).success ? key : crypto.randomUUID();
  try {
    await docsLinks.create(
      expires ? { label, expires_at: `${expires}T23:59:59+01:00` } : { label },
      idempotencyKey,
    );
    revalidatePath("/api-explorer/links");
    return { status: "created", label };
  } catch (error) {
    return { status: "error", error: toActionError(error) };
  }
}

export async function setDocsLinkStatusAction(linkId: string, status: "active" | "disabled"): Promise<LinkActionState> {
  await requireAdmin();
  if (status !== "active" && status !== "disabled") return { status: "error", error: toActionError(null) };
  try {
    await docsLinks.setStatus(linkId, status);
    revalidatePath("/api-explorer/links");
    return { status: "done" };
  } catch (error) {
    return { status: "error", error: toActionError(error) };
  }
}

export async function deleteDocsLinkAction(linkId: string): Promise<LinkActionState> {
  await requireAdmin();
  try {
    await docsLinks.remove(linkId);
    revalidatePath("/api-explorer/links");
    return { status: "done" };
  } catch (error) {
    return { status: "error", error: toActionError(error) };
  }
}
