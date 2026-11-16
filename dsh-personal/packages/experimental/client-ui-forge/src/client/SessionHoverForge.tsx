/**
 * The forge section of a Session row's hover card: the worktree branch while
 * the Session works in the worktree the panel created for it, and its change
 * requests, most urgent first.
 */
import { defineComponent, h } from "vue";
import { IconBranchOutlineRegular } from "@deepseek-ai/dsh-client-ui-primitives";
import type { InjectFace, PropsLocale, PropsRuntime } from "@deepseek-ai/dsh-client-ui-slots";
// Type-only: pulls the ui-workspace SlotMap merge (the Session row seats).
import type {} from "@deepseek-ai/dsh-client-ui-workspace/client";
import { ChangeRequestGlyph } from "./glyphs.tsx";
import type { NS } from "./locales.ts";
import { useSessionForgeFacts, type SessionListInjected } from "./session-list.ts";
import { CHECKS_LABEL, rowChecks, stateLine } from "./SessionRowForge.tsx";
import { TONE_LABEL } from "./status.ts";
import css from "./SessionList.module.css";
/** Change requests the hover card lists before naming how many more there are. */
export const HOVER_CHANGE_REQUEST_LIMIT = 3;
/** Full props of the hover section. */
export type SessionHoverForgeProps = PropsRuntime<"sidebar.session.row.hover"> &
  PropsLocale<typeof NS> &
  InjectFace<SessionListInjected>;
/**
 * Render the forge section of a Session's hover card.
 * @param props - the row's Session, the shared hooks, and copy.
 * @returns the section, or null for a Session without a worktree or change requests.
 */
export const SessionHoverForge = defineComponent(
  (props: SessionHoverForgeProps) => {
    const facts = useSessionForgeFacts(props.useSessions, props.useStates, () => props.sessionId);
    return () => {
      const { t } = props;
      if (facts.value.worktree === null && facts.value.changeRequests.length === 0) return null;
      const shown = facts.value.changeRequests.slice(0, HOVER_CHANGE_REQUEST_LIMIT);
      const omitted = facts.value.changeRequests.length - shown.length;
      const worktree = facts.value.worktree;
      return h("div", { class: css.hover, "data-forge-session-hover": "" }, [
        worktree !== null &&
          h("div", { class: css.hoverItem }, [
            h("span", { class: css.hoverIcon, "aria-hidden": "true" }, [
              h(IconBranchOutlineRegular, { size: 12 }, undefined),
            ]),
            h("span", { class: css.hoverBody }, [
              h("span", { class: css.hoverBranch }, [worktree.branch]),
              h("span", { class: css.hoverNote }, [
                t("checkout.worktreeFrom", {
                  base: worktree.from ?? worktree.baseCommit.slice(0, 7),
                }),
              ]),
            ]),
          ]),
        shown.map((entry) => {
          const checks = rowChecks(entry);
          return h(
            "div",
            { class: css.hoverItem, key: entry.url, "data-forge-session-hover-change": entry.tone },
            [
              h("span", { class: css.hoverIcon, "data-tone": entry.tone, "aria-hidden": "true" }, [
                h(ChangeRequestGlyph, { tone: entry.tone, tinted: false, size: 12 }, undefined),
              ]),
              h("span", { class: css.hoverBody }, [
                h("span", { class: css.hoverTitle }, [
                  entry.state === undefined
                    ? entry.url
                    : `#${entry.state.number} ${entry.state.title}`,
                ]),
                h("span", { class: css.hoverNote }, [
                  h("span", { "aria-hidden": "true" }, [
                    t(TONE_LABEL[entry.tone]),
                    checks !== "none" && h("span", { class: css.hoverSeparator }, ["\u00B7"]),
                    checks !== "none" &&
                      h("span", { "data-checks": checks }, [t(CHECKS_LABEL[checks])]),
                  ]),
                  h("span", { class: css.visuallyHidden }, [stateLine(entry, t)]),
                ]),
              ]),
            ],
          );
        }),
        omitted > 0 && h("div", { class: css.hoverMore }, [t("list.more", { count: omitted })]),
      ]);
    };
  },
  { props: ["sessionId", "useSessions", "useStates", "t"], inheritAttrs: false },
);
