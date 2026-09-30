// Dev harness for the 3D world: /world-dev.html
// URL params: ?season=0..3 &nomotion=1 &noui=1 &night=1 &p2=0|1 &visitor=0|1 &fair=0|1 &n=40 (extra paddock sheep)
import { WorldView, type WorldSheep, type WorldSnapshot } from "./index.js";

const q = new URLSearchParams(location.search);
const flag = (k: string, d: boolean) => (q.has(k) ? q.get(k) === "1" : d);
if (flag("noui", false)) document.body.classList.add("noui");

const S = (id: string, name: string, o: Partial<WorldSheep>): WorldSheep => ({
  id, name, sex: "ewe", adult: true, wool: "#FAFAF7", family: "white", pattern: "solid", horns: "polled",
  size: 60, fleeceWeight: 4, fineness: 26, crimp: 5, zone: "paddock", marker: null, ...o,
});

const base: WorldSheep[] = [
  S("s1", "Clover", { wool: "#FAFAF7", family: "white", marker: "planned" }),
  S("s2", "Bramble", { sex: "ram", wool: "#2F5DA8", family: "blue", horns: "horned", size: 76, fleeceWeight: 5 }),
  S("s3", "Hazel", { wool: "#C8322F", family: "red", pattern: "spotted", crimp: 7 }),
  S("s4", "Bluebell", { wool: "#7FA0D8", family: "blue", fineness: 18, marker: "new" }),
  S("s5", "Oat", { wool: "#E59A98", family: "red", size: 48, fleeceWeight: 2.5, crimp: 2 }),
  S("s6", "Pip", { adult: false, wool: "#7FA0D8", family: "blue", marker: "new" }),
  S("s7", "Moss", { adult: false, wool: "#2F5DA8", family: "blue", pattern: "spotted", horns: "horned", sex: "ram" }),
  S("s8", "Rowan", { sex: "ram", wool: "#FAFAF7", family: "white", horns: "horned", size: 72, marker: "rosette" }),
  S("s9", "Nettle", { wool: "#E59A98", family: "red", pattern: "spotted", zone: "paddock2", horns: "horned" }),
  S("s10", "Sorrel", { wool: "#C8322F", family: "red", zone: "paddock2", marker: "ill", size: 44 }),
  S("s11", "Thistle", { wool: "#FAFAF7", family: "white", pattern: "spotted", zone: "barn", fleeceWeight: 6, crimp: 8 }),
  S("s12", "Dusk", { wool: "#2F5DA8", family: "blue", zone: "barn", fineness: 34 }),
  S("s13", "Wren", { wool: "#E59A98", family: "red", zone: "market" }),
  S("s14", "Juniper", { wool: "#C8322F", family: "red", zone: "market", sex: "ram", horns: "horned", size: 70 }),
  S("s15", "Stranger", { wool: "#7FA0D8", family: "blue", zone: "visitor", sex: "ram", horns: "horned", size: 78, pattern: "spotted" }),
];
const extra = Number(q.get("n") ?? 0);
const colours: [string, string][] = [["#FAFAF7", "white"], ["#C8322F", "red"], ["#E59A98", "red"], ["#2F5DA8", "blue"], ["#E07A2A", "orange"], ["#EDE3CF", "oatmeal"], ["#3E8E4A", "green"], ["#B39BC2", "purple"]];
for (let i = 0; i < extra; i++) {
  base.push(S(`x${i}`, `Extra ${i}`, {
    wool: colours[i % colours.length]![0], family: colours[i % colours.length]![1], pattern: i % 3 ? "solid" : "spotted", horns: i % 4 ? "polled" : "horned",
    sex: i % 4 ? "ewe" : "ram", adult: i % 6 !== 0, size: 45 + ((i * 7) % 35),
    zone: i % 3 ? "paddock" : "paddock2",
  }));
}

const snap: WorldSnapshot = {
  season: Math.max(0, Math.min(3, Number(q.get("season") ?? 0))) as 0 | 1 | 2 | 3,
  year: 1,
  sheep: base,
  selected: "s2",
  paddock2: flag("p2", true),
  visitorPresent: flag("visitor", true),
  fairToday: flag("fair", true),
};

const info = document.getElementById("info")!;
const world = new WorldView(document.getElementById("world")!, {
  onSheep: (id) => { snap.selected = id; push(); info.textContent = `clicked sheep ${id}`; world.focus(id); },
  onHotspot: (h) => { info.textContent = `clicked hotspot ${h}`; world.focus(h); },
  onHover: (t) => { if (t) info.textContent = `hover ${t.kind} ${t.id}`; },
}, { seed: Number(q.get("seed") ?? 7), reducedMotion: flag("nomotion", false) });

