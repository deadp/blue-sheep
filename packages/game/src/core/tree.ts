/** Family tree for the tree page (act 3+). Pure view over the sheep table. */
import type { GameState, Sex, Sheep } from "./types.js";

export interface TreeNode {
  id: string;
  name: string;
  sex: Sex;
  colour: string;
  born: number;
  inbreeding: number;
  /** Still in the flock. */
  inFlock: boolean;
  rosettes: number;
}

export interface AncestorNode extends TreeNode { dam: AncestorNode | null; sire: AncestorNode | null }
export interface DescendantNode extends TreeNode { /** The other parent of these children, if known. */ mate: TreeNode | null; children: DescendantNode[] }

export interface FamilyTree {
  self: TreeNode;
  /** Parents, grandparents… of `self` up to `depth` generations. */
  ancestors: { dam: AncestorNode | null; sire: AncestorNode | null };
  /** Children (each with their own children) up to `depth` generations. */
  descendants: DescendantNode[];
}

function node(state: GameState, s: Sheep): TreeNode {
  return {
    id: s.id, name: s.name, sex: s.sex, colour: String(s.phenotype["colour"]), born: s.born, inbreeding: s.inbreeding,
    inFlock: state.flock.includes(s.id), rosettes: s.rosettes.length,
  };
}

function up(state: GameState, id: string | null, depth: number): AncestorNode | null {
  if (!id || depth <= 0) return null;
  const s = state.sheep[id];
  if (!s) return null;
  return { ...node(state, s), dam: up(state, s.dam, depth - 1), sire: up(state, s.sire, depth - 1) };
}

function down(state: GameState, id: string, depth: number, kids: Map<string, Sheep[]>): DescendantNode[] {
  if (depth <= 0) return [];
  return (kids.get(id) ?? []).map((c) => {
    const mateId = c.dam === id ? c.sire : c.dam;
    const mate = mateId && state.sheep[mateId] ? node(state, state.sheep[mateId]!) : null;
    return { ...node(state, c), mate, children: down(state, c.id, depth - 1, kids) };
  });
}

export function familyTree(state: GameState, sheepId: string, depth = 3): FamilyTree {
  const s = state.sheep[sheepId];
  if (!s) throw new Error("I can't find that sheep.");
  const kids = new Map<string, Sheep[]>();
  const all = Object.values(state.sheep).sort((a, b) => a.born - b.born || Number(a.id.slice(1)) - Number(b.id.slice(1)));
  for (const c of all) for (const p of [c.dam, c.sire]) if (p) kids.set(p, [...(kids.get(p) ?? []), c]);
  return {
    self: node(state, s),
    ancestors: { dam: up(state, s.dam, depth), sire: up(state, s.sire, depth) },
    descendants: down(state, sheepId, depth, kids),
  };
}
