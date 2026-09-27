// Style lab round 2: extra icons for expansion and the woolshed, same conventions as ../icons.ts
// (class "f" fill, "f2" second fill, "l" line, "d" dark detail).
import { icon as icon1, type IconName } from "../icons.js";

const I2: Record<string, string> = {
  hammer: `<path class="f" d="M5 5h8l2 2v3H5z"/><path class="l" d="M5 5h8l2 2v3H5zM9 10v10"/><rect class="f2" x="7.8" y="10" width="2.4" height="10" rx="1"/>`,
  spade: `<path class="f" d="M8 12h8v4a4 4 0 0 1-8 0z"/><path class="l" d="M8 12h8v4a4 4 0 0 1-8 0zM12 12V4M9.5 4h5"/><path class="l" d="M4 21c2-1 4-1 6 0s4 1 6 0 4-1 4-1"/>`,
  bridge: `<path class="f" d="M2 13c3-4 7-6 10-6s7 2 10 6v2H2z"/><path class="l" d="M2 13c3-4 7-6 10-6s7 2 10 6M2 15h20M6 11v4M12 9v6M18 11v4"/><path class="l" d="M3 19c2 1 4 1 6 0s4-1 6 0 4 1 6 0"/>`,
  key: `<circle class="f" cx="8" cy="12" r="4.5"/><circle class="l" cx="8" cy="12" r="4.5"/><circle class="d" cx="8" cy="12" r="1.4"/><path class="l" d="M12.5 12H21M18 12v3M21 12v2.5"/>`,
  handshake: `<path class="f" d="M3 11l4-4 5 2 5-2 4 4-7 7z"/><path class="l" d="M3 11l4-4 5 2 5-2 4 4-7 7zM9 12l2 2M11 10l3 3"/>`,
  comb: `<rect class="f" x="3" y="5" width="18" height="6" rx="2"/><rect class="l" x="3" y="5" width="18" height="6" rx="2"/><path class="l" d="M5 11v6M8 11v7M11 11v7M14 11v7M17 11v7M20 11v6"/>`,
  spindle: `<circle class="f" cx="12" cy="15" r="5"/><circle class="l" cx="12" cy="15" r="5"/><path class="l" d="M12 2v20M8 13c3 1 5 3 7 5M9 17c2-3 4-4 6-4"/>`,
  needles: `<path class="l" d="M5 20L17 4M9 21L19 7"/><circle class="f2" cx="17.5" cy="3.5" r="1.8"/><circle class="f2" cx="19.5" cy="6.5" r="1.8"/><path class="f" d="M4 14c3-2 6-1 7 1s1 5-2 6-6 0-6-3 0-3 1-4z"/><path class="l" d="M4 14c3-2 6-1 7 1s1 5-2 6-6 0-6-3 0-3 1-4z"/>`,
  fleece: `<path class="f" d="M4 13c-1.5-2 0-4.5 2-4.2.3-2.3 3-3.3 4.6-1.6 1.2-1.8 4-1.6 4.8.4 2-.8 4 1 3.4 3 2 .8 1.8 3.8-.4 4.2-.3 2-3 2.6-4.3 1.2-1.3 1.6-4 1.4-4.8-.2-2 .8-4.2-.6-3.8-2.6-1.2-.2-1.8-1-1.5-2.2z"/><path class="l" d="M4 13c-1.5-2 0-4.5 2-4.2.3-2.3 3-3.3 4.6-1.6 1.2-1.8 4-1.6 4.8.4 2-.8 4 1 3.4 3 2 .8 1.8 3.8-.4 4.2-.3 2-3 2.6-4.3 1.2-1.3 1.6-4 1.4-4.8-.2-2 .8-4.2-.6-3.8-2.6-1.2-.2-1.8-1-1.5-2.2z"/>`,
  jumper: `<path class="f" d="M8 4l-5 3 2 5 2-1v9h10v-9l2 1 2-5-5-3c-1 1.5-2.5 2-4 2S9 5.5 8 4z"/><path class="l" d="M8 4l-5 3 2 5 2-1v9h10v-9l2 1 2-5-5-3c-1 1.5-2.5 2-4 2S9 5.5 8 4zM7 16h10"/>`,
  bird: `<path class="f" d="M4 14c0-4 3-7 7-7 2.5 0 4 1.2 5 3l4 1-3.5 1.5C16 16 13 19 9 19c-3 0-5-2-5-5z"/><path class="l" d="M4 14c0-4 3-7 7-7 2.5 0 4 1.2 5 3l4 1-3.5 1.5C16 16 13 19 9 19c-3 0-5-2-5-5zM7 14c2 1.5 5 1.5 7-1M9 19l-1 3M11 19l1 3"/><circle class="d" cx="13.2" cy="10" r="1.1"/>`,
  play: `<path class="f" d="M7 4.5v15l12-7.5z"/><path class="l" d="M7 4.5v15l12-7.5z"/>`,
  swap: `<path class="l" d="M4 8h14l-3-3M20 16H6l3 3"/>`,
};

export type Icon2 = IconName | keyof typeof I2;

export function icon(name: Icon2, cls = ""): string {
  const own = I2[name];
  if (own) return `<svg class="ic ${cls}" viewBox="0 0 24 24" aria-hidden="true">${own}</svg>`;
  return icon1(name as IconName, cls);
}
