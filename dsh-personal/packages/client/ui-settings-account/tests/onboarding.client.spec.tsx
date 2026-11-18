import { h, shallowRef, computed } from "vue";
// @vitest-environment jsdom
import { contextMenuHook } from "@deepseek-ai/dsh-client-test-runtime";
/** The credential onboarding step owns login until dismissal or completion. */
import { fireEvent, screen } from "@testing-library/dom";
import { act, cleanup, render } from "../../../test-support/client-runtime/src/vue-test.ts";
import { afterEach, expect, it, vi } from "vite-plus/test";
import type { GlobalStandardProps } from "@deepseek-ai/dsh-client-ui-slots";
import type { ThemeSnapshot } from "@deepseek-ai/dsh-client-ui-theme/client";
import { AccountOnboarding } from "../src/client/AccountOnboarding.tsx";
import type { AccountSnapshot } from "../src/client/AccountSection.tsx";
import { allowAllAccess, makeTranslate } from "@deepseek-ai/dsh-client-test-runtime";
import { en } from "../src/client/locales.ts";
afterEach(cleanup);
const theme: ThemeSnapshot = {
  preference: "light",
  fontSizes: { text: 14, code: 11, terminal: 13 },
  fontFamilies: { text: "", code: "", terminal: "" },
  active: { id: "light", colorScheme: "light", tokens: {} },
  themes: [],
  revision: 0,
};
it("claims onboarding while loading, offers API key fallback, and completes after login", async () => {
  const account = shallowRef<AccountSnapshot>({
    view: undefined,
    details: undefined,
    avatar: undefined,
    failed: false,
  });
  const unused = (): never => {
    throw new Error("AccountOnboarding does not consume global hooks");
  };
  const globals: GlobalStandardProps = {
    usePanelInfo: unused,
    useSessions: unused,
    useSessionStatus: unused,
    useSessionRetainInfo: unused,
    useResource: unused,
    useWorkspaces: unused,
    ...allowAllAccess,
    useContextMenu: contextMenuHook(),
  };
  const props = {
    ...globals,
    hasRunningAccountTasks: vi.fn(async () => false),
    complete: vi.fn(),
    useApiKey: vi.fn(),
    setOnboarding: vi.fn(),
    showLogin: vi.fn(),
    useAccount: <T,>(select: (snapshot: AccountSnapshot) => T) =>
      computed(() => select(account.value)),
    useTheme: <T,>(select: (snapshot: ThemeSnapshot) => T) => computed(() => select(theme)),
    start: vi.fn(async () => {}),
    cancel: vi.fn(async () => {}),
    signOut: vi.fn(async () => {}),
    contactUs: vi.fn(),
    t: makeTranslate(en),
    refreshAccount: vi.fn(async () => {}),
    avatarFailed: vi.fn(),
  };
  const view = render(h(AccountOnboarding, { ...props }));
  expect(props.setOnboarding).toHaveBeenCalledExactlyOnceWith(true);
  expect(screen.queryByRole("dialog")).toBeNull();
  account.value = {
    ...account.value,
    view: { status: "signed-out", attempt: null, links: { usageUrl: "", topUpUrl: "" } },
  };
  await view.rerender(h(AccountOnboarding, { ...props }));
  await act(() => fireEvent.click(screen.getByRole("button", { name: en.addApiKey })));
  expect(props.showLogin).toHaveBeenLastCalledWith(false);
  expect(props.useApiKey).toHaveBeenCalledOnce();
  await act(() => fireEvent.click(screen.getByRole("button", { name: en.close })));
  expect(props.complete).toHaveBeenCalledOnce();
  account.value = {
    ...account.value,
    view: { ...account.value.view!, status: "credential-stored" },
  };
  await view.rerender(h(AccountOnboarding, { ...props }));
  expect(props.complete).toHaveBeenCalledTimes(2);
  expect(screen.queryByRole("dialog")).toBeNull();
  view.unmount();
  expect(props.setOnboarding).toHaveBeenLastCalledWith(false);
});
