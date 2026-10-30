/**
 * Human interaction acceptance for delivery (PB-04).
 * Checklist state is session-local only; checking boxes never means build/test passed.
 */

export type AcceptanceItemId = "nav" | "composer" | "preview" | "verification";

export type AcceptanceItem = {
  id: AcceptanceItemId;
  labelKey: string;
};

export const ACCEPTANCE_ITEMS: AcceptanceItem[] = [
  { id: "nav", labelKey: "desktop.acceptNav" },
  { id: "composer", labelKey: "desktop.acceptComposer" },
  { id: "preview", labelKey: "desktop.acceptPreview" },
  { id: "verification", labelKey: "desktop.acceptVerification" },
];

const STORAGE_KEY = "eap.acceptance.checklist.v1";

export type AcceptanceState = Record<AcceptanceItemId, boolean>;

export function emptyAcceptance(): AcceptanceState {
  return { nav: false, composer: false, preview: false, verification: false };
}

export function loadAcceptance(storage?: Storage | null): AcceptanceState {
  const base = emptyAcceptance();
  try {
    const raw = storage?.getItem(STORAGE_KEY);
    if (!raw) return base;
    const parsed = JSON.parse(raw) as Partial<AcceptanceState>;
    for (const item of ACCEPTANCE_ITEMS) {
      base[item.id] = parsed[item.id] === true;
    }
  } catch {
    /* ignore corrupt session storage */
  }
  return base;
}

export function saveAcceptance(state: AcceptanceState, storage?: Storage | null) {
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* quota / private mode: keep memory only */
  }
}

export function toggleAcceptance(
  state: AcceptanceState,
  id: AcceptanceItemId,
  checked: boolean,
): AcceptanceState {
  return { ...state, [id]: checked };
}

export function acceptanceComplete(state: AcceptanceState): boolean {
  return ACCEPTANCE_ITEMS.every((item) => state[item.id]);
}

/** Message key: complete still is human-only, never build/test success. */
export function acceptanceStatusKey(state: AcceptanceState): string {
  return acceptanceComplete(state) ? "desktop.acceptanceHumanDone" : "desktop.acceptanceStillOpen";
}
