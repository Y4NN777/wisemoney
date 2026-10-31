import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Disclosure } from "./disclosure.tsx";

describe("Disclosure", () => {
  it("starts folded with the title only", () => {
    const html = renderToStaticMarkup(<Disclosure title="Exchange rates"><p>Body</p></Disclosure>);
    expect(html).toContain("Exchange rates");
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain("Body");
  });

  it("starts open on request", () => {
    const html = renderToStaticMarkup(<Disclosure title="Exchange rates" defaultOpen><p>Body</p></Disclosure>);
    expect(html).toContain('aria-expanded="true"');
    expect(html).toContain("Body");
  });
});
