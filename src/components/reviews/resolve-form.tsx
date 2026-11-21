"use client";

import { useActionState, useState } from "react";

import type { ResolveState } from "@/app/(console)/reviews/actions";
import { Alert, Button, Field, inputClass } from "@/components/ui";

export function ResolveForm({ action }: { action: (state: ResolveState, form: FormData) => Promise<ResolveState> }) {
  const [state, formAction, pending] = useActionState(action, { status: "idle" });
  const [idempotencyKey] = useState(() => crypto.randomUUID());

  if (state.status === "resolved") {
    return <Alert tone="green">Dossier clos. La transaction n&apos;a pas été modifiée.</Alert>;
  }
  const error = state.status === "error" ? state.error : null;
  return (
    <form
      action={formAction}
      onSubmit={(event) => {
        if (!window.confirm("Clore ce dossier ? Il ne pourra pas être rouvert.")) event.preventDefault();
      }}
      className="space-y-3"
      noValidate
    >
      <input type="hidden" name="idempotency_key" value={idempotencyKey} />
      {error && !error.fieldErrors.note ? (
        <Alert>
          {error.message}
          {error.requestId ? <span className="block text-xs opacity-75">Référence : {error.requestId}</span> : null}
        </Alert>
      ) : null}
      <Field
        label="Action menée"
        name="note"
        error={error?.fieldErrors.note}
        hint="Ex. : client remboursé le 21/11 (réf. prestataire …). Conservée pour l'audit."
      >
        <textarea
          id="note"
          name="note"
          rows={3}
          minLength={5}
          maxLength={500}
          required
          aria-invalid={error?.fieldErrors.note ? true : undefined}
          aria-describedby={error?.fieldErrors.note ? "note-error" : undefined}
          className={inputClass}
        />
      </Field>
      <Button type="submit" disabled={pending}>
        {pending ? "Clôture…" : "Clore le dossier"}
      </Button>
    </form>
  );
}
