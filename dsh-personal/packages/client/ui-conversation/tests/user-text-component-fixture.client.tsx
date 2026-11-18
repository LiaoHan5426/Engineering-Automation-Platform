/** Production UserText assembly for component units that supply their own outer Slot seats. */
import { Context } from "@deepseek-ai/cordis";
import { defineComponent, h, type VNodeChild } from "vue";
type ComponentProps<C> = C extends new (...args: never[]) => { $props: infer P }
  ? P
  : C extends (props: infer P) => unknown
    ? P
    : never;
import { onTestFinished } from "vite-plus/test";
import {
  bindSnapshotSelector,
  contextMenuHook,
  makeTranslate,
} from "@deepseek-ai/dsh-client-test-runtime";
import { zh as commonZh } from "@deepseek-ai/dsh-client-locale/src/locales/zh.ts";
import type { UserTextInput, UserTextNodeOwnerProps } from "../src/client/contract/slots.ts";
import type { UserTextNode } from "../src/client/contract/user-text.ts";
import { UserTextRegistry } from "../src/client/conversation/user-text-registry.ts";
import { QuotedUserText } from "@deepseek-ai/dsh-message-quotes/src/client/QuotedUserText.tsx";
import { quoteRule } from "@deepseek-ai/dsh-message-quotes/src/client/quote-rule.ts";
import { UserText, PlainUserText, SessionReference } from "../src/client/user-text/UserText.tsx";
import { sessionReferenceRule } from "../src/client/user-text/session-reference-rule.ts";
import {
  collapseWhitespaceRule,
  trimWhitespaceRule,
} from "../src/client/user-text/whitespace-rules.ts";
import { skillReferenceRule } from "../../ui-skill/src/client/user-text-rules.ts";
import { SkillReference } from "../../ui-skill/src/client/SkillReference.tsx";
import {
  fileReferenceRule,
  folderReferenceRule,
} from "../../ui-reference/src/client/user-text-rules.ts";
import { FileReference, FolderReference } from "../../ui-reference/src/client/FileReference.tsx";
import { zh as referenceZh } from "../../ui-reference/src/client/locales.ts";
import { createSecretRule } from "../../ui-secret-mask/src/client/secret-rule.ts";
import { SecretText } from "../../ui-secret-mask/src/client/SecretText.tsx";
import { goalCommandReferenceRule } from "../../ui-goal/src/client/user-text-rules.ts";
import { GoalCommandReference } from "../../ui-goal/src/client/GoalCommandReference.tsx";

/** Actions supplied by the unit's business-injection fixture, not by UserText owner data. */
interface UserTextFixtureActions {
  openFile?: (path: string) => void;
  openSkill?: (name: string) => void;
}

type UserTextProps = ComponentProps<typeof UserText>;

/** Framework seats are supplied by real Slot integration; component units fail if they consume one. */
const unusedFrameworkSeat = (): never => {
  throw new Error("Unexpected framework seat in UserText component unit");
};
/** Complete standard seats for UserText units whose behavior uses only evaluator and node slots. */
export const userTextFrameworkProps = {
  SessionProvider: defineComponent(
    (_props: import("@deepseek-ai/dsh-client-ui-slots").SessionAreaProps) => unusedFrameworkSeat,
    { props: ["session"], inheritAttrs: false },
  ),
  sessionId: "user-text-unit" as import("@deepseek-ai/dsh-session/types").SessionId,
  useSession: unusedFrameworkSeat,
  useProjection: unusedFrameworkSeat,
  useAccess: unusedFrameworkSeat,
  useConversation: unusedFrameworkSeat,
  useInput: unusedFrameworkSeat,
  inputActions: {
    setDraft: unusedFrameworkSeat,
    submit: unusedFrameworkSeat,
    insertQuote: unusedFrameworkSeat,
    captureInsertion: unusedFrameworkSeat,
    insertText: unusedFrameworkSeat,
    persistDraft: unusedFrameworkSeat,
    addAttachments: unusedFrameworkSeat,
    removeAttachment: unusedFrameworkSeat,
    pruneAttachments: unusedFrameworkSeat,
  },
  useChat: unusedFrameworkSeat,
  useTrajectory: unusedFrameworkSeat,
  useRemoteAccess: unusedFrameworkSeat,
  useSessions: unusedFrameworkSeat,
  useSessionRetainInfo: unusedFrameworkSeat,
  useSessionAccess: unusedFrameworkSeat,
  useSessionStatus: unusedFrameworkSeat,
  usePanelInfo: unusedFrameworkSeat,
  useContextMenu: unusedFrameworkSeat,
  useWorkspaces: unusedFrameworkSeat,
  useResource: unusedFrameworkSeat,
  useWorkspaceAccess: unusedFrameworkSeat,
  useFactorySlot: unusedFrameworkSeat,
};

