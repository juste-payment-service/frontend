import type { Metadata } from "next";
import Link from "next/link";

import { TRANSFER_STATUS_OPTIONS, TransferStatusBadge } from "@/components/transfers/labels";
import { Alert, ButtonLink, Card, inputClass, PageHeader } from "@/components/ui";
import { toActionError } from "@/lib/api-errors";
import { formatAmount, formatDateTime, formatNumber } from "@/lib/format";
import { services } from "@/lib/server/services";
import { parseTransferFilters, type TransferFilters, transfers } from "@/lib/server/transfers";

export const metadata: Metadata = { title: "Transferts" };

function href(filters: TransferFilters, changes: Record<string, string | undefined>) {
  const params = new URLSearchParams();
  const merged: Record<string, string | undefined> = {
    q: filters.q,
    status: filters.status,
    service_id: filters.service_id,
    user_id: filters.user_id,
    from: filters.fromDate,
    to: filters.toDate,
    page: String(filters.page),
    ...changes,
  };
  for (const [key, value] of Object.entries(merged)) if (value) params.set(key, value);
  return `/transfers?${params}`;
}

const party = (p: { name: string | null; phone_masked: string | null; method: string }) =>
  p.method === "card" ? `${p.name ?? "—"} · carte` : `${p.name ?? "—"} · ${p.phone_masked ?? "—"}`;

export default async function TransfersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const filters = parseTransferFilters(await searchParams);
  const { fromDate, toDate, ...query } = filters;
  void fromDate;
  void toDate;
  const [listResult, servicesResult] = await Promise.allSettled([transfers.list(query), services.list({ pageSize: 100 })]);
  const result = listResult.status === "fulfilled" ? listResult.value : null;
  const error = listResult.status === "rejected" ? toActionError(listResult.reason).message : null;
  const serviceOptions = servicesResult.status === "fulfilled" ? servicesResult.value.data : [];
  const pagination = result?.meta.pagination;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Transferts"
        description="Transferts entre clients : encaissement du payeur puis versement au bénéficiaire."
        actions={<ButtonLink variant="secondary" href="/transfers?status=requires_review">Transferts en revue</ButtonLink>}
      />

      <form className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6" role="search">
        {filters.user_id ? <input type="hidden" name="user_id" value={filters.user_id} /> : null}
        <div className="lg:col-span-2">
          <label htmlFor="q" className="block text-sm font-medium">Recherche exacte</label>
          <input id="q" name="q" defaultValue={filters.q} placeholder="ID transfert ou mouvement, référence client" className={inputClass} />
        </div>
        <div>
          <label htmlFor="status" className="block text-sm font-medium">Statut</label>
          <select id="status" name="status" defaultValue={filters.status ?? ""} className={inputClass}>
            <option value="">Tous</option>
            {TRANSFER_STATUS_OPTIONS.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="service_id" className="block text-sm font-medium">Service</label>
          <select id="service_id" name="service_id" defaultValue={filters.service_id ?? ""} className={inputClass}>
            <option value="">Tous</option>
            {serviceOptions.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="from" className="block text-sm font-medium">Du</label>
          <input id="from" name="from" type="date" defaultValue={filters.fromDate} className={inputClass} />
        </div>
        <div>
          <label htmlFor="to" className="block text-sm font-medium">Au (inclus)</label>
          <input id="to" name="to" type="date" defaultValue={filters.toDate} className={inputClass} />
        </div>
        <div className="flex flex-wrap items-center gap-2 lg:col-span-6">
          <button className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white dark:bg-white dark:text-slate-900">Filtrer</button>
          <Link href="/transfers" className="text-sm text-slate-500 hover:underline">Réinitialiser</Link>
          {filters.user_id ? (
            <Link href={href(filters, { user_id: undefined, page: "1" })} className="rounded-full bg-slate-200 px-2 py-0.5 text-xs dark:bg-slate-800">
              Utilisateur {filters.user_id.slice(0, 8)}… (payeur ou bénéficiaire) ✕
            </Link>
          ) : null}
        </div>
      </form>

      {error ? <Alert>{error}</Alert> : null}

      {result ? (
        <Card>
          {result.data.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-500">Aucun transfert ne correspond.</p>
          ) : (
            <div className="-mx-4 overflow-x-auto">
              <table className="w-full min-w-[900px] text-left text-sm">
                <thead className="text-xs text-slate-500 uppercase">
                  <tr className="border-b border-slate-200 dark:border-slate-800">
                    <th className="px-4 py-2 font-medium">Date</th>
                    <th className="px-4 py-2 font-medium">Service</th>
                    <th className="px-4 py-2 font-medium">Payeur → bénéficiaire</th>
                    <th className="px-4 py-2 text-right font-medium">Montant</th>
                    <th className="px-4 py-2 font-medium">Statut</th>
                  </tr>
                </thead>
                <tbody>
                  {result.data.map((t) => (
                    <tr key={t.id} className="border-b border-slate-100 last:border-0 dark:border-slate-800">
                      <td className="px-4 py-2 whitespace-nowrap">
                        <Link href={`/transfers/${t.id}`} className="font-medium hover:underline">{formatDateTime(t.created_at)}</Link>
                      </td>
                      <td className="px-4 py-2">{t.service_name}</td>
                      <td className="px-4 py-2">{party(t.payer)} → {party(t.beneficiary)}</td>
                      <td className="px-4 py-2 text-right whitespace-nowrap tabular-nums">{formatAmount(t.amount, t.currency)}</td>
                      <td className="px-4 py-2"><TransferStatusBadge status={t.status} /></td>
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
          <span className="text-slate-500">Page {pagination.page} sur {pagination.total_pages} · {formatNumber(pagination.total_items)} transferts</span>
          <div className="flex gap-2">
            {pagination.page > 1 ? <ButtonLink variant="secondary" href={href(filters, { page: String(pagination.page - 1) })}>Précédente</ButtonLink> : null}
            {pagination.page < pagination.total_pages ? <ButtonLink variant="secondary" href={href(filters, { page: String(pagination.page + 1) })}>Suivante</ButtonLink> : null}
          </div>
        </nav>
      ) : null}
    </div>
  );
}
