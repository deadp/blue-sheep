import type { Sheep } from "./state.js";

const FILL: Record<string, string> = {
  white: "#f6f2e9", black: "#2f2a2a", brown: "#7a5232", blue: "#8aa2c8", fawn: "#d6b98a",
};
const FACE: Record<string, string> = {
  white: "#3a3232", black: "#1a1616", brown: "#3a2415", blue: "#3e4a63", fawn: "#5b4630",
};

/** Small SVG sheep drawn straight from phenotype. */
export function sheepSvg(s: Sheep, size = 96): string {
  const colour = String(s.phenotype["colour"]);
  const fill = FILL[colour] ?? "#ccc";
  const face = FACE[colour] ?? "#333";
  const spotted = s.phenotype["pattern"] === "spotted";
  const horned = s.phenotype["horns"] === "horned";
  const spotFill = colour === "white" ? "#cfc6b8" : "#f6f2e9";
  const spots = spotted
    ? `<circle cx="38" cy="40" r="6" fill="${spotFill}"/><circle cx="56" cy="52" r="5" fill="${spotFill}"/><circle cx="46" cy="58" r="4" fill="${spotFill}"/>`
    : "";
  const horns = horned
    ? `<path d="M66 30 q-8 -14 2 -18 q6 6 2 18z" fill="#c9b48a" stroke="#8a7550"/><path d="M80 30 q8 -14 -2 -18 q-6 6 -2 18z" fill="#c9b48a" stroke="#8a7550"/>`
    : "";
  return `<svg viewBox="0 0 100 80" width="${size}" height="${size * 0.8}" aria-label="${colour} ${s.sex}">
  <g stroke="#3b3330" stroke-width="1.5">
    <rect x="30" y="60" width="6" height="14" rx="3" fill="${face}"/><rect x="44" y="60" width="6" height="14" rx="3" fill="${face}"/>
    <rect x="56" y="60" width="6" height="14" rx="3" fill="${face}"/><rect x="20" y="58" width="6" height="14" rx="3" fill="${face}"/>
    <ellipse cx="44" cy="46" rx="30" ry="20" fill="${fill}"/>
    <circle cx="26" cy="36" r="8" fill="${fill}"/><circle cx="60" cy="30" r="9" fill="${fill}"/><circle cx="44" cy="28" r="9" fill="${fill}"/>
    ${spots}
    ${horns}
    <ellipse cx="73" cy="40" rx="12" ry="10" fill="${face}"/>
    <ellipse cx="62" cy="34" rx="5" ry="3" fill="${face}" transform="rotate(-25 62 34)"/>
    <circle cx="70" cy="38" r="1.8" fill="#fff" stroke="none"/><circle cx="78" cy="38" r="1.8" fill="#fff" stroke="none"/>
    <circle cx="70.5" cy="38.4" r="0.9" fill="#111" stroke="none"/><circle cx="78.5" cy="38.4" r="0.9" fill="#111" stroke="none"/>
  </g>
</svg>`;
}
