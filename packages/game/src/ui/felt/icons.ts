/**
 * The embroidered icon set: small 24×24 inline SVGs drawn as satin-stitch patches with running-stitch
 * outlines (felt.css styles the classes). Parts: "f" main fill, "f2" second fill, "l" stitched line,
 * "d" dark detail (French knots, eyes). Each icon has a default thread colour (`ic-<name>` in felt.css);
 * a context can recolour it with `--i1` / `--i2`. These replace every emoji in the UI.
 */

const I = {
  // ---- HUD and places
  coin: `<circle class="f" cx="12" cy="12" r="8.5"/><circle class="l" cx="12" cy="12" r="8.5"/><circle class="l" cx="12" cy="12" r="5.6"/><path class="l" d="M12 9v6"/>`,
  sheep: `<path class="f" d="M5 14c-2-1-2-4 0-5 0-2.5 3-3.5 4.5-2 1-1.8 4-1.8 5 0 1.8-1.3 4.5 0 4.2 2.2 1.8 1 1.6 3.8-.2 4.8-.5 2.2-3 2.8-4.5 1.6-1.2 1.4-3.6 1.4-4.8 0C7.5 17 5.2 16 5 14z"/><path class="l" d="M5 14c-2-1-2-4 0-5 0-2.5 3-3.5 4.5-2 1-1.8 4-1.8 5 0 1.8-1.3 4.5 0 4.2 2.2 1.8 1 1.6 3.8-.2 4.8-.5 2.2-3 2.8-4.5 1.6-1.2 1.4-3.6 1.4-4.8 0C7.5 17 5.2 16 5 14z"/><path class="l" d="M9 17.5v3M15 17.5v3"/><ellipse class="d" cx="18.6" cy="10.3" rx="2.6" ry="2.2"/>`,
  ram: `<path class="f" d="M5 15c-2-1-2-4 0-5 0-2.5 3-3.5 4.5-2 1-1.8 4-1.8 5 0 1.8-1.3 4.5 0 4.2 2.2 1.8 1 1.6 3.8-.2 4.8-.5 2.2-3 2.8-4.5 1.6-1.2 1.4-3.6 1.4-4.8 0C7.5 18 5.2 17 5 15z"/><path class="l" d="M5 15c-2-1-2-4 0-5 0-2.5 3-3.5 4.5-2 1-1.8 4-1.8 5 0 1.8-1.3 4.5 0 4.2 2.2 1.8 1 1.6 3.8-.2 4.8-.5 2.2-3 2.8-4.5 1.6-1.2 1.4-3.6 1.4-4.8 0C7.5 18 5.2 17 5 15z"/><ellipse class="d" cx="18.6" cy="11.3" rx="2.6" ry="2.2"/><path class="f2" d="M15.5 9.5c-1-3 2-5 4.3-3.6 2 1.3 1.2 4.2-.8 4.1-1.3-.1-1.6-1.6-.6-2"/><path class="l" d="M15.5 9.5c-1-3 2-5 4.3-3.6 2 1.3 1.2 4.2-.8 4.1-1.3-.1-1.6-1.6-.6-2"/><path class="l" d="M9 18.5v2.5M15 18.5v2.5"/>`,
  flower: `<g class="f"><circle cx="12" cy="6.5" r="3.2"/><circle cx="17.2" cy="10.3" r="3.2"/><circle cx="15.2" cy="16.4" r="3.2"/><circle cx="8.8" cy="16.4" r="3.2"/><circle cx="6.8" cy="10.3" r="3.2"/></g><circle class="d" cx="12" cy="12" r="2.6"/>`,
  sun: `<circle class="f" cx="12" cy="12" r="5"/><circle class="l" cx="12" cy="12" r="5"/><path class="l" d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8"/>`,
  leaf: `<path class="f" d="M5 19C4 11 9 5 19 4c1 9-4 15-14 15z"/><path class="l" d="M5 19C4 11 9 5 19 4c1 9-4 15-14 15zM5 19l9-9"/>`,
  snow: `<circle class="f" cx="12" cy="12" r="3"/><path class="l" d="M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9M9.5 4.5 12 7l2.5-2.5M9.5 19.5 12 17l2.5 2.5"/>`,
  moon: `<path class="f" d="M15.5 3.5a8.5 8.5 0 1 0 5 13.5A7 7 0 0 1 15.5 3.5z"/><path class="l" d="M15.5 3.5a8.5 8.5 0 1 0 5 13.5A7 7 0 0 1 15.5 3.5z"/><circle class="d" cx="7" cy="6" r=".9"/><circle class="d" cx="9.5" cy="3.5" r=".6"/>`,
  bag: `<path class="f" d="M4 9h16l-1.5 11h-13z"/><path class="l" d="M4 9h16l-1.5 11h-13zM8.5 9V7a3.5 3.5 0 0 1 7 0v2"/><path class="f2" d="M9 13.5h6v3H9z"/>`,
  board: `<rect class="f" x="4" y="4.5" width="16" height="16" rx="2"/><rect class="l" x="4" y="4.5" width="16" height="16" rx="2"/><path class="f2" d="M9 3h6v3.5H9z"/><path class="l" d="M9 3h6v3.5H9zM7.5 10.5h9M7.5 13.5h9M7.5 16.5h5"/>`,
  mail: `<rect class="f" x="3" y="6" width="18" height="13" rx="2"/><rect class="l" x="3" y="6" width="18" height="13" rx="2"/><path class="l" d="M3.5 7l8.5 6.5L20.5 7"/><path class="f2" d="M14.5 14.8l2.2-1.6 2.2 1.6-.8 2.6h-2.8z"/>`,
  store: `<path class="f2" d="M4 9h16v11H4z"/><path class="f" d="M3 9l2-5h14l2 5c0 1.5-1.2 2.5-2.5 2.5S16 10.5 16 9c0 1.5-1.8 2.5-4 2.5S8 10.5 8 9c0 1.5-1.2 2.5-2.5 2.5S3 10.5 3 9z"/><path class="l" d="M3 9l2-5h14l2 5M4 11v9h16v-9M10 20v-5h4v5"/>`,
  vet: `<rect class="f" x="3.5" y="7" width="17" height="12" rx="2.5"/><rect class="l" x="3.5" y="7" width="17" height="12" rx="2.5"/><path class="l" d="M9 7V5h6v2"/><path class="f2" d="M10.6 9.8h2.8v2.1h2.1v2.8h-2.1v2.1h-2.8v-2.1H8.5v-2.8h2.1z"/>`,
  rosette: `<path class="f2" d="M8 14l-3 8 3.5-1.5L10 23l2-7M16 14l3 8-3.5-1.5L14 23l-2-7"/><circle class="f" cx="12" cy="9.5" r="7"/><circle class="l" cx="12" cy="9.5" r="7"/><circle class="l" cx="12" cy="9.5" r="3.6"/>`,
  book: `<path class="f" d="M4 5c3-1 6-1 8 1 2-2 5-2 8-1v14c-3-1-6-1-8 1-2-2-5-2-8-1z"/><path class="l" d="M4 5c3-1 6-1 8 1 2-2 5-2 8-1v14c-3-1-6-1-8 1-2-2-5-2-8-1zM12 6v14"/>`,
  help: `<circle class="f" cx="12" cy="12" r="9"/><circle class="l" cx="12" cy="12" r="9"/><path class="l" d="M9.2 9.5a2.9 2.9 0 1 1 4.3 2.6c-1 .6-1.5 1.2-1.5 2.4"/><circle class="d" cx="12" cy="17.3" r="1.2"/>`,
  gear: `<path class="f" d="M10.3 2.8h3.4l.5 2.4 1.9.8 2-1.4 2.4 2.4-1.4 2 .8 1.9 2.4.5v3.4l-2.4.5-.8 1.9 1.4 2-2.4 2.4-2-1.4-1.9.8-.5 2.4h-3.4l-.5-2.4-1.9-.8-2 1.4-2.4-2.4 1.4-2-.8-1.9-2.4-.5v-3.4l2.4-.5.8-1.9-1.4-2 2.4-2.4 2 1.4 1.9-.8z"/><path class="l" d="M10.3 2.8h3.4l.5 2.4 1.9.8 2-1.4 2.4 2.4-1.4 2 .8 1.9 2.4.5v3.4l-2.4.5-.8 1.9 1.4 2-2.4 2.4-2-1.4-1.9.8-.5 2.4h-3.4l-.5-2.4-1.9-.8-2 1.4-2.4-2.4 1.4-2-.8-1.9-2.4-.5v-3.4l2.4-.5.8-1.9-1.4-2 2.4-2.4 2 1.4 1.9-.8z"/><circle class="f2" cx="12" cy="12" r="3.2"/><circle class="l" cx="12" cy="12" r="3.2"/>`,
  house: `<path class="f" d="M4 11l8-6.5 8 6.5v9H4z"/><path class="f2" d="M2.5 11.5L12 3.5l9.5 8"/><path class="l" d="M2.5 11.5L12 3.5l9.5 8M4.5 10v10h15V10M10 20v-5h4v5"/>`,
  barn: `<path class="f" d="M3 10l3-5h12l3 5v10H3z"/><path class="l" d="M3 10l3-5h12l3 5v10H3zM3 10h18M8.5 20v-6h7v6M8.5 14l7 6M15.5 14l-7 6"/>`,
  fence: `<path class="f" d="M4 6l1.5-2L7 6v14H4zM10.5 6L12 4l1.5 2v14h-3zM17 6l1.5-2L20 6v14h-3z"/><path class="l" d="M4 6l1.5-2L7 6v14H4zM10.5 6L12 4l1.5 2v14h-3zM17 6l1.5-2L20 6v14h-3zM2 9.5h20M2 15h20"/>`,
  // ---- actions
  close: `<path class="l x" d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>`,
  check: `<path class="l x" d="M4.5 12.5l4.5 4.5 10-10"/>`,
  plus: `<path class="l x" d="M12 5v14M5 12h14"/>`,
  minus: `<path class="l x" d="M5 12h14"/>`,
  arrow: `<path class="l x" d="M4 12h15M13 6l6 6-6 6"/>`,
  back: `<path class="l x" d="M20 12H5M11 6l-6 6 6 6"/>`,
  down: `<path class="l x" d="M6 9.5l6 6 6-6"/>`,
  rings: `<circle class="l" cx="9" cy="12" r="5.5"/><circle class="l" cx="15" cy="12" r="5.5"/><path class="f" d="M12 7.6a5.5 5.5 0 0 1 0 8.8 5.5 5.5 0 0 1 0-8.8z"/>`,
  heart: `<path class="f" d="M12 20s-7.5-4.6-7.5-10A4.2 4.2 0 0 1 12 7.6 4.2 4.2 0 0 1 19.5 10C19.5 15.4 12 20 12 20z"/><path class="l" d="M12 20s-7.5-4.6-7.5-10A4.2 4.2 0 0 1 12 7.6 4.2 4.2 0 0 1 19.5 10C19.5 15.4 12 20 12 20z"/>`,
  heartBroken: `<path class="f" d="M12 20s-7.5-4.6-7.5-10A4.2 4.2 0 0 1 12 7.6 4.2 4.2 0 0 1 19.5 10C19.5 15.4 12 20 12 20z"/><path class="l" d="M12 20s-7.5-4.6-7.5-10A4.2 4.2 0 0 1 12 7.6 4.2 4.2 0 0 1 19.5 10C19.5 15.4 12 20 12 20zM12 7.6l-1.5 3.4 2.5 2-1.8 3.2"/>`,
  brush: `<path class="f" d="M4 13h13v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z"/><path class="l" d="M4 13h13v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2zM6 13V9M9 13V8M12 13V8M15 13V9M17 15h3"/>`,
  apple: `<path class="f" d="M12 8c-2-1.5-7-1.5-7 4 0 4.5 3 8 5 8 1 0 1.3-.5 2-.5s1 .5 2 .5c2 0 5-3.5 5-8 0-5.5-5-5.5-7-4z"/><path class="l" d="M12 8c-2-1.5-7-1.5-7 4 0 4.5 3 8 5 8 1 0 1.3-.5 2-.5s1 .5 2 .5c2 0 5-3.5 5-8 0-5.5-5-5.5-7-4zM12 8c0-2 .5-3.5 2-4.5"/><path class="f2" d="M13 6.5c1-2 3-2.5 4.5-2-.5 1.8-2.5 2.6-4.5 2z"/>`,
  hand: `<path class="f" d="M7 12V6.5a1.5 1.5 0 0 1 3 0V11V4.8a1.5 1.5 0 0 1 3 0V11V5.8a1.5 1.5 0 0 1 3 0V12v-3a1.5 1.5 0 0 1 3 0v5c0 4-2.5 7-6.5 7-3 0-4.5-1.5-6-4L4.5 13c-.8-1.3.8-2.6 2-1.6z"/><path class="l" d="M7 12V6.5a1.5 1.5 0 0 1 3 0V11V4.8a1.5 1.5 0 0 1 3 0V11V5.8a1.5 1.5 0 0 1 3 0V12v-3a1.5 1.5 0 0 1 3 0v5c0 4-2.5 7-6.5 7-3 0-4.5-1.5-6-4L4.5 13c-.8-1.3.8-2.6 2-1.6z"/>`,
  pencil: `<path class="f" d="M5 19l1-4L16 5l3 3L9 18z"/><path class="l" d="M5 19l1-4L16 5l3 3L9 18zM14 7l3 3"/>`,
  tag: `<path class="f" d="M3.5 12.5V4.5h8l9 9-8 8z"/><path class="l" d="M3.5 12.5V4.5h8l9 9-8 8z"/><circle class="d" cx="7.8" cy="8.8" r="1.5"/>`,
  lock: `<rect class="f" x="5" y="10.5" width="14" height="10" rx="2"/><rect class="l" x="5" y="10.5" width="14" height="10" rx="2"/><path class="l" d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/><circle class="d" cx="12" cy="15.5" r="1.4"/>`,
  sound: `<path class="f" d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path class="l" d="M4 9.5h3.5L12 5.5v13l-4.5-4H4zM15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/>`,
  wave: `<path class="l" d="M3 9c2-2 4-2 6 0s4 2 6 0 4-2 6 0M3 15c2-2 4-2 6 0s4 2 6 0 4-2 6 0"/>`,
  box: `<path class="f" d="M4 8l8-4 8 4v9l-8 4-8-4z"/><path class="l" d="M4 8l8-4 8 4v9l-8 4-8-4zM4 8l8 4 8-4M12 12v9"/>`,
  redo: `<path class="l" d="M19 8a8 8 0 1 0 1.5 6M19 3.5V8h-4.5"/>`,
  sprout: `<path class="f" d="M12 13c-4 0-7-2.5-7-7 4 0 7 2.5 7 7z"/><path class="f2" d="M12 11c0-4 3-7 7-7 0 4-3 7-7 7z"/><path class="l" d="M12 21v-10M12 13c-4 0-7-2.5-7-7 4 0 7 2.5 7 7zM12 11c0-4 3-7 7-7 0 4-3 7-7 7zM7 21h10"/>`,
  // ---- knowledge
  eye: `<path class="f" d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><path class="l" d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle class="d" cx="12" cy="12" r="3.3"/>`,
  lens: `<circle class="f" cx="10" cy="10" r="6"/><circle class="l" cx="10" cy="10" r="6"/><path class="l x" d="M14.5 14.5L20 20"/>`,
  sparkle: `<path class="f" d="M12 2c.8 5 2 6.2 7 7-5 .8-6.2 2-7 7-.8-5-2-6.2-7-7 5-.8 6.2-2 7-7z"/><path class="l" d="M12 2c.8 5 2 6.2 7 7-5 .8-6.2 2-7 7-.8-5-2-6.2-7-7 5-.8 6.2-2 7-7z"/><path class="f2" d="M18.5 15c.4 2.2 1 2.8 3 3.2-2 .4-2.6 1-3 3.2-.4-2.2-1-2.8-3-3.2 2-.4 2.6-1 3-3.2z"/>`,
  star: `<path class="f" d="M12 3l2.7 5.6 6.1.8-4.4 4.3 1 6.1L12 16.9l-5.4 2.9 1-6.1-4.4-4.3 6.1-.8z"/><path class="l" d="M12 3l2.7 5.6 6.1.8-4.4 4.3 1 6.1L12 16.9l-5.4 2.9 1-6.1-4.4-4.3 6.1-.8z"/>`,
  dice: `<rect class="f" x="4" y="4" width="16" height="16" rx="4"/><rect class="l" x="4" y="4" width="16" height="16" rx="4"/><circle class="d" cx="9" cy="9" r="1.5"/><circle class="d" cx="15" cy="15" r="1.5"/><circle class="d" cx="15" cy="9" r="1.5"/><circle class="d" cx="9" cy="15" r="1.5"/>`,
  ruler: `<rect class="f" x="2.5" y="8" width="19" height="8" rx="1.5"/><rect class="l" x="2.5" y="8" width="19" height="8" rx="1.5"/><path class="l" d="M6 8v3M9.5 8v4.5M13 8v3M16.5 8v4.5M20 8v3"/>`,
  tree: `<path class="f" d="M12 3c3.5 0 6 2.5 6 5.5 1.8.8 2.5 2.6 2 4.3-.6 2-2.6 3.2-4.5 3.2H8.5c-2 0-3.9-1.2-4.5-3.2-.5-1.7.2-3.5 2-4.3C6 5.5 8.5 3 12 3z"/><path class="l" d="M12 3c3.5 0 6 2.5 6 5.5 1.8.8 2.5 2.6 2 4.3-.6 2-2.6 3.2-4.5 3.2H8.5c-2 0-3.9-1.2-4.5-3.2-.5-1.7.2-3.5 2-4.3C6 5.5 8.5 3 12 3z"/><path class="f2" d="M10.8 16h2.4v5.5h-2.4z"/><path class="l" d="M12 21.5V12M12 14l-3-2.5M12 13l3-2.5"/>`,
  family: `<circle class="f" cx="7" cy="6" r="3"/><circle class="f" cx="17" cy="6" r="3"/><circle class="f2" cx="12" cy="18" r="3"/><circle class="l" cx="7" cy="6" r="3"/><circle class="l" cx="17" cy="6" r="3"/><circle class="l" cx="12" cy="18" r="3"/><path class="l" d="M7 9v3h10V9M12 12v3"/>`,
  horn: `<path class="f" d="M6 6c6-2 11 1 11 6s-4 7-7 5-1.5-5 1-4.5c1.8.4 1.4 2.4.3 2.3"/><path class="l" d="M6 6c6-2 11 1 11 6s-4 7-7 5-1.5-5 1-4.5c1.8.4 1.4 2.4.3 2.3"/>`,
  spots: `<circle class="f" cx="12" cy="12" r="8.5"/><circle class="l" cx="12" cy="12" r="8.5"/><circle class="d" cx="9" cy="9.5" r="2"/><circle class="d" cx="15" cy="14" r="2.4"/><circle class="d" cx="9.5" cy="15.5" r="1.2"/>`,
  cake: `<rect class="f" x="4" y="11" width="16" height="9" rx="2"/><path class="l" d="M4 13c0-1 0-2 2-2h12c2 0 2 1 2 2v7H4zM4 15c2 1.5 4 1.5 5.3 0 1.4 1.5 4 1.5 5.4 0 1.3 1.5 3.3 1.5 5.3 0M12 11V7"/><path class="f2" d="M12 3c1.3 1.5 1.3 3 0 3.5-1.3-.5-1.3-2 0-3.5z"/>`,
  yarn: `<circle class="f" cx="12" cy="12" r="8"/><circle class="l" cx="12" cy="12" r="8"/><path class="l" d="M5 9c4-1 10 2 13 7M4.5 13c4-.5 8 2 10 6.3M8 5c3 2 6 6 7 11M13 4.2c2 2 4 4.8 5 8"/>`,
  scissors: `<circle class="f" cx="6.5" cy="17.5" r="3"/><circle class="f" cx="17.5" cy="17.5" r="3"/><circle class="l" cx="6.5" cy="17.5" r="3"/><circle class="l" cx="17.5" cy="17.5" r="3"/><path class="l" d="M8.5 15.5L17 4M15.5 15.5L7 4"/>`,
  hay: `<path class="f" d="M4 20c1-6 3-10 8-15 5 5 7 9 8 15z"/><path class="l" d="M4 20c1-6 3-10 8-15 5 5 7 9 8 15zM8 20c.5-4 2-8 4-11M16 20c-.5-4-2-8-4-11M12 9v11M5 15h14"/>`,
  cloud: `<path class="f" d="M6.5 18a4 4 0 0 1-.4-8A5.5 5.5 0 0 1 16.8 9 4.5 4.5 0 0 1 17.5 18z"/><path class="l" d="M6.5 18a4 4 0 0 1-.4-8A5.5 5.5 0 0 1 16.8 9 4.5 4.5 0 0 1 17.5 18z"/>`,
  stone: `<path class="f" d="M4 17c-1-4 1-8 5-9.5 3-1.2 7-1 9.5 1.5 2.3 2.3 2.3 6 .5 8.5z"/><path class="l" d="M4 17c-1-4 1-8 5-9.5 3-1.2 7-1 9.5 1.5 2.3 2.3 2.3 6 .5 8.5zM2.5 17.5h19"/>`,
  curl: `<path class="l" d="M4 16c0-5 4-9 8-9s6 3 6 5.5-2 4.5-4.5 4.5S9.5 15 9.5 13s1.3-3 3-3 2.5 1 2.5 2.4"/>`,
  // ---- the farm's news
  megaphone: `<path class="f" d="M4 10h3l9-5v14l-9-5H4z"/><path class="l" d="M4 10h3l9-5v14l-9-5H4zM7 14l1.5 5.5h2.5L9.8 14.8M19 9.5v5"/>`,
  calendar: `<rect class="f" x="3.5" y="5.5" width="17" height="15" rx="2"/><rect class="l" x="3.5" y="5.5" width="17" height="15" rx="2"/><path class="f2" d="M3.5 7.5a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2V10h-17z"/><path class="l" d="M8 3.5v4M16 3.5v4M3.5 10h17"/><circle class="d" cx="8.5" cy="14" r="1.1"/><circle class="d" cx="12" cy="14" r="1.1"/><circle class="d" cx="15.5" cy="14" r="1.1"/>`,
  warn: `<path class="f" d="M12 3.5L21.5 20h-19z"/><path class="l" d="M12 3.5L21.5 20h-19zM12 9.5v5"/><circle class="d" cx="12" cy="17.3" r="1.2"/>`,
  dove: `<path class="f" d="M3 12c3 0 5-1 7-4 1.5 2 1.5 4 .5 6 3-1 6-1 9.5 1-2 3-6 5-10 4.5L7 21l.5-3.5C5 17 3.5 15 3 12z"/><path class="l" d="M3 12c3 0 5-1 7-4 1.5 2 1.5 4 .5 6 3-1 6-1 9.5 1-2 3-6 5-10 4.5L7 21l.5-3.5C5 17 3.5 15 3 12z"/><circle class="d" cx="16" cy="14.5" r=".8"/>`,
  // ---- animals
  dog: `<path class="f" d="M7 8.5C7 5.5 9.2 4 12 4s5 1.5 5 4.5V13c0 1-.3 1.8-.8 2.5H7.8C7.3 14.8 7 14 7 13z"/><ellipse class="f" cx="12" cy="16.5" rx="4.2" ry="3.4"/><path class="f2" d="M7.4 6.2C5 5.8 3.4 8 3.6 11.5c.1 2.2 1.2 3.6 2.6 3.4 1.2-.2 1.2-2 1-3.6zM16.6 6.2C19 5.8 20.6 8 20.4 11.5c-.1 2.2-1.2 3.6-2.6 3.4-1.2-.2-1.2-2-1-3.6z"/><path class="l" d="M7 8.5C7 5.5 9.2 4 12 4s5 1.5 5 4.5V13M7 13V8.5M7.4 6.2C5 5.8 3.4 8 3.6 11.5c.1 2.2 1.2 3.6 2.6 3.4 1.2-.2 1.2-2 1-3.6M16.6 6.2C19 5.8 20.6 8 20.4 11.5c-.1 2.2-1.2 3.6-2.6 3.4-1.2-.2-1.2-2-1-3.6"/><ellipse class="l" cx="12" cy="16.5" rx="4.2" ry="3.4"/><circle class="d" cx="9.8" cy="10.3" r="1"/><circle class="d" cx="14.2" cy="10.3" r="1"/><ellipse class="d" cx="12" cy="15" rx="1.6" ry="1.1"/><path class="l x" d="M12 16.1v1.4M10.6 18.2c.8.5 2 .5 2.8 0"/>`,
  cat: `<path class="f" d="M5 20v-8l-1-8 5 3.5h6L20 4l-1 8v8z"/><path class="l" d="M5 20v-8l-1-8 5 3.5h6L20 4l-1 8v8zM12 15v1.5M3 14l4 .5M3 17l4-.5M21 14l-4 .5M21 17l-4-.5"/><circle class="d" cx="9.3" cy="12" r="1.1"/><circle class="d" cx="14.7" cy="12" r="1.1"/><path class="f2" d="M11 14h2l-1 1.2z"/>`,
  fox: `<path class="f" d="M3 5l5 3h8l5-3-1.5 8L12 20l-7.5-7z"/><path class="f2" d="M8 13l4 7 4-7c-1.5 1-2.6 1.3-4 1.3S9.5 14 8 13z"/><path class="l" d="M3 5l5 3h8l5-3-1.5 8L12 20l-7.5-7zM8 13c1.5 1 2.6 1.3 4 1.3s2.5-.3 4-1.3"/><circle class="d" cx="9" cy="11" r="1"/><circle class="d" cx="15" cy="11" r="1"/><circle class="d" cx="12" cy="19" r="1.1"/>`,
  wolf: `<path class="f" d="M4 3l4.5 4h7L20 3l-.5 9L12 21l-7.5-9z"/><path class="l" d="M4 3l4.5 4h7L20 3l-.5 9L12 21l-7.5-9zM9 15l3 2 3-2"/><circle class="d" cx="9" cy="11" r="1.1"/><circle class="d" cx="15" cy="11" r="1.1"/><circle class="d" cx="12" cy="18.5" r="1.1"/>`,
  mouse: `<path class="f" d="M3.5 17c0-4.5 3.5-8 8-8s8 3.5 8 8z"/><circle class="f2" cx="9" cy="8.5" r="2.6"/><path class="l" d="M3.5 17c0-4.5 3.5-8 8-8s8 3.5 8 8zM19.5 17c1.5 0 2 1.5 1 3"/><circle class="l" cx="9" cy="8.5" r="2.6"/><circle class="d" cx="6.5" cy="13" r="1"/>`,
  bird: `<path class="f" d="M4 14c0-4 3-7 7-7 2.5 0 4 1.2 5 3l4 1-3.5 1.5C16 16 13 19 9 19c-3 0-5-2-5-5z"/><path class="l" d="M4 14c0-4 3-7 7-7 2.5 0 4 1.2 5 3l4 1-3.5 1.5C16 16 13 19 9 19c-3 0-5-2-5-5zM7 14c2 1.5 5 1.5 7-1M9 19l-1 3M11 19l1 3"/><circle class="d" cx="13.2" cy="10" r="1.1"/>`,
  paw: `<circle class="f2" cx="7" cy="9" r="2"/><circle class="f2" cx="11" cy="6" r="2"/><circle class="f2" cx="15.5" cy="7" r="2"/><circle class="f2" cx="18" cy="11" r="2"/><path class="f" d="M8 17c0-3 3-6 5-6s5 3 4.5 5.5c-.4 2-2.5 1.5-4.5 1.5s-5 1.5-5-1z"/><path class="l" d="M8 17c0-3 3-6 5-6s5 3 4.5 5.5c-.4 2-2.5 1.5-4.5 1.5s-5 1.5-5-1z"/>`,
  // ---- the mentor
  tom: `<circle class="f" cx="12" cy="13" r="7"/><path class="f2" d="M4 10.5C4 6 7.5 3.5 12 3.5S20 6 20 10.5c-2-1-4.5-1.5-8-1.5s-6 .5-8 1.5z"/><path class="l" d="M4 10.5C4 6 7.5 3.5 12 3.5S20 6 20 10.5c-2-1-4.5-1.5-8-1.5s-6 .5-8 1.5zM2.5 11h19"/><circle class="d" cx="9.5" cy="13" r="1"/><circle class="d" cx="14.5" cy="13" r="1"/><path class="l" d="M8 17c2.5 1.8 5.5 1.8 8 0M9 16c1 .6 2 .6 3 0 1 .6 2 .6 3 0"/>`,
};

