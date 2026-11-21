"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { type ActionError, toActionError } from "@/lib/api-errors";
import { requireAdmin } from "@/lib/server/auth";
import { parseReason, transfers } from "@/lib/server/transfers";

export type ReviewActionState =
  | { status: "idle" }
  | { status: "error"; error: ActionError }
  | { status: "done"; message: string };

function idempotencyKey(form: FormData): string {
  const value = form.get("idempotency_key");
  return typeof value === "string" && z.uuid().safeParse(value).success ? value : crypto.randomUUID();
}

/** Relance le versement au bénéficiaire d'un transfert en revue (encaissement confirmé). */
export async function retryDisbursementAction(
  transferId: string,
  _previous: ReviewActionState,
  form: FormData,
): Promise<ReviewActionState> {
  await requireAdmin();
  try {
    await transfers.retryDisbursement(transferId, idempotencyKey(form));
    revalidatePath(`/transfers/${transferId}`);
    return { status: "done", message: "Nouveau versement lancé : le transfert repasse en cours." };
  } catch (error) {
    return { status: "error", error: toActionError(error) };
  }
}

/** Rembourse intégralement le payeur ; le motif est conservé dans l'historique. */
export async function reverseTransferAction(
  transferId: string,
  _previous: ReviewActionState,
  form: FormData,
): Promise<ReviewActionState> {
  await requireAdmin();
  const parsed = parseReason(form.get("reason"));
  if (!parsed.ok) {
    return { status: "error", error: { message: parsed.error, fieldErrors: { reason: parsed.error }, requestId: null } };
  }
  try {
    await transfers.reverse(transferId, parsed.reason, idempotencyKey(form));
    revalidatePath(`/transfers/${transferId}`);
    return { status: "done", message: "Remboursement du payeur lancé." };
  } catch (error) {
    return { status: "error", error: toActionError(error) };
  }
}
