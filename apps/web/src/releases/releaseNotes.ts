import releaseData from "./releases.json";

export type ReleaseLocale = "en" | "fr";

export type ProductReleaseHighlight = {
  id: string;
  title: string;
  body: string;
};

export type ProductReleaseContent = {
  title: string;
  summary: string;
  highlights: ProductReleaseHighlight[];
};

export type ProductRelease = {
  version: string;
  releasedAt: string;
  githubUrl: string;
  content: Record<ReleaseLocale, ProductReleaseContent>;
};

export const PRODUCT_RELEASES = releaseData satisfies ProductRelease[];
export const CURRENT_RELEASE = PRODUCT_RELEASES[0]!;
export const PRODUCT_VERSION = CURRENT_RELEASE.version;

export function resolveReleaseLocale(language: string): ReleaseLocale {
  return language.toLowerCase().startsWith("fr") ? "fr" : "en";
}

export function getReleaseContent(release: ProductRelease, language: string): ProductReleaseContent {
  return release.content[resolveReleaseLocale(language)];
}

export function getProductRelease(version: string): ProductRelease | undefined {
  return PRODUCT_RELEASES.find((release) => release.version === version);
}
