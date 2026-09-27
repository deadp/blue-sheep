// Style lab round 2: procedural fibre textures (SVG data URIs + SVG defs), no external assets.
// Felt (fibre noise), blanket stitch, satin-stitch icon fills, knit stitches, ribbing, cable,
// tweed herringbone with heather flecks, linen, and a fuzz filter for pom-poms.

const uri = (svg: string) => `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
const S = (w: number, h: number, body: string) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">${body}</svg>`;

/** Fibre speckle over any base colour (dark flecks + light hairs). */
export const feltNoise = uri(S(180, 180, `<filter id="f"><feTurbulence type="fractalNoise" baseFrequency=".8" numOctaves="3" seed="4" stitchTiles="stitch"/><feColorMatrix values="0 0 0 0 .3  0 0 0 0 .24  0 0 0 0 .2  0 0 0 1.5 -.62"/></filter><rect width="100%" height="100%" filter="url(#f)"/>`));
export const feltHair = uri(S(240, 240, `<filter id="g"><feTurbulence type="fractalNoise" baseFrequency=".015 .12" numOctaves="2" seed="9" stitchTiles="stitch"/><feColorMatrix values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 1.3 -.45"/></filter><rect width="100%" height="100%" filter="url(#g)"/>`));

/** Blanket stitch strips (ticks point inwards) in a thread colour. */
export function blanket(thread: string) {
  const st = `stroke="${thread}" stroke-width="2.2" stroke-linecap="round" fill="none"`;
  return {
    top: uri(S(16, 12, `<path d="M0 2H16M8 2V10" ${st}/>`)),
    bottom: uri(S(16, 12, `<path d="M0 10H16M8 10V2" ${st}/>`)),
    left: uri(S(12, 16, `<path d="M2 0V16M2 8H10" ${st}/>`)),
    right: uri(S(12, 16, `<path d="M10 0V16M10 8H2" ${st}/>`)),
  };
}

/** Knit stockinette: stacked V stitches, shaded, over a base colour. */
export function knit(base: string, w = 14, h = 14) {
  const leg = (cx: number, rot: number) =>
    `<ellipse cx="${cx}" cy="${h / 2}" rx="${w * 0.23}" ry="${h * 0.52}" transform="rotate(${rot} ${cx} ${h / 2})" fill="${base}" stroke="rgba(0,0,0,.22)" stroke-width="1"/>` +
    `<ellipse cx="${cx - rot * 0.02}" cy="${h / 2 - 1.5}" rx="${w * 0.1}" ry="${h * 0.3}" transform="rotate(${rot} ${cx} ${h / 2})" fill="rgba(255,255,255,.28)"/>`;
  return uri(S(w, h, `<rect width="${w}" height="${h}" fill="rgba(0,0,0,.18)"/>${leg(w * 0.28, -30)}${leg(w * 0.72, 30)}`));
}

/** A cable (two twisted ropes) running vertically. */
export function cable(base: string) {
  const rope = (x: number, flip: number) =>
    `<path d="M${x} 0 C${x + 10 * flip} 10 ${x + 10 * flip} 20 ${x} 30" stroke="rgba(0,0,0,.25)" stroke-width="9" fill="none"/>` +
    `<path d="M${x} 0 C${x + 10 * flip} 10 ${x + 10 * flip} 20 ${x} 30" stroke="${base}" stroke-width="7" fill="none"/>` +
    `<path d="M${x - 1} 3 C${x + 7 * flip} 11 ${x + 7 * flip} 17 ${x - 1} 25" stroke="rgba(255,255,255,.3)" stroke-width="2" fill="none"/>`;
  return uri(S(24, 30, `<rect width="24" height="30" fill="rgba(0,0,0,.2)"/>${rope(7, 1)}${rope(17, -1)}`));
}

