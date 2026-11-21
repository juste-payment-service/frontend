import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";

import {
  DELIVERY_LABELS,
  METHOD_LABELS,
  ROLE_LABELS,
  StatusBadge,
  TYPE_LABELS,
} from "@/components/transactions/labels";
import { SyncButton } from "@/components/transactions/sync-button";
import { Alert, Badge, Card, Dl, PageHeader } from "@/components/ui";
import { toActionError } from "@/lib/api-errors";
import { formatAmount, formatDateTime } from "@/lib/format";
import { ApiError } from "@/lib/server/api-client";
import { type AdminTransaction, transactions } from "@/lib/server/transactions";

import { syncTransactionAction } from "../actions";

export const metadata: Metadata = { title: "Transaction" };

function PartyLine({ party }: { party: NonNullable<AdminTransaction["payer"]> }) {
  return (
    <span>
      {party.name ? `${party.name} · ` : ""}
      <span className="font-mono">{party.phone_masked}</span> · {party.operator.toUpperCase()} · {party.country}
    </span>
  );
}

export default async function TransactionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();

  let tx: AdminTransaction;
  try {
    tx = await transactions.get(id);
  } catch (error) {
    if (error instanceof ApiError && error.code === "NOT_FOUND") notFound();
    return <Alert>{toActionError(error).message}</Alert>;
  }

  return (
    <div className="space-y-6">
      <Link href="/transactions" className="text-sm text-slate-500 hover:underline">← Transactions</Link>
      <PageHeader
        title={`${TYPE_LABELS[tx.type]} ${(METHOD_LABELS[tx.method] ?? tx.method).toLowerCase()} · ${formatAmount(tx.amount, tx.currency)}`}
        description={tx.description ?? undefined}
        actions={<StatusBadge status={tx.status} />}
      />

      {tx.failure ? (
        <Alert>
          <strong>{tx.failure.code}</strong> — {tx.failure.message}
        </Alert>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card title="Opération">
            <Dl
              items={[
                ["Identifiant", <code key="id" className="text-xs">{tx.id}</code>],
                ["Service", <Link key="s" href={`/services/${tx.service_id}`} className="hover:underline">{tx.service_name}</Link>],
                ["Utilisateur", <Link key="u" href={`/transactions?user_id=${tx.user_id}`} className="font-mono text-xs hover:underline">{tx.user_id}</Link>],
                ["Référence client", tx.client_reference ?? "—"],
                ["Montant", formatAmount(tx.amount, tx.currency)],
                ["Frais du prestataire", tx.fee_amount === null ? "—" : formatAmount(tx.fee_amount, tx.currency)],
                ["Payeur", tx.payer ? <PartyLine key="p" party={tx.payer} /> : "—"],
                ["Bénéficiaire", tx.recipient ? <PartyLine key="r" party={tx.recipient} /> : "—"],
                ["Créée le", formatDateTime(tx.created_at)],
                ["Terminée le", formatDateTime(tx.completed_at)],
              ]}
            />
          </Card>

          <Card title="Notifications envoyées au service">
            {tx.webhook_deliveries.length === 0 ? (
              <p className="text-sm text-slate-500">Aucune notification (pas d&apos;URL de notification ou transaction en cours).</p>
            ) : (
              <div className="-mx-4 overflow-x-auto">
                <table className="w-full min-w-[640px] text-left text-sm">
                  <thead className="text-xs text-slate-500 uppercase">
                    <tr className="border-b border-slate-200 dark:border-slate-800">
                      <th className="px-4 py-2 font-medium">URL</th>
                      <th className="px-4 py-2 font-medium">État</th>
                      <th className="px-4 py-2 text-right font-medium">Tentatives</th>
                      <th className="px-4 py-2 font-medium">Dernier code</th>
                      <th className="px-4 py-2 font-medium">Livrée / prochain essai</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tx.webhook_deliveries.map((delivery) => (
                      <tr key={delivery.event_id} className="border-b border-slate-100 last:border-0 dark:border-slate-800">
                        <td className="max-w-64 truncate px-4 py-2" title={delivery.url}>{delivery.url}</td>
                        <td className="px-4 py-2">
                          <Badge tone={delivery.status === "delivered" ? "green" : delivery.status === "failed" ? "red" : "amber"}>
                            {DELIVERY_LABELS[delivery.status]}
                          </Badge>
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums">{delivery.attempt}</td>
                        <td className="px-4 py-2">{delivery.response_status ?? "—"}</td>
                        <td className="px-4 py-2 whitespace-nowrap">
                          {delivery.delivered_at ? formatDateTime(delivery.delivered_at) : formatDateTime(delivery.next_retry_at)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          {tx.metadata && Object.keys(tx.metadata).length > 0 ? (
            <Card title="Métadonnées du service">
              <Dl items={Object.entries(tx.metadata).map(([key, value]) => [key, value])} />
            </Card>
          ) : null}
        </div>

        <div className="space-y-4">
          <Card title="Prestataire">
            <Dl
              items={[
                ["Prestataire", tx.provider.name],
                ["Référence prestataire", tx.provider.transaction_id ?? "—"],
                ["Notre référence", <code key="ref" className="text-xs break-all">{tx.provider.external_reference}</code>],
              ]}
            />
            {tx.status === "pending" ? (
              <div className="mt-4">
                <SyncButton action={syncTransactionAction.bind(null, tx.id, tx.status)} />
              </div>
            ) : null}
          </Card>

          {tx.transfer ? (
            <Card title="Transfert">
              <p className="text-sm">{ROLE_LABELS[tx.transfer.role]}</p>
              <Link href={`/transactions?transfer_id=${tx.transfer.transfer_id}`} className="mt-2 inline-block text-sm underline">
                Voir tous les mouvements du transfert
              </Link>
            </Card>
          ) : null}

          <Card title="Historique">
            <ol className="space-y-2 text-sm">
              {tx.history.map((event, index) => (
                <li key={`${event.status}-${index}`} className="flex items-center justify-between gap-2">
                  <StatusBadge status={event.status} />
                  <span className="text-slate-500">{formatDateTime(event.at)}</span>
                </li>
              ))}
            </ol>
          </Card>
        </div>
      </div>
    </div>
  );
}
