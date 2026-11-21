import type { Metadata } from "next";

import { type ChartSeries, LineChart, type ValueKind } from "@/components/dashboard/line-chart";
import { StatTile } from "@/components/dashboard/stat-tile";
import { Alert, Card, inputClass, PageHeader } from "@/components/ui";
import { toActionError } from "@/lib/api-errors";
import { formatAmount, formatNumber } from "@/lib/format";
import {
  CURRENCIES,
  type CurrencySummary,
  type DashboardFilters,
  type Granularity,
  MAX_COMPARED_SERVICES,
  type Metric,
  metrics,
  parseDashboardFilters,
  TIME_ZONE,
} from "@/lib/server/metrics";
import { services } from "@/lib/server/services";

export const metadata: Metadata = { title: "Tableau de bord" };

const METRIC_LABELS: Record<Metric, { label: string; kind: ValueKind }> = {
  collected_amount: { label: "Montant encaissé", kind: "amount" },
  paid_out_amount: { label: "Montant décaissé (frais compris)", kind: "amount" },
  net_amount: { label: "Net (encaissé − décaissé)", kind: "amount" },
  balance: { label: "Solde cumulé", kind: "amount" },
  payments_count: { label: "Nombre de paiements", kind: "count" },
  payouts_count: { label: "Nombre de retraits", kind: "count" },
  success_rate: { label: "Taux de réussite", kind: "percent" },
};
const GRANULARITY_LABELS: Record<Granularity, string> = { hour: "Heure", day: "Jour", week: "Semaine", month: "Mois" };
const RANGE_LABELS = { "7d": "7 derniers jours", "30d": "30 derniers jours", "90d": "90 derniers jours", "12m": "12 derniers mois", custom: "Période personnalisée" };

const percent = new Intl.NumberFormat("fr-FR", { style: "percent", maximumFractionDigits: 1 });

function pointLabel(iso: string, granularity: Granularity): string {
  const date = new Date(iso);
  const options: Intl.DateTimeFormatOptions =
    granularity === "hour"
      ? { day: "2-digit", month: "2-digit", hour: "2-digit" }
      : granularity === "month"
        ? { month: "short", year: "numeric" }
        : { day: "2-digit", month: "2-digit" };
  const text = new Intl.DateTimeFormat("fr-FR", { ...options, timeZone: TIME_ZONE }).format(date);
  return granularity === "week" ? `sem. ${text}` : text;
}

function Tiles({ summary, currency }: { summary: CurrencySummary; currency: string }) {
  const amount = (value: number) => formatAmount(value, currency);
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <StatTile label="Encaissé" value={amount(summary.collected_amount)} hint="Paiements réussis, à la date de règlement" />
      <StatTile label="Décaissé" value={amount(summary.paid_out_amount)} hint="Retraits réussis, frais compris" />
      <StatTile label="Frais du prestataire" value={amount(summary.fees_amount)} />
      <StatTile label="Solde disponible" value={amount(summary.balance)} hint="Depuis l'origine, retraits en attente déduits" />
      <StatTile label="Paiements créés" value={formatNumber(summary.payments_count)} hint={summary.average_payment_amount === null ? undefined : `Panier moyen ${amount(summary.average_payment_amount)}`} />
      <StatTile label="Retraits créés" value={formatNumber(summary.payouts_count)} />
      <StatTile
        label="Taux de réussite"
        value={summary.success_rate === null ? "—" : percent.format(summary.success_rate)}
        hint={`${formatNumber(summary.succeeded_count)} réussies · ${formatNumber(summary.failed_count)} échouées ou expirées`}
      />
      <StatTile label="En attente" value={formatNumber(summary.pending_count)} hint="Opérations créées sur la période" />
    </div>
  );
}

