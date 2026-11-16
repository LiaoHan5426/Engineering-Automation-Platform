import { defineComponent, h, Fragment, shallowRef, computed, watch } from "vue";
/**
 * The agent-preset chip on the new-session screen, beside the workspace
 * picker.
 *
 * It lives here rather than in the composer because the choice is only
 * available before a conversation starts: once a turn has run, the session's
 * history was produced under that preset's tools and the host refuses to swap
 * them. A control that spends most of its life disabled belongs on the screen
 * where it still works.
 *
 * The menu opens on the staged choice, which starts as the deployment default.
 * Picking stages; the choice reaches a session when one becomes current.
 */
import type { ObservableSnapshot, SnapshotStore } from "@deepseek-ai/dsh-client-store";
import type { InjectFace, PropsLocale, PropsRuntime } from "@deepseek-ai/dsh-client-ui-slots";
import {
  IconAgentPresetOutlineRegular,
  IconChevronDownOutlineRegular,
  IconWarningOutlineRegular,
  Menu,
  Toast,
} from "@deepseek-ai/dsh-client-ui-primitives";
import type { AgentPresetSeatState } from "./seat-store.ts";
import { presetDisplayText } from "./locales.ts";
import { requiresCodingTools } from "./settings-store.ts";
import css from "./AgentPresetSeat.module.css";
/** Registration-side business face for the hero chip. */
export interface AgentPresetSeatInjected {
  hooks: {
    /** Shared Developer tools preference; off hides the PTC and Minimal menu choices. */
    developerTools: ObservableSnapshot<boolean>;
    /** Seat snapshot bound by the renderer as useAgentPresetSeat. */
    agentPresetSeat: SnapshotStore<AgentPresetSeatState>;
  };
  /** Read the roster when the chip first renders. */
  load: () => Promise<void>;
  /** Stage one preset for the next session; resolves to a refusal, or undefined. */
  select: (id: string) => Promise<string | undefined>;
  /** Acknowledge the refusal whose Toast finished. */
  dismissRefusal: (error: AgentPresetSeatState["error"]) => void;
  /** Clear the one-shot introduce cue once the chip has played it. */
  introduced: () => void;
}
/* Introduce timeline: the icon eases in first (the CSS animation shares this
   duration); the name's characters start fading up the moment it lands, each
   taking the fade duration to settle. The cue clears after the last one. The
   stagger is capped twice: per tick for short CJK names, and by one shared
   reveal window so a long Latin name finishes in the same time as its CJK
   counterpart instead of dragging the run out per character. */
const INTRO_TEXT_DELAY_MS = 150;
const INTRO_CHAR_STAGGER_MS = 40;
const INTRO_TEXT_REVEAL_MS = 200;
const INTRO_CHAR_FADE_MS = 400;
/** Duration of a selection-refusal banner, including a revision becoming unavailable during a pick. */
const REFUSAL_HOLD_MS = 8000;
/**
 * Per-character start offset for the introduce reveal.
 * @param count - character count of the shown preset name.
 * @returns milliseconds between successive character starts.
 */
function introStaggerMs(count: number): number {
  if (count <= 1) return 0;
  return Math.min(INTRO_CHAR_STAGGER_MS, INTRO_TEXT_REVEAL_MS / (count - 1));
}
/** Full component props. */
export type AgentPresetSeatProps = PropsRuntime<"conversation.hero.agentPreset"> &
  PropsLocale<"settings.agentPreset"> &
  InjectFace<AgentPresetSeatInjected>;
/**
 * Render the new-session agent-preset chip.
 * @param props - composed slot props.
 * @returns The chip and any pending selection refusal, or null outside the main view.
 */
