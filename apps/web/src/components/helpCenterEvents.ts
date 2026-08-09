export const OPEN_HELP_CENTER_EVENT = "wisemoney:open-help-center";

export type HelpCenterSection = "financial-figures";

export function openHelpCenter(section: HelpCenterSection): void {
  window.dispatchEvent(new CustomEvent(OPEN_HELP_CENTER_EVENT, { detail: { section } }));
}
