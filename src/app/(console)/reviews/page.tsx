import type { Metadata } from "next";
import Link from "next/link";

import { Alert, Badge, ButtonLink, Card, PageHeader } from "@/components/ui";
import { toActionError } from "@/lib/api-errors";
import { formatDateTime, formatNumber } from "@/lib/format";
import { KINDS, parseReviewFilters, type ReviewFilters, reviews } from "@/lib/server/reviews";

export const metadata: Metadata = { title: "À régulariser" };

const KIND_LABELS: Record<string, string> = {
  late_approval: "Payé après expiration",
  amount_mismatch: "Écart de montant",
  payout_stuck: "Retrait bloqué",
};
const TABS = [
  { value: "open", label: "Ouverts" },
  { value: "resolved", label: "Clos" },
  { value: "all", label: "Tous" },
] as const;

function href(filters: ReviewFilters, changes: Record<string, string | undefined>) {
  const params = new URLSearchParams();
  const merged: Record<string, string | undefined> = {
    status: filters.status ?? "all",
    kind: filters.kind,
    service_id: filters.service_id,
    transaction_id: filters.transaction_id,
    page: "1",
    ...changes,
  };
  for (const [key, value] of Object.entries(merged)) if (value) params.set(key, value);
  return `/reviews?${params}`;
}

export default async function ReviewsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const filters = parseReviewFilters(await searchParams);
  const currentTab = filters.status ?? "all";

  let result: Awaited<ReturnType<typeof reviews.list>> | null = null;
  let error: string | null = null;
  try {
    result = await reviews.list(filters);
  } catch (cause) {
    error = toActionError(cause).message;
  }
  const pagination = result?.meta.pagination;

  return (
    <div className="space-y-6">
      <PageHeader
        title="À régulariser"
        description="Anomalies d'argent détectées automatiquement : à traiter hors de la console (remboursement, échange avec le prestataire), puis à clore avec une note."
      />

      <div className="flex flex-wrap items-center gap-2">
        <nav aria-label="Statut des dossiers" className="flex gap-1 rounded-md border border-slate-200 p-1 dark:border-slate-800">
          {TABS.map((tab) => (
            <Link
              key={tab.value}
              href={href(filters, { status: tab.value })}
              aria-current={currentTab === tab.value ? "page" : undefined}
              className={`rounded px-3 py-1 text-sm ${currentTab === tab.value ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900" : "hover:bg-slate-100 dark:hover:bg-slate-800"}`}
            >
              {tab.label}
            </Link>
          ))}
        </nav>
        <nav aria-label="Type de dossier" className="flex flex-wrap gap-1">
          <Link href={href(filters, { kind: undefined })} className={`rounded-full px-3 py-1 text-xs ${!filters.kind ? "bg-slate-200 dark:bg-slate-700" : "text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"}`}>
            Tous les types
          </Link>
          {KINDS.map((kind) => (
            <Link key={kind} href={href(filters, { kind })} className={`rounded-full px-3 py-1 text-xs ${filters.kind === kind ? "bg-slate-200 dark:bg-slate-700" : "text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"}`}>
              {KIND_LABELS[kind]}
            </Link>
          ))}
        </nav>
        {filters.service_id || filters.transaction_id ? (
          <Link href={href(filters, { service_id: undefined, transaction_id: undefined })} className="rounded-full bg-slate-200 px-2 py-0.5 text-xs dark:bg-slate-800">
            Filtre {filters.service_id ? "service" : "transaction"} ✕
          </Link>
        ) : null}
      </div>

      {error ? <Alert>{error}</Alert> : null}

      {result ? (
        result.data.length === 0 ? (
          <Card>
            <p className="py-6 text-center text-sm text-slate-500">
              {currentTab === "open" ? "Aucun dossier ouvert : rien à régulariser." : "Aucun dossier pour ces critères."}
            </p>
          </Card>
        ) : (
          <ul className="space-y-3">
            {result.data.map((item) => (
              <li key={item.id}>
                <Link
                  href={`/reviews/${item.id}`}
                  className="block rounded-lg border border-slate-200 bg-white p-4 hover:border-slate-400 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-600"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0 space-y-1">
                      <p className="font-medium">{item.label}</p>
                      <p className="text-xs text-slate-500">
                        Ouvert le {formatDateTime(item.opened_at)}
                        {item.occurrences > 1 ? ` · signalé ${formatNumber(item.occurrences)} fois, dernière fois le ${formatDateTime(item.last_seen_at)}` : ""}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Badge tone="gray">{KIND_LABELS[item.kind] ?? item.kind}</Badge>
                      {item.status === "open" ? <Badge tone="amber">Ouvert</Badge> : <Badge tone="green">Clos</Badge>}
                    </div>
                  </div>
                  {item.resolution_note ? <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">Clos le {formatDateTime(item.resolved_at)} : {item.resolution_note}</p> : null}
                </Link>
              </li>
            ))}
          </ul>
        )
      ) : null}

      {pagination && pagination.total_pages > 1 ? (
        <nav aria-label="Pagination" className="flex items-center justify-between text-sm">
          <span className="text-slate-500">Page {pagination.page} sur {pagination.total_pages} · {formatNumber(pagination.total_items)} dossiers</span>
          <div className="flex gap-2">
            {pagination.page > 1 ? <ButtonLink variant="secondary" href={href(filters, { page: String(pagination.page - 1) })}>Précédente</ButtonLink> : null}
            {pagination.page < pagination.total_pages ? <ButtonLink variant="secondary" href={href(filters, { page: String(pagination.page + 1) })}>Suivante</ButtonLink> : null}
          </div>
        </nav>
      ) : null}
    </div>
  );
}
