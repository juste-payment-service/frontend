import type { Metadata } from "next";

import { CatalogView, endpointCount } from "@/components/explorer/catalog-view";
import { catalog } from "@/lib/server/catalog";
import { docsLinks, isDocsToken } from "@/lib/server/docs-links";
import { getSecrets } from "@/lib/server/secrets";

/**
 * Documentation publique de l'API, partagée par lien (sans compte, lecture seule) : routes
 * d'intégration seulement, jamais la clé admin. Un lien indisponible ne dit pas pourquoi.
 */

export const metadata: Metadata = {
  title: "Documentation de l'API",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

function Unavailable() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-3 px-4 text-center">
      <h1 className="text-xl font-semibold">Lien indisponible</h1>
      <p className="text-sm text-slate-600 dark:text-slate-400">
        Ce lien de documentation n&apos;est pas ou plus valide. Demandez un nouveau lien à votre contact.
      </p>
    </main>
  );
}

export default async function PublicDocsPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { token } = await params;
  if (!isDocsToken(token)) return <Unavailable />;
  const raw = (await searchParams).q;
  const q = (Array.isArray(raw) ? raw[0] : raw)?.slice(0, 100) ?? "";

  let source;
  try {
    await docsLinks.resolve(token); // lien actif et non expiré, visite comptée
    source = await catalog.integration(); // routes d'intégration seulement
  } catch {
    return <Unavailable />;
  }
  const { apiUrl } = await getSecrets();

  return (
    <div className="min-h-dvh bg-slate-50 dark:bg-slate-950">
      <header className="border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="mx-auto max-w-6xl px-4 py-4">
          <p className="text-sm font-semibold">Payment Service · Documentation de l&apos;API</p>
          <p className="text-xs text-slate-500">
            Base {apiUrl}/v1 · API {source.version}
            {source.contract_version ? ` · contrat ${source.contract_version}` : ""} · {endpointCount(source)} endpoint(s) · lecture seule
          </p>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">
        <CatalogView source={source} q={q} apiUrl={apiUrl} basePath={`/docs/${token}`} />
      </main>
    </div>
  );
}
