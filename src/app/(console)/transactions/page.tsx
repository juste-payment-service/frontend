import type { Metadata } from "next";
import Link from "next/link";

import { METHOD_LABELS, STATUS_OPTIONS, StatusBadge, TYPE_LABELS } from "@/components/transactions/labels";
import { Alert, ButtonLink, Card, inputClass, PageHeader } from "@/components/ui";
import { toActionError } from "@/lib/api-errors";
import { formatAmount, formatDateTime, formatNumber } from "@/lib/format";
import { services } from "@/lib/server/services";
import {
  filtersToSearch,
  parseTransactionFilters,
  type TransactionFilters,
  transactions,
} from "@/lib/server/transactions";

export const metadata: Metadata = { title: "Transactions" };

const LINKED_FILTERS: { key: "transaction_id" | "transfer_id" | "user_id"; label: string }[] = [
  { key: "transaction_id", label: "Transaction" },
  { key: "transfer_id", label: "Transfert" },
  { key: "user_id", label: "Utilisateur" },
];

function without(filters: TransactionFilters, key: keyof TransactionFilters) {
  const rest = { ...filters, page: 1 };
  delete rest[key];
  return `/transactions?${filtersToSearch(rest)}`;
}

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const filters = parseTransactionFilters(await searchParams);
  const { fromDate, toDate, ...query } = filters;

  const [listResult, servicesResult] = await Promise.allSettled([
    transactions.list(query),
    services.list({ pageSize: 100 }),
  ]);
  const result = listResult.status === "fulfilled" ? listResult.value : null;
  const error = listResult.status === "rejected" ? toActionError(listResult.reason).message : null;
  const serviceOptions = servicesResult.status === "fulfilled" ? servicesResult.value.data : [];
  const pagination = result?.meta.pagination;

  return (
    <div className="space-y-6">
      <PageHeader title="Transactions" description="Toutes les opérations de tous les services : recherche, filtres et détail." />

      <form className="space-y-3" role="search">
        {LINKED_FILTERS.filter(({ key }) => filters[key]).map(({ key }) => (
          <input key={key} type="hidden" name={key} value={filters[key]} />
        ))}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="sm:col-span-2">
            <label htmlFor="q" className="block text-sm font-medium">Recherche exacte</label>
            <input id="q" name="q" defaultValue={filters.q} placeholder="UUID, référence client ou prestataire" className={inputClass} />
          </div>
          <div>
            <label htmlFor="service_id" className="block text-sm font-medium">Service</label>
            <select id="service_id" name="service_id" defaultValue={filters.service_id ?? ""} className={inputClass}>
              <option value="">Tous</option>
              {serviceOptions.map((service) => (
                <option key={service.id} value={service.id}>{service.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="status" className="block text-sm font-medium">Statut</label>
            <select id="status" name="status" defaultValue={filters.status ?? ""} className={inputClass}>
              <option value="">Tous</option>
              {STATUS_OPTIONS.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="type" className="block text-sm font-medium">Type</label>
            <select id="type" name="type" defaultValue={filters.type ?? ""} className={inputClass}>
              <option value="">Tous</option>
              {Object.entries(TYPE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="method" className="block text-sm font-medium">Moyen</label>
            <select id="method" name="method" defaultValue={filters.method ?? ""} className={inputClass}>
              <option value="">Tous</option>
              {Object.entries(METHOD_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="from" className="block text-sm font-medium">Du</label>
            <input id="from" name="from" type="date" defaultValue={fromDate} className={inputClass} />
          </div>
          <div>
            <label htmlFor="to" className="block text-sm font-medium">Au (inclus)</label>
            <input id="to" name="to" type="date" defaultValue={toDate} className={inputClass} />
          </div>
          <div>
            <label htmlFor="sort" className="block text-sm font-medium">Tri</label>
            <select id="sort" name="sort" defaultValue={filters.sort ?? "-created_at"} className={inputClass}>
              <option value="-created_at">Plus récentes</option>
              <option value="created_at">Plus anciennes</option>
              <option value="-amount">Montant décroissant</option>
              <option value="amount">Montant croissant</option>
            </select>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white dark:bg-white dark:text-slate-900">Filtrer</button>
          <Link href="/transactions" className="text-sm text-slate-500 hover:underline">Réinitialiser</Link>
          {LINKED_FILTERS.filter(({ key }) => filters[key]).map(({ key, label }) => (
            <Link key={key} href={without(filters, key)} className="rounded-full bg-slate-200 px-2 py-0.5 text-xs dark:bg-slate-800" title="Retirer ce filtre">
              {label} {filters[key]?.slice(0, 8)}… ✕
            </Link>
          ))}
        </div>
      </form>

      {error ? <Alert>{error}</Alert> : null}

      {result ? (
        <Card>
          {result.data.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-500">Aucune transaction ne correspond à ces critères.</p>
          ) : (
            <div className="-mx-4 overflow-x-auto">
              <table className="w-full min-w-[900px] text-left text-sm">
                <thead className="text-xs text-slate-500 uppercase">
                  <tr className="border-b border-slate-200 dark:border-slate-800">
                    <th className="px-4 py-2 font-medium">Date</th>
                    <th className="px-4 py-2 font-medium">Service</th>
                    <th className="px-4 py-2 font-medium">Type</th>
                    <th className="px-4 py-2 text-right font-medium">Montant</th>
                    <th className="px-4 py-2 font-medium">Statut</th>
                    <th className="px-4 py-2 font-medium">Référence client</th>
                    <th className="px-4 py-2 font-medium">Utilisateur</th>
                  </tr>
                </thead>
                <tbody>
                  {result.data.map((tx) => (
                    <tr key={tx.id} className="border-b border-slate-100 last:border-0 dark:border-slate-800">
                      <td className="px-4 py-2 whitespace-nowrap">
                        <Link href={`/transactions/${tx.id}`} className="font-medium hover:underline">{formatDateTime(tx.created_at)}</Link>
                      </td>
                      <td className="px-4 py-2">{tx.service_name}</td>
                      <td className="px-4 py-2 whitespace-nowrap">
                        {TYPE_LABELS[tx.type]} · {METHOD_LABELS[tx.method]}
                        {tx.transfer ? <span className="block text-xs text-slate-500">Transfert</span> : null}
                      </td>
                      <td className="px-4 py-2 text-right whitespace-nowrap tabular-nums">{formatAmount(tx.amount, tx.currency)}</td>
                      <td className="px-4 py-2">
                        <StatusBadge status={tx.status} />
                        {tx.failure ? <span className="block text-xs text-slate-500">{tx.failure.code}</span> : null}
                      </td>
                      <td className="px-4 py-2">{tx.client_reference ?? "—"}</td>
                      <td className="px-4 py-2 font-mono text-xs">
                        <Link href={`/transactions?user_id=${tx.user_id}`} className="hover:underline">{tx.user_id.slice(0, 8)}…</Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      ) : null}

      {pagination && pagination.total_pages > 1 ? (
        <nav aria-label="Pagination" className="flex items-center justify-between text-sm">
          <span className="text-slate-500">
            Page {pagination.page} sur {pagination.total_pages} · {formatNumber(pagination.total_items)} transactions
          </span>
          <div className="flex gap-2">
            {pagination.page > 1 ? <ButtonLink variant="secondary" href={`/transactions?${filtersToSearch(filters, pagination.page - 1)}`}>Précédente</ButtonLink> : null}
            {pagination.page < pagination.total_pages ? <ButtonLink variant="secondary" href={`/transactions?${filtersToSearch(filters, pagination.page + 1)}`}>Suivante</ButtonLink> : null}
          </div>
        </nav>
      ) : pagination ? (
        <p className="text-sm text-slate-500">{formatNumber(pagination.total_items)} transaction(s)</p>
      ) : null}
    </div>
  );
}
