import { afterEach, describe, expect, it, vi } from "vitest";
import { newGame, serialize } from "./core/index.js";
import { App, SAVE_KEY } from "./app.js";

afterEach(() => vi.unstubAllGlobals());

/** greet() on a stand-in App, with a fake localStorage that already holds a real save. */
function greetOn(persist: boolean): { store: Map<string, string>; real: string; fake: { persist: boolean } } {
  const store = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  });
  const real = serialize(newGame(1));
  store.set(SAVE_KEY, real);
  const state = newGame(99);
  const id = state.flock[0]!;
  const proto = App.prototype as unknown as Record<string, (...a: unknown[]) => unknown>;
  const fake = { state, persist, loveQueue: new Map<string, number>(), save: proto.save! };
  proto.greet!.call(fake, id);
  return { store, real, fake };
}

describe("app: preview boots and the real save", () => {
  it("opening an animal card on a preview boot (?seed=…&panel=sheep) leaves the stored save untouched", () => {
    const { store, real, fake } = greetOn(false);
    expect(fake.persist).toBe(false);
    expect(store.get(SAVE_KEY)).toBe(real);
  });

  it("a normal boot still saves when the card opens", () => {
    const { store, real } = greetOn(true);
    expect(store.get(SAVE_KEY)).not.toBe(real);
  });
});
