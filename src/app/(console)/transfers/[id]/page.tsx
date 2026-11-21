import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";

import { FEES_LABELS, TransferStatusBadge } from "@/components/transfers/labels";
import { ReviewActions } from "@/components/transfers/review-actions";
import { ROLE_LABELS, StatusBadge } from "@/components/transactions/labels";
import { Alert, Card, Dl, PageHeader } from "@/components/ui";
import { toActionError } from "@/lib/api-errors";
import { formatAmount, formatDateTime } from "@/lib/format";
import { ApiError } from "@/lib/server/api-client";
import { type AdminTransfer, transfers } from "@/lib/server/transfers";

import { retryDisbursementAction, reverseTransferAction } from "../actions";

export const metadata: Metadata = { title: "Transfert" };

function Party({ party }: { party: AdminTransfer["payer"] }) {
  return (
    <div className="space-y-0.5 text-sm">
      <p className="font-medium">{party.name ?? "—"}</p>
      <p className="text-slate-600 dark:text-slate-400">
        {party.method === "card" ? "Carte" : <><span className="font-mono">{party.phone_masked ?? "—"}</span> · {party.operator?.toUpperCase()} · {party.country}</>}
      </p>
      {party.user_id ? <Link href={`/users/${party.user_id}`} className="font-mono text-xs hover:underline">{party.user_id}</Link> : <p className="text-xs text-slate-500">Hors service (pas d&apos;identifiant)</p>}
    </div>
  );
}

export default async function TransferPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();

  let t: AdminTransfer;
  try {
    t = await transfers.get(id);
  } catch (error) {
    if (error instanceof ApiError && error.code === "NOT_FOUND") notFound();
    return <Alert>{toActionError(error).message}</Alert>;
  }

  return (
    <div className="space-y-6">
      <Link href="/transfers" className="text-sm text-slate-500 hover:underline">← Transferts</Link>
      <PageHeader
        title={`Transfert de ${formatAmount(t.amount, t.currency)}`}
        description={t.description ?? undefined}
        actions={<TransferStatusBadge status={t.status} />}
      />
      {t.failure ? <Alert><strong>{t.failure.code}</strong> — {t.failure.message}</Alert> : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <div className="grid gap-4 sm:grid-cols-2">
            <Card title="Payeur"><Party party={t.payer} /></Card>
            <Card title="Bénéficiaire"><Party party={t.beneficiary} /></Card>
          </div>

          <Card title="Montants">
            <Dl
              items={[
                ["Montant", formatAmount(t.amount, t.currency)],
                ["Frais", `${formatAmount(t.fee_amount, t.currency)} · ${FEES_LABELS[t.fees_paid_by] ?? t.fees_paid_by}`],
                ["Débité du payeur", formatAmount(t.debit_amount, t.currency)],
                ["Versé au bénéficiaire", formatAmount(t.credit_amount, t.currency)],
                ["Service", <Link key="s" href={`/services/${t.service_id}`} className="hover:underline">{t.service_name}</Link>],
                ["Référence client", t.client_reference ?? "—"],
                ["Créé le", formatDateTime(t.created_at)],
                ["Terminé le", formatDateTime(t.completed_at)],
              ]}
            />
          </Card>

          <Card title="Mouvements" actions={<Link href={`/transactions?transfer_id=${t.id}`} className="text-sm underline">Dans les transactions</Link>}>
            <div className="-mx-4 overflow-x-auto">
              <table className="w-full min-w-[560px] text-left text-sm">
                <thead className="text-xs text-slate-500 uppercase">
                  <tr className="border-b border-slate-200 dark:border-slate-800">
                    <th className="px-4 py-2 font-medium">Mouvement</th>
                    <th className="px-4 py-2 text-right font-medium">Montant</th>
                    <th className="px-4 py-2 font-medium">Statut</th>
                    <th className="px-4 py-2 font-medium">Terminé le</th>
                  </tr>
                </thead>
                <tbody>
                  {t.legs.map((leg) => (
                    <tr key={leg.transaction_id} className="border-b border-slate-100 last:border-0 dark:border-slate-800">
                      <td className="px-4 py-2">
                        <Link href={`/transactions/${leg.transaction_id}`} className="hover:underline">
                          {ROLE_LABELS[leg.role] ?? leg.role}{leg.attempt > 1 ? ` (tentative ${leg.attempt})` : ""}
                        </Link>
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums">{formatAmount(leg.amount, t.currency)}</td>
                      <td className="px-4 py-2"><StatusBadge status={leg.status} /></td>
                      <td className="px-4 py-2 whitespace-nowrap">{formatDateTime(leg.completed_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>

        <div className="space-y-4">
          {t.status === "requires_review" ? (
            <Card title="Intervention requise">
              <ReviewActions
                retry={retryDisbursementAction.bind(null, t.id)}
                reverse={reverseTransferAction.bind(null, t.id)}
              />
            </Card>
          ) : null}
          <Card title="Historique">
            <ol className="space-y-3 text-sm">
              {t.history.map((event, index) => (
                <li key={`${event.status}-${index}`} className="space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <TransferStatusBadge status={event.status} />
                    <span className="text-slate-500">{formatDateTime(event.at)}</span>
                  </div>
                  {event.reason ? <p className="text-slate-600 dark:text-slate-400">Motif : {event.reason}</p> : null}
                </li>
              ))}
            </ol>
          </Card>
        </div>
      </div>
    </div>
  );
}
