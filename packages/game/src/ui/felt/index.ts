/**
 * The felt design system (DESIGN-v3 §15 items 16, 21, 25): felted-wool surfaces with blanket stitching,
 * embroidered icons, pom-pom badges, soft pastels; Patrick Hand for headings and names only, Nunito for the
 * rest. Tokens and textures live in tokens.css, components in felt.css, markup helpers in components.ts.
 * `FELT_DEFS` is the one hidden SVG the page needs (satin-stitch fills and the pom-pom fuzz); the Overlay
 * installs it once (`installFelt`).
 */
export * from "./icons.js";
export * from "./components.js";

const sat = (id: string, c: string) =>
  `<pattern id="sat-${id}" width="2.4" height="2.4" patternUnits="userSpaceOnUse" patternTransform="rotate(38)"><rect width="2.4" height="2.4" fill="${c}"/><rect width=".9" height="2.4" fill="#fff" opacity=".32"/></pattern>`;

/** Satin-stitch fills (url(#sat-*)) for icons and the fuzz/fray filters for pom-poms, as one hidden SVG. */
export const FELT_DEFS = `<svg id="felt-defs" width="0" height="0" style="position:absolute;width:0;height:0" aria-hidden="true" focusable="false"><defs>
${sat("pink", "#e79a93")}${sat("rose", "#e8849a")}${sat("butter", "#eec95e")}${sat("sage", "#9cc28d")}${sat("sky", "#93c2da")}${sat("blue", "#6f9fd0")}${sat("white", "#f6f1e8")}${sat("lilac", "#c3a9d6")}${sat("rust", "#d27a52")}${sat("oat", "#d9c7a4")}${sat("bark", "#9a7458")}${sat("grey", "#a9a3a0")}${sat("coal", "#5b504d")}
<filter id="fuzz" x="-20%" y="-20%" width="140%" height="140%"><feTurbulence type="fractalNoise" baseFrequency=".75" numOctaves="2" seed="5"/><feDisplacementMap in="SourceGraphic" scale="6" xChannelSelector="R" yChannelSelector="G"/></filter>
</defs></svg>`;
