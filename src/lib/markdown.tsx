import { Fragment, type ReactNode } from "react";

/**
 * Markdown minimal des descriptions du contrat (paragraphes, listes, tableaux, `code`, **gras**),
 * rendu en éléments React : aucun HTML n'est interprété, tout le texte est échappé par React.
 */

function inline(text: string): ReactNode[] {
  return text.split(/(`[^`]+`|\*\*[^*]+\*\*)/g).map((part, i) => {
    if (part.startsWith("`") && part.endsWith("`") && part.length > 2) return <code key={i}>{part.slice(1, -1)}</code>;
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) return <strong key={i}>{part.slice(2, -2)}</strong>;
    return <Fragment key={i}>{part}</Fragment>;
  });
}

/** Une ligne de Markdown sans bloc (résumés) : `code` et **gras** seulement. */
export function InlineMarkdown({ source }: { source: string }) {
  return <>{inline(source)}</>;
}

const cells = (line: string) => line.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());

export function Markdown({ source }: { source: string }) {
  const blocks: ReactNode[] = [];
  const lines = source.split(/\r?\n/);
  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!.trim();
    if (!line) { i += 1; continue; }
    if (line.startsWith("|")) {
      const rows: string[] = [];
      while (i < lines.length && lines[i]!.trim().startsWith("|")) rows.push(lines[i++]!.trim());
      const [head, ...rest] = rows.filter((r) => !/^\|[\s:|-]+\|$/.test(r));
      blocks.push(
        <table key={blocks.length}>
          <thead><tr>{cells(head ?? "").map((c, k) => <th key={k}>{inline(c)}</th>)}</tr></thead>
          <tbody>{rest.map((r, k) => <tr key={k}>{cells(r).map((c, j) => <td key={j}>{inline(c)}</td>)}</tr>)}</tbody>
        </table>,
      );
      continue;
    }
    if (/^[-*] /.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*] /.test(lines[i]!)) {
        let item = lines[i++]!.trim().slice(2);
        while (i < lines.length && /^\s{2,}\S/.test(lines[i]!) && !/^\s*[-*] /.test(lines[i]!)) item += ` ${lines[i++]!.trim()}`;
        items.push(item);
      }
      blocks.push(<ul key={blocks.length}>{items.map((it, k) => <li key={k}>{inline(it)}</li>)}</ul>);
      continue;
    }
    const para: string[] = [];
    while (i < lines.length && lines[i]!.trim() && !/^\s*([-*] |\|)/.test(lines[i]!)) para.push(lines[i++]!.trim());
    blocks.push(<p key={blocks.length}>{inline(para.join(" "))}</p>);
  }
  return <>{blocks}</>;
}
