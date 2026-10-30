import { afterEach, expect, it } from "vite-plus/test";
import { clearFeedScroll, readFeedScroll, saveFeedScroll } from "./feedScroll";

afterEach(() => { clearFeedScroll(); });

it("keeps each conversation scroll and forgets it when cleared", () => {
  saveFeedScroll("a", 180);
  saveFeedScroll("b", 40);
  expect(readFeedScroll("a")).toBe(180);
  expect(readFeedScroll("b")).toBe(40);
  saveFeedScroll("a", 0);
  expect(readFeedScroll("a")).toBe(0);
  expect(readFeedScroll("missing")).toBe(0);
  clearFeedScroll();
  expect(readFeedScroll("b")).toBe(0);
});
