// @vitest-environment jsdom
import { liveFixtureProps } from "./vue-render.client.ts";
import { h as vueH, defineComponent } from "vue";
import { act, cleanup, fireEvent, render, screen } from "./vue-render.client.ts";
import { afterEach, describe, expect, it, vi } from "vitest";
import { makeTranslate, RemoteError } from "@deepseek-ai/dsh-client-test-runtime";
import type { RemoteResult } from "@deepseek-ai/dsh-api-remotes/client";
import type {
  ScheduleDeleteResult,
  ScheduleId,
  ScheduleCatalogEntry,
} from "@deepseek-ai/dsh-schedule/client";
import type { SessionId } from "@deepseek-ai/dsh-session/types";
import { bindSnapshotSelector } from "@deepseek-ai/dsh-client-test-runtime";
import { createCatalogSource, type CatalogInjected } from "../src/client/catalog-source.ts";
import {
  SessionScheduleMark as NativeSessionScheduleMark,
  type SessionScheduleMarkProps,
} from "../src/client/SessionScheduleMark.tsx";
import { en } from "../src/client/locales.ts";
const SESSION = "mark-session" as SessionId;
const OTHER_SESSION = "other-session" as SessionId;
const id = "mark-task" as ScheduleId;
afterEach(cleanup);
function entry(
  taskId: string,
  sessionId: SessionId,
  status: ScheduleCatalogEntry["status"] = "active",
): ScheduleCatalogEntry {
  return {
    kind: "rrule",
    id: taskId as ScheduleId,
    title: "Read status",
    prompt: "Read status",
    rrule: "DTSTART;TZID=UTC:20261001T000000\nRRULE:FREQ=DAILY;COUNT=1",
    scheduledAt: "2026-10-01T00:00:00.000Z",
    target: { kind: "session", sessionId },
    involvedSessionIds: [sessionId],
    status,
    createdAt: "2026-09-30T00:00:00.000Z",
    updatedAt: "2026-09-30T00:00:00.000Z",
  };
}
function sourceFor(
  list: () => Promise<RemoteResult<ScheduleCatalogEntry[]>>,
): CatalogInjected<ScheduleCatalogEntry> {
  return createCatalogSource<ScheduleCatalogEntry>({
    list,
    remove: async (): Promise<RemoteResult<ScheduleDeleteResult>> => ({
      ok: true,
      value: { id, deleted: true },
    }),
    subscribeChanged: () => () => {},
    subscribeReset: () => () => {},
  });
}
function renderMark(source: CatalogInjected<ScheduleCatalogEntry>, sessionId: SessionId = SESSION) {
  const props = {
    sessionId,
    useCatalog: bindSnapshotSelector(source.hooks.catalog),
    t: makeTranslate(en),
  } as SessionScheduleMarkProps;
  return render(vueH(SessionScheduleMark, { ...props }));
}
/** Flush the source's initial read and its publication. */
async function settle(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
  });
}
describe("Session schedule sidebar mark", () => {
  it("shows no mark until a read settles, and none for an empty, paused-or-ended-only, or failed read", async () => {
    const pending = renderMark(sourceFor(() => new Promise(() => {})));
    expect(pending.container.querySelector("[data-session-schedule-mark]")).toBeNull();
    pending.unmount();
    const empty = renderMark(sourceFor(async () => ({ ok: true, value: [] })));
    await settle();
    expect(empty.container.querySelector("[data-session-schedule-mark]")).toBeNull();
    const ended = renderMark(
      sourceFor(async () => ({
        ok: true,
        value: [entry("paused", SESSION, "paused"), entry("ended", SESSION, "ended")],
      })),
    );
    await settle();
    expect(ended.container.querySelector("[data-session-schedule-mark]")).toBeNull();
    const failed = renderMark(
      sourceFor(async () => ({
        ok: false,
        error: new RemoteError("gateway/internal", "Unavailable", {}),
      })),
    );
    await settle();
    expect(failed.container.querySelector("[data-session-schedule-mark]")).toBeNull();
  });
  it("marks a row whose Session has an active task and names the count", async () => {
    renderMark(sourceFor(async () => ({ ok: true, value: [entry("mark-task", SESSION)] })));
    await settle();
    const mark = screen.getByText(en["mark.aria"].replace("{count}", "1"))
      .parentElement as HTMLElement;
    expect(mark.getAttribute("data-session-schedule-mark")).toBe("");
    expect(mark.querySelectorAll("svg")).toHaveLength(1);
  });
  it("marks no row for a Session whose active tasks belong to another Session", async () => {
    const list = vi.fn(async (): Promise<RemoteResult<ScheduleCatalogEntry[]>> => ({
      ok: true,
      value: [entry("other-task", OTHER_SESSION)],
    }));
    renderMark(sourceFor(list), SESSION);
    await settle();
    expect(document.querySelector("[data-session-schedule-mark]")).toBeNull();
    expect(list).toHaveBeenCalledTimes(1);
  });
  it("answers many rows from one shared catalog read", async () => {
    const list = vi.fn(async (): Promise<RemoteResult<ScheduleCatalogEntry[]>> => ({
      ok: true,
      value: [entry("first-task", SESSION), entry("second-task", OTHER_SESSION)],
    }));
    const source = sourceFor(list);
    render(
      vueH("div", {}, [
        vueH(SessionScheduleMark, {
          ...({
            sessionId: SESSION,
            useCatalog: bindSnapshotSelector(source.hooks.catalog),
            t: makeTranslate(en),
          } as SessionScheduleMarkProps),
        }),
        vueH(SessionScheduleMark, {
          ...({
            sessionId: OTHER_SESSION,
            useCatalog: bindSnapshotSelector(source.hooks.catalog),
            t: makeTranslate(en),
          } as SessionScheduleMarkProps),
        }),
      ]),
    );
    await settle();
    expect(document.querySelectorAll("[data-session-schedule-mark]")).toHaveLength(2);
    expect(list).toHaveBeenCalledTimes(1);
  });
  it("does not activate the Session through the row click target", async () => {
    const onOpen = vi.fn();
    const source = sourceFor(async () => ({ ok: true, value: [entry("mark-task", SESSION)] }));
    const props = {
      sessionId: SESSION,
      useCatalog: bindSnapshotSelector(source.hooks.catalog),
      t: makeTranslate(en),
    } as SessionScheduleMarkProps;
    render(vueH("div", { onClick: onOpen }, [vueH(SessionScheduleMark, { ...props })]));
    await settle();
    await fireEvent.click(screen.getByText(en["mark.aria"].replace("{count}", "1")));
    expect(onOpen).not.toHaveBeenCalled();
  });
});

const SessionScheduleMark = defineComponent(
  (props: InstanceType<typeof NativeSessionScheduleMark>["$props"]) => {
    const read = liveFixtureProps(props);
    return () => vueH(NativeSessionScheduleMark, read());
  },
  {
    props: [
      "sessionId",
      "useRemoteAccess",
      "useSessions",
      "useSessionRetainInfo",
      "useSessionAccess",
      "usePanelInfo",
      "useContextMenu",
      "useSessionStatus",
      "useWorkspaces",
      "useResource",
      "useWorkspaceAccess",
      "useCatalog",
      "t",
    ],
  },
);
