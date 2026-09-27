// Style lab: one small SVG icon set. Each direction styles it in CSS (pencil, stamp, felt, toy).
// Parts with class "f" are fills, class "l" are lines.

const I: Record<string, string> = {
  coin: `<circle class="f" cx="12" cy="12" r="8.5"/><circle class="l" cx="12" cy="12" r="8.5"/><path class="l" d="M12 7.5v9M9.5 9.5c0-1.2 5-1.6 5 .5s-5 1.5-5 3.7 5 1.6 5 .3"/>`,
  sheep: `<path class="f" d="M5 14c-2-1-2-4 0-5 0-2.5 3-3.5 4.5-2 1-1.8 4-1.8 5 0 1.8-1.3 4.5 0 4.2 2.2 1.8 1 1.6 3.8-.2 4.8-.5 2.2-3 2.8-4.5 1.6-1.2 1.4-3.6 1.4-4.8 0C7.5 17 5.2 16 5 14z"/><path class="l" d="M5 14c-2-1-2-4 0-5 0-2.5 3-3.5 4.5-2 1-1.8 4-1.8 5 0 1.8-1.3 4.5 0 4.2 2.2 1.8 1 1.6 3.8-.2 4.8-.5 2.2-3 2.8-4.5 1.6-1.2 1.4-3.6 1.4-4.8 0C7.5 17 5.2 16 5 14z"/><path class="l" d="M9 17.5v3M15 17.5v3"/><ellipse class="d" cx="18.6" cy="10.3" rx="2.6" ry="2.2"/>`,
  flower: `<g class="f"><circle cx="12" cy="6.5" r="3.2"/><circle cx="17.2" cy="10.3" r="3.2"/><circle cx="15.2" cy="16.4" r="3.2"/><circle cx="8.8" cy="16.4" r="3.2"/><circle cx="6.8" cy="10.3" r="3.2"/></g><circle class="d" cx="12" cy="12" r="2.6"/>`,
  sun: `<circle class="f" cx="12" cy="12" r="5"/><circle class="l" cx="12" cy="12" r="5"/><path class="l" d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8"/>`,
  leaf: `<path class="f" d="M5 19C4 11 9 5 19 4c1 9-4 15-14 15z"/><path class="l" d="M5 19C4 11 9 5 19 4c1 9-4 15-14 15zM5 19l9-9"/>`,
  snow: `<path class="l" d="M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9M9.5 4.5 12 7l2.5-2.5M9.5 19.5 12 17l2.5 2.5"/>`,
  rosette: `<path class="f2" d="M8 14l-3 8 3.5-1.5L10 23l2-7M16 14l3 8-3.5-1.5L14 23l-2-7"/><circle class="f" cx="12" cy="9.5" r="7"/><circle class="l" cx="12" cy="9.5" r="7"/><circle class="l" cx="12" cy="9.5" r="3.6"/>`,
  heart: `<path class="f" d="M12 20s-7.5-4.6-7.5-10A4.2 4.2 0 0 1 12 7.6 4.2 4.2 0 0 1 19.5 10C19.5 15.4 12 20 12 20z"/><path class="l" d="M12 20s-7.5-4.6-7.5-10A4.2 4.2 0 0 1 12 7.6 4.2 4.2 0 0 1 19.5 10C19.5 15.4 12 20 12 20z"/>`,
  moon: `<path class="f" d="M15.5 3.5a8.5 8.5 0 1 0 5 13.5A7 7 0 0 1 15.5 3.5z"/><path class="l" d="M15.5 3.5a8.5 8.5 0 1 0 5 13.5A7 7 0 0 1 15.5 3.5z"/>`,
  bag: `<path class="f" d="M4 9h16l-1.5 11h-13z"/><path class="l" d="M4 9h16l-1.5 11h-13zM8.5 9V7a3.5 3.5 0 0 1 7 0v2"/>`,
  shed: `<path class="f" d="M3 11l9-6 9 6v9H3z"/><path class="l" d="M3 11l9-6 9 6v9H3zM9 20v-5h6v5"/>`,
  store: `<path class="f2" d="M4 9h16v11H4z"/><path class="f" d="M3 9l2-5h14l2 5c0 1.5-1.2 2.5-2.5 2.5S16 10.5 16 9c0 1.5-1.8 2.5-4 2.5S8 10.5 8 9c0 1.5-1.2 2.5-2.5 2.5S3 10.5 3 9z"/><path class="l" d="M3 9l2-5h14l2 5M4 11v9h16v-9M10 20v-5h4v5"/>`,
  vet: `<rect class="f" x="3.5" y="7" width="17" height="12" rx="2.5"/><rect class="l" x="3.5" y="7" width="17" height="12" rx="2.5"/><path class="l" d="M9 7V5h6v2M12 10v6M9 13h6"/>`,
  book: `<path class="f" d="M4 5c3-1 6-1 8 1 2-2 5-2 8-1v14c-3-1-6-1-8 1-2-2-5-2-8-1z"/><path class="l" d="M4 5c3-1 6-1 8 1 2-2 5-2 8-1v14c-3-1-6-1-8 1-2-2-5-2-8-1zM12 6v14"/>`,
  brush: `<path class="f" d="M4 13h13v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z"/><path class="l" d="M4 13h13v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2zM6 13V9M9 13V8M12 13V8M15 13V9M17 15h3"/>`,
  eye: `<path class="f" d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><path class="l" d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle class="d" cx="12" cy="12" r="3.3"/>`,
  cake: `<rect class="f" x="4" y="11" width="16" height="9" rx="2"/><path class="l" d="M4 13c0-1 0-2 2-2h12c2 0 2 1 2 2v7H4zM4 15c2 1.5 4 1.5 5.3 0 1.4 1.5 4 1.5 5.4 0 1.3 1.5 3.3 1.5 5.3 0M12 11V7"/><path class="f2" d="M12 3c1.3 1.5 1.3 3 0 3.5-1.3-.5-1.3-2 0-3.5z"/>`,
  yarn: `<circle class="f" cx="12" cy="12" r="8"/><circle class="l" cx="12" cy="12" r="8"/><path class="l" d="M5 9c4-1 10 2 13 7M4.5 13c4-.5 8 2 10 6.3M8 5c3 2 6 6 7 11M13 4.2c2 2 4 4.8 5 8"/>`,
  paw: `<circle class="d" cx="7" cy="9" r="2"/><circle class="d" cx="11" cy="6" r="2"/><circle class="d" cx="15.5" cy="7" r="2"/><circle class="d" cx="18" cy="11" r="2"/><path class="f" d="M8 17c0-3 3-6 5-6s5 3 4.5 5.5c-.4 2-2.5 1.5-4.5 1.5s-5 1.5-5-1z"/>`,
  heartPlus: `<path class="f" d="M12 20s-7.5-4.6-7.5-10A4.2 4.2 0 0 1 12 7.6 4.2 4.2 0 0 1 19.5 10C19.5 15.4 12 20 12 20z"/><path class="l" d="M12 20s-7.5-4.6-7.5-10A4.2 4.2 0 0 1 12 7.6 4.2 4.2 0 0 1 19.5 10C19.5 15.4 12 20 12 20z"/>`,
  rings: `<circle class="l" cx="9" cy="12" r="5.5"/><circle class="l" cx="15" cy="12" r="5.5"/>`,
  arrow: `<path class="l" d="M4 12h15M13 6l6 6-6 6"/>`,
  check: `<path class="l" d="M4.5 12.5l4.5 4.5 10-10"/>`,
  star: `<path class="f" d="M12 3l2.7 5.6 6.1.8-4.4 4.3 1 6.1L12 16.9l-5.4 2.9 1-6.1-4.4-4.3 6.1-.8z"/><path class="l" d="M12 3l2.7 5.6 6.1.8-4.4 4.3 1 6.1L12 16.9l-5.4 2.9 1-6.1-4.4-4.3 6.1-.8z"/>`,
  map: `<path class="f" d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2z"/><path class="l" d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2zM9 4v14M15 6v14"/>`,
  horn: `<path class="l" d="M6 6c6-2 11 1 11 6s-4 7-7 5-1.5-5 1-4.5"/>`,
  sparkle: `<path class="f" d="M12 2c.8 5 2 6.2 7 7-5 .8-6.2 2-7 7-.8-5-2-6.2-7-7 5-.8 6.2-2 7-7z"/>`,
  dice: `<rect class="f" x="4" y="4" width="16" height="16" rx="4"/><rect class="l" x="4" y="4" width="16" height="16" rx="4"/><circle class="d" cx="9" cy="9" r="1.5"/><circle class="d" cx="15" cy="15" r="1.5"/><circle class="d" cx="15" cy="9" r="1.5"/><circle class="d" cx="9" cy="15" r="1.5"/>`,
};

