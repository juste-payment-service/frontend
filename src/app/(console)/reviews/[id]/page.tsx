import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";

import { ResolveForm } from "@/components/reviews/resolve-form";
import { Alert, Badge, ButtonLink, Card, Dl, PageHeader } from "@/components/ui";
import { toActionError } from "@/lib/api-errors";
import { formatAmount, formatDateTime, formatNumber } from "@/lib/format";
import { ApiError } from "@/lib/server/api-client";
import { type ReviewCase, reviews } from "@/lib/server/reviews";

import { resolveReviewAction } from "../actions";

export const metadata: Metadata = { title: "Dossier à régulariser" };

const DETAIL_LABELS: Record<string, string> = {
  confirmed_amount: "Montant confirmé par le prestataire",
  confirmed_currency: "Devise confirmée",
  expected_amount: "Montant attendu",
  expected_currency: "Devise attendue",
  provider_transaction_id: "Référence prestataire",
  expired_at: "Expirée le",
  pending_since: "En attente depuis",
};

/** Détails du dossier, lisibles : montants dans leur devise, dates formatées, clés inconnues telles quelles. */
function detailItems(details: ReviewCase["details"]): [string, string][] {
  return Object.entries(details).map(([key, value]) => {
    const label = DETAIL_LABELS[key] ?? key;
    if (value === null || value === undefined || value === "") return [label, "—"];
    if (key.endsWith("_amount") && typeof value === "number") {
      const currency = details[key.replace("_amount", "_currency")];
      return [label, typeof currency === "string" ? formatAmount(value, currency) : formatNumber(value)];
    }
    if ((key.endsWith("_at") || key.endsWith("_since")) && typeof value === "string") return [label, formatDateTime(value)];
    return [label, typeof value === "string" ? value : JSON.stringify(value)];
  });
}

export default async function ReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();

  let item: ReviewCase;
  try {
    item = await reviews.get(id);
  } catch (error) {
    if (error instanceof ApiError && error.code === "NOT_FOUND") notFound();
    return <Alert>{toActionError(error).message}</Alert>;
  }
  const open = item.status === "open";

  return (
    <div className="space-y-6">
      <Link href="/reviews" className="text-sm text-slate-500 hover:underline">← À régulariser</Link>
      <PageHeader
        title={item.label}
        actions={open ? <Badge tone="amber">Ouvert</Badge> : <Badge tone="green">Clos</Badge>}
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card title="Constat">
            <Dl items={detailItems(item.details)} />
          </Card>
          <Card title="Suivi">
            <Dl
              items={[
                ["Ouvert le", formatDateTime(item.opened_at)],
                ["Dernier signalement", formatDateTime(item.last_seen_at)],
                ["Signalements", formatNumber(item.occurrences)],
                ["Clos le", formatDateTime(item.resolved_at)],
              ]}
            />
            {item.resolution_note ? (
              <p className="mt-3 rounded-md bg-slate-50 p-3 text-sm dark:bg-slate-800">{item.resolution_note}</p>
            ) : null}
          </Card>
        </div>
        <div className="space-y-4">
          <Card title="Concerne">
            <div className="flex flex-col gap-2">
              <ButtonLink variant="secondary" href={`/transactions/${item.transaction_id}`}>Voir la transaction</ButtonLink>
              <ButtonLink variant="secondary" href={`/services/${item.service_id}`}>Voir le service</ButtonLink>
            </div>
          </Card>
          {open ? (
            <Card title="Clore le dossier">
              <p className="mb-3 text-sm text-slate-600 dark:text-slate-400">
                Régularisez d&apos;abord hors de la console, puis décrivez ici l&apos;action menée. Clore le dossier ne modifie pas la transaction.
              </p>
              <ResolveForm action={resolveReviewAction.bind(null, item.id)} />
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}
