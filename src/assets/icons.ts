/**
 * Single source for the AI Assistant icon used by SiYuan dock/topbar.
 * Keep root icon.png visually aligned with this flat SVG symbol.
 */

export const AI_ASSISTANT_ICON_ID = "iconClaudeAI";
export const LEGACY_AI_ASSISTANT_ICON_IDS = ["iconClaudeCode"] as const;
export const AI_ASSISTANT_TITLE = "Claude AI Assistant";

export const AI_ASSISTANT_ICON_SVG = `<svg>
<symbol id="${AI_ASSISTANT_ICON_ID}" viewBox="0 0 32 32">
  <rect x="2" y="2" width="28" height="28" rx="7" fill="#0B3D78" fill-opacity="0.74"/>
  <path d="M5.2 9.4 L12.2 7.2 L26 10 M6.8 23.2 L14.4 25 L25.4 22"
        stroke="#39D8FF"
        stroke-width="0.9"
        stroke-linecap="round"
        opacity="0.7"/>
  <circle cx="5.2" cy="9.4" r="1.05" fill="#39D8FF"/>
  <circle cx="26" cy="10" r="1.05" fill="#39D8FF"/>
  <circle cx="25.4" cy="22" r="1.1" fill="#39D8FF"/>
  <path fill="#FFFFFF" fill-rule="evenodd" d="
        M6.2 24 L10.3 24 L11.4 20.8 L16.6 20.8 L17.8 24 L21.9 24
        L16.2 8 L11.9 8 Z
        M12.5 17.8 L15.6 17.8 L14 12.9 Z"/>
  <path fill="#FFFFFF" d="
        M23 8 H26 V24 H23 Z
        M21.7 8 H27.3 V10.8 H21.7 Z
        M21.7 21.2 H27.3 V24 H21.7 Z"/>
</symbol>
</svg>`;

export function getAiAssistantIconCleanupSelectors(): string[] {
    const iconIds = [AI_ASSISTANT_ICON_ID, ...LEGACY_AI_ASSISTANT_ICON_IDS];

    return [
        ...iconIds.map(id => `svg[data-icon="${id}"]`),
        ...iconIds.map(id => `.toolbar__item:has(svg[data-icon="${id}"])`),
        ...iconIds.map(id => `[href="#${id}"]`),
        ...iconIds.map(id => `[xlink\\:href="#${id}"]`),
        `[aria-label*="${AI_ASSISTANT_TITLE}"]`,
    ];
}
