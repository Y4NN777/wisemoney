import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import HelpMessageMarkdown, { parseHelpMarkdown } from "./HelpMessageMarkdown.tsx";

describe("WiseBot Markdown", () => {
  it("groups numbered instructions and paragraphs into readable blocks", () => {
    expect(parseHelpMarkdown("Voici les étapes :\n\n1. Ouvrez **Saisie**.\n2. Choisissez Virement.\n\nLe solde est mis à jour.")).toEqual([
      { type: "paragraph", text: "Voici les étapes :" },
      { type: "ordered-list", items: ["Ouvrez **Saisie**.", "Choisissez Virement."] },
      { type: "paragraph", text: "Le solde est mis à jour." },
    ]);
  });

  it("renders supported Markdown without injecting provider HTML", () => {
    const html = renderToStaticMarkup(<HelpMessageMarkdown text={"1. Ouvrez **Saisie**.\n2. Touchez `Virement`.\n\n<script>alert(1)</script>"} />);

    expect(html).toContain("<ol");
    expect(html).toContain("<strong");
    expect(html).toContain("<code");
    expect(html).not.toContain("**Saisie**");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
  });
});
