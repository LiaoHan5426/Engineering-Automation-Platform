import { describe, expect, it } from "vite-plus/test";
import { deliveryChatPreviewUrl, isLocalUiOrigin, pagePreviewMessageKey, resolvePagePreview } from "./pagePreview";

describe("pagePreview", () => {
  it("accepts colocated localhost UI origins only", () => {
    expect(isLocalUiOrigin("http://127.0.0.1:5173")).toBe(true);
    expect(isLocalUiOrigin("http://localhost:5173")).toBe(true);
    expect(isLocalUiOrigin("https://example.com")).toBe(false);
    expect(deliveryChatPreviewUrl("http://127.0.0.1:5173/")).toBe("http://127.0.0.1:5173/#chat");
  });

  it("stays honest in mock and unknown origins", () => {
    expect(resolvePagePreview({ mock: true })).toEqual({ url: "", ready: false, denial: "PREVIEW_MOCK" });
    expect(resolvePagePreview({ origin: "" }).denial).toBe("PREVIEW_ORIGIN_UNKNOWN");
    expect(resolvePagePreview({ origin: "https://app.example" }).denial).toBe("PREVIEW_NOT_LOCAL_UI");
    const ready = resolvePagePreview({ origin: "http://127.0.0.1:5173" });
    expect(ready.ready).toBe(true);
    expect(pagePreviewMessageKey(ready)).toBe("desktop.deliveryPreviewReady");
    expect(pagePreviewMessageKey({ url: "", ready: false, denial: "PREVIEW_MOCK" })).toBe("desktop.deliveryPreviewMock");
  });
});