export const AgentPresetSeat = defineComponent(
  (props: AgentPresetSeatProps) => {
    const { useSessionRetainInfo, introduced, useAgentPresetSeat, useDeveloperTools } = props;
    const developerTools = useDeveloperTools((value) => value);
    const state = useAgentPresetSeat((snapshot) => snapshot);
    const retainedMain = useSessionRetainInfo((info) => (info?.retainedBy.mainView ?? 0) > 0);
    const main = computed(() => props.sessionId === undefined || retainedMain.value === true);
    const open = shallowRef(false);
    const setOpen = (
      next: typeof open.value | ((previous: typeof open.value) => typeof open.value),
    ) => {
      open.value = typeof next === "function" ? next(open.value) : next;
    };
    // The seq keys the banner, so picking the same broken preset twice replays
    // it rather than leaving the first one silently in place.
    const toastSeq = shallowRef(0);
    const toast = shallowRef<{
      seq: number;
      error: Exclude<AgentPresetSeatState["error"], string | null>;
    } | null>(null);
    const setToast = (
      next: typeof toast.value | ((previous: typeof toast.value) => typeof toast.value),
    ) => {
      toast.value = typeof next === "function" ? next(toast.value) : next;
    };
    watch(
      () => [state.value.error],
      (_next, _previous, onCleanup) => {
        const dispose = (() => {
          if (state.value.error !== null && typeof state.value.error === "object") {
            toastSeq.value += 1;
            setToast({ seq: toastSeq.value, error: state.value.error });
          } else setToast(null);
        })();
        if (typeof dispose === "function") onCleanup(dispose);
      },
      { immediate: true, flush: "post" },
    );
    watch(
      () => [props.load],
      (_next, _previous, onCleanup) => {
        const dispose = (() => {
          void props.load();
        })();
        if (typeof dispose === "function") onCleanup(dispose);
      },
      { immediate: true, flush: "post" },
    );
    const options = computed(() =>
      state.value.options.filter((option) => developerTools.value || !requiresCodingTools(option)),
    );
    watch(
      () => [developerTools.value, options.value.length],
      (_next, _previous, onCleanup) => {
        const dispose = (() => {
          setOpen(false);
        })();
        if (typeof dispose === "function") onCleanup(dispose);
      },
      { immediate: true, flush: "post" },
    );
    const label = computed(() => {
      const chosen = state.value.options.find((option) => option.id === state.value.current);
      return chosen === undefined ? state.value.current : presetDisplayText(chosen, props.t).name;
    });
    const ready = computed(() => state.value.options.length > 0 && state.value.current !== "");
    // The introduce cue: the pick was staged from another screen (the settings
    // creator entry), so the chip announces it — the icon eases in and each
    // character of the name fades up on a stagger (CSS owns the motion; this
    // effect only arms it and acknowledges the cue once the run is over).
    const introducing = shallowRef(false);
    const setIntroducing = (
      next:
        | typeof introducing.value
        | ((previous: typeof introducing.value) => typeof introducing.value),
    ) => {
      introducing.value = typeof next === "function" ? next(introducing.value) : next;
    };
    watch(
      () => [state.value.introduce, ready.value, label.value, props.introduced],
      (_next, _previous, onCleanup) => {
        const dispose = (() => {
          if (!state.value.introduce || !ready.value) return;
          const characters = Array.from(label.value);
          if (
            characters.length === 0 ||
            window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ) {
            introduced();
            return;
          }
          setIntroducing(true);
          const done = window.setTimeout(
            () => {
              setIntroducing(false);
              introduced();
            },
            INTRO_TEXT_DELAY_MS +
              (characters.length - 1) * introStaggerMs(characters.length) +
              INTRO_CHAR_FADE_MS,
          );
          return () => {
            window.clearTimeout(done);
          };
        })();
        if (typeof dispose === "function") onCleanup(dispose);
      },
      { immediate: true, flush: "post" },
    );
    // A refused initial composition still needs its Toast when there is no chip to show.
    return () => {
      if (!main.value) return null;
      const { select, dismissRefusal, t } = props;
      // One wrapper span: the chip is a flex row with a gap, so loose character
      // spans would each pick up the gap between them.
      const refusal = toast.value;
      const characters = Array.from(label.value);
      const stagger = introStaggerMs(characters.length);
      const shownLabel = introducing.value
        ? h("span", { class: css.introText }, [
            characters.map((character, index) =>
              h(
                "span",
                {
                  key: index,
                  class: css.introChar,
                  style: { animationDelay: `${INTRO_TEXT_DELAY_MS + index * stagger}ms` },
                },
                [character],
              ),
            ),
          ])
        : label.value;
      return h(Fragment, null, [
        ready.value &&
          h(
            Menu,
            {
              open: open.value && options.value.length > 0,
              onClose: () => {
                setOpen(false);
              },
              items: options.value.map((option) => {
                const text = presetDisplayText(option, t);
                return {
                  id: option.id,
                  // Name and description together: the id alone never says what a
                  // preset does, which is why the roster carries display copy.
                  label: h("span", { class: css.item }, [
                    h("span", { class: css.itemName }, [text.name]),
                    h("span", { class: css.itemDesc }, [text.description ?? t("noDescription")]),
                  ]),
                };
              }),
              selectedId: state.value.current,
              onSelect: (id) => {
                setOpen(false);
                void select(id);
              },
              align: "start",
              portal: true,
              className: css.menuAnchor ?? "",
            },
            {
              anchor: () =>
                h(
                  "button",
                  {
                    type: "button",
                    class: css.seat,
                    "aria-haspopup": "menu",
                    "aria-expanded": open.value && options.value.length > 0,
                    title:
                      (typeof state.value.error === "object"
                        ? state.value.error?.reason
                        : state.value.error) ?? t("seatHint"),
                    disabled: state.value.busy || options.value.length === 0,
                    onClick: () => {
                      setOpen((value) => !value);
                    },
                  },
                  [
                    h(IconAgentPresetOutlineRegular, {
                      className: introducing.value
                        ? `${css.seatIcon} ${css.introIcon}`
                        : (css.seatIcon ?? ""),
                    }),
                    h("span", { class: css.seatLabel }, [shownLabel]),
                    h(IconChevronDownOutlineRegular, { className: css.chevron ?? "" }),
                  ],
                ),
            },
          ),
        refusal !== null &&
          h(
            Toast,
            {
              key: refusal.seq,
              text: t("switchRefused", {
                name: presetDisplayText(refusal.error.preset, t).name,
                reason: refusal.error.reason,
              }),
              holdMs: REFUSAL_HOLD_MS,
              anchor: document.querySelector<HTMLElement>("[data-composer-card]"),
              onDone: () => {
                dismissRefusal(refusal.error);
              },
            },
            { icon: () => h(IconWarningOutlineRegular) },
          ),
      ]);
    };
  },
  {
    props: [
      "sessionId",
      "useSessionRetainInfo",
      "load",
      "select",
      "dismissRefusal",
      "introduced",
      "useAgentPresetSeat",
      "useDeveloperTools",
      "t",
    ],
  },
);
