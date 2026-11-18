// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";
import { h, shallowRef } from "vue";
import { act, cleanup, render } from "./vue-fixture.ts";
import { createSnapshotStore } from "@deepseek-ai/dsh-client-store";
import { bindSnapshotSelector } from "./vue-fixture.ts";
import type { SessionListState } from "@deepseek-ai/dsh-api-session-controller/client";
import type { SessionId } from "@deepseek-ai/dsh-session/types";
import { DocumentTitle } from "../src/client/DocumentTitle.tsx";
import type { MainPanelId, PanelInfo } from "../src/client/service.ts";

let originalTitle: string;
beforeEach(() => {
  originalTitle = document.title;
});
afterEach(() => {
  try {
    cleanup();
  } finally {
    document.title = originalTitle;
  }
});

function titleSources() {
  const sessionId = "session-title" as SessionId;
  const sessions = createSnapshotStore<SessionListState>({
    ids: [sessionId],
    byId: {
      [sessionId]: {
        id: sessionId,
        displayTitle: "Test",
        running: false,
        retainedBy: { mainView: 1 },
        blank: false,
        updatedAt: 1,
      },
    },
    phase: "ready",
    projectionsBySession: {},
  });
  const panelInfo = createSnapshotStore<PanelInfo>({ activePanelId: null });
  return {
    sessionId,
    sessions,
    panelInfo,
    props: {
      useSessions: bindSnapshotSelector(sessions),
      usePanelInfo: bindSnapshotSelector(panelInfo),
    },
  };
}

describe("DocumentTitle", () => {
  it("projects a durable title and restores the product title", async () => {
    const { sessionId, sessions, props } = titleSources();
    document.title = "stale title";
    const mounted = await render(() =>
      h(DocumentTitle, { ...props, productTitle: "DeepSeek Harness" }),
    );
    expect(document.title).toBe("DeepSeek Harness");
    await act(() => {
      sessions.update((state) => {
        state.byId[sessionId]!.title = "First title";
      });
    });
    expect(document.title).toBe("First title — DeepSeek Harness");
    await act(() => {
      sessions.update((state) => {
        state.byId[sessionId]!.title = "Revised title";
      });
    });
    expect(document.title).toBe("Revised title — DeepSeek Harness");
    await act(() => {
      const state = sessions.getSnapshot();
      sessions.set({
        ...state,
        byId: { ...state.byId, [sessionId]: { ...state.byId[sessionId]!, retainedBy: {} } },
      });
    });
    expect(document.title).toBe("DeepSeek Harness");
    mounted.unmount();
    expect(document.title).toBe("DeepSeek Harness");
  });

  it("uses the localized product title supplied by the frame", async () => {
    const { sessionId, sessions, props } = titleSources();
    sessions.update((state) => {
      state.byId[sessionId]!.title = "First title";
    });
    const productTitle = shallowRef("DSH Local Build");
    const mounted = await render(() =>
      h(DocumentTitle, { ...props, productTitle: productTitle.value }),
    );
    expect(document.title).toBe("First title — DSH Local Build");
    await act(() => {
      productTitle.value = "DSH 本地构建";
    });
    expect(document.title).toBe("First title — DSH 本地构建");
    mounted.unmount();
    expect(document.title).toBe("DSH 本地构建");
  });

  it("keeps the product title across global panels and restores the latest Session title on return", async () => {
    const { sessionId, sessions, panelInfo, props } = titleSources();
    sessions.update((state) => {
      state.byId[sessionId]!.title = "Session title";
    });
    await render(() => h(DocumentTitle, { ...props, productTitle: "Product" }));
    expect(document.title).toBe("Session title — Product");
    await act(() => {
      panelInfo.set({ activePanelId: "panel-a" as MainPanelId });
    });
    expect(document.title).toBe("Product");
    await act(() => {
      sessions.update((state) => {
        state.byId[sessionId]!.title = "Updated title";
      });
    });
    expect(document.title).toBe("Product");
    await act(() => {
      panelInfo.set({ activePanelId: "panel-b" as MainPanelId });
    });
    expect(document.title).toBe("Product");
    expect(sessions.getSnapshot().byId[sessionId]?.retainedBy.mainView).toBe(1);
    await act(() => {
      panelInfo.set({ activePanelId: null });
    });
    expect(document.title).toBe("Updated title — Product");
  });

  it("uses the product title when the current Session row is not available", async () => {
    const { sessions, props } = titleSources();
    sessions.update((state) => {
      state.byId = {};
      state.ids = [];
    });
    await render(() => h(DocumentTitle, { ...props, productTitle: "Product" }));
    expect(document.title).toBe("Product");
  });
});
