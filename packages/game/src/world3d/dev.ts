// Dev harness for the 3D world: /world-dev.html
// URL params: ?season=0..3 &nomotion=1 &noui=1 &night=1 &p2=0|1 &visitor=0|1 &fair=0|1 &n=40 (extra paddock sheep)
import { WorldView, type WorldSheep, type WorldSnapshot } from "./index.js";

const q = new URLSearchParams(location.search);
const flag = (k: string, d: boolean) => (q.has(k) ? q.get(k) === "1" : d);
if (flag("noui", false)) document.body.classList.add("noui");

const S = (id: string, name: string, o: Partial<WorldSheep>): WorldSheep => ({
  id, name, sex: "ewe", adult: true, colour: "white", pattern: "solid", horns: "polled",
  size: 60, fleeceWeight: 4, fineness: 26, crimp: 5, zone: "paddock", marker: null, ...o,
});

const base: WorldSheep[] = [
  S("s1", "Clover", { colour: "white", marker: "planned" }),
  S("s2", "Bramble", { sex: "ram", colour: "black", horns: "horned", size: 76, fleeceWeight: 5 }),
  S("s3", "Hazel", { colour: "brown", pattern: "spotted", crimp: 7 }),
  S("s4", "Bluebell", { colour: "blue", fineness: 18, marker: "new" }),
  S("s5", "Oat", { colour: "fawn", size: 48, fleeceWeight: 2.5, crimp: 2 }),
  S("s6", "Pip", { adult: false, colour: "blue", marker: "new" }),
  S("s7", "Moss", { adult: false, colour: "black", pattern: "spotted", horns: "horned", sex: "ram" }),
  S("s8", "Rowan", { sex: "ram", colour: "white", horns: "horned", size: 72, marker: "rosette" }),
  S("s9", "Nettle", { colour: "fawn", pattern: "spotted", zone: "paddock2", horns: "horned" }),
  S("s10", "Sorrel", { colour: "brown", zone: "paddock2", marker: "ill", size: 44 }),
  S("s11", "Thistle", { colour: "white", pattern: "spotted", zone: "barn", fleeceWeight: 6, crimp: 8 }),
  S("s12", "Dusk", { colour: "black", zone: "barn", fineness: 34 }),
  S("s13", "Wren", { colour: "fawn", zone: "market" }),
  S("s14", "Juniper", { colour: "brown", zone: "market", sex: "ram", horns: "horned", size: 70 }),
  S("s15", "Stranger", { colour: "blue", zone: "visitor", sex: "ram", horns: "horned", size: 78, pattern: "spotted" }),
];
const extra = Number(q.get("n") ?? 0);
const colours = ["white", "black", "brown", "blue", "fawn"] as const;
for (let i = 0; i < extra; i++) {
  base.push(S(`x${i}`, `Extra ${i}`, {
    colour: colours[i % 5]!, pattern: i % 3 ? "solid" : "spotted", horns: i % 4 ? "polled" : "horned",
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
  snap.sheep.push(S(`l${lambN}`, `Lamb ${lambN}`, { adult: false, colour: colours[lambN % 5]!, marker: "new" }));
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