function push(): void {
  world.setSnapshot({ ...snap, sheep: snap.sheep.map((s) => ({ ...s })) });
}
push();

const bar = document.getElementById("bar")!;
const btn = (label: string, fn: () => void) => {
  const b = document.createElement("button");
  b.textContent = label;
  b.onclick = fn;
  bar.appendChild(b);
};
btn("Season ▸", () => { snap.season = ((snap.season + 1) % 4) as 0 | 1 | 2 | 3; push(); });
btn("Paddock 2", () => { snap.paddock2 = !snap.paddock2; push(); });
btn("Visitor", () => { snap.visitorPresent = !snap.visitorPresent; push(); });
btn("Fair day", () => { snap.fairToday = !snap.fairToday; push(); });
btn("Celebrate", () => world.celebrate(snap.selected ?? "s4"));
btn("Sleep", () => { void world.sleepTransition().then(() => { info.textContent = "dark"; }); });
btn("Dawn", () => { void world.dawn().then(() => { info.textContent = "day"; }); });
let lambN = 0;
btn("Add lamb", () => {
  snap.sheep.push(S(`l${lambN}`, `Lamb ${lambN}`, { adult: false, wool: colours[lambN % colours.length]![0], family: colours[lambN % colours.length]![1], marker: "new" }));
  lambN++;
  push();
});
btn("Remove one", () => { snap.sheep.pop(); push(); });
btn("Focus house", () => world.focus("house"));

// portraits
const grid = document.getElementById("portraits")!;
const t0 = performance.now();
for (const s of base.slice(0, 12)) {
  const img = document.createElement("img");
  img.src = world.portrait(s, 96);
  img.title = s.name;
  grid.appendChild(img);
}
const tFirst = performance.now() - t0;
const t1 = performance.now();
for (const s of base.slice(0, 12)) world.portrait({ ...s, size: s.size + 3 }, 96); // cache-miss, warm
const tWarm = (performance.now() - t1) / 12;

if (flag("night", false)) void world.sleepTransition();

const w = window as unknown as Record<string, unknown>;
w.__world = world;
w.__portraitMs = { first12: tFirst, warmEach: tWarm };
setInterval(() => {
  const st = world.debugStats();
  if (!info.textContent?.startsWith("click")) info.textContent = `sheep ${st.sheep} · draw calls ${st.calls} · tris ${st.triangles} · portrait warm ${tWarm.toFixed(1)} ms`;
}, 1000);
requestAnimationFrame(() => requestAnimationFrame(() => { document.body.dataset.ready = "1"; }));

// ?gallery=1: big static portraits of every look (and lambs), plus a live portrait, for judging the sheep up close.
if (flag("gallery", false)) {
  const g = document.createElement("div");
  g.id = "gallery";
  g.style.cssText = "position:absolute;inset:0;z-index:20;background:#f4efe4;display:flex;flex-wrap:wrap;gap:8px;padding:8px;align-content:flex-start;overflow:auto";
  const px = Number(q.get("px") ?? 180);
  const lambs: WorldSheep[] = colours.map((c, i) => S(`gl${i}`, `Lamb ${c[1]}`, {
    adult: false, wool: c[0], family: c[1], sex: i % 2 ? "ram" : "ewe", horns: i === 3 ? "horned" : "polled", pattern: i === 2 ? "spotted" : "solid", size: 46, fleeceWeight: 3.8, crimp: 5,
  }));
  for (const s of [...base.slice(0, 11), ...lambs]) {
    const fig = document.createElement("figure");
    fig.style.cssText = "margin:0;text-align:center;font-size:11px";
    const img = document.createElement("img");
    img.src = world.portrait(s, px);
    img.style.cssText = `width:${px}px;height:${px}px;border-radius:14px;display:block`;
    fig.append(img, Object.assign(document.createElement("figcaption"), { textContent: `${s.name} ${s.adult ? s.sex : "lamb"} ${s.family}` }));
    g.appendChild(fig);
  }
  const live = document.createElement("div");
  live.style.cssText = "width:360px;height:220px;border-radius:14px;background:#bfdcec;position:relative";
  g.appendChild(live);
  document.body.appendChild(g);
  const who = base.find((s) => s.id === (q.get("live") ?? "s2")) ?? base[0]!;
  world.mountPortrait(live, { ...who, personality: "curious" });
}
