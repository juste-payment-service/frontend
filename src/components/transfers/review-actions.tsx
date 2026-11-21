"use client";

import { useActionState, useState } from "react";

import type { ReviewActionState } from "@/app/(console)/transfers/actions";
import { Alert, Button, Field, inputClass } from "@/components/ui";

type Action = (state: ReviewActionState, form: FormData) => Promise<ReviewActionState>;

function Outcome({ state }: { state: ReviewActionState }) {
  if (state.status === "done") return <Alert tone="green">{state.message}</Alert>;
  if (state.status === "error" && !state.error.fieldErrors.reason) {
    return (
      <Alert>
        {state.error.message}
        {state.error.requestId ? <span className="block text-xs opacity-75">Référence : {state.error.requestId}</span> : null}
      </Alert>
    );
  }
  return null;
}

/** Actions d'un transfert en revue : relancer le versement ou rembourser le payeur (motif). */
export function ReviewActions({ retry, reverse }: { retry: Action; reverse: Action }) {
  const [retryState, retryAction, retryPending] = useActionState(retry, { status: "idle" });
  const [reverseState, reverseAction, reversePending] = useActionState(reverse, { status: "idle" });
  const [retryKey] = useState(() => crypto.randomUUID());
  const [reverseKey] = useState(() => crypto.randomUUID());
  const done = retryState.status === "done" || reverseState.status === "done";
  const reasonError = reverseState.status === "error" ? reverseState.error.fieldErrors.reason : undefined;

  return (
    <div className="space-y-5">
      <form
        action={retryAction}
        onSubmit={(event) => {
          if (!window.confirm("Relancer un versement au bénéficiaire ?")) event.preventDefault();
        }}
        className="space-y-2"
      >
        <input type="hidden" name="idempotency_key" value={retryKey} />
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Le payeur a été débité : un nouveau versement au bénéficiaire est tenté (l&apos;ancien reste dans l&apos;historique).
        </p>
        <Button type="submit" disabled={retryPending || done}>
          {retryPending ? "Relance…" : "Relancer le versement"}
        </Button>
        <Outcome state={retryState} />
      </form>

      <form
        action={reverseAction}
        onSubmit={(event) => {
          if (!window.confirm("Rembourser intégralement le payeur (frais compris) ?")) event.preventDefault();
        }}
        className="space-y-2 border-t border-slate-200 pt-4 dark:border-slate-800"
        noValidate
      >
        <input type="hidden" name="idempotency_key" value={reverseKey} />
        <Field label="Motif du remboursement" name="reason" error={reasonError} hint="Conservé dans l'historique du transfert.">
          <textarea
            id="reason"
            name="reason"
            rows={2}
            minLength={5}
            maxLength={500}
            aria-invalid={reasonError ? true : undefined}
            aria-describedby={reasonError ? "reason-error" : undefined}
            className={inputClass}
          />
        </Field>
        <Button type="submit" variant="danger" disabled={reversePending || done}>
          {reversePending ? "Remboursement…" : "Rembourser le payeur"}
        </Button>
        <Outcome state={reverseState} />
      </form>
    </div>
  );
}