function search(filters: DashboardFilters, changes: Partial<Record<string, string>>) {
  const params = new URLSearchParams({ range: filters.range, currency: filters.currency, metric: filters.metric, granularity: filters.granularity });
  if (filters.range === "custom") {
    params.set("from", filters.fromDate);
    params.set("to", filters.toDate);
  }
  for (const id of filters.serviceIds) params.append("service_id", id);
  for (const [key, value] of Object.entries(changes)) if (value) params.set(key, value);
  return `?${params}`;
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const filters = parseDashboardFilters(await searchParams);
  const [summaryResult, seriesResult, servicesResult] = await Promise.allSettled([
    metrics.summary(filters),
    metrics.timeseries(filters),
    services.list({ pageSize: 100 }),
  ]);
  const error = [summaryResult, seriesResult].find((r) => r.status === "rejected");
  const summary = summaryResult.status === "fulfilled" ? summaryResult.value : null;
  const timeseries = seriesResult.status === "fulfilled" ? seriesResult.value : null;
  const serviceOptions = servicesResult.status === "fulfilled" ? servicesResult.value.data : [];
  const current = summary?.by_currency.find((c) => c.currency === filters.currency);
  const others = summary?.by_currency.filter((c) => c.currency !== filters.currency) ?? [];
  const metric = METRIC_LABELS[filters.metric];

  const labels = timeseries?.series[0]?.points.map((p) => pointLabel(p.t, filters.granularity)) ?? [];
  const chartSeries: ChartSeries[] =
    timeseries?.series.map((s) => ({ key: s.service_id ?? "all", name: s.service_name, values: s.points.map((p) => p.value) })) ?? [];
  const formatCell = (value: number | null) =>
    value === null ? "—" : metric.kind === "amount" ? formatAmount(value, filters.currency) : metric.kind === "percent" ? percent.format(value) : formatNumber(value);

  return (
    <div className="space-y-6">
      <PageHeader title="Tableau de bord" description={`${RANGE_LABELS[filters.range]} · du ${filters.fromDate.split("-").reverse().join("/")} au ${filters.toDate.split("-").reverse().join("/")} (heure du Bénin)`} />

      <form className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6" aria-label="Filtres du tableau de bord">
        <div className="lg:col-span-2">
          <label htmlFor="range" className="block text-sm font-medium">Période</label>
          <select id="range" name="range" defaultValue={filters.range} className={inputClass}>
            {Object.entries(RANGE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="from" className="block text-sm font-medium">Du (personnalisée)</label>
          <input id="from" name="from" type="date" defaultValue={filters.fromDate} className={inputClass} />
        </div>
        <div>
          <label htmlFor="to" className="block text-sm font-medium">Au (inclus)</label>
          <input id="to" name="to" type="date" defaultValue={filters.toDate} className={inputClass} />
        </div>
        <div>
          <label htmlFor="currency" className="block text-sm font-medium">Devise</label>
          <select id="currency" name="currency" defaultValue={filters.currency} className={inputClass}>
            {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="granularity" className="block text-sm font-medium">Intervalle</label>
          <select id="granularity" name="granularity" defaultValue={filters.granularity} className={inputClass}>
            {Object.entries(GRANULARITY_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </div>
        <div className="lg:col-span-2">
          <label htmlFor="metric" className="block text-sm font-medium">Courbe</label>
          <select id="metric" name="metric" defaultValue={filters.metric} className={inputClass}>
            {Object.entries(METRIC_LABELS).map(([value, { label }]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </div>
        <div className="lg:col-span-3">
          <label htmlFor="service_id" className="block text-sm font-medium">Services (jusqu&apos;à {MAX_COMPARED_SERVICES} à comparer ; aucun = tous)</label>
          <select id="service_id" name="service_id" multiple defaultValue={filters.serviceIds} className={`${inputClass} h-24`}>
            {serviceOptions.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div className="flex items-end">
          <button className="w-full rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white dark:bg-white dark:text-slate-900">Appliquer</button>
        </div>
      </form>

      {error && error.status === "rejected" ? <Alert>{toActionError(error.reason).message}</Alert> : null}

      {summary ? (
        <section className="space-y-3" aria-label="Indicateurs">
          <h2 className="text-lg font-semibold">
            Indicateurs {filters.serviceIds.length === 1 ? `· ${serviceOptions.find((s) => s.id === filters.serviceIds[0])?.name ?? "service"}` : "· tous les services"} ({filters.currency})
          </h2>
          {current ? <Tiles summary={current} currency={filters.currency} /> : <p className="text-sm text-slate-500">Aucune opération en {filters.currency} sur la période.</p>}
          {others.length > 0 ? (
            <p className="text-sm text-slate-500">
              Autres devises sur la période :{" "}
              {others.map((c, i) => (
                <a key={c.currency} href={search(filters, { currency: c.currency })} className="underline">
                  {c.currency} ({formatAmount(c.collected_amount, c.currency)} encaissés){i < others.length - 1 ? ", " : ""}
                </a>
              ))}
            </p>
          ) : null}
        </section>
      ) : null}

      {timeseries ? (
        <Card title={`${metric.label} (${filters.currency}) · par ${GRANULARITY_LABELS[filters.granularity].toLowerCase()}`}>
          <LineChart series={chartSeries} labels={labels} kind={metric.kind} currency={filters.currency} title={metric.label} />
          <details className="mt-4">
            <summary className="cursor-pointer text-sm text-slate-600 dark:text-slate-400">Voir les données en tableau</summary>
            <div className="mt-2 max-h-80 overflow-auto">
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 bg-white text-xs text-slate-500 uppercase dark:bg-slate-900">
                  <tr>
                    <th className="px-2 py-1 font-medium">Intervalle</th>
                    {chartSeries.map((s) => <th key={s.key} className="px-2 py-1 text-right font-medium">{s.name}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {labels.map((label, index) => (
                    <tr key={label + index} className="border-t border-slate-100 dark:border-slate-800">
                      <td className="px-2 py-1 whitespace-nowrap">{label}</td>
                      {chartSeries.map((s) => <td key={s.key} className="px-2 py-1 text-right tabular-nums">{formatCell(s.values[index] ?? null)}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </Card>
      ) : null}
    </div>
  );
}
