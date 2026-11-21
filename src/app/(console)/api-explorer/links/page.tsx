import type { Metadata } from "next";
import Link from "next/link";

import { CreateLinkForm, LinkRow } from "@/components/explorer/docs-links";
import { Alert, Card, PageHeader } from "@/components/ui";
import { toActionError } from "@/lib/api-errors";
import { formatDateTime, formatNumber } from "@/lib/format";
import { docsLinks, publicDocsUrl } from "@/lib/server/docs-links";

import { createDocsLinkAction, deleteDocsLinkAction, setDocsLinkStatusAction } from "../actions";

export const metadata: Metadata = { title: "Liens publics de l'explorateur" };

export default async function DocsLinksPage() {
  let links: Awaited<ReturnType<typeof docsLinks.list>> | null = null;
  let error: string | null = null;
  try {
    links = await docsLinks.list();
  } catch (cause) {
    error = toActionError(cause).message;
  }

  return (
    <div className="space-y-6">
      <Link href="/api-explorer" className="text-sm text-slate-500 hover:underline">← Explorateur d&apos;API</Link>
      <PageHeader
        title="Liens publics"
        description="Partagez la documentation de l'API sans créer de compte : lecture seule, routes d'intégration uniquement (aucune route d'administration)."
      />
      <Card title="Nouveau lien">
        <CreateLinkForm action={createDocsLinkAction} />
      </Card>
      {error ? <Alert>{error}</Alert> : null}
      {links ? (
        links.data.length === 0 ? (
          <p className="text-sm text-slate-500">Aucun lien pour l&apos;instant.</p>
        ) : (
          <ul className="space-y-3">
            {links.data.map((link) => (
              <LinkRow
                key={link.id}
                label={link.label}
                url={publicDocsUrl(link.token)}
                status={link.status}
                usable={link.usable}
                details={[
                  `${formatNumber(link.view_count)} visite(s)`,
                  link.last_viewed_at ? `dernière le ${formatDateTime(link.last_viewed_at)}` : null,
                  link.expires_at ? `expire le ${formatDateTime(link.expires_at)}` : "sans expiration",
                ]
                  .filter(Boolean)
                  .join(" · ")}
                toggle={setDocsLinkStatusAction.bind(null, link.id, link.status === "active" ? "disabled" : "active")}
                remove={deleteDocsLinkAction.bind(null, link.id)}
              />
            ))}
          </ul>
        )
      ) : null}
    </div>
  );
}
