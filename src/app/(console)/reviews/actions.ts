"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { type ActionError, toActionError } from "@/lib/api-errors";
import { requireAdmin } from "@/lib/server/auth";
import { parseResolveNote, reviews } from "@/lib/server/reviews";

export type ResolveState =
  | { status: "idle" }
  | { status: "error"; error: ActionError }
  | { status: "resolved" };

/** Clôt un dossier : trace l'action menée, ne modifie jamais la transaction. */
export async function resolveReviewAction(
  reviewId: string,
  _previous: ResolveState,
  form: FormData,
): Promise<ResolveState> {
  await requireAdmin();
  const parsed = parseResolveNote(form.get("note"));
  if (!parsed.ok) {
    return { status: "error", error: { message: parsed.error, fieldErrors: { note: parsed.error }, requestId: null } };
  }
  const key = form.get("idempotency_key");
  const idempotencyKey = typeof key === "string" && z.uuid().safeParse(key).success ? key : crypto.randomUUID();
  try {
    await reviews.resolve(reviewId, parsed.note, idempotencyKey);
    revalidatePath("/", "layout"); // badge de la navigation, liste et détail
    return { status: "resolved" };
  } catch (error) {
    return { status: "error", error: toActionError(error) };
  }
}
