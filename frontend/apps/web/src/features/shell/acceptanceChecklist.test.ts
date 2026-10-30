import { describe, expect, it } from "vite-plus/test";
import {
  ACCEPTANCE_ITEMS,
  acceptanceComplete,
  acceptanceStatusKey,
  emptyAcceptance,
  loadAcceptance,
  saveAcceptance,
  toggleAcceptance,
} from "./acceptanceChecklist";

describe("acceptanceChecklist", () => {
  it("stays incomplete until every human item is checked", () => {
    const state = emptyAcceptance();
    expect(acceptanceComplete(state)).toBe(false);
    expect(acceptanceStatusKey(state)).toBe("desktop.acceptanceStillOpen");
    let next = state;
    for (const item of ACCEPTANCE_ITEMS) {
      next = toggleAcceptance(next, item.id, true);
    }
    expect(acceptanceComplete(next)).toBe(true);
    expect(acceptanceStatusKey(next)).toBe("desktop.acceptanceHumanDone");
  });

  it("round-trips through session storage without inventing checks", () => {
    const memory = new Map<string, string>();
    const storage = {
      getItem: (key: string) => memory.get(key) ?? null,
      setItem: (key: string, value: string) => { memory.set(key, value); },
    } as Storage;
    saveAcceptance(toggleAcceptance(emptyAcceptance(), "preview", true), storage);
    expect(loadAcceptance(storage)).toEqual({
      nav: false,
      composer: false,
      preview: true,
      verification: false,
    });
  });
});
