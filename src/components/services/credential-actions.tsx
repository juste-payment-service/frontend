"use client";

import { useActionState, useState } from "react";

import type { CredentialState } from "@/app/(console)/services/actions";
import { Alert, Button, Card, inputClass } from "@/components/ui";
import { formatDateTime } from "@/lib/format";

import { SecretReveal } from "./secret-reveal";

type Action = (state: CredentialState, form: FormData) => Promise<CredentialState>;

function Outcome({ state, secretLabel }: { state: CredentialState; secretLabel?: string }) {
  if (state.status === "error") {
    return (
      <Alert>
        {state.error.message}
        {state.error.requestId ? <span className="block text-xs opacity-75">Référence : {state.error.requestId}</span> : null}
      </Alert>
    );
  }
  if (state.status !== "done") return null;
  return (
    <div className="space-y-3">
      <Alert tone={state.secret ? "amber" : "green"}>
        {state.message}
        {state.secret ? " Copiez-le maintenant : il ne sera plus jamais affiché." : null}
        {state.expiresAt ? ` L'ancien reste valable jusqu'au ${formatDateTime(state.expiresAt)}.` : null}
      </Alert>
      {state.secret && secretLabel ? <SecretReveal label={secretLabel} value={state.secret} /> : null}
    </div>
  );
}

const confirmed = (message: string) => (event: React.FormEvent) => {
  if (!window.confirm(message)) event.preventDefault();
};

export function CredentialActions({
  active,
  setStatus,
  rotateApiKey,
  rotateWebhookSecret,
}: {
  active: boolean;
  setStatus: Action;
  rotateApiKey: Action;
  rotateWebhookSecret: Action;
}) {
  const [statusState, statusAction, statusPending] = useActionState(setStatus, { status: "idle" });
  const [keyState, keyAction, keyPending] = useActionState(rotateApiKey, { status: "idle" });
  const [secretState, secretAction, secretPending] = useActionState(rotateWebhookSecret, { status: "idle" });
  const [keyIdempotency] = useState(() => crypto.randomUUID());
  const [secretIdempotency] = useState(() => crypto.randomUUID());

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card title="Clé API">
        <form
          action={keyAction}
          onSubmit={confirmed("Générer une nouvelle clé API ? L'ancienne expirera après la période de grâce.")}
          className="space-y-3"
        >
          <input type="hidden" name="idempotency_key" value={keyIdempotency} />
          <label htmlFor="grace_period_hours" className="block text-sm">
            Période de grâce de l&apos;ancienne clé
          </label>
          <select id="grace_period_hours" name="grace_period_hours" defaultValue="24" className={inputClass}>
            <option value="0">Révocation immédiate</option>
            <option value="1">1 heure</option>
            <option value="24">24 heures</option>
            <option value="48">48 heures</option>
            <option value="72">72 heures</option>
          </select>
          <Button type="submit" variant="secondary" disabled={keyPending || keyState.status === "done"}>
            {keyPending ? "Génération…" : "Régénérer la clé API"}
          </Button>
          <Outcome state={keyState} secretLabel="Nouvelle clé API (X-Api-Key)" />
        </form>
      </Card>

      <Card title="Secret des webhooks">
        <form
          action={secretAction}
          onSubmit={confirmed("Générer un nouveau secret de signature ? L'ancien reste valable 24 h.")}
          className="space-y-3"
        >
          <input type="hidden" name="idempotency_key" value={secretIdempotency} />
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Signe les notifications envoyées au service. L&apos;ancien secret reste accepté 24 h.
          </p>
          <Button type="submit" variant="secondary" disabled={secretPending || secretState.status === "done"}>
            {secretPending ? "Génération…" : "Régénérer le secret"}
          </Button>
          <Outcome state={secretState} secretLabel="Nouveau secret des webhooks" />
        </form>
      </Card>

      <Card title="Statut">
        <form
          action={statusAction}
          onSubmit={confirmed(
            active
              ? "Désactiver ce service ? Tous ses appels seront refusés."
              : "Réactiver ce service ?",
          )}
          className="space-y-3"
        >
          <input type="hidden" name="status" value={active ? "disabled" : "active"} />
          <p className="text-sm text-slate-600 dark:text-slate-400">
            {active
              ? "Un service désactivé ne peut plus encaisser, décaisser ni transférer."
              : "Ce service est désactivé : ses appels sont refusés."}
          </p>
          <Button type="submit" variant={active ? "danger" : "primary"} disabled={statusPending}>
            {statusPending ? "Enregistrement…" : active ? "Désactiver le service" : "Réactiver le service"}
          </Button>
          <Outcome state={statusState} />
        </form>
      </Card>
    </div>
  );
}
