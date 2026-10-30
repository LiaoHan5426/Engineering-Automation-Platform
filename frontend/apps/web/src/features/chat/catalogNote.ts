export type CatalogNote = { kind: "cached" | "fresh"; time: string; error: string };

/** Describes a catalog refresh without inventing a cache time or treating an error as a new catalog. */
export function catalogRefreshNote(input: { discoveryError?: string; discoveredAt?: string; requestError?: string }): CatalogNote {
  const requestError = input.requestError?.trim() ?? "";
  const discoveryError = input.discoveryError?.trim() ?? "";
  const time = input.discoveredAt?.trim() ?? "";
  if (requestError || discoveryError) return { kind: "cached", time, error: requestError || discoveryError };
  return { kind: "fresh", time, error: "" };
}
