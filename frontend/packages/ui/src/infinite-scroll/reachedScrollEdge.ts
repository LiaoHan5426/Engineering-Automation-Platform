export function reachedScrollEdge(
  metrics: { scrollTop: number; scrollHeight: number; clientHeight: number },
  edge: "start" | "end",
  distance: number,
): boolean {
  const overflow = metrics.scrollHeight - metrics.clientHeight;
  if (overflow <= 1) return false;
  if (edge === "end") return overflow - metrics.scrollTop <= distance;
  return metrics.scrollTop <= distance;
}