export type IconName = keyof typeof I;
export const ICON_NAMES = Object.keys(I) as IconName[];

/** An embroidered icon. `cls` adds classes (size: "sm" | "lg" | "xl"; colour: "t-pink", "t-sky" …). */
export function icon(name: IconName, cls = ""): string {
  return `<svg class="ic ic-${name}${cls ? ` ${cls}` : ""}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${I[name]}</svg>`;
}

/** Emoji that still arrive in words from core (lessons, log lines, events), mapped to icons. */
const EMOJI: [string, IconName][] = [
  ["🐕‍🦺", "dog"], ["📮", "mail"], ["🩺", "vet"], ["🛒", "store"], ["🎪", "rosette"], ["📖", "book"], ["📋", "board"],
  ["🏵", "rosette"], ["🏅", "rosette"], ["🧶", "yarn"], ["🐑", "sheep"], ["🐏", "ram"], ["🦊", "fox"], ["🐺", "wolf"],
  ["🐭", "mouse"], ["🐈", "cat"], ["🐕", "dog"], ["✨", "sparkle"], ["💙", "heart"], ["💗", "heart"], ["♥", "heart"],
  ["🌱", "sprout"], ["🌿", "fence"], ["🛖", "barn"], ["✂️", "scissors"], ["🌾", "hay"], ["❄️", "snow"], ["📣", "megaphone"],
  ["🗓", "calendar"], ["🕊", "dove"], ["⚠", "warn"], ["🔍", "lens"], ["🔎", "lens"], ["★", "star"], ["🌙", "moon"],
];

/** Swap known emoji in a (trusted, escaped) HTML string for inline icons; strips a following variation selector. */
export function iconize(html: string): string {
  let out = html;
  for (const [e, n] of EMOJI) if (out.includes(e)) out = out.split(e).join(icon(n, "inl"));
  return out.replace(/️/g, "");
}
