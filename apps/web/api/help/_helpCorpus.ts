import { getHelpSections, type HelpLocale, type HelpSection } from "../../src/help/corpus.js";

export function getTrustedHelpCorpus(locale: HelpLocale): HelpSection[] {
  return getHelpSections(locale);
}
