"use client";

import { useActionState } from "react";

import type { SyncState } from "@/app/(console)/transactions/actions";
import { Alert, Button } from "@/components/ui";

const LABELS: Record<string, string> = {
  pending: "toujours en attente",
  succeeded: "réussie",
  failed: "échouée",
  expired: "expirée",
};

export function SyncButton({ action }: { action: (state: SyncState) => Promise<SyncState> }) {
  const [state, run, pending] = useActionState(action, { status: "idle" });
  return (
    <form action={run} className="space-y-3">
      <Button type="submit" variant="secondary" disabled={pending}>
        {pending ? "Vérification…" : "Revérifier auprès du prestataire"}
      </Button>
      {state.status === "error" ? (
        <Alert>
          {state.error.message}
          {state.error.requestId ? <span className="block text-xs opacity-75">Référence : {state.error.requestId}</span> : null}
        </Alert>
      ) : null}
      {state.status === "done" ? (
        <Alert tone={state.changed ? "green" : "blue"}>
          {state.changed
            ? `Statut mis à jour : transaction ${LABELS[state.transactionStatus] ?? state.transactionStatus}.`
            : `Aucun changement : transaction ${LABELS[state.transactionStatus] ?? state.transactionStatus}.`}
        </Alert>
      ) : null}
    </form>
  );
}
