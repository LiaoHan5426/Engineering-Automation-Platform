import { nextTick } from "vue";
import { h } from "vue";
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { act, cleanup, fireEvent, render, screen } from "./content-render.ts";
type ComponentProps<
  T extends abstract new (...args: never[]) => {
    $props: unknown;
  },
> = InstanceType<T>["$props"];
import {
  DEFAULT_TERMINAL_MAX_LINES,
  TerminalBlock as LocalizedTerminalBlock,
} from "../src/index.ts";
import { writeClipboard } from "../src/clipboard.ts";
import { terminalBlockLabels } from "./labels.client.ts";
function TerminalBlock(props: Omit<ComponentProps<typeof LocalizedTerminalBlock>, "labels">) {
  return h(LocalizedTerminalBlock, { ...props, labels: terminalBlockLabels });
}
const ESC = "\u001b";
afterEach(cleanup);
beforeEach(() => {
  vi.useRealTimers();
});
function outputLines(container: HTMLElement): string[] {
  return [...container.querySelectorAll('[class^="_line_"]')].map((row) => row.textContent ?? "");
}
function runStateOf(container: HTMLElement): {
  state: string | null;
  label: string | undefined;
} {
  const dot = container.querySelector('[class*="_runState_"][data-state]');
  return {
    state: dot?.getAttribute("data-state") ?? null,
    label: container.querySelector('[class^="_runStateLabel_"]')?.textContent ?? undefined,
  };
}
function promptRows(container: HTMLElement): string[] {
  return [...container.querySelectorAll('[class^="_promptLine_"]')].map((row) =>
    (row.textContent ?? "").trim(),
  );
}
function body(count: number): string {
  return Array.from({ length: count }, (_value, index) => `line ${index + 1}`).join("\n");
}
describe("TerminalBlock prompt label", () => {
  it("collapses the home directory itself to ~", async () => {
    render(h(TerminalBlock, { command: "ls", cwd: "/Users/me", home: "/Users/me" }));
    await nextTick();
    await nextTick();
    expect(screen.getByText("~")).toBeTruthy();
  });
  it("shows only the last segment below home", async () => {
    render(h(TerminalBlock, { command: "ls", cwd: "/Users/me/Documents", home: "/Users/me" }));
    await nextTick();
    await nextTick();
    expect(screen.getByText("Documents")).toBeTruthy();
  });
  it("ignores trailing separators on both the cwd and home", async () => {
    const view = render(h(TerminalBlock, { command: "ls", cwd: "/Users/me/", home: "/Users/me" }));
    await nextTick();
    await nextTick();
    expect(view.getByText("~")).toBeTruthy();
    view.rerender(h(TerminalBlock, { command: "ls", cwd: "/Users/me", home: "/Users/me/" }));
    await nextTick();
    await nextTick();
    expect(view.getByText("~")).toBeTruthy();
  });
  it("drops trailing separators before taking the last segment", async () => {
    render(h(TerminalBlock, { command: "ls", cwd: "/Users/me/Documents///", home: "/Users/me" }));
    await nextTick();
    await nextTick();
    expect(screen.getByText("Documents")).toBeTruthy();
  });
  it("takes the last segment when no home is known", async () => {
    render(h(TerminalBlock, { command: "ls", cwd: "C:\\Users\\me\\Projects" }));
    await nextTick();
    await nextTick();
    expect(screen.getByText("Projects")).toBeTruthy();
  });
  it("collapses a backslash home path to ~", async () => {
    render(h(TerminalBlock, { command: "ls", cwd: "C:\\Users\\me", home: "C:\\Users\\me" }));
    await nextTick();
    await nextTick();
    expect(screen.getByText("~")).toBeTruthy();
  });
  it("falls back to the raw path when it has no segment", async () => {
    render(h(TerminalBlock, { command: "ls", cwd: "/", home: "/Users/me" }));
    await nextTick();
    await nextTick();
    expect(screen.getByText("/")).toBeTruthy();
  });
  it("renders a plain $ with no cwd", async () => {
    render(h(TerminalBlock, { command: "ls" }));
    await nextTick();
    await nextTick();
    expect(screen.getByText("$")).toBeTruthy();
  });
  it("renders the command verbatim after the label", async () => {
    render(h(TerminalBlock, { command: "git log --oneline | head -3", cwd: "/Users/me/app" }));
    await nextTick();
    await nextTick();
    expect(screen.getByText("git log --oneline | head -3")).toBeTruthy();
  });
});
describe("TerminalBlock states", () => {
  it.each([
    { output: undefined, running: false, exitCode: undefined },
    { output: "launch acknowledgement", running: false, exitCode: 7, signal: "SIGTERM" },
    { output: "launch acknowledgement", running: false, exitCode: 0 },
    { output: "", running: false, exitCode: 0 },
  ])("background suppresses execution presentation for %j", async (execution) => {
    const view = render(
      h(TerminalBlock, {
        command: "worker --watch\nprintf ready\n",
        cwd: "/workspace/app",
        background: true,
        ...execution,
      }),
    );
    await nextTick();
    await nextTick();
    expect(promptRows(view.container)).toEqual(["appworker --watch", "$printf ready"]);
    await nextTick();
    expect(runStateOf(view.container)).toEqual({ state: null, label: undefined });
    await nextTick();
    expect(outputLines(view.container)).toEqual([]);
    await nextTick();
    expect(view.queryByText("launch acknowledgement")).toBeNull();
    await nextTick();
    expect(view.queryByText("无输出")).toBeNull();
    await nextTick();
    expect(view.queryByText("信号 SIGTERM")).toBeNull();
    await nextTick();
    expect(view.queryByRole("button")).toBeNull();
    await nextTick();
    expect(view.container.firstElementChild?.hasAttribute("data-running")).toBe(false);
    await nextTick();
    expect(view.container.firstElementChild?.hasAttribute("data-body")).toBe(false);
  });
  it("keeps command and prompt DOM when a background launch returns", async () => {
    const view = render(
      h(TerminalBlock, {
        command: "worker --watch",
        cwd: "/workspace/app",
        background: true,
        running: true,
      }),
    );
    await nextTick();
    const command = view.container.querySelector("[data-command-text]");
    await nextTick();
    expect(runStateOf(view.container).state).toBe("ongoing");
    view.rerender(
      h(TerminalBlock, { command: "worker --watch", cwd: "/workspace/app", background: true }),
    );
    await nextTick();
    await nextTick();
    expect(view.container.querySelector("[data-command-text]")).toBe(command);
    await nextTick();
    expect(runStateOf(view.container)).toEqual({ state: null, label: undefined });
    await nextTick();
    expect(view.queryByText("无输出")).toBeNull();
    await nextTick();
    expect(view.queryByRole("button")).toBeNull();
  });
  it("keeps an explicit copyText override available in background mode", async () => {
    const view = render(
      h(TerminalBlock, { command: "worker", background: true, copyText: "explicit copy" }),
    );
    await nextTick();
    await nextTick();
    expect(view.getByRole("button", { name: "复制" })).toBeTruthy();
    await nextTick();
    expect(view.queryByText("无输出")).toBeNull();
    await nextTick();
    expect(runStateOf(view.container)).toEqual({ state: null, label: undefined });
  });
  it("running with no output shows the command line only: no output box, no placeholder, no copy", async () => {
    const view = render(h(TerminalBlock, { command: "sleep 5", running: true }));
    await nextTick();
    await nextTick();
    expect(view.getByText("sleep 5")).toBeTruthy();
    await nextTick();
    expect(outputLines(view.container)).toEqual([]);
    await nextTick();
    expect(view.queryByText("无输出")).toBeNull();
    await nextTick();
    expect(view.queryByRole("button")).toBeNull();
    await nextTick();
    expect(view.container.firstElementChild?.getAttribute("data-running")).toBe("");
    await nextTick();
    // Banner-only: no body, so no banner divider either.
    expect(view.container.firstElementChild?.getAttribute("data-body")).toBeNull();
  });
  it("copyText overrides the copy payload and keeps the control before any output", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    const view = render(
      h(TerminalBlock, {
        command: "npm run build --verbose",
        running: true,
        copyText: "npm run build --verbose",
      }),
    );
    await nextTick();
    // No output yet, but the command is already copyable.
    const button = view.getByRole("button", { name: "复制" });
    await act(async () => {
      await fireEvent.click(button);
    });
    await nextTick();
    expect(writeText).toHaveBeenCalledWith("npm run build --verbose");
  });
  it("omits the run-state dot and its assistive label when the host carries the state", async () => {
    const view = render(
      h(TerminalBlock, {
        command: "sleep 5",
        running: true,
        output: "partial",
        runStateDot: false,
      }),
    );
    await nextTick();
    await nextTick();
    expect(view.container.querySelector('[class*="runState"]')).toBeNull();
    await nextTick();
    expect(view.queryByText("运行中")).toBeNull();
  });
  it("running with supplied output streams the live text without a default copy control", async () => {
    const view = render(h(TerminalBlock, { command: "sleep 5", running: true, output: "partial" }));
    await nextTick();
    await nextTick();
    expect(view.getByText("partial")).toBeTruthy();
    await nextTick();
    expect(view.queryByText("无输出")).toBeNull();
    await nextTick();
    expect(view.queryByRole("button", { name: "复制" })).toBeNull();
    await nextTick();
    expect(view.container.firstElementChild?.getAttribute("data-running")).toBe("");
    await nextTick();
    // Live output renders a body, so the banner divider returns.
    expect(view.container.firstElementChild?.getAttribute("data-body")).toBe("");
  });
  it("running with an empty live stream draws neither output nor placeholder", async () => {
    const view = render(h(TerminalBlock, { command: "tail -f log", running: true, output: "" }));
    await nextTick();
    await nextTick();
    expect(outputLines(view.container)).toEqual([]);
    await nextTick();
    expect(view.queryByText("无输出")).toBeNull();
    await nextTick();
    expect(view.queryByRole("button")).toBeNull();
  });
  it("running still shows a settled-looking status pill when one is supplied", async () => {
    render(h(TerminalBlock, { command: "sleep 5", running: true, signal: "SIGINT" }));
    await nextTick();
    await nextTick();
    expect(screen.getByText("信号 SIGINT")).toBeTruthy();
  });
  it("settled with whitespace-only output shows the dimmed placeholder", async () => {
    const view = render(h(TerminalBlock, { command: "true", output: "  \n ", exitCode: 0 }));
    await nextTick();
    await nextTick();
    expect(view.getByText("无输出")).toBeTruthy();
    await nextTick();
    expect(view.queryByRole("button", { name: "复制" })).toBeNull();
  });
  it("settled with absent output shows the placeholder", async () => {
    render(h(TerminalBlock, { command: "true", exitCode: 0 }));
    await nextTick();
    await nextTick();
    expect(screen.getByText("无输出")).toBeTruthy();
  });
  it("settled with an empty string shows the placeholder", async () => {
    render(h(TerminalBlock, { command: "true", output: "", exitCode: 0 }));
    await nextTick();
    await nextTick();
    expect(screen.getByText("无输出")).toBeTruthy();
  });
  it("treats output that renders nothing visible as empty", async () => {
    // A lone reset, an OSC title, an erase: all survive `text.trim()` yet parse
    // to nothing. Judging emptiness on the raw text drew a box of blank rows
    // plus a copy control for invisible bytes, and hid the placeholder.
    const view = render(h(TerminalBlock, { command: "true", output: `${ESC}[0m`, exitCode: 0 }));
    await nextTick();
    await nextTick();
    expect(view.getByText("无输出")).toBeTruthy();
    await nextTick();
    expect(view.queryByText("复制")).toBeNull();
    view.rerender(
      h(TerminalBlock, { command: "true", output: `${ESC}]0;title${ESC}\\`, exitCode: 0 }),
    );
    await nextTick();
    await nextTick();
    expect(view.getByText("无输出")).toBeTruthy();
  });
  it("merges className onto the wrapper", async () => {
    const view = render(h(TerminalBlock, { command: "ls", className: "x", output: "a" }));
    await nextTick();
    await nextTick();
    expect(view.container.firstElementChild?.classList.contains("x")).toBe(true);
    await nextTick();
    expect(view.container.firstElementChild?.hasAttribute("data-running")).toBe(false);
  });
  it("drops the output text terminator instead of drawing a blank line", async () => {
    const view = render(h(TerminalBlock, { command: "ls", output: "a\nb\n" }));
    await nextTick();
    await nextTick();
    expect(outputLines(view.container)).toEqual(["a", "b"]);
  });
  it("drops the output terminator even when a reset follows the final newline", async () => {
    // `line\n\x1b[0m` does not end in a newline as a string, yet its last parsed
    // line holds nothing visible — a common shape, since tools close their color
    // after the last line. Judging the terminator on the raw text added a blank
    // row and inflated both the card height and the collapse count.
    const view = render(h(TerminalBlock, { command: "ls", output: `a\nb\n${ESC}[0m` }));
    await nextTick();
    await nextTick();
    expect(outputLines(view.container)).toEqual(["a", "b"]);
  });
  it("keeps a genuinely blank final line when the output ends with two newlines", async () => {
    const view = render(h(TerminalBlock, { command: "ls", output: "a\nb\n\n" }));
    await nextTick();
    await nextTick();
    expect(outputLines(view.container)).toEqual(["a", "b", ""]);
  });
  it("renders ANSI runs as styled spans and plain text bare", async () => {
    const view = render(h(TerminalBlock, { command: "ls", output: `${ESC}[31mbad${ESC}[39m ok` }));
    await nextTick();
    // Scoped to a line: the prompt line's run-state dot is a styled span too.
    const span = view.container.querySelector('[class^="_line_"] span[style]');
    await nextTick();
    expect(span?.textContent).toBe("bad");
    await nextTick();
    expect(span?.getAttribute("style")).toContain("--dsw-alias-state-error-primary");
    await nextTick();
    expect(outputLines(view.container)).toEqual(["bad ok"]);
  });
  it("renders uncolored output with no span wrappers at all", async () => {
    const view = render(h(TerminalBlock, { command: "ls", output: "plain one\nplain two\n" }));
    await nextTick();
    await nextTick();
    expect(view.container.querySelectorAll('[class^="_line_"] span')).toHaveLength(0);
  });
});
describe("TerminalBlock status pill", () => {
  it("renders no pill for a clean exit", async () => {
    const view = render(h(TerminalBlock, { command: "true", output: "a", exitCode: 0 }));
    await nextTick();
    await nextTick();
    expect(view.queryByText(/退出码|信号/u)).toBeNull();
  });
  it("renders no pill while the exit status is unknown", async () => {
    const view = render(h(TerminalBlock, { command: "ls", output: "a" }));
    await nextTick();
    await nextTick();
    expect(view.queryByText(/退出码|信号/u)).toBeNull();
  });
  it("renders the exit-code pill for a non-zero exit", async () => {
    render(h(TerminalBlock, { command: "false", output: "a", exitCode: 1 }));
    await nextTick();
    await nextTick();
    expect(screen.getByText("退出码 1")).toBeTruthy();
  });
  it("renders the no-exit-code pill and the error dot for a command that settled without one", async () => {
    const view = render(
      h(TerminalBlock, { command: "pnpm add x", output: "spawn pnpm ENOENT", exitCode: null }),
    );
    await nextTick();
    await nextTick();
    expect(view.getByText("未正常退出")).toBeTruthy();
    await nextTick();
    expect(runStateOf(view.container)).toEqual({ state: "error", label: "失败" });
  });
  it("renders the signal pill, which outranks the exit code", async () => {
    render(h(TerminalBlock, { command: "sleep 9", output: "a", exitCode: 0, signal: "SIGKILL" }));
    await nextTick();
    await nextTick();
    expect(screen.getByText("信号 SIGKILL")).toBeTruthy();
    await nextTick();
    expect(screen.queryByText(/退出码/u)).toBeNull();
  });
});
describe("TerminalBlock run-state dot", () => {
  it("shows the running chase and its running label while the command runs", async () => {
    const view = render(h(TerminalBlock, { command: "sleep 5", running: true }));
    await nextTick();
    await nextTick();
    expect(runStateOf(view.container)).toEqual({ state: "ongoing", label: "运行中" });
  });
  it("shows the done dot for a clean settled exit", async () => {
    const view = render(h(TerminalBlock, { command: "true", output: "a", exitCode: 0 }));
    await nextTick();
    await nextTick();
    expect(runStateOf(view.container)).toEqual({ state: "done", label: "已完成" });
  });
  it("counts a settled command with no exit status as a clean settle", async () => {
    const view = render(h(TerminalBlock, { command: "ls", output: "a" }));
    await nextTick();
    await nextTick();
    expect(runStateOf(view.container)).toEqual({ state: "done", label: "已完成" });
  });
  it("shows the error dot for a non-zero exit", async () => {
    const view = render(h(TerminalBlock, { command: "false", output: "a", exitCode: 1 }));
    await nextTick();
    await nextTick();
    expect(runStateOf(view.container)).toEqual({ state: "error", label: "失败" });
  });
  it("shows the error dot for a signal, whatever the exit code says", async () => {
    const view = render(
      h(TerminalBlock, { command: "sleep 9", output: "a", exitCode: 0, signal: "SIGKILL" }),
    );
    await nextTick();
    await nextTick();
    expect(runStateOf(view.container)).toEqual({ state: "error", label: "失败" });
  });
  // The dot precedes the prompt label, which is what makes it read as the
  // state OF this command rather than of the card's chrome.
  it("places the dot ahead of the prompt label and the command", async () => {
    const view = render(h(TerminalBlock, { command: "ls", cwd: "/srv/app", output: "a" }));
    await nextTick();
    const row = view.container.querySelector('[class^="_promptLine_"]');
    await nextTick();
    expect([...row!.children].map((node) => node.textContent)).toEqual(["", "app", "ls"]);
  });
  // The cwd labels the call, not each line: a `cd` in the command moves later
  // lines elsewhere, so repeating the label would state a directory per line
  // that the view does not know.
  it("labels only the first row with the cwd, leaving later rows a bare $", async () => {
    const view = render(
      h(TerminalBlock, { command: "cd ~\nls", cwd: "/srv/app", output: "a", exitCode: 0 }),
    );
    await nextTick();
    await nextTick();
    expect(promptRows(view.container)).toEqual(["appcd ~", "$ls"]);
  });
  it("gives a multi-line command one row per line", async () => {
    const view = render(
      h(TerminalBlock, { command: "echo one\necho two", output: "a", exitCode: 0 }),
    );
    await nextTick();
    await nextTick();
    expect(promptRows(view.container)).toEqual(["$echo one", "$echo two"]);
  });
  // A heredoc or an editor-authored command commonly ends in a newline; that
  // terminator is not a further, empty command to draw a row for.
  it("drops a trailing newline instead of drawing an empty final row", async () => {
    const view = render(
      h(TerminalBlock, { command: "echo one\necho two\n", output: "a", exitCode: 0 }),
    );
    await nextTick();
    await nextTick();
    expect(promptRows(view.container)).toEqual(["$echo one", "$echo two"]);
  });
  it("keeps a genuinely blank command line when the command ends with two newlines", async () => {
    const view = render(h(TerminalBlock, { command: "echo one\n\n", output: "a", exitCode: 0 }));
    await nextTick();
    await nextTick();
    expect(promptRows(view.container)).toEqual(["$echo one", "$"]);
  });
  // The exit status the view carries is the whole call's — bash reports no
  // per-command status — so exactly one dot and one label are correct however
  // many lines the command spans. A dot per row would assert, of a line that
  // succeeded inside a failing call, that the line itself failed.
  it("marks the call once, on the first row, never per line", async () => {
    const view = render(
      h(TerminalBlock, { command: "true\nfalse\ntrue", output: "x", exitCode: 1 }),
    );
    await nextTick();
    await nextTick();
    expect(view.container.querySelectorAll('[class*="_runState_"][data-state]')).toHaveLength(1);
    await nextTick();
    expect(view.container.querySelectorAll('[class^="_runStateLabel_"]')).toHaveLength(1);
    await nextTick();
    expect(runStateOf(view.container)).toEqual({ state: "error", label: "失败" });
    const rows = view.container.querySelectorAll('[class^="_promptLine_"]');
    await nextTick();
    expect(rows[0]!.querySelector("[data-state]")).not.toBeNull();
    await nextTick();
    expect(rows[1]!.querySelector("[data-state]")).toBeNull();
    await nextTick();
    expect(rows[2]!.querySelector("[data-state]")).toBeNull();
  });
  it("keeps the running dot even while a settled-looking status pill is supplied", async () => {
    const view = render(h(TerminalBlock, { command: "sleep 5", running: true, signal: "SIGINT" }));
    await nextTick();
    await nextTick();
    expect(runStateOf(view.container)).toEqual({ state: "ongoing", label: "运行中" });
  });
});
describe("TerminalBlock height cap", () => {
  it("renders every line and no expand control under the cap", async () => {
    const view = render(h(TerminalBlock, { command: "ls", output: body(4), maxLines: 4 }));
    await nextTick();
    await nextTick();
    expect(outputLines(view.container)).toHaveLength(4);
    await nextTick();
    expect(view.container.querySelector("[aria-expanded]")).toBeNull();
  });
  it("does not count the output terminator against the cap", async () => {
    const view = render(h(TerminalBlock, { command: "ls", output: `${body(4)}\n`, maxLines: 4 }));
    await nextTick();
    await nextTick();
    expect(outputLines(view.container)).toHaveLength(4);
    await nextTick();
    expect(view.container.querySelector("[aria-expanded]")).toBeNull();
  });
  it("slices head and tail over the cap and expands on click", async () => {
    const view = render(h(TerminalBlock, { command: "ls", output: body(10), maxLines: 4 }));
    await nextTick();
    await nextTick();
    // maxLines 4: head = ceil(4/2) = 2, tail = 4 - 2 = 2, 6 hidden.
    expect(outputLines(view.container)).toEqual(["line 1", "line 2", "line 9", "line 10"]);
    const toggle = view.getByRole("button", { name: "展开其余 6 行输出" });
    await nextTick();
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    await nextTick();
    expect(toggle.textContent).toBe("… 其余 6 行");
    await fireEvent.click(toggle);
    await nextTick();
    expect(outputLines(view.container)).toHaveLength(10);
    const collapse = view.getByRole("button", { name: "收起输出" });
    await nextTick();
    expect(collapse.getAttribute("aria-expanded")).toBe("true");
    await nextTick();
    expect(collapse.textContent).toBe("收起");
    await fireEvent.click(collapse);
    await nextTick();
    expect(outputLines(view.container)).toEqual(["line 1", "line 2", "line 9", "line 10"]);
  });
  it("renders the head slice alone when the cap leaves no tail", async () => {
    const view = render(h(TerminalBlock, { command: "ls", output: body(5), maxLines: 1 }));
    await nextTick();
    await nextTick();
    expect(outputLines(view.container)).toEqual(["line 1"]);
    await nextTick();
    expect(view.getByRole("button", { name: "展开其余 4 行输出" })).toBeTruthy();
  });
  it("caps at the documented default when maxLines is absent", async () => {
    const view = render(
      h(TerminalBlock, { command: "ls", output: body(DEFAULT_TERMINAL_MAX_LINES + 1) }),
    );
    await nextTick();
    await nextTick();
    expect(outputLines(view.container)).toHaveLength(DEFAULT_TERMINAL_MAX_LINES);
    await nextTick();
    expect(view.getByRole("button", { name: "展开其余 1 行输出" })).toBeTruthy();
  });
});
describe("TerminalBlock copy", () => {
  it("copies the raw output, never the prompt line or the pill", async () => {
    vi.useFakeTimers();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    const output = `${ESC}[31mbad${ESC}[39m\n`;
    render(
      h(TerminalBlock, { command: "make", cwd: "/Users/me/app", output: output, exitCode: 2 }),
    );
    await nextTick();
    await fireEvent.click(screen.getByRole("button", { name: "复制" }));
    await nextTick();
    // Escape codes, the newline terminator, and nothing of the chrome around them.
    expect(writeText).toHaveBeenCalledWith(output);
    await act(async () => {
      await Promise.resolve();
    });
    await nextTick();
    expect(screen.getByRole("button", { name: "复制成功" })).toBeTruthy();
    // While the ok label is showing, further clicks are no-ops.
    await fireEvent.click(screen.getByRole("button", { name: "复制成功" }));
    await nextTick();
    expect(writeText).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1000);
    await nextTick();
    expect(screen.getByRole("button", { name: "复制" })).toBeTruthy();
  });
  it("copies the whole output while the height cap hides its middle", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    const output = `${body(10)}\n`;
    render(h(TerminalBlock, { command: "ls", output: output, maxLines: 4, exitCode: 0 }));
    await nextTick();
    await fireEvent.click(screen.getByRole("button", { name: "复制" }));
    await nextTick();
    expect(writeText).toHaveBeenCalledWith(output);
    await nextTick();
    expect(await screen.findByRole("button", { name: "复制成功" })).toBeTruthy();
  });
  it("does not claim success when the host refuses the write", async () => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: vi.fn().mockRejectedValue(new Error("denied")) },
    });
    render(h(TerminalBlock, { command: "ls", output: "a" }));
    await nextTick();
    await fireEvent.click(screen.getByRole("button", { name: "复制" }));
    await act(async () => {
      await Promise.resolve();
    });
    await nextTick();
    expect(screen.getByRole("button", { name: "复制" })).toBeTruthy();
    await nextTick();
    expect(screen.queryByRole("button", { name: "复制成功" })).toBeNull();
  });
});
describe("writeClipboard", () => {
  it("reports true after the async Clipboard API accepts the exact text", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    await expect(writeClipboard("payload")).resolves.toBe(true);
    await nextTick();
    expect(writeText).toHaveBeenCalledWith("payload");
  });
  it("reports false when the Clipboard API rejects and no fallback exists", async () => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: vi.fn().mockRejectedValue(new Error("denied")) },
    });
    Object.defineProperty(document, "execCommand", { configurable: true, value: undefined });
    await expect(writeClipboard("payload")).resolves.toBe(false);
  });
  it("falls back to execCommand when the Clipboard API rejects", async () => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: vi.fn().mockRejectedValue(new Error("denied")) },
    });
    let selected: string | undefined;
    const exec = vi.fn(() => {
      selected = document.querySelector<HTMLTextAreaElement>("textarea[readonly]")?.value;
      return true;
    });
    Object.defineProperty(document, "execCommand", { configurable: true, value: exec });
    await expect(writeClipboard("payload")).resolves.toBe(true);
    await nextTick();
    expect(exec).toHaveBeenCalledWith("copy");
    await nextTick();
    expect(selected).toBe("payload");
    await nextTick();
    expect(document.querySelector("textarea")).toBeNull();
  });
  it("selects a detached textarea for the execCommand fallback and removes it after", async () => {
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: undefined });
    let selected: string | undefined;
    const exec = vi.fn(() => {
      selected = document.querySelector<HTMLTextAreaElement>("textarea[readonly]")?.value;
      return true;
    });
    Object.defineProperty(document, "execCommand", { configurable: true, value: exec });
    await expect(writeClipboard("payload")).resolves.toBe(true);
    await nextTick();
    expect(exec).toHaveBeenCalledWith("copy");
    await nextTick();
    expect(selected).toBe("payload");
    await nextTick();
    expect(document.querySelector("textarea")).toBeNull();
  });
  it("returns focus to the copy control after the execCommand fallback", async () => {
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: undefined });
    Object.defineProperty(document, "execCommand", {
      configurable: true,
      value: vi.fn(() => true),
    });
    const button = document.createElement("button");
    document.body.appendChild(button);
    button.focus();
    await expect(writeClipboard("payload")).resolves.toBe(true);
    await nextTick();
    expect(document.activeElement).toBe(button);
    button.remove();
  });
  it("copies through the fallback when nothing had focus", async () => {
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: undefined });
    Object.defineProperty(document, "execCommand", {
      configurable: true,
      value: vi.fn(() => true),
    });
    const activeElement = vi.spyOn(document, "activeElement", "get").mockReturnValue(null);
    await expect(writeClipboard("payload")).resolves.toBe(true);
    activeElement.mockRestore();
  });
  it("reports execCommand's own refusal verbatim", async () => {
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: undefined });
    Object.defineProperty(document, "execCommand", {
      configurable: true,
      value: vi.fn(() => false),
    });
    await expect(writeClipboard("payload")).resolves.toBe(false);
  });
  it("reports false and still removes the textarea when execCommand throws", async () => {
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: undefined });
    Object.defineProperty(document, "execCommand", {
      configurable: true,
      value: () => {
        throw new Error("denied");
      },
    });
    await expect(writeClipboard("payload")).resolves.toBe(false);
    await nextTick();
    expect(document.querySelector("textarea")).toBeNull();
  });
  it("reports false on a host with neither clipboard path", async () => {
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: undefined });
    Object.defineProperty(document, "execCommand", { configurable: true, value: undefined });
    await expect(writeClipboard("payload")).resolves.toBe(false);
  });
  it("reports false when navigator.clipboard exists without writeText", async () => {
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: {} });
    Object.defineProperty(document, "execCommand", { configurable: true, value: undefined });
    await expect(writeClipboard("payload")).resolves.toBe(false);
  });
});
