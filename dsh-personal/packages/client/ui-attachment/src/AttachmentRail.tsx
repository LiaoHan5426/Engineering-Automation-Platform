/** Draft-attachment rail: scrollbar-less horizontal overflow paged by edge arrows. */
import clsx from "clsx";
import {
  IconChevronLeftOutlineRegular,
  IconChevronRightOutlineRegular,
} from "@deepseek-ai/dsh-client-ui-primitives";
import css from "./AttachmentRail.module.css";
import { h, defineComponent, shallowRef, watch, type VNodeChild } from "vue";
/** One ordered draft attachment rendered by the rail owner. */
export interface AttachmentRailItem {
  /** Stable attachment identity. */
  id: string;
}
/** Rail-level strings the owner resolves from its own locale namespace. */
export interface AttachmentRailLabels {
  /** Accessible name of the rail group. */
  group: string;
  /** Accessible label of the left paging arrow. */
  scrollLeft: string;
  /** Accessible label of the right paging arrow. */
  scrollRight: string;
}
/** Approximate pixels per wheel step for `deltaMode` LINE deltas (Firefox
 * notch wheels report lines, not pixels). */
const WHEEL_LINE_PX = 16;
/** Smooth paging unless the user asked for reduced motion. */
function pageBehavior(): ScrollBehavior {
  // jsdom (the unit lane) implements no matchMedia despite lib.dom's
  // non-optional typing; the optional call keeps that lane on the default.
  const matchMedia = (
    window as {
      matchMedia?: Window["matchMedia"];
    }
  ).matchMedia;
  return matchMedia?.("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
}

/**
 * Horizontal rail over the caller's ordered draft attachments.
 *
 * The rail scrolls with its scrollbar hidden; overflow is announced by edge
 * arrows recomputed from scroll geometry on scroll, item-count changes, and
 * rail size changes (a ResizeObserver on the rail element, so sidebar or
 * panel resizes count, not only window resizes). A vertical wheel pans the
 * rail horizontally and is consumed exclusively (non-passive listener), a
 * newly added item is revealed at the rail's end while a rail that mounts
 * over an existing draft keeps its start position. The owner renders each
 * item and decides mounting; it renders the rail only while items exist.
 *
 * @param props.items - attachments in draft order.
 * @param props.labels - rail-level strings (group name and paging arrows).
 * @param props.renderItem - render one attachment card in draft order.
 * @returns the rail group with its paging arrows.
 */
export const AttachmentRail = defineComponent(
  <T extends AttachmentRailItem>(props: {
    items: readonly T[];
    labels: AttachmentRailLabels;
    renderItem: (item: T) => VNodeChild;
  }) => {
    const railRef = shallowRef<HTMLDivElement | null>(null);
    let count: number | null = null;
    const edges = shallowRef({ left: false, right: false });
    const updateEdges = () => {
      const el = railRef.value;
      if (el === null) return;
      const left = el.scrollLeft > 1;
      const right = el.scrollLeft < el.scrollWidth - el.clientWidth - 1;
      if (edges.value.left !== left || edges.value.right !== right) edges.value = { left, right };
    };
    watch(
      [railRef, () => props.items.length],
      () => {
        const el = railRef.value;
        if (el === null) return;
        const grew = count !== null && props.items.length > count;
        count = props.items.length;
        if (grew) el.scrollLeft = el.scrollWidth - el.clientWidth;
        updateEdges();
      },
      { flush: "post" },
    );
    watch(
      railRef,
      (el, _old, onCleanup) => {
        if (el === null) return;
        const observer =
          typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(updateEdges);
        observer?.observe(el);
        const onWheel = (event: WheelEvent) => {
          if (event.deltaY === 0) return;
          const scale =
            event.deltaMode === WheelEvent.DOM_DELTA_LINE
              ? WHEEL_LINE_PX
              : event.deltaMode === WheelEvent.DOM_DELTA_PAGE
                ? el.clientWidth
                : 1;
          event.preventDefault();
          el.scrollBy({
            left:
              event.deltaX !== 0
                ? event.deltaX * scale
                : Math.sign(event.deltaY) * Math.min(Math.abs(event.deltaY) * scale, 60),
            behavior: "auto",
          });
        };
        el.addEventListener("wheel", onWheel, { passive: false });
        onCleanup(() => {
          observer?.disconnect();
          el.removeEventListener("wheel", onWheel);
        });
      },
      { flush: "post" },
    );
    const page = (direction: -1 | 1) => {
      const el = railRef.value;
      if (el !== null)
        el.scrollBy({
          left: direction * Math.max(el.clientWidth - 64, 200),
          behavior: pageBehavior(),
        });
    };
    return () => {
      const { items, labels, renderItem } = props;
      return h("div", { class: css.root }, [
        edges.value.left &&
          h(
            "button",
            {
              type: "button",
              class: clsx(css.arrow, css.arrowLeft),
              "aria-label": labels.scrollLeft,
              onClick: () => {
                page(-1);
              },
            },
            [h(IconChevronLeftOutlineRegular, undefined, undefined)],
          ),
        h(
          "div",
          {
            ref: railRef,
            class: css.rail,
            role: "group",
            "aria-label": labels.group,
            onScroll: updateEdges,
          },
          [items.map((item) => h("div", { key: item.id, class: css.item }, [renderItem(item)]))],
        ),
        edges.value.right &&
          h(
            "button",
            {
              type: "button",
              class: clsx(css.arrow, css.arrowRight),
              "aria-label": labels.scrollRight,
              onClick: () => {
                page(1);
              },
            },
            [h(IconChevronRightOutlineRegular, undefined, undefined)],
          ),
      ]);
    };
  },
  { name: "AttachmentRail", inheritAttrs: false, props: ["items", "labels", "renderItem"] },
);
