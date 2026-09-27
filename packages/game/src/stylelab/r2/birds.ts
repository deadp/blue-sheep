// Style lab round 2: chunky round native birds as SVG (DESIGN-v3 §12): big eyes, one signature
// feature each: the kākā's orange underwing and heavy beak, the tūī's white throat tufts, the
// pīwakawaka's fanned tail. Used as embroidered / knitted / woven patches on the woolshed screen.

export type BirdId = "kaka" | "tui" | "piwakawaka";

interface Look { body: string; belly: string; wing: string; head: string; beak: string; accent: string }
const LOOK: Record<BirdId, Look> = {
  kaka: { body: "#8a7a45", belly: "#c98a4a", wing: "#6f6236", head: "#b3aa94", beak: "#6d665f", accent: "#e2703a" },
  tui: { body: "#34485a", belly: "#3f5a64", wing: "#2a3a48", head: "#34485a", beak: "#2a2a2a", accent: "#ffffff" },
  piwakawaka: { body: "#8c7662", belly: "#e8c99a", wing: "#6f5c4b", head: "#6f5c4b", beak: "#3a302a", accent: "#ffffff" },
};

export function bird(id: BirdId): string {
  const L = LOOK[id];
  const tail = id === "piwakawaka"
    ? `<g transform="translate(22 66) rotate(-18)">${[-50, -30, -10, 10, 30].map((a) => `<path d="M0 0 L-26 -4 A26 26 0 0 0 -24 8 Z" transform="rotate(${a})" fill="${L.wing}" stroke="${L.accent}" stroke-width="2.2"/>`).join("")}</g>`
    : `<path d="M28 64 L8 76 L14 82 L34 72 Z" fill="${L.wing}"/>`;
  const beak = id === "kaka"
    ? `<path d="M73 38 C86 38 90 46 86 56 C84 50 80 47 73 48 Z" fill="${L.beak}"/>`
    : id === "tui"
      ? `<path d="M74 40 C84 41 90 45 93 50 C86 48 80 47 74 46 Z" fill="${L.beak}"/>`
      : `<path d="M74 41 L84 44 L74 47 Z" fill="${L.beak}"/>`;
  const sig = id === "tui"
    ? `<circle cx="66" cy="57" r="4.2" fill="#fff"/><circle cx="71" cy="58" r="4.2" fill="#fff"/><path d="M40 50 q8 -4 16 0" stroke="#7fa7b8" stroke-width="2" fill="none" opacity=".7"/>`
    : id === "kaka"
      ? `<path d="M36 58 C44 76 58 78 62 70 C54 72 44 66 36 58 Z" fill="${L.accent}"/>`
      : `<path d="M58 34 q8 -4 14 1" stroke="#fff" stroke-width="3" fill="none" stroke-linecap="round"/><circle cx="68" cy="52" r="3" fill="#fff"/>`;
  return `<svg class="bird bird-${id}" viewBox="0 0 100 100" aria-hidden="true">
    <ellipse cx="50" cy="92" rx="26" ry="4" fill="#000" opacity=".12"/>
    ${tail}
    <path d="M44 84 v8 M54 84 v8" stroke="#8a6d55" stroke-width="3" stroke-linecap="round"/>
    <ellipse cx="48" cy="62" rx="27" ry="24" fill="${L.body}"/>
    <ellipse cx="54" cy="70" rx="17" ry="15" fill="${L.belly}"/>
    <path d="M26 58 C30 44 46 44 52 56 C48 72 34 76 26 58 Z" fill="${L.wing}"/>
    <circle cx="62" cy="42" r="15" fill="${L.head}"/>
    ${sig}
    <circle cx="66" cy="40" r="6.2" fill="#fff"/><circle cx="67.5" cy="40.5" r="4.2" fill="#1d1614"/><circle cx="69" cy="38.6" r="1.5" fill="#fff"/>
    ${beak}
  </svg>`;
}
