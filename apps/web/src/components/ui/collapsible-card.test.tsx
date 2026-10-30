import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CollapsibleCard } from "./collapsible-card.tsx";

const render = (props: { defaultOpen?: boolean; forceOpen?: boolean }) =>
  renderToStaticMarkup(
    <CollapsibleCard title="Export" description="Download your data." {...props}>
      <p>Body</p>
    </CollapsibleCard>,
  );

describe("CollapsibleCard", () => {
  it("starts folded: title only, no description or body", () => {
    const html = render({});
    expect(html).toContain("Export");
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain("Download your data.");
    expect(html).not.toContain("Body");
  });

  it("starts open on request and shows the description and body", () => {
    const html = render({ defaultOpen: true });
    expect(html).toContain('aria-expanded="true"');
    expect(html).toContain("Download your data.");
    expect(html).toContain("Body");
  });

  it("opens when forced, so an error inside is never hidden", () => {
    expect(render({ forceOpen: true })).toContain("Body");
  });
});