export type IconName = keyof typeof I;

export function icon(name: IconName, cls = ""): string {
  return `<svg class="ic ${cls}" viewBox="0 0 24 24" aria-hidden="true">${I[name] ?? ""}</svg>`;
}

/** SVG filters used by the directions: pencil wobble (A), stamp roughness (B), paper and felt grain. */
export const FILTERS = `
<svg width="0" height="0" style="position:absolute" aria-hidden="true">
  <filter id="pencil" x="-5%" y="-5%" width="110%" height="110%">
    <feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="2" seed="3" result="n"/>
    <feDisplacementMap in="SourceGraphic" in2="n" scale="3.2" xChannelSelector="R" yChannelSelector="G"/>
  </filter>
  <filter id="wobble" x="-5%" y="-5%" width="110%" height="110%">
    <feTurbulence type="fractalNoise" baseFrequency="0.02" numOctaves="2" seed="8" result="n"/>
    <feDisplacementMap in="SourceGraphic" in2="n" scale="2.2" xChannelSelector="R" yChannelSelector="G"/>
  </filter>
  <filter id="stamp" x="-5%" y="-5%" width="110%" height="110%">
    <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="1" seed="2" result="n"/>
    <feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -2.2 1.6" result="m"/>
    <feComposite in="SourceGraphic" in2="m" operator="in"/>
  </filter>
</svg>`;
