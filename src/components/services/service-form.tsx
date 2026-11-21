"use client";

import Link from "next/link";
import { useActionState, useState } from "react";

import type { ServiceFormState } from "@/app/(console)/services/actions";
import { Alert, Button, Card, Field, inputClass } from "@/components/ui";

import { SecretReveal } from "./secret-reveal";

type Defaults = {
  name: string;
  description: string | null;
  default_callback_url: string | null;
  allowed_redirect_hosts: string[];
  transfers_enabled: boolean;
  transfer_limits: {
    max_amount: number | null;
    daily_max_amount_per_payer: number | null;
    daily_max_count_per_payer: number | null;
  };
};

const EMPTY: Defaults = {
  name: "",
  description: null,
  default_callback_url: null,
  allowed_redirect_hosts: [],
  transfers_enabled: false,
  transfer_limits: { max_amount: null, daily_max_amount_per_payer: null, daily_max_count_per_payer: null },
};

export function ServiceForm({
  action,
  defaults = EMPTY,
  submitLabel,
}: {
  action: (state: ServiceFormState, form: FormData) => Promise<ServiceFormState>;
  defaults?: Defaults;
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, { status: "idle" });
  // Une clé par intention : réutilisée si l'envoi est rejoué (double clic, réseau).
  const [idempotencyKey] = useState(() => crypto.randomUUID());

  if (state.status === "created") {
    return (
      <Card title={`Service « ${state.name} » créé`}>
        <div className="space-y-4">
          <Alert tone="amber">
            Copiez ces deux valeurs maintenant et transmettez-les au service par un canal sûr : elles
            ne seront <strong>plus jamais affichées</strong>. En cas de perte, il faudra les régénérer.
          </Alert>
          <SecretReveal label="Identifiant du service (X-Service-Id)" value={state.id} />
          <SecretReveal label="Clé API (X-Api-Key)" value={state.apiKey} />
          <SecretReveal label="Secret de signature des webhooks" value={state.webhookSecret} />
          <Link href={`/services/${state.id}`} className="inline-block text-sm font-medium underline">
            J&apos;ai copié les secrets : voir le service
          </Link>
        </div>
      </Card>
    );
  }

  const errors = state.status === "error" ? state.error.fieldErrors : {};
  const field = (name: string) => ({
    id: name,
    name,
    "aria-invalid": errors[name] ? true : undefined,
    "aria-describedby": errors[name] ? `${name}-error` : undefined,
    className: inputClass,
  });
  const limits = defaults.transfer_limits;

  return (
    <form action={formAction} className="space-y-6" noValidate>
      <input type="hidden" name="idempotency_key" value={idempotencyKey} />
      {state.status === "error" ? (
        <Alert>
          {state.error.message}
          {state.error.requestId ? <span className="block text-xs opacity-75">Référence : {state.error.requestId}</span> : null}
        </Alert>
      ) : null}
      {state.status === "saved" ? <Alert tone="green">Modifications enregistrées.</Alert> : null}

      <Card title="Identité">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nom" name="name" error={errors.name}>
            <input {...field("name")} required maxLength={100} defaultValue={defaults.name} />
          </Field>
          <Field label="Description" name="description" error={errors.description} hint="Facultatif.">
            <input {...field("description")} maxLength={500} defaultValue={defaults.description ?? ""} />
          </Field>
        </div>
      </Card>

      <Card title="Intégration">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="URL de notification par défaut"
            name="default_callback_url"
            error={errors.default_callback_url}
            hint="https uniquement, domaine public. Utilisée si une opération n'en précise pas."
          >
            <input {...field("default_callback_url")} type="url" placeholder="https://…" defaultValue={defaults.default_callback_url ?? ""} />
          </Field>
          <Field
            label="Hôtes de retour autorisés"
            name="allowed_redirect_hosts"
            error={errors.allowed_redirect_hosts}
            hint="Un par ligne (20 au maximum). Requis pour les paiements carte et les redirections."
          >
            <textarea {...field("allowed_redirect_hosts")} rows={3} defaultValue={defaults.allowed_redirect_hosts.join("\n")} />
          </Field>
        </div>
      </Card>

      <Card title="Transferts entre clients">
        <div className="space-y-4">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="transfers_enabled" defaultChecked={defaults.transfers_enabled} className="size-4" />
            Autoriser les transferts pour ce service
          </label>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Montant maximal par transfert" name="max_amount" error={errors.max_amount} hint="Unité mineure ; vide = sans plafond.">
              <input {...field("max_amount")} inputMode="numeric" defaultValue={limits.max_amount ?? ""} />
            </Field>
            <Field label="Montant max. par payeur / 24 h" name="daily_max_amount_per_payer" error={errors.daily_max_amount_per_payer}>
              <input {...field("daily_max_amount_per_payer")} inputMode="numeric" defaultValue={limits.daily_max_amount_per_payer ?? ""} />
            </Field>
            <Field label="Nombre max. par payeur / 24 h" name="daily_max_count_per_payer" error={errors.daily_max_count_per_payer}>
              <input {...field("daily_max_count_per_payer")} inputMode="numeric" defaultValue={limits.daily_max_count_per_payer ?? ""} />
            </Field>
          </div>
        </div>
      </Card>

      <Button type="submit" disabled={pending}>
        {pending ? "Enregistrement…" : submitLabel}
      </Button>
    </form>
  );
}
