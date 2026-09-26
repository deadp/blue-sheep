/** The only DOM code in ui/: the panel overlay, a click delegate and a toast. */

export type ActionData = Record<string, string | undefined>;

/**
 * Forward clicks on any enabled button (or [role=button]) that has data-* attributes.
 * If the button is `data-newgame=""` and an `input[name=seed]` holds a value, that value is filled in.
 */
export function delegateActions(root: HTMLElement, onAction: (data: ActionData) => void, skipClose = false): void {
  root.addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>("button, [role=button]");
    if (!b || !root.contains(b) || (b as HTMLButtonElement).disabled) return;
    const data: ActionData = { ...b.dataset };
    if (!Object.keys(data).length) return;
    if (skipClose && "close" in data) return;
    if ("newgame" in data && !data["newgame"]) {
      const inp = root.querySelector<HTMLInputElement>("input[name=seed]");
      if (inp && inp.value.trim()) data["newgame"] = inp.value.trim();
    }
    onAction(data);
  });
}

export interface ShowOptions { wide?: boolean; closable?: boolean; name?: string }

export class Overlay {
  readonly el: HTMLElement;
  /** Called whenever the overlay closes (button, backdrop, Escape or close()). */
  onClose: (() => void) | null = null;
  private lastFocus: Element | null = null;
  private closable = true;

  constructor(private onAction: (data: ActionData) => void, el?: HTMLElement | string) {
    const found = typeof el === "string" ? document.querySelector<HTMLElement>(el) : el ?? document.querySelector<HTMLElement>("#overlay");
    this.el = found ?? Object.assign(document.body.appendChild(document.createElement("div")), { id: "overlay", hidden: true });
    this.el.addEventListener("click", (e) => {
      if (e.target === this.el) { if (this.closable) this.close(); return; }
      const b = (e.target as HTMLElement).closest<HTMLElement>("[data-close]");
      if (b && this.el.contains(b) && !(b as HTMLButtonElement).disabled) this.close();
    });
    delegateActions(this.el, (d) => this.onAction(d), true);
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && this.open && this.closable) { e.preventDefault(); this.close(); }
    });
  }

  get open(): boolean { return !this.el.hidden; }

  show(html: string, opts: ShowOptions = {}): void {
    const wasOpen = this.open;
    const scroll = wasOpen ? this.el.querySelector(".panel")?.scrollTop ?? 0 : 0;
    this.closable = opts.closable !== false;
    if (!wasOpen) this.lastFocus = document.activeElement;
    this.el.innerHTML = `<div class="panel ${opts.wide ? "wide" : ""}" role="dialog" aria-modal="true" tabindex="-1" ${opts.name ? `data-panel="${opts.name}"` : ""}>
      ${this.closable ? `<button class="panel-x" data-close aria-label="Close">×</button>` : ""}${html}</div>`;
    this.el.hidden = false;
    const panel = this.el.querySelector<HTMLElement>(".panel");
    if (panel && wasOpen) panel.scrollTop = scroll;
    // Focus the dialog itself so Tab starts inside it, without a focus ring on an arbitrary button.
    if (!wasOpen) panel?.focus({ preventScroll: true });
  }

  close(): void {
    if (this.el.hidden) return;
    this.el.hidden = true;
    this.el.innerHTML = "";
    (this.lastFocus as HTMLElement | null)?.focus?.({ preventScroll: true });
    this.onClose?.();
  }
}

let toastTimer: ReturnType<typeof setTimeout> | null = null;

/** Small message at the bottom of the screen (errors from core actions, confirmations). */
export function toast(msg: string, ms = 2800): void {
  let el = document.querySelector<HTMLElement>("#toast");
  if (!el) {
    el = document.createElement("div");
    el.id = "toast";
    el.setAttribute("role", "status");
    el.setAttribute("aria-live", "polite");
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.add("show");
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el!.classList.remove("show"), ms);
}
