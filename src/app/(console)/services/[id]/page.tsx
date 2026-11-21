import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";

import { CredentialActions } from "@/components/services/credential-actions";
import { ServiceForm } from "@/components/services/service-form";
import { Alert, Badge, Card, Dl, PageHeader } from "@/components/ui";
import { toActionError } from "@/lib/api-errors";
import { formatDateTime, formatNumber } from "@/lib/format";
import { ApiError } from "@/lib/server/api-client";
import { type Service, services } from "@/lib/server/services";

import {
  rotateApiKeyAction,
  rotateWebhookSecretAction,
  setServiceStatusAction,
  updateServiceAction,
} from "../actions";

export const metadata: Metadata = { title: "Service" };

export default async function ServicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();

  let service: Service;
  try {
    service = await services.get(id);
  } catch (error) {
    if (error instanceof ApiError && error.code === "NOT_FOUND") notFound();
    return <Alert>{toActionError(error).message}</Alert>;
  }

  const active = service.status === "active";
  return (
    <div className="space-y-6">
      <Link href="/services" className="text-sm text-slate-500 hover:underline">← Services</Link>
      <PageHeader
        title={service.name}
        description={service.description ?? undefined}
        actions={active ? <Badge tone="green">Actif</Badge> : <Badge tone="red">Désactivé</Badge>}
      />

      <Card title="Identifiants et activité">
        <Dl
          items={[
            ["Identifiant (X-Service-Id)", <code key="id" className="text-xs">{service.id}</code>],
            ["Clé API active", <code key="key" className="text-xs">{service.api_key_prefix}…</code>],
            ["Dernière utilisation de la clé", formatDateTime(service.api_key_last_used_at)],
            ["Utilisateurs distincts", formatNumber(service.stats.users_count)],
            ["Transactions", formatNumber(service.stats.transactions_count)],
            ["Dernière transaction", formatDateTime(service.stats.last_transaction_at)],
            ["Créé le", formatDateTime(service.created_at)],
            ["Modifié le", formatDateTime(service.updated_at)],
          ]}
        />
      </Card>

      <CredentialActions
        active={active}
        setStatus={setServiceStatusAction.bind(null, service.id)}
        rotateApiKey={rotateApiKeyAction.bind(null, service.id)}
        rotateWebhookSecret={rotateWebhookSecretAction.bind(null, service.id)}
      />

      <div className="space-y-3">
        <h2 className="text-lg font-semibold">Configuration</h2>
        <ServiceForm
          key={service.updated_at}
          action={updateServiceAction.bind(null, service.id)}
          defaults={service}
          submitLabel="Enregistrer les modifications"
        />
      </div>
    </div>
  );
}