/** Tweed herringbone with heather flecks. */
export function tweed(a: string, b: string, fleck: string) {
  // herringbone: 8 px columns of short twill dashes, alternating direction, light and dark threads
  let hb = "";
  for (let col = 0; col < 4; col++) {
    const x = col * 8, dir = col % 2 ? -1 : 1;
    for (let y = -8; y < 40; y += 4) {
      hb += `<path d="M${x + 0.5} ${y} l7 ${3.5 * dir}" stroke="${b}" stroke-width="2.2" stroke-linecap="round"/>`;
      hb += `<path d="M${x + 0.5} ${y + 2} l7 ${3.5 * dir}" stroke="rgba(255,255,255,.14)" stroke-width="1.2" stroke-linecap="round"/>`;
    }
  }
  return uri(S(32, 32, `<rect width="32" height="32" fill="${a}"/>${hb}<filter id="n"><feTurbulence type="fractalNoise" baseFrequency=".7" numOctaves="1" seed="3" stitchTiles="stitch"/><feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -4 1.9"/><feComposite in="SourceGraphic" operator="in"/></filter><rect width="32" height="32" fill="${fleck}" filter="url(#n)" opacity=".85"/>`));
}

/** Linen: fine crossed threads. */
export const linen = uri(S(8, 8, `<path d="M0 2h8M0 6h8" stroke="rgba(120,95,70,.12)" stroke-width="1"/><path d="M2 0v8M6 0v8" stroke="rgba(255,255,255,.35)" stroke-width="1"/>`));

/** Hidden SVG defs: satin-stitch fills for icons and the pom-pom fuzz filter. */
export function defs(): string {
  const sat = (id: string, c: string) =>
    `<pattern id="sat-${id}" width="2.4" height="2.4" patternUnits="userSpaceOnUse" patternTransform="rotate(38)"><rect width="2.4" height="2.4" fill="${c}"/><rect width=".9" height="2.4" fill="#fff" opacity=".32"/></pattern>`;
  return `<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>
    ${sat("pink", "#e79a93")}${sat("butter", "#eec95e")}${sat("sage", "#9cc28d")}${sat("sky", "#93c2da")}${sat("white", "#f6f1e8")}${sat("lilac", "#c3a9d6")}${sat("rust", "#d27a52")}
    <filter id="fuzz" x="-20%" y="-20%" width="140%" height="140%"><feTurbulence type="fractalNoise" baseFrequency=".75" numOctaves="2" seed="5"/><feDisplacementMap in="SourceGraphic" scale="7" xChannelSelector="R" yChannelSelector="G"/></filter>
    <filter id="fray" x="-5%" y="-5%" width="110%" height="110%"><feTurbulence type="fractalNoise" baseFrequency=".6" numOctaves="2" seed="2"/><feDisplacementMap in="SourceGraphic" scale="2.2" xChannelSelector="R" yChannelSelector="G"/></filter>
  </defs></svg>`;
}

/** CSS custom properties with every texture, injected once on the body. */
export function textureVars(): string {
  const bl = blanket("#b76e5f");
  const blC = blanket("#fbf4e6");
  return `:root{
    --felt-noise:${feltNoise};--felt-hair:${feltHair};
    --bl-top:${bl.top};--bl-bottom:${bl.bottom};--bl-left:${bl.left};--bl-right:${bl.right};
    --blc-top:${blC.top};--blc-bottom:${blC.bottom};--blc-left:${blC.left};--blc-right:${blC.right};
    --knit-oat:${knit("#efe3cc")};--knit-blue:${knit("#9ab7cf")};--knit-red:${knit("#d4786d")};--knit-sage:${knit("#a9c79b")};--knit-butter:${knit("#eccb6c")};
    --knit-oat-s:${knit("#efe3cc", 9, 9)};--knit-red-s:${knit("#d4786d", 9, 9)};--knit-sage-s:${knit("#a9c79b", 9, 9)};--knit-blue-s:${knit("#9ab7cf", 9, 9)};
    --cable-oat:${cable("#efe3cc")};
    --tweed-moss:${tweed("#7f8d63", "#5c6946", "#e6d3a0")};--tweed-oat:${tweed("#d2c29f", "#ae9c77", "#6f7f58")};--tweed-heather:${tweed("#94849a", "#6c5f74", "#ecd0a3")};
    --linen:${linen};
  }`;
}
