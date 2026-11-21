import type { Metadata } from "next";
import Link from "next/link";

import { Alert, Badge, ButtonLink, Card, inputClass, PageHeader } from "@/components/ui";
import { toActionError } from "@/lib/api-errors";
import { formatDateTime, formatNumber } from "@/lib/format";
import { services } from "@/lib/server/services";

export const metadata: Metadata = { title: "Services" };

type Search = Promise<Record<string, string | string[] | undefined>>;

const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) ?? "";

export default async function ServicesPage({ searchParams }: { searchParams: Search }) {
  const params = await searchParams;
  const q = one(params.q).trim().slice(0, 100);
  const status = one(params.status);
  const statusFilter = status === "active" || status === "disabled" ? status : undefined;
  const page = Math.max(1, Number.parseInt(one(params.page), 10) || 1);

  let result: Awaited<ReturnType<typeof services.list>> | null = null;
  let error: string | null = null;
  try {
    result = await services.list({ q: q || undefined, status: statusFilter, page });
  } catch (cause) {
    error = toActionError(cause).message;
  }

  const pageLink = (target: number) => {
    const search = new URLSearchParams();
    if (q) search.set("q", q);
    if (statusFilter) search.set("status", statusFilter);
    search.set("page", String(target));
    return `/services?${search}`;
  };
  const pagination = result?.meta.pagination;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Services"
        description="Applications intégratrices autorisées à encaisser, décaisser et transférer."
        actions={<ButtonLink href="/services/new">Nouveau service</ButtonLink>}
      />

      <form className="flex flex-wrap items-end gap-3" role="search">
        <div className="min-w-56 flex-1">
          <label htmlFor="q" className="block text-sm font-medium">Rechercher</label>
          <input id="q" name="q" defaultValue={q} placeholder="Nom du service" className={inputClass} />
        </div>
        <div>
          <label htmlFor="status" className="block text-sm font-medium">Statut</label>
          <select id="status" name="status" defaultValue={statusFilter ?? ""} className={inputClass}>
            <option value="">Tous</option>
            <option value="active">Actifs</option>
            <option value="disabled">Désactivés</option>
          </select>
        </div>
        <button className="rounded-md border border-slate-300 px-3 py-2 text-sm dark:border-slate-700">Filtrer</button>
      </form>

      {error ? <Alert>{error}</Alert> : null}

      {result ? (
        <Card>
          {result.data.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-500">
              Aucun service{q || statusFilter ? " ne correspond à ces critères" : " pour l'instant"}.
            </p>
          ) : (
            <div className="-mx-4 overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="text-xs text-slate-500 uppercase">
                  <tr className="border-b border-slate-200 dark:border-slate-800">
                    <th className="px-4 py-2 font-medium">Nom</th>
                    <th className="px-4 py-2 font-medium">Statut</th>
                    <th className="px-4 py-2 font-medium">Transferts</th>
                    <th className="px-4 py-2 text-right font-medium">Utilisateurs</th>
                    <th className="px-4 py-2 text-right font-medium">Transactions</th>
                    <th className="px-4 py-2 font-medium">Dernière transaction</th>
                    <th className="px-4 py-2 font-medium">Clé</th>
                  </tr>
                </thead>
                <tbody>
                  {result.data.map((service) => (
                    <tr key={service.id} className="border-b border-slate-100 last:border-0 dark:border-slate-800">
                      <td className="px-4 py-2">
                        <Link href={`/services/${service.id}`} className="font-medium hover:underline">
                          {service.name}
                        </Link>
                      </td>
                      <td className="px-4 py-2">
                        {service.status === "active" ? <Badge tone="green">Actif</Badge> : <Badge tone="red">Désactivé</Badge>}
                      </td>
                      <td className="px-4 py-2">{service.transfers_enabled ? "Oui" : "Non"}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{formatNumber(service.stats.users_count)}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{formatNumber(service.stats.transactions_count)}</td>
                      <td className="px-4 py-2 whitespace-nowrap">{formatDateTime(service.stats.last_transaction_at)}</td>
                      <td className="px-4 py-2 font-mono text-xs">{service.api_key_prefix}…</td>
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
            Page {pagination.page} sur {pagination.total_pages} · {formatNumber(pagination.total_items)} services
          </span>
          <div className="flex gap-2">
            {pagination.page > 1 ? <ButtonLink variant="secondary" href={pageLink(pagination.page - 1)}>Précédente</ButtonLink> : null}
            {pagination.page < pagination.total_pages ? <ButtonLink variant="secondary" href={pageLink(pagination.page + 1)}>Suivante</ButtonLink> : null}
          </div>
        </nav>
      ) : null}
    </div>
  );
}
