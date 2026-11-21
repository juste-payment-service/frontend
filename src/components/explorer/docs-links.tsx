"use client";

import { useActionState, useState, useTransition } from "react";

import type { LinkActionState, LinkFormState } from "@/app/(console)/api-explorer/actions";
import { Alert, Badge, Button, Field, inputClass } from "@/components/ui";

export function CreateLinkForm({ action }: { action: (state: LinkFormState, form: FormData) => Promise<LinkFormState> }) {
  const [state, formAction, pending] = useActionState(action, { status: "idle" });
  const [idempotencyKey, setKey] = useState(() => crypto.randomUUID());
  const errors = state.status === "error" ? state.error.fieldErrors : {};
  return (
    <form
      action={async (form) => {
        await formAction(form);
        setKey(crypto.randomUUID()); // chaque lien créé est une nouvelle intention
      }}
      className="grid gap-3 sm:grid-cols-[1fr_12rem_auto] sm:items-end"
      noValidate
    >
      <input type="hidden" name="idempotency_key" value={idempotencyKey} />
      <Field label="Destinataire" name="label" error={errors.label} hint="Ex. : Partenaire X (visible du visiteur).">
        <input id="label" name="label" maxLength={100} required className={inputClass} aria-invalid={errors.label ? true : undefined} />
      </Field>
      <Field label="Expire le (facultatif)" name="expires_on" error={errors.expires_on} hint="Inclus, heure du Bénin.">
        <input id="expires_on" name="expires_on" type="date" className={inputClass} />
      </Field>
      <Button type="submit" disabled={pending} className="sm:mb-5">{pending ? "Création…" : "Créer le lien"}</Button>
      <div className="sm:col-span-3">
        {state.status === "created" ? <Alert tone="green">Lien créé pour « {state.label} » : copiez-le dans la liste ci-dessous.</Alert> : null}
        {state.status === "error" && Object.keys(errors).length === 0 ? <Alert>{state.error.message}</Alert> : null}
      </div>
    </form>
  );
}

export function LinkRow({
  label,
  url,
  status,
  usable,
  details,
  toggle,
  remove,
}: {
  label: string;
  url: string;
  status: "active" | "disabled";
  usable: boolean;
  details: string;
  toggle: () => Promise<LinkActionState>;
  remove: () => Promise<LinkActionState>;
}) {
  const [pending, startTransition] = useTransition();
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = (task: () => Promise<LinkActionState>) =>
    startTransition(async () => {
      const result = await task();
      setError(result.status === "error" ? result.error.message : null);
    });

  return (
    <li className="space-y-2 rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex flex-wrap items-center gap-2">
        <p className="font-medium">{label}</p>
        {usable ? <Badge tone="green">Actif</Badge> : status === "disabled" ? <Badge tone="gray">Désactivé</Badge> : <Badge tone="amber">Expiré</Badge>}
        <span className="ml-auto text-xs text-slate-500">{details}</span>
      </div>
      <div className="flex flex-wrap gap-2">
        <input readOnly value={url} aria-label={`Lien public de ${label}`} onFocus={(e) => e.currentTarget.select()} className={`${inputClass} min-w-0 flex-1 font-mono text-xs`} />
        <Button
          type="button"
          variant="secondary"
          onClick={async () => {
            await navigator.clipboard.writeText(url);
            setCopied(true);
          }}
        >
          {copied ? "Copié" : "Copier"}
        </Button>
        <Button
          type="button"
          variant="secondary"
          disabled={pending}
          onClick={() => {
            if (window.confirm(status === "active" ? `Désactiver le lien de « ${label} » ? Il cessera aussitôt de fonctionner.` : `Réactiver le lien de « ${label} » ?`)) run(toggle);
          }}
        >
          {status === "active" ? "Désactiver" : "Activer"}
        </Button>
        <Button
          type="button"
          variant="danger"
          disabled={pending}
          onClick={() => {
            if (window.confirm(`Supprimer définitivement le lien de « ${label} » ?`)) run(remove);
          }}
        >
          Supprimer
        </Button>
      </div>
      {error ? <Alert>{error}</Alert> : null}
    </li>
  );
}
