import type { Metadata } from "next";
import Link from "next/link";

import { Alert, ButtonLink, Card, inputClass, PageHeader } from "@/components/ui";
import { toActionError } from "@/lib/api-errors";
import { formatAmount, formatDateTime, formatNumber } from "@/lib/format";
import { services } from "@/lib/server/services";
import { parseUserFilters, users } from "@/lib/server/users";

export const metadata: Metadata = { title: "Utilisateurs" };

export default async function UsersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const filters = parseUserFilters(await searchParams);
  const [listResult, servicesResult] = await Promise.allSettled([users.list(filters), services.list({ pageSize: 100 })]);
  const result = listResult.status === "fulfilled" ? listResult.value : null;
  const error = listResult.status === "rejected" ? toActionError(listResult.reason).message : null;
  const serviceOptions = servicesResult.status === "fulfilled" ? servicesResult.value.data : [];
  const pagination = result?.meta.pagination;
  const pageHref = (page: number) => {
    const params = new URLSearchParams({ page: String(page) });
    if (filters.user_id) params.set("user_id", filters.user_id);
    if (filters.service_id) params.set("service_id", filters.service_id);
    return `/users?${params}`;
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Utilisateurs" description="Identifiants (UUID) envoyés par les services, avec leur activité par service." />

      <form className="flex flex-wrap items-end gap-3" role="search">
        <div className="min-w-72 flex-1">
          <label htmlFor="user_id" className="block text-sm font-medium">Identifiant utilisateur (UUID exact)</label>
          <input id="user_id" name="user_id" defaultValue={filters.user_id} placeholder="8a6e0f6e-…" className={`${inputClass} font-mono`} />
        </div>
        <div>
          <label htmlFor="service_id" className="block text-sm font-medium">Service</label>
          <select id="service_id" name="service_id" defaultValue={filters.service_id ?? ""} className={inputClass}>
            <option value="">Tous</option>
            {serviceOptions.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <button className="rounded-md border border-slate-300 px-3 py-2 text-sm dark:border-slate-700">Filtrer</button>
        <Link href="/users" className="text-sm text-slate-500 hover:underline">Réinitialiser</Link>
      </form>

      {error ? <Alert>{error}</Alert> : null}

      {result ? (
        <Card>
          {result.data.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-500">Aucun utilisateur ne correspond.</p>
          ) : (
            <div className="-mx-4 overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="text-xs text-slate-500 uppercase">
                  <tr className="border-b border-slate-200 dark:border-slate-800">
                    <th className="px-4 py-2 font-medium">Utilisateur</th>
                    <th className="px-4 py-2 font-medium">Services</th>
                    <th className="px-4 py-2 text-right font-medium">Transactions</th>
                    <th className="px-4 py-2 font-medium">Payé (réussi)</th>
                    <th className="px-4 py-2 font-medium">Dernière activité</th>
                  </tr>
                </thead>
                <tbody>
                  {result.data.map((user) => {
                    const paid = new Map<string, number>();
                    for (const s of user.services) for (const t of s.totals) paid.set(t.currency, (paid.get(t.currency) ?? 0) + t.paid_amount);
                    return (
                      <tr key={user.user_id} className="border-b border-slate-100 last:border-0 dark:border-slate-800">
                        <td className="px-4 py-2 font-mono text-xs">
                          <Link href={`/users/${user.user_id}`} className="hover:underline">{user.user_id}</Link>
                        </td>
                        <td className="px-4 py-2">{user.services.map((s) => s.service_name).join(", ")}</td>
                        <td className="px-4 py-2 text-right tabular-nums">{formatNumber(user.services.reduce((n, s) => n + s.transactions_count, 0))}</td>
                        <td className="px-4 py-2 whitespace-nowrap">{[...paid].map(([c, v]) => formatAmount(v, c)).join(" · ") || "—"}</td>
                        <td className="px-4 py-2 whitespace-nowrap">{formatDateTime(user.last_seen_at)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      ) : null}

      {pagination && pagination.total_pages > 1 ? (
        <nav aria-label="Pagination" className="flex items-center justify-between text-sm">
          <span className="text-slate-500">Page {pagination.page} sur {pagination.total_pages} · {formatNumber(pagination.total_items)} utilisateurs</span>
          <div className="flex gap-2">
            {pagination.page > 1 ? <ButtonLink variant="secondary" href={pageHref(pagination.page - 1)}>Précédente</ButtonLink> : null}
            {pagination.page < pagination.total_pages ? <ButtonLink variant="secondary" href={pageHref(pagination.page + 1)}>Suivante</ButtonLink> : null}
          </div>
        </nav>
      ) : null}
    </div>
  );
}
