import type { Metadata } from "next";
import Link from "next/link";

import { EndpointCard } from "@/components/explorer/endpoint-card";
import { Alert, inputClass, PageHeader } from "@/components/ui";
import { toActionError } from "@/lib/api-errors";
import { Markdown } from "@/lib/markdown";
import { type Catalog, catalog, curlExample, filterCatalog } from "@/lib/server/catalog";
import { getSecrets } from "@/lib/server/secrets";

export const metadata: Metadata = { title: "Explorateur d'API" };

const anchor = (tag: string) => `groupe-${tag.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;

export default async function ApiExplorerPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const raw = (await searchParams).q;
  const q = (Array.isArray(raw) ? raw[0] : raw)?.slice(0, 100) ?? "";

  let source: Catalog;
  try {
    source = await catalog.get();
  } catch (error) {
    return <Alert>{toActionError(error).message}</Alert>;
  }
  const { apiUrl } = await getSecrets();
  const view = filterCatalog(source, q);
  const total = view.groups.reduce((n, g) => n + g.endpoints.length, 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Explorateur d'API"
        description={`Base ${apiUrl}/v1 · API ${source.version}${source.contract_version ? ` · contrat ${source.contract_version}` : ""} · ${total} endpoint(s)`}
      />
      {!source.contract_version ? (
        <Alert tone="amber">Contrat illisible côté API : documentation partielle (sans descriptions ni exemples).</Alert>
      ) : null}

      <form role="search" className="flex flex-wrap items-end gap-3">
        <div className="min-w-64 flex-1">
          <label htmlFor="q" className="block text-sm font-medium">Rechercher</label>
          <input id="q" name="q" defaultValue={q} placeholder="Chemin, résumé, groupe (ex. payouts, transfert)" className={inputClass} />
        </div>
        <button className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white dark:bg-white dark:text-slate-900">Rechercher</button>
        {q ? <Link href="/api-explorer" className="text-sm text-slate-500 hover:underline">Tout afficher</Link> : null}
      </form>

      <div className="grid gap-6 lg:grid-cols-[14rem_1fr]">
        <nav aria-label="Groupes" className="lg:sticky lg:top-4 lg:self-start">
          <ul className="flex flex-wrap gap-1 lg:flex-col">
            {view.groups.map((g) => (
              <li key={g.tag}>
                <a href={`#${anchor(g.tag)}`} className="block rounded px-2 py-1 text-sm hover:bg-slate-100 dark:hover:bg-slate-800">
                  {g.tag} <span className="text-slate-400">{g.endpoints.length}</span>
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <div className="min-w-0 space-y-8">
          {view.groups.length === 0 ? <p className="text-sm text-slate-500">Aucun endpoint ne correspond à « {q} ».</p> : null}
          {view.groups.map((g) => (
            <section key={g.tag} id={anchor(g.tag)} className="scroll-mt-4 space-y-3">
              <div>
                <h2 className="text-lg font-semibold">{g.tag}</h2>
                {g.description ? <div className="text-sm text-slate-600 dark:text-slate-400"><Markdown source={g.description} /></div> : null}
              </div>
              {g.endpoints.map((e) => (
                <EndpointCard key={`${e.method} ${e.path}`} endpoint={e} curl={curlExample(apiUrl, e)} />
              ))}
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
