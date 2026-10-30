/**
 * Honest colocated UI preview for delivery gates.
 * Opening the local console is not build/test verification and not human acceptance.
 */

export type PagePreview = {
  url: string;
  ready: boolean;
  denial: string;
};

export function isLocalUiOrigin(origin: string): boolean {
  try {
    const url = new URL(origin);
    const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
    return local && url.protocol.startsWith("http");
  } catch {
    return false;
  }
}

/** Chat workbench hash used for the current EAP delivery target. */
export function deliveryChatPreviewUrl(origin: string): string {
  const base = origin.replace(/\/$/, "");
  return `${base}/#chat`;
}

export function resolvePagePreview(input: { mock?: boolean; origin?: string }): PagePreview {
  if (input.mock) {
    return { url: "", ready: false, denial: "PREVIEW_MOCK" };
  }
  const origin = (input.origin ?? "").trim();
  if (!origin) {
    return { url: "", ready: false, denial: "PREVIEW_ORIGIN_UNKNOWN" };
  }
  if (!isLocalUiOrigin(origin)) {
    return { url: "", ready: false, denial: "PREVIEW_NOT_LOCAL_UI" };
  }
  return { url: deliveryChatPreviewUrl(origin), ready: true, denial: "" };
}

export function pagePreviewMessageKey(preview: PagePreview): string {
  if (preview.ready) return "desktop.deliveryPreviewReady";
  if (preview.denial === "PREVIEW_MOCK") return "desktop.deliveryPreviewMock";
  return "desktop.deliveryPreview";
}
