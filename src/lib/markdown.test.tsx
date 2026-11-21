import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { InlineMarkdown, Markdown } from "./markdown";

const html = (source: string) => renderToStaticMarkup(<Markdown source={source} />);

describe("rendu Markdown des descriptions du contrat", () => {
  it("rend paragraphes, listes, code et gras", () => {
    expect(html("Initie un **encaissement**.\n\n- `none` : téléphone ;\n- `redirect` : ouvrir l'URL.")).toBe(
      "<p>Initie un <strong>encaissement</strong>.</p>" +
        "<ul><li><code>none</code> : téléphone ;</li><li><code>redirect</code> : ouvrir l&#x27;URL.</li></ul>",
    );
  });

  it("rend les tableaux", () => {
    expect(html("| a | b |\n|---|---|\n| `x` | y |")).toBe(
      "<table><thead><tr><th>a</th><th>b</th></tr></thead><tbody><tr><td><code>x</code></td><td>y</td></tr></tbody></table>",
    );
  });

  it("n'interprète jamais de HTML (texte échappé)", () => {
    const out = html('<script>alert(1)</script> <img src=x onerror="alert(1)">');
    expect(out).not.toContain("<script>");
    expect(out).not.toContain("<img");
    expect(out).toContain("&lt;script&gt;");
  });

  it("rend une ligne de résumé sans bloc", () => {
    expect(renderToStaticMarkup(<InlineMarkdown source="Inconnu (`SERVICE_NOT_FOUND`)." />)).toBe(
      "Inconnu (<code>SERVICE_NOT_FOUND</code>).",
    );
  });

  it("rejoint les lignes d'un même paragraphe", () => {
    expect(html("ligne une\nligne deux")).toBe("<p>ligne une ligne deux</p>");
  });
});
