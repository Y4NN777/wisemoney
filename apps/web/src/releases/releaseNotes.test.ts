import { describe, expect, it } from "vitest";
import {
  CURRENT_RELEASE,
  getProductRelease,
  getReleaseContent,
  PRODUCT_RELEASES,
  PRODUCT_VERSION,
  resolveReleaseLocale,
} from "./releaseNotes.ts";
import { isUpdatesPath, releaseAnchor } from "./navigation.ts";

const SEMVER = /^\d+\.\d+\.\d+$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

describe("product release notes", () => {
  it("keeps the current version as the first release", () => {
    expect(PRODUCT_RELEASES.length).toBeGreaterThan(0);
    expect(PRODUCT_VERSION).toBe(CURRENT_RELEASE.version);
    expect(getProductRelease(PRODUCT_VERSION)).toBe(CURRENT_RELEASE);
  });

  it("uses unique semantic versions in newest-first order", () => {
    const versions = PRODUCT_RELEASES.map(({ version }) => version);
    const dates = PRODUCT_RELEASES.map(({ releasedAt }) => releasedAt);

    expect(versions.every((version) => SEMVER.test(version))).toBe(true);
    expect(new Set(versions).size).toBe(versions.length);
    expect(dates.every((date) => ISO_DATE.test(date) && !Number.isNaN(Date.parse(date)))).toBe(true);
    expect(dates).toEqual([...dates].sort().reverse());
  });

  it("keeps French and English highlights aligned and non-empty", () => {
    for (const release of PRODUCT_RELEASES) {
      const french = getReleaseContent(release, "fr-FR");
      const english = getReleaseContent(release, "en-US");
      expect(french.title.trim()).not.toBe("");
      expect(english.summary.trim()).not.toBe("");
      expect(french.highlights.map(({ id }) => id)).toEqual(english.highlights.map(({ id }) => id));
      expect([...french.highlights, ...english.highlights].every(({ title, body }) => title.trim().length > 0 && body.trim().length > 0)).toBe(true);
      expect(release.githubUrl).toBe(`https://github.com/Y4NN777/wisemoney/releases/tag/v${release.version}`);
    }
  });

  it("falls back to English for unsupported languages", () => {
    expect(resolveReleaseLocale("fr-CA")).toBe("fr");
    expect(resolveReleaseLocale("de-DE")).toBe("en");
  });

  it("recognizes the public route and creates stable version anchors", () => {
    expect(isUpdatesPath("/updates")).toBe(true);
    expect(isUpdatesPath("/updates/")).toBe(true);
    expect(isUpdatesPath("/help")).toBe(false);
    expect(releaseAnchor("1.0.0")).toBe("v1.0.0");
  });
});
