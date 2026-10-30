const positions = new Map<string, number>();

export function saveFeedScroll(key: string, top: number) {
  if (!key) return;
  positions.set(key, Number.isFinite(top) && top > 0 ? top : 0);
}

export function readFeedScroll(key: string) {
  return positions.get(key) ?? 0;
}

export function clearFeedScroll() {
  positions.clear();
}
