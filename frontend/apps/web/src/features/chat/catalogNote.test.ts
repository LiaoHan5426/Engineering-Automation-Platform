import { describe, expect, it } from "vite-plus/test";
import { catalogRefreshNote } from "./catalogNote";

describe("catalog refresh note", () => {
  it("keeps the recorded cache time when discovery fails", () => {
    expect(catalogRefreshNote({
      discoveryError: "MODEL_DISCOVERY_HTTP_401",
      discoveredAt: "2026-10-26T00:00:00.000Z",
    })).toEqual({ kind: "cached", time: "2026-10-26T00:00:00.000Z", error: "MODEL_DISCOVERY_HTTP_401" });
  });

  it("does not invent a cache time", () => {
    expect(catalogRefreshNote({ discoveryError: "MODEL_DISCOVERY_HTTP_401", discoveredAt: "  " }).time).toBe("");
  });

  it("reports a fresh catalog only when there is no error", () => {
    expect(catalogRefreshNote({ discoveredAt: "2026-10-27T01:00:00.000Z" })).toEqual({
      kind: "fresh",
      time: "2026-10-27T01:00:00.000Z",
      error: "",
    });
  });

  it("prefers the failed request over a stored discovery error", () => {
    expect(catalogRefreshNote({
      discoveryError: "MODEL_DISCOVERY_HTTP_401",
      discoveredAt: "2026-10-26T00:00:00.000Z",
      requestError: "Network Error",
    }).error).toBe("Network Error");
  });
});