/**
 * Bind the production evaluator and node components without replacing matching or display behavior.
 * Integration tests install the actual Slot registrations separately.
 * @param actions - reference operations owned by the surrounding test fixture.
 * @returns renderer accepting the production Factory's input fields.
 */
export function createUserTextFixture(
  actions: UserTextFixtureActions = {},
): (input: UserTextInput) => VNodeChild {
  const ctx = new Context();
  onTestFinished(async () => {
    await ctx.fiber.dispose();
  });
  const registry = new UserTextRegistry(ctx);
  for (const rule of [
    quoteRule,
    createSecretRule(),
    sessionReferenceRule,
    skillReferenceRule,
    fileReferenceRule,
    folderReferenceRule,
    goalCommandReferenceRule,
    collapseWhitespaceRule,
    trimWhitespaceRule,
  ])
    registry.register(rule);
  const useUserTextRevision = bindSnapshotSelector({
    getSnapshot: () => registry.getSnapshot(),
    subscribe: (listener) => registry.subscribe(listener),
  });
  const createUserTextEvaluator = () => registry.createEvaluator();
  const reportTransformFailure = (error: unknown): never => {
    throw error;
  };
  const openFile =
    actions.openFile ??
    (() => {
      throw new Error("This fixture has no file navigation action");
    });
  const openSkill =
    actions.openSkill ??
    (() => {
      throw new Error("This fixture has no skill navigation action");
    });
  const t = makeTranslate(referenceZh, commonZh);
  const renderSlot: UserTextProps["renderSlot"] = (
    name: string,
    input: object,
    options?: { fallback?: VNodeChild },
  ) => {
    if (name !== "conversation.user.text.node")
      throw new Error(`Unexpected UserText Slot: ${name}`);
    const owner = input as UserTextNodeOwnerProps & { node: UserTextNode };
    switch (owner.node.id) {
      // The production components only read these owner, action and locale seats in these units.
      case "quote":
        return h(QuotedUserText, owner as ComponentProps<typeof QuotedUserText>);
      case "secret":
        return h(SecretText, { ...owner, t } as ComponentProps<typeof SecretText>);
      case "text":
        return h(PlainUserText, owner as ComponentProps<typeof PlainUserText>);
      case "session":
        return h(SessionReference, owner as ComponentProps<typeof SessionReference>);
      case "file":
        return h(FileReference, {
          ...owner,
          openFile,
          t,
          useContextMenu: contextMenuHook(),
          resolveFilePath: (path: string) => path,
        } as ComponentProps<typeof FileReference>);
      case "folder":
        return h(FolderReference, owner as ComponentProps<typeof FolderReference>);
      case "skill":
        return h(SkillReference, { ...owner, openSkill } as ComponentProps<typeof SkillReference>);
      case "command":
        return h(GoalCommandReference, owner as ComponentProps<typeof GoalCommandReference>);
      default:
        return options?.fallback ?? null;
    }
  };
  const renderText = (input: UserTextInput) =>
    h(UserText, {
      ...userTextFrameworkProps,
      ...input,
      useUserTextRevision,
      createUserTextEvaluator,
      reportTransformFailure,
      renderSlot,
      renderFactorySlot: () => null,
    });
  return renderText;
}
