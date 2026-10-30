import { expect, it } from "vite-plus/test";
import { reachedScrollEdge } from "@eap/ui";

it("loads older chat when the scrolled list is near the start, and newer items near the end", () => {
  const metrics = { scrollTop: 0, scrollHeight: 800, clientHeight: 200 };
  expect(reachedScrollEdge(metrics, "start", 80)).toBe(true);
  expect(reachedScrollEdge({ ...metrics, scrollTop: 120 }, "start", 80)).toBe(false);
  expect(reachedScrollEdge({ ...metrics, scrollTop: 520 }, "end", 80)).toBe(true);
  expect(reachedScrollEdge({ scrollTop: 0, scrollHeight: 180, clientHeight: 200 }, "start", 80)).toBe(false);
});
