"use server";

import { revalidatePath } from "next/cache";

import { type ActionError, toActionError } from "@/lib/api-errors";
import { requireAdmin } from "@/lib/server/auth";
import { transactions } from "@/lib/server/transactions";

export type SyncState =
  | { status: "idle" }
  | { status: "error"; error: ActionError }
  | { status: "done"; transactionStatus: string; changed: boolean };

/** Reconfirme immédiatement le statut auprès du prestataire (jamais appliqué sans confirmation). */
export async function syncTransactionAction(
  transactionId: string,
  previousStatus: string,
): Promise<SyncState> {
  await requireAdmin();
  try {
    const synced = await transactions.sync(transactionId);
    revalidatePath(`/transactions/${transactionId}`);
    return {
      status: "done",
      transactionStatus: synced.status,
      changed: synced.status !== previousStatus,
    };
  } catch (error) {
    return { status: "error", error: toActionError(error) };
  }
}
