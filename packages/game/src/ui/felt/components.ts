/**
 * Felt components as HTML strings (styled by felt.css): buttons, icon buttons, pom-pom badges, tags,
 * "more" (progressive disclosure), fact tiles, stitched dividers, section heads and handwritten names.
 * Callers pass already-escaped text unless a parameter says otherwise.
 */
import { icon, type IconName } from "./icons.js";

export type Data = Record<string, string | number>;

function escAttr(s: string | number): string {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

/** ` data-a="1" data-b="x"` in the given order. */
export function dataAttrs(d: Data = {}): string {
  return Object.entries(d).map(([k, v]) => ` data-${k}="${escAttr(v)}"`).join("");
}

export type BtnKind = "primary" | "secondary" | "ghost" | "danger" | "sky";

export interface BtnOptions {
  icon?: IconName;
  kind?: BtnKind;
  data?: Data;
  disabled?: boolean;
  /** Tooltip (escaped here). */
  title?: string;
  cls?: string;
  /** A small pom-pom count on the corner. */
  badge?: number;
  /** Accessible name when the label is not enough (escaped here). */
  aria?: string;
}

/** A felt button: `label` is escaped HTML; kind picks the felt colour. */
export function btn(label: string, o: BtnOptions = {}): string {
  const cls = [o.kind ?? "secondary", o.cls ?? ""].filter(Boolean).join(" ");
  return `<button class="${cls}"${dataAttrs(o.data)}${o.disabled ? " disabled" : ""}${o.title ? ` title="${escAttr(o.title)}"` : ""}${o.aria ? ` aria-label="${escAttr(o.aria)}"` : ""}>${o.icon ? icon(o.icon) : ""}${label ? `<span class="b-t">${label}</span>` : ""}${o.badge ? `<span class="badge">${o.badge}</span>` : ""}</button>`;
}

/** A round icon-only button with a tooltip and an accessible name (`label` is plain text). */
export function iconBtn(name: IconName, label: string, data: Data, o: { kind?: BtnKind; cls?: string; disabled?: boolean } = {}): string {
  return `<button class="icon ${o.kind ?? "ghost"} ${o.cls ?? ""}"${dataAttrs(data)}${o.disabled ? " disabled" : ""} title="${escAttr(label)}" aria-label="${escAttr(label)}">${icon(name)}</button>`;
}

/** A HUD pom-pom badge: a fuzzy wool ball holding the icon, then the value (and an optional small line). */
export function pom(piece: string, name: IconName, value: string, sub = "", o: { title?: string; tone?: string } = {}): string {
  return `<span class="pom tone-${o.tone ?? "cream"}" data-hud-piece="${piece}"${o.title ? ` title="${escAttr(o.title)}"` : ""}><span class="pom-ball" aria-hidden="true">${icon(name)}</span><span class="pom-txt"><b>${value}</b>${sub ? `<small>${sub}</small>` : ""}</span></span>`;
}

/** A small felt tag with an optional icon. `tone`: sage, rose, sky, butter, lilac, cream. */
export function tag(text: string, o: { icon?: IconName; tone?: string; cls?: string; title?: string } = {}): string {
  return `<span class="tag tone-${o.tone ?? "cream"} ${o.cls ?? ""}"${o.title ? ` title="${escAttr(o.title)}"` : ""}>${o.icon ? icon(o.icon) : ""}${text}</span>`;
}

/**
 * Progressive disclosure: a stitched "more" fold. `key` keeps it open across re-renders of the same panel
 * (Overlay.show remembers open folds by key). Summary is escaped HTML.
 */
export function more(key: string, summary: string, body: string, o: { open?: boolean; cls?: string } = {}): string {
  return `<details class="more ${o.cls ?? ""}" data-more="${escAttr(key)}"${o.open ? " open" : ""}><summary><span class="more-knot" aria-hidden="true">${icon("plus", "sm")}</span>${summary}</summary><div class="more-body">${body}</div></details>`;
}

/** A felt fact tile: an icon (or a swatch/art), a short word, and an optional tiny caption. */
export function fact(art: string, word: string, caption = "", o: { tone?: string; title?: string } = {}): string {
  return `<div class="fact tone-${o.tone ?? "sage"}"${o.title ? ` title="${escAttr(o.title)}"` : ""}><span class="fact-art">${art}</span><b>${word}</b>${caption ? `<small>${caption}</small>` : ""}</div>`;
}

/** A section heading with an embroidered icon (handwritten). */
export function head(name: IconName, text: string, level: 2 | 3 = 3): string {
  return `<h${level} class="sh">${icon(name)}<span>${text}</span></h${level}>`;
}

/** A stitched divider. */
export const stitch = `<hr class="stitch">`;

/** A sheep's (or an animal's) name in the handwritten face. `name` is escaped HTML. */
export function nm(name: string): string {
  return `<span class="nm">${name}</span>`;
}

/** A row of `n` of `max` small felt pips (goal progress, act track). */
export function pipRow(n: number, max: number, cls = ""): string {
  let out = "";
  for (let i = 0; i < max; i++) out += `<i class="${i < n ? "on" : ""}"></i>`;
  return `<span class="pipsrow ${cls}" aria-hidden="true">${out}</span>`;
}
