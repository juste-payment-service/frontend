import type { Metadata } from "next";

import { CatalogView, endpointCount } from "@/components/explorer/catalog-view";
import { Alert, ButtonLink, PageHeader } from "@/components/ui";
import { toActionError } from "@/lib/api-errors";
import { type Catalog, catalog } from "@/lib/server/catalog";
import { getSecrets } from "@/lib/server/secrets";

export const metadata: Metadata = { title: "Explorateur d'API" };

export default async function ApiExplorerPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const raw = (await searchParams).q;
  const q = (Array.isArray(raw) ? raw[0] : raw)?.slice(0, 100) ?? "";

  let source: Catalog;
  try {
    source = await catalog.full(); // vue complète, routes admin comprises
  } catch (error) {
    return <Alert>{toActionError(error).message}</Alert>;
  }
  const { apiUrl } = await getSecrets();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Explorateur d'API"
        description={`Base ${apiUrl}/v1 · API ${source.version}${source.contract_version ? ` · contrat ${source.contract_version}` : ""} · ${endpointCount(source)} endpoint(s)`}
        actions={<ButtonLink variant="secondary" href="/api-explorer/links">Liens publics</ButtonLink>}
      />
      {!source.contract_version ? (
        <Alert tone="amber">Contrat illisible côté API : documentation partielle (sans descriptions ni exemples).</Alert>
      ) : null}
      <CatalogView source={source} q={q} apiUrl={apiUrl} basePath="/api-explorer" />
    </div>
  );
}
