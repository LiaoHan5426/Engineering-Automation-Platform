// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { h } from "vue";
import { fireEvent, screen } from "@testing-library/dom";
import { renderVue as render, cleanupVue as cleanup, flushVue as act } from "./vue-render.ts";
import { bindSnapshotSelector, makeTranslate } from "@deepseek-ai/dsh-client-test-runtime";
import { createSnapshotStore } from "@deepseek-ai/dsh-client-store";
import type {
  ShortcutCatalogEntry,
  ShortcutCommandId,
} from "@deepseek-ai/dsh-client-shortcuts/client";
import { OpenInAppAction, type OpenInAppActionProps } from "../src/client/OpenInAppAction.tsx";
import { OpenInAppController } from "../src/client/controller.ts";
import { zh } from "../src/client/locales.ts";
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
});
const t: OpenInAppActionProps["t"] = makeTranslate(zh);
interface Bench {
  props: OpenInAppActionProps;
  launch: ReturnType<typeof vi.fn>;
  choose: ReturnType<typeof vi.fn>;
  report: ReturnType<typeof vi.fn>;
}
function bench(
  over: {
    apps?: readonly string[] | null;
    choice?: string;
    absolutePath?: string;
    shortcuts?: readonly ShortcutCatalogEntry[];
    launch?: (appId: string, path: string) => Promise<void>;
  } = {},
): Bench {
  const apps = createSnapshotStore<readonly string[] | null>(over.apps ?? null);
  const choice = createSnapshotStore<string>(over.choice ?? "");
  const controller = new OpenInAppController(async (_input, init) => {
    const request = JSON.parse(init?.body as string) as {
      app: string;
      path: string;
    };
    await over.launch?.(request.app, request.path);
    return new Response("", { status: 200 });
  });
  const launch = vi.fn((appId: string, path: string) => controller.launch(appId, path));
  const choose = vi.fn();
  const report = vi.fn();
  const props: OpenInAppActionProps = {
    absolutePath: over.absolutePath ?? "/w",
    useOpenInAppApps: bindSnapshotSelector(apps),
    useOpenInAppChoice: bindSnapshotSelector(choice),
    useOpenInAppLaunch: bindSnapshotSelector(controller.operation),
    useShortcuts: bindSnapshotSelector(createSnapshotStore(over.shortcuts ?? [])),
    launch,
    choose,
    report,
    iconUrl: (appId: string) => `open-in-app/icon/${appId}`,
    t,
  };
  return { props, launch, choose, report };
}
describe("OpenInAppAction visibility", () => {
  it("advertises the configured workspace accelerator", async () => {
    await act(async () =>
      render(
        h(
          OpenInAppAction,
          {
            ...bench({
              apps: ["finder"],
              absolutePath: "/w",
              shortcuts: [
                {
                  id: "workspace.openLocal" as ShortcutCommandId,
                  label: "Open",
                  aliases: [],
                  binding: null,
                  keys: ["Ctrl", "O"],
                  aria: "Control+O",
                  modified: true,
                  conflicts: [],
                  issue: null,
                },
              ],
            }).props,
          },
          undefined,
        ),
      ),
    );
    expect(
      screen
        .getByRole("button", { name: t("open.title", { app: zh["app.finder"] }) })
        .getAttribute("aria-keyshortcuts"),
    ).toBe("Control+O");
  });
  it("renders nothing before availability arrives, with no apps, and for unnameable ids", async () => {
    for (const over of [
      { apps: null, absolutePath: "/w" },
      { apps: [], absolutePath: "/w" },
      { apps: [], choice: "vscode", absolutePath: "/w" },
      { apps: ["someday-an-app"], absolutePath: "/w" },
    ] as const) {
      const { container } = await act(async () =>
        render(h(OpenInAppAction, { ...bench(over).props }, undefined)),
      );
      expect(container.firstElementChild).toBeNull();
      cleanup();
    }
  });
  it("shows the remembered choice, falling back to the first available app when it is gone", async () => {
    await act(async () =>
      render(
        h(
          OpenInAppAction,
          { ...bench({ apps: ["finder", "cursor"], choice: "cursor", absolutePath: "/w" }).props },
          undefined,
        ),
      ),
    );
    expect(
      screen
        .getByRole("button", { name: t("open.title", { app: zh["app.cursor"] }) })
        .querySelector("img")
        ?.getAttribute("src"),
    ).toBe("open-in-app/icon/cursor");
    cleanup();
    await act(async () =>
      render(
        h(
          OpenInAppAction,
          { ...bench({ apps: ["finder", "cursor"], choice: "vscode", absolutePath: "/w" }).props },
          undefined,
        ),
      ),
    );
    expect(
      screen
        .getByRole("button", { name: t("open.title", { app: zh["app.finder"] }) })
        .querySelector("img")
        ?.getAttribute("src"),
    ).toBe("open-in-app/icon/finder");
  });
});
describe("OpenInAppAction launching", () => {
  it("disables both buttons and ignores duplicate gestures until the launch settles", async () => {
    const pending = Promise.withResolvers<undefined>();
    const b = bench({
      apps: ["finder", "cursor"],
      absolutePath: "/w/dir",
      launch: () => pending.promise,
    });
    const view = await act(async () => render(h(OpenInAppAction, { ...b.props }, undefined)));
    const main = screen.getByRole("button", { name: t("open.title", { app: zh["app.finder"] }) });
    await act(async () => fireEvent.click(main));
    expect(main).toHaveProperty("disabled", true);
    expect(screen.getByRole("button", { name: zh["path.more"] })).toHaveProperty("disabled", true);
    await act(async () => fireEvent.click(main));
    expect(b.launch).toHaveBeenCalledOnce();
    expect(view.container.querySelector("[data-open-target]")?.getAttribute("data-state")).toBe(
      "busy",
    );
    await act(async () => {
      pending.resolve(undefined);
    });
    await vi.waitFor(() => {
      expect(main).toHaveProperty("disabled", false);
    });
    expect(b.report).toHaveBeenCalledWith({ kind: "opened" });
  });
  it("reports a dropped gesture without remembering its application", async () => {
    const b = bench({ apps: ["finder", "cursor"], absolutePath: "/w/dir" });
    await act(async () =>
      render(
        h(
          OpenInAppAction,
          { ...b.props, launch: async () => ({ kind: "skipped" as const }) },
          undefined,
        ),
      ),
    );
    await act(async () => fireEvent.click(screen.getByRole("button", { name: zh["path.more"] })));
    await act(async () => {
      await act(async () => fireEvent.click(screen.getByRole("menuitem", { name: "Cursor" })));
    });
    expect(b.report).toHaveBeenCalledWith({ kind: "skipped" });
    expect(b.choose).not.toHaveBeenCalled();
  });
  it("reports a launch failure without changing the remembered application", async () => {
    const b = bench({
      apps: ["finder", "cursor"],
      absolutePath: "/w",
      launch: async () => {
        throw new Error("gone");
      },
    });
    await act(async () => render(h(OpenInAppAction, { ...b.props }, undefined)));
    await act(async () => fireEvent.click(screen.getByRole("button", { name: zh["path.more"] })));
    await act(async () => {
      await act(async () => fireEvent.click(screen.getByRole("menuitem", { name: "Cursor" })));
    });
    expect(b.report).toHaveBeenCalledWith({ kind: "failed", failure: "openError" });
    expect(b.choose).not.toHaveBeenCalled();
    expect(screen.queryByRole("alert")).toBeNull();
  });
  it("lists only applications, marks the remembered default, and remembers a successful choice", async () => {
    const b = bench({ apps: ["finder", "cursor", "terminal"], absolutePath: "/w/dir" });
    await act(async () => render(h(OpenInAppAction, { ...b.props }, undefined)));
    await act(async () => fireEvent.click(screen.getByRole("button", { name: zh["path.more"] })));
    expect(screen.getAllByRole("menuitem").map((item) => item.textContent)).toEqual([
      "访达（默认）",
      "Cursor",
      "终端",
    ]);
    expect(screen.queryByText(zh["path.reveal"])).toBeNull();
    await act(async () => {
      await act(async () => fireEvent.click(screen.getByRole("menuitem", { name: "Cursor" })));
    });
    expect(b.launch).toHaveBeenCalledWith("cursor", "/w/dir");
    expect(b.choose).toHaveBeenCalledWith("cursor");
    expect(b.report).toHaveBeenCalledWith({ kind: "opened" });
  });
  it("closes on Escape without launching and falls back after an icon fails", async () => {
    const b = bench({ apps: ["finder", "terminal"], absolutePath: "/w" });
    const view = await act(async () => render(h(OpenInAppAction, { ...b.props }, undefined)));
    await act(async () => fireEvent.click(screen.getByRole("button", { name: zh["path.more"] })));
    await act(async () => fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" }));
    expect(screen.queryByRole("menu")).toBeNull();
    expect(b.launch).not.toHaveBeenCalled();
    const image = view.container.querySelector("img")!;
    await act(async () => fireEvent.error(image));
    expect(view.container.querySelector("img")).toBeNull();
    expect(view.container.querySelector("svg")).not.toBeNull();
  });
  it("names the selected application in both the button and tooltip", async () => {
    await act(async () =>
      render(
        h(OpenInAppAction, { ...bench({ apps: ["finder"], absolutePath: "/w" }).props }, undefined),
      ),
    );
    await act(async () =>
      fireEvent.pointerEnter(
        screen.getByRole("button", { name: t("open.title", { app: zh["app.finder"] }) }),
      ),
    );
    expect(await screen.findByText(t("open.title", { app: zh["app.finder"] }))).toBeTruthy();
  });
});
it("omits the dropdown when only one directory application is available", async () => {
  await act(async () =>
    render(
      h(OpenInAppAction, { ...bench({ apps: ["finder"], absolutePath: "/w" }).props }, undefined),
    ),
  );
  expect(screen.getAllByRole("button")).toHaveLength(1);
  expect(screen.queryByRole("button", { name: zh["path.more"] })).toBeNull();
});
it("opens the displayed directory and follows its changes", async () => {
  const b = bench({ apps: ["finder"], absolutePath: "/displayed-directory" });
  const view = await act(async () =>
    render(h(OpenInAppAction, { ...b.props, absolutePath: "/displayed-directory" }, undefined)),
  );
  await act(async () => {
    await act(async () => fireEvent.click(screen.getByRole("button")));
  });
  expect(b.launch).toHaveBeenLastCalledWith("finder", "/displayed-directory");
  await act(async () =>
    view.rerender(
      h(OpenInAppAction, { ...b.props, absolutePath: "/another-directory" }, undefined),
    ),
  );
  await act(async () => {
    await act(async () => fireEvent.click(screen.getByRole("button")));
  });
  expect(b.launch).toHaveBeenLastCalledWith("finder", "/another-directory");
});
