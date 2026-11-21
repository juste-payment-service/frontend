import { Badge } from "@/components/ui";
import { InlineMarkdown, Markdown } from "@/lib/markdown";
import type { Endpoint } from "@/lib/server/catalog";

import { SchemaView } from "./schema-view";

const METHOD_TONES = { GET: "blue", POST: "green", PATCH: "amber", PUT: "amber", DELETE: "red" } as const;
const AUTH_LABELS: Record<string, string> = {
  public: "Public",
  service_api_key: "Clé API du service",
  admin_key: "Clé admin (serveur uniquement)",
};

const json = (value: unknown) => JSON.stringify(value, null, 2);
const pre = "max-h-80 overflow-auto rounded-md bg-slate-950 p-3 font-mono text-xs text-slate-100";

/** Styles des descriptions Markdown (pas de plugin typographique : sélecteurs ciblés). */
const prose =
  "space-y-2 text-sm text-slate-700 dark:text-slate-300 [&_code]:rounded [&_code]:bg-slate-100 [&_code]:px-1 [&_code]:text-xs dark:[&_code]:bg-slate-800 [&_li]:ml-5 [&_li]:list-disc [&_table]:w-full [&_table]:text-left [&_td]:border-t [&_td]:border-slate-200 [&_td]:py-1 [&_td]:pr-3 dark:[&_td]:border-slate-800 [&_th]:py-1 [&_th]:pr-3 [&_th]:text-xs [&_th]:text-slate-500";

export function EndpointCard({ endpoint, curl }: { endpoint: Endpoint; curl: string }) {
  const planned = endpoint.status === "planned";
  return (
    <details id={endpoint.operation_id ?? undefined} className="group rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      <summary className="flex cursor-pointer list-none flex-wrap items-center gap-2 p-3">
        <Badge tone={METHOD_TONES[endpoint.method as keyof typeof METHOD_TONES] ?? "gray"}>{endpoint.method}</Badge>
        <code className="text-sm break-all">{endpoint.path}</code>
        <span className="text-sm text-slate-600 dark:text-slate-400">{endpoint.summary}</span>
        <span className="ml-auto flex flex-wrap gap-1">
          {planned ? <Badge tone="amber">Bientôt</Badge> : null}
          {endpoint.auth !== "public" ? <Badge tone="gray">{AUTH_LABELS[endpoint.auth] ?? endpoint.auth}</Badge> : null}
          {endpoint.idempotent ? <Badge tone="gray">Idempotent</Badge> : null}
        </span>
      </summary>

      <div className="space-y-5 border-t border-slate-200 p-4 dark:border-slate-800">
        {endpoint.description ? <div className={prose}><Markdown source={endpoint.description} /></div> : null}

        <dl className="grid gap-2 text-sm sm:grid-cols-2">
          <div><dt className="text-slate-500">Authentification</dt><dd>{AUTH_LABELS[endpoint.auth] ?? endpoint.auth}</dd></div>
          <div>
            <dt className="text-slate-500">Idempotence</dt>
            <dd>{endpoint.idempotent ? "Idempotency-Key (UUID v4) obligatoire ; même clé pour réessayer" : "—"}</dd>
          </div>
        </dl>

        {endpoint.headers.length || endpoint.parameters.length ? (
          <section>
            <h4 className="mb-1 text-sm font-semibold">En-têtes et paramètres</h4>
            <table className="w-full text-left text-sm">
              <tbody>
                {endpoint.headers.map((h) => (
                  <tr key={`h-${h.name}`} className="border-t border-slate-100 dark:border-slate-800">
                    <td className="py-1 pr-3 font-mono text-xs">{h.name}{h.required ? " *" : ""}</td>
                    <td className="py-1 pr-3 text-xs text-slate-500">en-tête</td>
                    <td className="py-1 text-xs">{h.description}</td>
                  </tr>
                ))}
                {endpoint.parameters.map((p) => (
                  <tr key={`${p.in}-${p.name}`} className="border-t border-slate-100 dark:border-slate-800">
                    <td className="py-1 pr-3 font-mono text-xs">{p.name}{p.required ? " *" : ""}</td>
                    <td className="py-1 pr-3 text-xs text-slate-500">{p.in === "path" ? "chemin" : "requête"}</td>
                    <td className="py-1 text-xs">{p.description}<SchemaView schema={p.schema} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ) : null}

        {endpoint.request ? (
          <section className="grid gap-4 lg:grid-cols-2">
            <div>
              <h4 className="mb-1 text-sm font-semibold">Corps de la requête</h4>
              <SchemaView schema={endpoint.request.schema} />
            </div>
            {endpoint.request.example != null ? (
              <div>
                <h4 className="mb-1 text-sm font-semibold">Exemple</h4>
                <pre className={pre}>{json(endpoint.request.example)}</pre>
              </div>
            ) : null}
          </section>
        ) : null}

        {!planned ? (
          <section>
            <h4 className="mb-1 text-sm font-semibold">Exemple curl</h4>
            <pre className={pre}>{curl}</pre>
          </section>
        ) : null}

        {endpoint.responses.length ? (
          <section>
            <h4 className="mb-1 text-sm font-semibold">Réponses</h4>
            <ul className="space-y-2">
              {endpoint.responses.map((r) => (
                <li key={r.status} className="text-sm">
                  <details>
                    <summary className="cursor-pointer">
                      <Badge tone={r.status < 300 ? "green" : r.status < 500 ? "amber" : "red"}>{r.status}</Badge>{" "}
                      <span className="text-slate-700 dark:text-slate-300 [&_code]:rounded [&_code]:bg-slate-100 [&_code]:px-1 [&_code]:text-xs dark:[&_code]:bg-slate-800"><InlineMarkdown source={r.description.split("\n")[0] ?? ""} /></span>
                    </summary>
                    <div className={`mt-2 ${prose}`}><Markdown source={r.description} /></div>
                    {r.example != null ? <pre className={`${pre} mt-2`}>{json(r.example)}</pre> : null}
                  </details>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </details>
  );
}
