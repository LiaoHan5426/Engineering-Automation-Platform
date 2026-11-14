var __defProp = Object.defineProperty;
var __export = (target, all2) => {
  for (var name in all2)
    __defProp(target, name, { get: all2[name], enumerable: true });
};

// upstream/packages/client/ui-shortcuts/src/client/index.ts.snapshot
var index_ts_exports = {};
__export(index_ts_exports, {
  apply: () => apply,
  inject: () => inject
});

// upstream/packages/client/ui-primitives/src/Menu.tsx.snapshot
import { useEffect as useEffect4, useId as useId5, useLayoutEffect as useLayoutEffect4, useMemo, useRef as useRef6, useState as useState3 } from "react";
import { createPortal as createPortal4 } from "react-dom";
import clsx5 from "clsx";

// upstream/packages/client/ui-primitives/src/useMenuSubmenu.ts.snapshot
import { useId, useLayoutEffect, useRef as useRef2, useState } from "react";

// upstream/packages/client/ui-primitives/src/menu-submenu-position.ts.snapshot
var SUBMENU_GAP = 4;
var SUBMENU_MARGIN = 12;
function submenuNeedsPage(parent, width, viewportWidth) {
  const right = parent.right + SUBMENU_GAP + width <= viewportWidth - SUBMENU_MARGIN;
  const left = parent.left - SUBMENU_GAP - width >= SUBMENU_MARGIN;
  return !right && !left;
}

// upstream/packages/client/ui-primitives/src/pointer-grace.ts.snapshot
import { useCallback, useEffect, useRef } from "react";
var POINTER_GRACE_MS = 200;
function usePointerGrace(close) {
  const timerRef = useRef(null);
  const closeRef = useRef(close);
  closeRef.current = close;
  const cancel = useCallback(() => {
    if (timerRef.current === null) return;
    clearTimeout(timerRef.current);
    timerRef.current = null;
  }, []);
  const arm = useCallback(() => {
    cancel();
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      closeRef.current();
    }, POINTER_GRACE_MS);
  }, [cancel]);
  useEffect(() => cancel, [cancel]);
  return { arm, cancel };
}

// upstream/packages/client/ui-primitives/src/useMenuSubmenu.ts.snapshot
function menuHoverAllowed(event) {
  return event.pointerType !== "touch" && window.matchMedia("(any-hover: hover)").matches;
}
function useMenuSubmenu(options) {
  const { open, items, footer, listRef, refocusAnchor } = options;
  const [expanded, setExpanded] = useState(null);
  const panelRef = useRef2(null);
  const pendingFocus = useRef2(null);
  const entry = [...items, ...footer ?? []].find((item) => !("type" in item) && item.id === expanded?.id && item.disabled !== true && item.submenu !== void 0 && item.submenu.length > 0);
  const trigger = expanded?.trigger ?? null;
  const anchorId = useId().replaceAll(":", "");
  const parentAnchor = `--dsh-submenu-parent-${anchorId}`;
  const [needsPage, setNeedsPage] = useState(null);
  const contains = (node) => panelRef.current?.contains(node) === true;
  const invalidated = expanded !== null && entry === void 0;
  const active = document.activeElement;
  const restoreInvalidatedFocus = open && invalidated && (contains(active) || trigger === active);
  const backWasFocused = contains(active) && active?.hasAttribute("data-menu-back") === true;
  const measured = needsPage !== null;
  const page = entry !== void 0 && expanded?.activated === true && needsPage === true;
  const hidden = !measured || needsPage && !page;
  const visible = open && entry !== void 0;
  useLayoutEffect(() => {
    const panel = panelRef.current;
    const parent = listRef.current;
    if (!visible || panel === null || parent === null || trigger === null) {
      setNeedsPage(null);
      return;
    }
    const measureRow = () => {
      panel.style.setProperty("--dsh-submenu-row-offset", `${trigger.getBoundingClientRect().top - parent.getBoundingClientRect().top}px`);
    };
    const measure = () => {
      const layout = panel.getAttribute("data-submenu-layout");
      panel.removeAttribute("data-submenu-layout");
      const width = panel.offsetWidth;
      panel.style.setProperty("--dsh-submenu-height", `${panel.offsetHeight}px`);
      if (layout !== null) panel.setAttribute("data-submenu-layout", layout);
      measureRow();
      const viewport = document.documentElement.clientWidth || window.innerWidth;
      setNeedsPage(submenuNeedsPage(parent.getBoundingClientRect(), width, viewport));
    };
    measure();
    window.addEventListener("resize", measure);
    parent.addEventListener("scroll", measureRow, true);
    const observer = new ResizeObserver(measure);
    for (const element of [parent, trigger, panel]) observer.observe(element);
    return () => {
      window.removeEventListener("resize", measure);
      parent.removeEventListener("scroll", measureRow, true);
      observer.disconnect();
    };
  }, [visible, entry, trigger, listRef]);
  const focusFirstChild = () => {
    const panel = panelRef.current;
    const first = panel?.querySelector('button[role="menuitem"]:not(:disabled):not([data-menu-back])') ?? panel?.querySelector("button:not(:disabled)");
    first?.focus();
  };
  const returnToParent = () => {
    cancelClose();
    pendingFocus.current = trigger;
    setExpanded(null);
  };
  const collapse = () => {
    cancelClose();
    if (contains(document.activeElement)) returnToParent();
    else setExpanded(null);
  };
  const { arm: armClose, cancel: cancelClose } = usePointerGrace(() => {
    if (!page) collapse();
  });
  const openChild = (id, target, enter = false) => {
    cancelClose();
    if (trigger !== target && contains(document.activeElement)) {
      pendingFocus.current = target;
      target.focus();
      pendingFocus.current = null;
    }
    pendingFocus.current = enter ? "child" : null;
    setExpanded((current2) => current2?.id === id ? enter && !current2.activated ? { ...current2, activated: true } : current2 : { id, trigger: target, activated: enter });
    if (enter) focusFirstChild();
  };
  useLayoutEffect(() => {
    if (!open || invalidated) {
      cancelClose();
      pendingFocus.current = null;
      setExpanded(null);
      if (restoreInvalidatedFocus && (document.activeElement === document.body || document.activeElement === trigger)) {
        const target = trigger?.isConnected === true && !trigger.disabled ? trigger : listRef.current?.querySelector("button:not(:disabled)");
        pendingFocus.current = target ?? null;
        if (target != null) target.focus();
        else refocusAnchor();
        pendingFocus.current = null;
      }
      return;
    }
    if (entry === void 0 && pendingFocus.current instanceof HTMLButtonElement) {
      pendingFocus.current.focus();
      pendingFocus.current = null;
    }
    if (entry === void 0 || hidden) return;
    if (pendingFocus.current === "child" || page && listRef.current?.contains(document.activeElement) || !page && backWasFocused) {
      focusFirstChild();
      pendingFocus.current = null;
    }
  }, [open, entry, needsPage, page, hidden, invalidated, restoreInvalidatedFocus, backWasFocused, cancelClose]);
  const collapseFrom = (event) => {
    const row = event.target.closest('button[role="menuitem"]');
    if (row === null || row.getAttribute("aria-haspopup") === "menu") return;
    if (row.closest('[role="menu"]') === event.currentTarget) collapse();
  };
  return {
    entry,
    panelRef,
    parentAnchor,
    measured,
    page,
    hidden,
    contains,
    activeList: (focused) => page || contains(focused) ? panelRef.current : listRef.current,
    returnToParent: () => {
      if (entry === void 0 || hidden) return false;
      returnToParent();
      return true;
    },
    openChild,
    focusParent: (id, target) => {
      if (pendingFocus.current !== target) openChild(id, target);
    },
    leave: () => {
      if (!page) armClose();
    },
    cancelClose,
    collapseFrom
  };
}

// upstream/packages/client/ui-primitives/src/MenuRow.tsx.snapshot
import { useId as useId3 } from "react";
import clsx2 from "clsx";

// upstream/packages/client/ui-primitives/src/icons/artwork.ts.snapshot
var ICON_REGULAR_STROKE = 1;
var ICON_MEDIUM_STROKE = 1.3;
var ICON_ARTWORK = {
  "mail-unread-outline": { size: 16, svg: (strokeWidth) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round"><path d="M8.5 3.5H3C2.44772 3.5 2 3.94772 2 4.5V11.5C2 12.0523 2.44772 12.5 3 12.5H13C13.5523 12.5 14 12.0523 14 11.5V7" stroke="currentColor"></path><path d="M2.5 4.5L8 8.5L10.5 6.7" stroke="currentColor"></path><circle cx="12.5" cy="3.5" r="1.5" fill="currentColor"></circle></svg>` },
  "mail-read-outline": { size: 16, svg: (strokeWidth) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round"><path d="M2 6.5L7.4 2.45C7.75556 2.18333 8.24444 2.18333 8.6 2.45L14 6.5V12.5C14 13.0523 13.5523 13.5 13 13.5H3C2.44772 13.5 2 13.0523 2 12.5V6.5Z" stroke="currentColor"></path><path d="M2.5 7L8 10.5L13.5 7M2.5 13L6 9.5M13.5 13L10 9.5" stroke="currentColor"></path></svg>` },
  "layers-outline": { size: 16, svg: (strokeWidth) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round"><path d="M8.481371 2.304371 a1.159971 1.159971 0 0 0-.962742 0 L2.547971 4.566371 a.580029 .580029 0 0 0 0 1.0614 l4.9764 2.267829 a1.159971 1.159971 0 0 0 .962829 0 l4.9764-2.262 a.580029 .580029 0 0 0 0-1.0614Z" stroke="currentColor"></path><path d="M2.199971 8 a.580029 .580029 0 0 0 .336429 .527829 l4.987971 2.267742 a1.159971 1.159971 0 0 0 .957 0 l4.9764-2.262 A.580029 .580029 0 0 0 13.800029 8" stroke="currentColor"></path><path d="M2.199971 10.899971 a.580029 .580029 0 0 0 .336429 .527829 l4.987971 2.267829 a1.159971 1.159971 0 0 0 .957 0 l4.9764-2.262 A.580029 .580029 0 0 0 13.800029 10.899971" stroke="currentColor"></path></svg>` },
  "save-outline": { size: 16, svg: (strokeWidth) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="${strokeWidth}" stroke-linejoin="round"><path d="M2.5 1.5h8l3 3v9a1 1 0 0 1-1 1h-10a1 1 0 0 1-1-1v-11a1 1 0 0 1 1-1Z"></path><path d="M4.5 1.5v4h6v-4M4 14.5v-6h7v6"></path></svg>` },
  "new-chat-outline": { size: 16, svg: (strokeWidth) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke-width="${strokeWidth}"><path d="M2.37091 11.2501C1.58745 9.89288 1.32067 8.29835 1.61969 6.76006C1.91872 5.22177 2.76342 3.8433 3.99826 2.87846C5.2331 1.91362 6.77494 1.42737 8.33988 1.50925C9.90482 1.59113 11.3875 2.23562 12.5149 3.32406C13.6425 4.41269 14.3387 5.87206 14.4754 7.4334C14.612 8.99474 14.18 10.5529 13.2587 11.8209C12.3375 13.0888 10.9891 13.9813 9.46194 14.3337C8.18691 14.628 6.85895 14.5294 5.64989 14.0605C5.1712 13.8748 4.76962 13.4932 4.26534 13.3967C3.67413 13.2835 2.95257 13.5598 2.03794 14.3337" stroke="currentColor"></path><path d="M8 5V11" stroke="currentColor"></path><path d="M5 8H11" stroke="currentColor"></path></svg>` },
  "search-outline": { size: 16, svg: (strokeWidth) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke-width="${strokeWidth}"><path d="M6.58727 11.8586C9.55061 11.8586 11.9529 9.45637 11.9529 6.49304C11.9529 3.5297 9.55061 1.12744 6.58727 1.12744C3.62394 1.12744 1.22168 3.5297 1.22168 6.49304C1.22168 9.45637 3.62394 11.8586 6.58727 11.8586Z" stroke="currentColor"></path><path d="M10.2991 10.3933L14.7783 14.8725" stroke="currentColor"></path></svg>` },
  "eye-outline": { size: 16, svg: (strokeWidth) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke-width="${strokeWidth}"><path d="M1.5 8C3.36 4.41 5.52 2.63 8 2.63C10.48 2.63 12.64 4.41 14.5 8C12.64 11.59 10.48 13.37 8 13.37C5.52 13.37 3.36 11.59 1.5 8Z" stroke="currentColor"></path><circle cx="8" cy="8" r="2.25" stroke="currentColor"></circle></svg>` },
  "eye-off-outline": { size: 16, svg: (strokeWidth) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke-width="${strokeWidth}"><path d="M2.25 2.25L13.75 13.75" stroke="currentColor"></path><path d="M6.35 3.03C6.88 2.76 7.42 2.63 8 2.63C10.48 2.63 12.64 4.41 14.5 8C13.75 9.48 12.95 10.6 12.08 11.36" stroke="currentColor"></path><path d="M10.28 12.81C9.54 13.19 8.78 13.37 8 13.37C5.52 13.37 3.36 11.59 1.5 8C2.26 6.49 3.08 5.36 3.97 4.6" stroke="currentColor"></path><path d="M6.55 6.55A2.05 2.05 0 0 0 9.45 9.45" stroke="currentColor"></path></svg>` },
  "globe-outline": { size: 14, svg: (strokeWidth) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke-width="${strokeWidth}"><path d="M7.99986 14.0887C11.3626 14.0887 14.0886 11.3627 14.0886 7.99998C14.0886 4.63727 11.3626 1.91125 7.99986 1.91125C4.63715 1.91125 1.91113 4.63727 1.91113 7.99998C1.91113 11.3627 4.63715 14.0887 7.99986 14.0887Z" stroke="currentColor"></path><path d="M2.34619 8H13.6538" stroke="currentColor" stroke-linecap="square"></path><path d="M7.99976 14.0889C9.23509 14.0889 10.1743 11.3629 10.1743 8.00006C10.1743 4.63739 9.23509 1.91138 7.99976 1.91138" stroke="currentColor"></path><path d="M7.99973 14.0889C6.76445 14.0889 5.8252 11.3629 5.8252 8.00006C5.8252 4.63739 6.76445 1.91138 7.99973 1.91138" stroke="currentColor"></path></svg>` },
  "settings-outline": { size: 16, svg: (strokeWidth) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke-width="${strokeWidth}"><path d="M8 9.75012C8.9665 9.75012 9.75 8.96662 9.75 8.00012C9.75 7.03362 8.9665 6.25012 8 6.25012C7.0335 6.25012 6.25 7.03362 6.25 8.00012C6.25 8.96662 7.0335 9.75012 8 9.75012Z" stroke="currentColor"></path><path d="M13.0107 7.79377C12.9505 7.89401 12.9205 7.94413 12.9205 7.99951C12.9205 8.0549 12.9505 8.10502 13.0106 8.20528L13.9849 9.83006C14.045 9.93029 14.0751 9.9804 14.0751 10.0358C14.0751 10.0911 14.045 10.1413 13.9849 10.2415L13.0037 11.8777C12.9468 11.9726 12.9184 12.0201 12.8725 12.0461C12.8267 12.072 12.7713 12.072 12.6607 12.072H10.6704C10.5598 12.072 10.5045 12.072 10.4586 12.098C10.4128 12.1239 10.3843 12.1714 10.3274 12.2662L9.33825 13.9142C9.28133 14.009 9.25287 14.0564 9.20703 14.0823C9.16118 14.1083 9.10588 14.1083 8.99529 14.1083H7.00486C6.89426 14.1083 6.83896 14.1083 6.79312 14.0823C6.74727 14.0564 6.71881 14.009 6.6619 13.9142L5.67273 12.2662C5.61581 12.1714 5.58735 12.1239 5.54151 12.098C5.49566 12.072 5.44036 12.072 5.32977 12.072H3.33945C3.2288 12.072 3.17347 12.072 3.12761 12.0461C3.08176 12.0201 3.0533 11.9726 2.9964 11.8777L2.0152 10.2415C1.9551 10.1413 1.92505 10.0911 1.92505 10.0358C1.92505 9.9804 1.9551 9.93029 2.0152 9.83006L2.98951 8.20528C3.04963 8.10502 3.07969 8.0549 3.07969 7.99951C3.07968 7.94413 3.04961 7.89401 2.98946 7.79377L2.01529 6.17011C1.95514 6.06987 1.92507 6.01975 1.92507 5.96437C1.92506 5.90899 1.95512 5.85886 2.01524 5.7586L2.9964 4.1224C3.0533 4.0275 3.08176 3.98005 3.12761 3.95408C3.17347 3.92811 3.2288 3.92811 3.33945 3.92811H5.32977C5.44036 3.92811 5.49566 3.92811 5.54151 3.90216C5.58735 3.87621 5.61581 3.82879 5.67273 3.73397L6.6619 2.08599C6.71881 1.99116 6.74727 1.94375 6.79312 1.9178C6.83896 1.89185 6.89426 1.89185 7.00486 1.89185H8.99529C9.10588 1.89185 9.16118 1.89185 9.20703 1.9178C9.25287 1.94375 9.28133 1.99116 9.33825 2.08599L10.3274 3.73397C10.3843 3.82879 10.4128 3.87621 10.4586 3.90216C10.5045 3.92811 10.5598 3.92811 10.6704 3.92811H12.6607C12.7713 3.92811 12.8267 3.92811 12.8725 3.95408C12.9184 3.98005 12.9468 4.0275 13.0037 4.1224L13.9849 5.7586C14.045 5.85886 14.0751 5.90899 14.0751 5.96437C14.0751 6.01975 14.045 6.06987 13.9849 6.17011L13.0107 7.79377Z" stroke="currentColor" stroke-miterlimit="10"></path></svg>` },
  "panel-left-outline": { size: 16, svg: (strokeWidth) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke-width="${strokeWidth}"><path d="M13.5 1.5H2.5C1.94772 1.5 1.5 1.94772 1.5 2.5V13.5C1.5 14.0523 1.94772 14.5 2.5 14.5H13.5C14.0523 14.5 14.5 14.0523 14.5 13.5V2.5C14.5 1.94772 14.0523 1.5 13.5 1.5Z" stroke="currentColor"></path><path d="M5.5 1.5V14.5" stroke="currentColor"></path></svg>` },
  "ellipsis-outline": { size: 16, svg: (strokeWidth) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke-width="${strokeWidth}"><path d="M3 9C3.55228 9 4 8.55228 4 8C4 7.44772 3.55228 7 3 7C2.44772 7 2 7.44772 2 8C2 8.55228 2.44772 9 3 9Z" fill="currentColor"></path><path d="M8 9C8.55228 9 9 8.55228 9 8C9 7.44772 8.55228 7 8 7C7.44772 7 7 7.44772 7 8C7 8.55228 7.44772 9 8 9Z" fill="currentColor"></path><path d="M13 9C13.5523 9 14 8.55228 14 8C14 7.44772 13.5523 7 13 7C12.4477 7 12 7.44772 12 8C12 8.55228 12.4477 9 13 9Z" fill="currentColor"></path></svg>` },
  "plus-outline": { size: 16, svg: (strokeWidth) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke-width="${strokeWidth}"><path d="M8 2V14" stroke="currentColor"></path><path d="M2 8H14" stroke="currentColor"></path></svg>` },
  "check-outline": { size: 16, svg: (strokeWidth) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke-width="${strokeWidth}"><path d="M2.25 8.5L5.49732 11.7473C5.90519 12.1552 6.57263 12.1344 6.95426 11.7018L13.75 4" stroke="currentColor"></path></svg>` },
  "branch-outline": { size: 16, svg: (strokeWidth) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke-width="${strokeWidth}"><path d="M1.01503 8.0001L5.6964 8.0001C6.41913 8.0001 6.78049 8.0001 7.12115 7.91951C7.4232 7.84804 7.71233 7.73014 7.97821 7.57C8.27809 7.38939 8.5364 7.13669 9.05303 6.63129L11.3281 4.40564" stroke="currentColor"></path><path d="M1.01221 7.9999L5.6964 7.9999C6.41913 7.9999 6.78049 7.9999 7.12115 8.08049C7.4232 8.15196 7.71233 8.26986 7.97821 8.43C8.27809 8.61061 8.5364 8.86331 9.05303 9.36871L11.3281 11.5944" stroke="currentColor"></path><circle cx="12.4502" cy="3.3079" r="1.56962" stroke="currentColor"></circle><circle cx="12.4502" cy="12.6921" r="1.56962" stroke="currentColor"></circle></svg>` },
  "chevron-down-outline": { size: 14, svg: (strokeWidth) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke-width="${strokeWidth}"><path d="M4 6L7.29289 9.29289C7.68342 9.68342 8.31658 9.68342 8.70711 9.29289L12 6" stroke="currentColor"></path></svg>` },
  "chevron-left-outline": { size: 14, svg: (strokeWidth) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke-width="${strokeWidth}"><path d="M10 4L6.70711 7.29289C6.31658 7.68342 6.31658 8.31658 6.70711 8.70711L10 12" stroke="currentColor"></path></svg>` },
  "chevron-right-outline": { size: 14, svg: (strokeWidth) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke-width="${strokeWidth}"><path d="M6 12L9.29289 8.70711C9.68342 8.31658 9.68342 7.68342 9.29289 7.29289L6 4" stroke="currentColor"></path></svg>` },
  "triangle-right-fill": { size: 14, svg: (strokeWidth) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke-width="${strokeWidth}"><path d="M5.5 4.5C5.5 4.40714 5.52586 4.31612 5.57467 4.23713C5.62349 4.15815 5.69334 4.09431 5.77639 4.05279C5.85945 4.01126 5.95242 3.99368 6.0449 4.00202C6.13738 4.01036 6.22572 4.04429 6.3 4.1L10.967 7.6C11.0291 7.64657 11.0795 7.70697 11.1142 7.77639C11.1489 7.84582 11.167 7.92238 11.167 8C11.167 8.07762 11.1489 8.15418 11.1142 8.22361C11.0795 8.29303 11.0291 8.35343 10.967 8.4L6.3 11.9C6.22572 11.9557 6.13738 11.9896 6.0449 11.998C5.95242 12.0063 5.85945 11.9887 5.77639 11.9472C5.69334 11.9057 5.62349 11.8419 5.57467 11.7629C5.52586 11.6839 5.5 11.5929 5.5 11.5V4.5Z" fill="currentColor"></path></svg>` },
  "chevron-up-outline": { size: 14, svg: (strokeWidth) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke-width="${strokeWidth}"><path d="M12 10L8.70711 6.70711C8.31658 6.31658 7.68342 6.31658 7.29289 6.70711L4 10" stroke="currentColor"></path></svg>` },
  "close-outline": { size: 16, svg: (strokeWidth) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke-width="${strokeWidth}"><path d="M2.5 2.5L13.5 13.5" stroke="currentColor"></path><path d="M13.5 2.5L2.5 13.5" stroke="currentColor"></path></svg>` },
  "close-fill": { size: 14, svg: (strokeWidth) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke-width="${strokeWidth}"><path d="M3.5 3.5L12.5 12.5" stroke="currentColor"></path><path d="M12.5 3.5L3.5 12.5" stroke="currentColor"></path></svg>` },
  "close-circle-fill": { size: 16, svg: (strokeWidth) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke-width="${strokeWidth}"><path fill-rule="evenodd" clip-rule="evenodd" d="M15 8A7 7 0 1 1 1 8A7 7 0 1 1 15 8ZM6.409 10.652L5.348 9.591L6.939 8L5.348 6.409L6.409 5.348L8 6.939L9.591 5.348L10.652 6.409L9.061 8L10.652 9.591L9.591 10.652L8 9.061Z" fill="currentColor"></path></svg>` },
  "copy-outline": { size: 16, svg: (strokeWidth) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke-width="${strokeWidth}"><rect x="1.52075" y="4.07373" width="10.3932" height="10.3932" rx="2" stroke="currentColor"></rect><path d="M11.9792 1.53296C13.36 1.53296 14.4792 2.65225 14.4792 4.03296V9.42847C14.4792 10.3756 13.9521 11.1987 13.1755 11.6228V10.3298C13.3652 10.0787 13.4792 9.7674 13.4792 9.42847V4.03296C13.4792 3.20453 12.8077 2.53296 11.9792 2.53296H6.58374C6.27966 2.53301 5.99684 2.6235 5.7605 2.77905H4.42358C4.85652 2.03463 5.66056 1.53304 6.58374 1.53296H11.9792Z" fill="currentColor"></path></svg>` },
  "refresh-outline": { size: 16, svg: (strokeWidth) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke-width="${strokeWidth}"><path d="M14.5001 8C14.5 9.28552 14.1188 10.5422 13.4045 11.611C12.6903 12.6799 11.6752 13.5129 10.4875 14.0049C9.29982 14.4968 7.99295 14.6255 6.73212 14.3747C5.4713 14.124 4.31314 13.505 3.4041 12.596C2.49514 11.687 1.87614 10.5288 1.62537 9.26798C1.37459 8.00716 1.50331 6.70028 1.99525 5.51261C2.48719 4.32494 3.32025 3.30981 4.3891 2.59557C5.45795 1.88134 6.71458 1.50008 8.0001 1.5C9.9001 1.5 11.7001 2.3 13.0001 3.6L14.5001 5.1" stroke="currentColor"></path><path d="M14.4999 1.5V5.1H10.8999" stroke="currentColor"></path></svg>` },
  "like-outline": { size: 16, svg: (strokeWidth) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke-width="${strokeWidth}"><path d="M13.537 8.12098L12.3983 12.8455C12.1818 13.7438 11.378 14.3769 10.454 14.3769L9.35595 14.3769H7.43799H5.16577C3.50892 14.3769 2.16577 13.0337 2.16577 11.3769V7.88668C2.16577 7.33439 2.61349 6.88668 3.16577 6.88668H4.02665C5.84943 6.88668 7.38083 3.28711 7.67689 2.54578C7.71259 2.45639 7.73501 2.36373 7.77922 2.27824C7.86506 2.11221 8.08228 1.87578 8.59039 2.07775C10.3291 2.76886 9.23144 6.04071 8.96955 6.75058C8.94502 6.81707 8.99495 6.88668 9.06581 6.88668H12.5648C13.2119 6.88668 13.6886 7.49192 13.537 8.12098Z" stroke="currentColor"></path></svg>` },
  "like-fill": { size: 16, svg: (strokeWidth) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke-width="${strokeWidth}"><path d="M13.537 8.12098L12.3983 12.8455C12.1818 13.7438 11.378 14.3769 10.454 14.3769L9.35595 14.3769H7.43799H5.16577C3.50892 14.3769 2.16577 13.0337 2.16577 11.3769V7.88668C2.16577 7.33439 2.61349 6.88668 3.16577 6.88668H4.02665C5.84943 6.88668 7.38083 3.28711 7.67689 2.54578C7.71259 2.45639 7.73501 2.36373 7.77922 2.27824C7.86506 2.11221 8.08228 1.87578 8.59039 2.07775C10.3291 2.76886 9.23144 6.04071 8.96955 6.75058C8.94502 6.81707 8.99495 6.88668 9.06581 6.88668H12.5648C13.2119 6.88668 13.6886 7.49192 13.537 8.12098Z" fill="currentColor" stroke="currentColor"></path></svg>` },
  "dislike-outline": { size: 16, svg: (strokeWidth) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke-width="${strokeWidth}"><path d="M2.46302 8.06749L3.60171 3.34299C3.81822 2.44467 4.62196 1.81162 5.546 1.8116L6.64406 1.81158L8.56202 1.81158L10.8342 1.81158C12.4911 1.81158 13.8342 3.15473 13.8342 4.81158L13.8342 8.3018C13.8342 8.85408 13.3865 9.3018 12.8342 9.3018L11.9734 9.3018C10.1506 9.3018 8.61918 12.9014 8.32311 13.6427C8.28741 13.7321 8.26499 13.8247 8.22078 13.9102C8.13494 14.0763 7.91772 14.3127 7.40961 14.1107C5.67089 13.4196 6.76856 10.1478 7.03045 9.43789C7.05498 9.37141 7.00505 9.3018 6.93419 9.3018L3.43519 9.3018C2.78811 9.3018 2.31141 8.69656 2.46302 8.06749Z" stroke="currentColor"></path></svg>` },
  "dislike-fill": { size: 16, svg: (strokeWidth) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke-width="${strokeWidth}"><path d="M2.46302 8.06749L3.60171 3.34299C3.81822 2.44467 4.62196 1.81162 5.546 1.8116L6.64406 1.81158L8.56202 1.81158L10.8342 1.81158C12.4911 1.81158 13.8342 3.15473 13.8342 4.81158L13.8342 8.3018C13.8342 8.85408 13.3865 9.3018 12.8342 9.3018L11.9734 9.3018C10.1506 9.3018 8.61918 12.9014 8.32311 13.6427C8.28741 13.7321 8.26499 13.8247 8.22078 13.9102C8.13494 14.0763 7.91772 14.3127 7.40961 14.1107C5.67089 13.4196 6.76856 10.1478 7.03045 9.43789C7.05498 9.37141 7.00505 9.3018 6.93419 9.3018L3.43519 9.3018C2.78811 9.3018 2.31141 8.69656 2.46302 8.06749Z" fill="currentColor" stroke="currentColor"></path></svg>` },
  "share-outline": { size: 16, svg: (strokeWidth) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke-width="${strokeWidth}"><path d="M14.1256 7.58723C14.3483 7.81942 14.3482 8.18589 14.1254 8.41799L8.6646 14.1077C8.53985 14.2377 8.32031 14.1494 8.32031 13.9692L8.32035 10.2039C8.32035 10.1943 8.31534 10.1864 8.30592 10.1849C8.08306 10.148 5.30067 9.7729 1.50993 13.2904C1.49711 13.3023 1.47561 13.2943 1.4757 13.2768C1.49273 9.87168 3.42001 5.07166 8.29999 5.05835C8.31103 5.05832 8.32035 5.04937 8.32035 5.03832L8.32031 2.03109C8.32031 1.85088 8.53993 1.76259 8.66466 1.89266L14.1256 7.58723Z" stroke="currentColor"></path></svg>` },
  "deliver-doc": { size: 16, svg: (strokeWidth) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke-width="${strokeWidth}"><path d="M6.15479 4.91687H9.84543" stroke="currentColor"></path><path d="M11.8798 9.55347V2.71525C11.8798 2.37416 11.564 2.09766 11.1744 2.09766H4.82577C4.43618 2.09766 4.12036 2.37416 4.12036 2.71525V9.55347" stroke="currentColor"></path><path d="M2.28735 13.8022V8.84792C2.28735 8.77514 2.36262 8.72673 2.42884 8.75693L13.2936 13.7112C13.3914 13.7558 13.3596 13.9022 13.2521 13.9022H2.38735C2.33213 13.9022 2.28735 13.8575 2.28735 13.8022Z" stroke="currentColor"></path><path d="M7.46929 10.979L13.5783 8.7416C13.6435 8.7177 13.7126 8.76601 13.7126 8.83551L13.7125 13.8022C13.7125 13.8574 13.6678 13.9022 13.6125 13.9022H7.99999" stroke="currentColor"></path><path d="M6.15479 7.2395H9.05644" stroke="currentColor"></path></svg>` },
  "edit-outline": { size: 16, svg: (strokeWidth) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke-width="${strokeWidth}"><path d="M8.85596 2.69971H4.19971C3.37141 2.69971 2.69992 3.37146 2.69971 4.19971V11.8003C2.69992 12.6285 3.37141 13.3003 4.19971 13.3003H11.8003C12.6283 13.2999 13.3001 12.6283 13.3003 11.8003V7.89893H14.3003V11.8003C14.3001 13.1806 13.1806 14.2999 11.8003 14.3003H4.19971C2.81913 14.3003 1.69992 13.1808 1.69971 11.8003V4.19971C1.69992 2.81918 2.81913 1.69971 4.19971 1.69971H8.85596V2.69971Z" fill="currentColor"></path><path d="M7.7849 8.23878L13.888 2.13574" stroke="currentColor"></path></svg>` },
  "think-outline": { size: 16, svg: (strokeWidth) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke-width="${strokeWidth}"><path d="M10.2854 5.71481C12.9673 8.39663 14.1182 11.5938 12.8562 12.8559C11.5942 14.1179 8.39706 12.9669 5.71518 10.2851C3.03333 7.60323 1.88236 4.40608 3.14441 3.14403C4.40644 1.882 7.6036 3.03297 10.2854 5.71481Z" stroke="currentColor"></path><path d="M10.2854 10.2851C7.6036 12.9669 4.40644 14.1179 3.14441 12.8559C1.88236 11.5938 3.03333 8.39663 5.71518 5.71481C8.39706 3.03297 11.5942 1.882 12.8562 3.14403C14.1182 4.40608 12.9673 7.60323 10.2854 10.2851Z" stroke="currentColor"></path><path d="M8.86291 8.0002C8.86291 8.47549 8.47762 8.86087 8.00224 8.86087C7.52694 8.86087 7.1416 8.47549 7.1416 8.0002C7.1416 7.52485 7.52694 7.13953 8.00224 7.13953C8.47762 7.13953 8.86291 7.52485 8.86291 8.0002Z" fill="currentColor"></path></svg>` },
  "agent-preset-outline": { size: 16, svg: (strokeWidth) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke-width="${strokeWidth}"><path d="M6.51867 12.3282C7.29816 12.6011 8.16475 12.6514 9.02269 12.4216C9.57879 12.2726 10.0784 12.0185 10.5087 11.6888C10.7819 12.0555 11.1606 12.3304 11.5913 12.4805C10.9688 13.029 10.2149 13.4478 9.35911 13.6771C8.13946 14.0038 6.90632 13.8971 5.82126 13.4533C6.15821 13.1562 6.4021 12.7652 6.51867 12.3282ZM9.17629 2.89409C11.1101 3.34433 12.739 4.81872 13.2889 6.87043C13.4219 7.3665 13.4811 7.8649 13.4774 8.35466C13.0924 8.13213 12.6422 8.01837 12.1741 8.05276L12.1711 8.05257C12.1539 7.77199 12.109 7.48889 12.0334 7.20684C11.6363 5.72533 10.5048 4.6372 9.13549 4.22844C9.25559 3.87667 9.29214 3.49087 9.22309 3.09892C9.2108 3.02922 9.19451 2.96108 9.17629 2.89409ZM4.7311 3.89107L4.78302 4.11879C4.87648 4.4488 5.04146 4.74263 5.25579 4.98896C3.98078 6.01355 3.35848 7.72904 3.8089 9.41059C3.81828 9.44559 3.82866 9.48025 3.83885 9.51479C3.38217 9.61268 2.98548 9.84137 2.68107 10.1556C2.63414 10.022 2.5897 9.88632 2.55244 9.74726C1.93301 7.43489 2.86717 5.07173 4.71504 3.76697L4.7311 3.89107Z" fill="currentColor"></path><path d="M7.99136 5.28105C8.87501 5.28105 9.59136 4.56471 9.59136 3.68105C9.59136 2.7974 8.87501 2.08105 7.99136 2.08105C7.1077 2.08105 6.39136 2.7974 6.39136 3.68105C6.39136 4.56471 7.1077 5.28105 7.99136 5.28105Z" stroke="currentColor"></path><path d="M3.94009 12.9417C4.82374 12.9417 5.54009 12.2254 5.54009 11.3417C5.54009 10.458 4.82374 9.7417 3.94009 9.7417C3.05643 9.7417 2.34009 10.458 2.34009 11.3417C2.34009 12.2254 3.05643 12.9417 3.94009 12.9417Z" stroke="currentColor"></path><path d="M12.0851 12.9417C12.9688 12.9417 13.6851 12.2254 13.6851 11.3417C13.6851 10.458 12.9688 9.7417 12.0851 9.7417C11.2015 9.7417 10.4851 10.458 10.4851 11.3417C10.4851 12.2254 11.2015 12.9417 12.0851 12.9417Z" stroke="currentColor"></path></svg>` },
  "browse-outline": { size: 16, svg: (strokeWidth) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke-width="${strokeWidth}"><path d="M4.9375 5.90295H11.0625" stroke="currentColor"></path><path d="M4.9375 9.02991H8.27841" stroke="currentColor"></path><path d="M12.5 1.32617C13.3039 1.32617 14 1.95171 14 2.77637V13.2246C13.9996 14.0489 13.3036 14.6738 12.5 14.6738H3.5C2.69637 14.6738 2.00042 14.0489 2 13.2246V2.77637C2 1.95171 2.69613 1.32617 3.5 1.32617H12.5ZM3.5 2.32617C3.1993 2.32617 3 2.55186 3 2.77637V13.2246C3.00044 13.4489 3.19963 13.6738 3.5 13.6738H12.5C12.8004 13.6738 12.9996 13.4489 13 13.2246V2.77637C13 2.55186 12.8007 2.32617 12.5 2.32617H3.5Z" fill="currentColor"></path></svg>` },
  "context-injection-outline": { size: 16, svg: (strokeWidth) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke-width="${strokeWidth}"><path d="M5 2.5H3.5C3.23478 2.5 2.98043 2.60536 2.79289 2.79289C2.60536 2.98043 2.5 3.23478 2.5 3.5V13.5C2.5 13.7652 2.60536 14.0196 2.79289 14.2071C2.98043 14.3946 3.23478 14.5 3.5 14.5H12.5C12.7652 14.5 13.0196 14.3946 13.2071 14.2071C13.3946 14.0196 13.5 13.7652 13.5 13.5V3.5C13.5 3.23478 13.3946 2.98043 13.2071 2.79289C13.0196 2.60536 12.7652 2.5 12.5 2.5H11" stroke="currentColor"></path><path d="M8 0.5V7.5" stroke="currentColor"></path><path d="M5.5 5L8 7.5L10.5 5" stroke="currentColor"></path><path d="M5.5 11H10.5" stroke="currentColor"></path></svg>` },
  "link-outline": { size: 16, svg: (strokeWidth) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke-width="${strokeWidth}"><path d="M6.59961 9.40051C6.82779 9.6334 7.10015 9.81842 7.40074 9.94472C7.70132 10.071 8.02409 10.1361 8.35013 10.1361C8.67618 10.1361 8.99894 10.071 9.29953 9.94472C9.60011 9.81842 9.87247 9.6334 10.1007 9.40051L12.9015 6.59967C13.3658 6.13541 13.6266 5.50572 13.6266 4.84915C13.6266 4.19258 13.3658 3.56289 12.9015 3.09863C12.4372 2.63436 11.8075 2.37354 11.151 2.37354C10.4944 2.37354 9.86472 2.63436 9.40045 3.09863L9.05034 3.44873" stroke="currentColor"></path><path d="M9.40051 6.59959C9.17233 6.3667 8.89997 6.18169 8.59939 6.05538C8.2988 5.92907 7.97603 5.86401 7.64999 5.86401C7.32395 5.86401 7.00118 5.92907 6.70059 6.05538C6.40001 6.18169 6.12765 6.3667 5.89946 6.59959L3.09863 9.40043C2.63436 9.8647 2.37354 10.4944 2.37354 11.151C2.37354 11.8075 2.63436 12.4372 3.09863 12.9015C3.56289 13.3657 4.19258 13.6266 4.84915 13.6266C5.50572 13.6266 6.13541 13.3657 6.59967 12.9015L6.94978 12.5514" stroke="currentColor"></path></svg>` },
  "right-up-outline": { size: 16, svg: (strokeWidth) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke-width="${strokeWidth}"><path d="M11.7256 2.77441C12.5538 2.77469 13.2256 3.44616 13.2256 4.27441V10.1416H12.2256V4.27441C12.2256 3.99844 12.0015 3.77469 11.7256 3.77441H5.7207V2.77441H11.7256Z" fill="currentColor"></path><path d="M2.77441 13.2255L12.3756 3.62427" stroke="currentColor"></path></svg>` },
  "enhance-outline": { size: 16, svg: (strokeWidth) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke-width="${strokeWidth}"><path d="M1.98486 2.95374H14.0151" stroke="currentColor"></path><path d="M1.98486 6.31787H14.0151" stroke="currentColor"></path><path d="M1.98486 9.68213H14.0151" stroke="currentColor"></path><path d="M1.98486 13.0463H8.4627" stroke="currentColor"></path></svg>` },
  "trash-outline": { size: 16, svg: (strokeWidth) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke-width="${strokeWidth}"><path d="M1.28149 3.88831H14.7187" stroke="currentColor"></path><path d="M5.41602 3.88833V2.47962C5.41602 2.29282 5.52492 2.11366 5.71876 1.98157C5.9126 1.84948 6.17551 1.77527 6.44964 1.77527H9.55053C9.82466 1.77527 10.0876 1.84948 10.2814 1.98157C10.4753 2.11366 10.5842 2.29282 10.5842 2.47962V3.88833" stroke="currentColor"></path><path d="M2.57349 3.88831L3.19366 13.2943C3.21937 13.5502 3.33952 13.7872 3.53065 13.9593C3.72178 14.1313 3.97016 14.2259 4.22729 14.2246H11.7728C12.0299 14.2259 12.2783 14.1313 12.4694 13.9593C12.6605 13.7872 12.7807 13.5502 12.8064 13.2943L13.4266 3.88831" stroke="currentColor"></path><path d="M6.44946 6.98926V11.1238" stroke="currentColor"></path><path d="M9.55054 6.98926V11.1238" stroke="currentColor"></path></svg>` },
  "warning-outline": { size: 16, svg: (strokeWidth) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke-width="${strokeWidth}"><path d="M8 14.5C11.5899 14.5 14.5 11.5899 14.5 8C14.5 4.41015 11.5899 1.5 8 1.5C4.41015 1.5 1.5 4.41015 1.5 8C1.5 11.5899 4.41015 14.5 8 14.5Z" stroke="currentColor"></path><path d="M8 4.29199V9.79199" stroke="currentColor"></path><path d="M8 10.708V11.708" stroke="currentColor"></path></svg>` },
  "check-circle-fill": { size: 16, svg: (strokeWidth) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 36 36" fill="none" stroke-width="${strokeWidth}"><path d="M28.1936 14.6936L19.8066 23.0806C19.2373 23.65 18.7159 24.1742 18.24 24.5571C17.7389 24.9602 17.1365 25.3359 16.3657 25.458C15.9581 25.5225 15.5428 25.5225 15.1353 25.458C14.3645 25.3359 13.7621 24.9602 13.261 24.5571C12.7851 24.1742 12.2637 23.65 11.6943 23.0806L7.80737 19.1936L10.1936 16.8074L14.0806 20.6943C14.7033 21.317 15.0763 21.6873 15.377 21.9292C15.6523 22.1507 15.7109 22.1325 15.6626 22.1248C15.7208 22.1339 15.7802 22.1339 15.8384 22.1248C15.7901 22.1325 15.8486 22.1507 16.124 21.9292C16.4247 21.6873 16.7977 21.317 17.4204 20.6943L25.8074 12.3074L28.1936 14.6936Z" fill="currentColor"></path><path d="M32.8496 18.0005C32.8496 9.79906 26.2019 3.15137 18.0005 3.15137C9.79906 3.15137 3.15137 9.79906 3.15137 18.0005C3.15137 26.2019 9.79906 32.8496 18.0005 32.8496C26.2019 32.8496 32.8496 26.2019 32.8496 18.0005ZM35.7764 18.0005C35.7764 27.8173 27.8173 35.7764 18.0005 35.7764C8.18363 35.7764 0.224609 27.8173 0.224609 18.0005C0.224609 8.18363 8.18363 0.224609 18.0005 0.224609C27.8173 0.224609 35.7764 8.18363 35.7764 18.0005Z" fill="currentColor"></path></svg>` },
  "warning-triangle-outline": { size: 16, svg: (strokeWidth) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke-linecap="round" stroke-linejoin="round" stroke-width="${strokeWidth}"><path d="M6.87 2.6a1.33 1.33 0 0 1 2.26 0l5.34 9.33A1.33 1.33 0 0 1 13.33 14H2.67a1.33 1.33 0 0 1-1.14-2.07Z" stroke="currentColor"></path><path d="M8 6v3m0 2.33h.01" stroke="currentColor"></path></svg>` },
  "user-outline": { size: 16, svg: (strokeWidth) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke-width="${strokeWidth}"><path d="M8 8.25C9.51878 8.25 10.75 7.01878 10.75 5.5C10.75 3.98122 9.51878 2.75 8 2.75C6.48122 2.75 5.25 3.98122 5.25 5.5C5.25 7.01878 6.48122 8.25 8 8.25Z" stroke="currentColor"></path><path d="M2.5 14.5C2.5 11.5 5.25 10.25 8 10.25C10.75 10.25 13.5 11.5 13.5 14.5" stroke="currentColor"></path></svg>` },
  // Users has inset contours in the 16px box; only coordinates, never stroke widths, carry the inset.
  "users-outline": { size: 16, svg: (strokeWidth) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke-width="${strokeWidth}"><path d="M6.18 8.2275C7.5620898 8.2275 8.6825 7.1070898 8.6825 5.725C8.6825 4.3429102 7.5620898 3.2225 6.18 3.2225C4.7979102 3.2225 3.6775 4.3429102 3.6775 5.725C3.6775 7.1070898 4.7979102 8.2275 6.18 8.2275Z" stroke="currentColor"></path><path d="M1.63 13.915C1.63 11.185 3.905 10.0475 6.18 10.0475C8.455 10.0475 10.73 11.185 10.73 13.915" stroke="currentColor"></path><path d="M10.275 3.359C11.3215 3.7685 12.0495 4.6785 12.0495 5.725C12.0495 6.7715 11.3215 7.6815 10.275 8.091" stroke="currentColor"></path><path d="M12.004 10.366C13.369 11.003 14.37 12.186 14.37 13.915" stroke="currentColor"></path></svg>` },
  "paper-plane-outline": { size: 14, svg: (strokeWidth) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke-width="${strokeWidth}"><path d="M4.74024 9.11029L1.82882 7.79865C1.75022 7.76323 1.75026 7.65161 1.82889 7.61626L12.9665 2.60943C13.0354 2.57846 13.1125 2.63213 13.1073 2.70749L12.3914 13.1388C12.3864 13.2117 12.3073 13.2548 12.2433 13.2194L6.12677 9.83657" stroke="currentColor"></path><path d="M8.44336 11.0825L6.2832 13.2843C6.22048 13.3482 6.11182 13.3038 6.11182 13.2143V9.86772C6.11182 9.84165 6.122 9.8166 6.1402 9.79793L12.972 2.78748" stroke="currentColor"></path></svg>` },
  "stop-fill": { size: 16, svg: (strokeWidth) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke-width="${strokeWidth}"><path d="M12.5 2.5H3.5C2.94772 2.5 2.5 2.94772 2.5 3.5V12.5C2.5 13.0523 2.94772 13.5 3.5 13.5H12.5C13.0523 13.5 13.5 13.0523 13.5 12.5V3.5C13.5 2.94772 13.0523 2.5 12.5 2.5Z" fill="currentColor"></path></svg>` },
  "paperclip-outline": { size: 16, svg: (strokeWidth) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke-width="${strokeWidth}"><path d="M12.75 4.5V9.5C12.75 10.7598 12.2496 11.968 11.3588 12.8588C10.468 13.7496 9.25978 14.25 8 14.25C6.74022 14.25 5.53204 13.7496 4.64124 12.8588C3.75045 11.968 3.25 10.7598 3.25 9.5V5C3.25 4.13805 3.59241 3.3114 4.2019 2.7019C4.8114 2.09241 5.63805 1.75 6.5 1.75C7.36195 1.75 8.1886 2.09241 8.7981 2.7019C9.40759 3.3114 9.75 4.13805 9.75 5V9.5C9.75 9.96413 9.56563 10.4092 9.23744 10.7374C8.90925 11.0656 8.46413 11.25 8 11.25C7.53587 11.25 7.09075 11.0656 6.76256 10.7374C6.43437 10.4092 6.25 9.96413 6.25 9.5V5.5" stroke="currentColor"></path></svg>` },
  "loading-outline": { size: 16, svg: (strokeWidth) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke-width="${strokeWidth}"><path d="M12.596 12.596C11.687 13.5049 10.5288 14.1239 9.26798 14.3747C8.00716 14.6255 6.70028 14.4968 5.51261 14.0048C4.32494 13.5129 3.30981 12.6798 2.59557 11.611C1.88134 10.5421 1.50008 9.2855 1.5 7.99998C1.50008 6.71446 1.88134 5.45783 2.59557 4.38898C3.30981 3.32013 4.32494 2.48707 5.51261 1.99513C6.70028 1.50319 8.00716 1.37447 9.26798 1.62524C10.5288 1.87602 11.687 2.49502 12.596 3.40398" stroke="currentColor"></path></svg>` },
  "download-outline": { size: 16, svg: (strokeWidth) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke-width="${strokeWidth}"><path d="M8 1.95317V10.0469" stroke="currentColor"></path><path d="M4.25 6.29688L8 10.0469L11.75 6.29688" stroke="currentColor"></path><path d="M1.5 10.0469V13.158C1.5 13.3937 1.60536 13.6198 1.79289 13.7865C1.98043 13.9532 2.23478 14.0469 2.5 14.0469H13.5C13.7652 14.0469 14.0196 13.9532 14.2071 13.7865C14.3946 13.6198 14.5 13.3937 14.5 13.158V10.0469" stroke="currentColor"></path></svg>` },
  "upload-outline": { size: 16, svg: (strokeWidth) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke-width="${strokeWidth}"><path d="M8 10.0469V1.95317" stroke="currentColor"></path><path d="M4.25 5.70317L8 1.95317L11.75 5.70317" stroke="currentColor"></path><path d="M1.5 10.0469V13.158C1.5 13.3937 1.60536 13.6198 1.79289 13.7865C1.98043 13.9532 2.23478 14.0469 2.5 14.0469H13.5C13.7652 14.0469 14.0196 13.9532 14.2071 13.7865C14.3946 13.6198 14.5 13.3937 14.5 13.158V10.0469" stroke="currentColor"></path></svg>` },
  "play-outline": { size: 16, svg: (strokeWidth) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke-width="${strokeWidth}"><path d="M8 14.5C11.5899 14.5 14.5 11.5899 14.5 8C14.5 4.41015 11.5899 1.5 8 1.5C4.41015 1.5 1.5 4.41015 1.5 8C1.5 11.5899 4.41015 14.5 8 14.5Z" stroke="currentColor"></path><path d="M10.3329 7.91346C10.3996 7.95195 10.3996 8.04818 10.3329 8.08667L6.78304 10.1362C6.71638 10.1747 6.63304 10.1266 6.63304 10.0496L6.63304 5.95055C6.63304 5.87357 6.71638 5.82546 6.78304 5.86395L10.3329 7.91346Z" stroke="currentColor"></path></svg>` },
  "pause-outline": { size: 16, svg: (strokeWidth) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke-width="${strokeWidth}"><path d="M8 14.5C11.5899 14.5 14.5 11.5899 14.5 8C14.5 4.41015 11.5899 1.5 8 1.5C4.41015 1.5 1.5 4.41015 1.5 8C1.5 11.5899 4.41015 14.5 8 14.5Z" stroke="currentColor"></path><path d="M6.5 5V11" stroke="currentColor"></path><path d="M9.5 5V11" stroke="currentColor"></path></svg>` },
  "fullscreen-outline": { size: 16, svg: (strokeWidth) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke-width="${strokeWidth}"><path d="M2.33154 9.40576V13.1685C2.3318 13.4444 2.55556 13.6685 2.83154 13.6685H6.49463V14.6685H2.83154C2.00328 14.6685 1.3318 13.9967 1.33154 13.1685V9.40576H2.33154ZM13.1685 1.33154C13.9964 1.33199 14.6683 2.00352 14.6685 2.83154V6.40576H13.6685V2.83154C13.6683 2.5558 13.4441 2.33199 13.1685 2.33154H9.49463V1.33154H13.1685Z" fill="currentColor"></path><path d="M9.4292 6.57077L13.914 2.08594" stroke="currentColor"></path><path d="M6.57077 9.4292L2.08594 13.914" stroke="currentColor"></path></svg>` },
  "code-outline": { size: 16, svg: (strokeWidth) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke-width="${strokeWidth}"><path d="M6.27612 1.5L4.52612 14.5" stroke="currentColor"></path><path d="M11.4739 1.5L9.72388 14.5" stroke="currentColor"></path><path d="M2.39868 5.5H14.0681" stroke="currentColor"></path><path d="M1.93188 10.5H13.6013" stroke="currentColor"></path></svg>` },
  "cordis-plugin-outline": { size: 14, svg: (strokeWidth) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke-width="${strokeWidth}"><path d="M3.16143 6.59068L1.75205 8.00006L3.10619 9.35419L2.39908 10.0613L0.832948 8.49517C0.559581 8.2218 0.559582 7.77831 0.832948 7.50494L2.45432 5.88357L3.16143 6.59068ZM8.49511 15.1671C8.22176 15.4405 7.77826 15.4404 7.50489 15.1671L5.93461 13.5968L6.64172 12.8897L8 14.248L9.40938 12.8386L10.1165 13.5457L8.49511 15.1671ZM15.1671 7.50494C15.4403 7.7782 15.4401 8.22179 15.1671 8.49517L13.652 10.0102L12.9449 9.30309L14.248 8.00006L12.8897 6.64178L13.5968 5.93467L15.1671 7.50494ZM9.35414 3.10624L8 1.7521L6.69696 3.05514L5.98986 2.34803L7.50489 0.833003C7.77828 0.559981 8.22186 0.559752 8.49511 0.833003L10.0612 2.39913L9.35414 3.10624Z" fill="currentColor"></path><circle cx="8" cy="8" r="1.76221" stroke="currentColor"></circle></svg>` },
  "api-outline": { size: 14, svg: (strokeWidth) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke-width="${strokeWidth}"><path d="M3 4L7 8L3 12" stroke="currentColor"></path><path d="M9 12H13" stroke="currentColor"></path></svg>` },
  "personalization-outline": { size: 16, svg: (strokeWidth) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke-width="${strokeWidth}"><path d="M3.25 7.16357C3.20417 7.32247 3.17778 7.48993 3.17773 7.66357C3.17773 7.83698 3.20336 8.00486 3.24902 8.16357H1.85742V7.16357H3.25ZM14.1426 8.16357H6.71484C6.76052 8.00485 6.78613 7.837 6.78613 7.66357C6.78609 7.48991 6.75971 7.32249 6.71387 7.16357H14.1426V8.16357Z" fill="currentColor"></path><path d="M9.1377 11.9092C9.08596 12.0666 9.05668 12.2344 9.05664 12.4092C9.05664 12.5838 9.08606 12.7518 9.1377 12.9092H1.85742V11.9092H9.1377ZM14.1426 12.9092H12.1816C12.2332 12.7519 12.2617 12.5838 12.2617 12.4092C12.2617 12.2345 12.2333 12.0666 12.1816 11.9092H14.1426V12.9092Z" fill="currentColor"></path><path d="M9.1123 3.09106C9.06138 3.24865 9.03324 3.41653 9.0332 3.59106C9.0332 3.76549 9.06148 3.93355 9.1123 4.09106H1.85742V3.09106H9.1123ZM14.1426 4.09106H12.207C12.2578 3.93358 12.2861 3.76545 12.2861 3.59106C12.2861 3.41657 12.2579 3.24862 12.207 3.09106H14.1426V4.09106Z" fill="currentColor"></path><circle cx="4.97065" cy="7.66401" r="1.35151" stroke="currentColor"></circle><circle cx="10.6596" cy="12.4091" r="1.35151" stroke="currentColor"></circle><circle cx="10.6596" cy="3.59101" r="1.35151" stroke="currentColor"></circle></svg>` },
  "project-add-outline": { size: 16, svg: (strokeWidth) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke-width="${strokeWidth}"><path d="M5.54492 2.06738C5.91034 2.06754 6.26318 2.20149 6.53711 2.44336L7.94043 3.68164V4.7998C7.71462 4.74105 7.50367 4.63139 7.32617 4.47461L5.87598 3.19238C5.78477 3.11185 5.66658 3.06754 5.54492 3.06738H2.94922C2.67322 3.06738 2.44946 3.29145 2.44922 3.56738V12.4326C2.44927 12.7087 2.67311 12.9326 2.94922 12.9326H12.9326C13.2086 12.9325 13.4326 12.7086 13.4326 12.4326V8.53613H14.4326V12.4326C14.4326 13.2609 13.7609 13.9325 12.9326 13.9326H2.94922C2.12083 13.9326 1.44927 13.261 1.44922 12.4326V3.56738C1.44946 2.73916 2.12094 2.06738 2.94922 2.06738H5.54492Z" fill="currentColor"></path><path d="M9.75977 4.50208H14.5509" stroke="currentColor"></path><path d="M12.1492 6.89758L12.1492 2.10642" stroke="currentColor"></path></svg>` },
  "folder-open-outline": { size: 16, svg: (strokeWidth) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke-width="${strokeWidth}"><path d="M12.3994 13.5986H2.04956C1.49728 13.5986 1.04956 13.1509 1.04956 12.5986V3.40137C1.04956 2.84908 1.49728 2.40137 2.04956 2.40137H4.76632C5.01016 2.40137 5.24561 2.49046 5.42836 2.6519L6.94088 3.98799C7.12364 4.14943 7.35908 4.23852 7.60293 4.23852H12.3994C12.9517 4.23852 13.3994 4.68624 13.3994 5.23852V7.16991" stroke="currentColor"></path><path d="M2.55911 7.93683C2.67584 7.49906 3.07229 7.19446 3.52536 7.19446H13.6491C14.3061 7.19446 14.7846 7.81725 14.6153 8.45209L13.4411 12.856C13.3244 13.2938 12.9279 13.5984 12.4748 13.5984H2.35113C1.69411 13.5984 1.21562 12.9756 1.38489 12.3407L2.55911 7.93683Z" stroke="currentColor"></path></svg>` },
  "folder-open": { size: 16, svg: (strokeWidth) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke-width="${strokeWidth}"><path d="M2.55912 7.93683C2.67584 7.49906 3.0723 7.19446 3.52536 7.19446H13.6491C14.3061 7.19446 14.7846 7.81725 14.6153 8.45209L13.4411 12.856C13.3244 13.2938 12.9279 13.5984 12.4748 13.5984H2.35113C1.69411 13.5984 1.21562 12.9756 1.38489 12.3407L2.55912 7.93683Z" fill="currentColor" opacity="0.16"></path><path d="M13.6491 6.69446C14.6346 6.69453 15.3522 7.62895 15.0983 8.58118L13.9245 12.9845C13.7494 13.6412 13.1539 14.0988 12.4743 14.0988H2.35126C1.36574 14.0988 0.648153 13.1643 0.902044 12.212L2.07587 7.80774C2.25102 7.15128 2.84567 6.69455 3.52509 6.69446H13.6491ZM3.52509 7.69446C3.29865 7.69455 3.10004 7.84674 3.04169 8.06555L1.86786 12.4698C1.78345 12.7872 2.02285 13.0988 2.35126 13.0988H12.4743C12.7007 13.0988 12.8992 12.9463 12.9577 12.7277L14.1325 8.32336C14.2171 8.00598 13.9776 7.69453 13.6491 7.69446H3.52509Z" fill="currentColor"></path><path d="M4.7666 1.90137C5.13227 1.90144 5.48571 2.03525 5.75977 2.27734L7.27246 3.61328C7.36379 3.69382 7.48174 3.73828 7.60352 3.73828H12.3994C13.2276 3.73841 13.8993 4.41005 13.8994 5.23828V6.7168C13.8183 6.70327 13.735 6.69436 13.6494 6.69434H12.8994V5.23828C12.8993 4.96233 12.6754 4.73841 12.3994 4.73828H7.60352C7.23781 4.73828 6.88446 4.60438 6.61035 4.3623L5.09766 3.02637C5.00636 2.94576 4.88838 2.90144 4.7666 2.90137H2.0498C1.77366 2.90137 1.5498 3.12523 1.5498 3.40137V9.78223L0.902344 12.2119C0.648452 13.1642 1.36604 14.0986 2.35156 14.0986H2.0498C1.2214 14.0986 0.549838 13.427 0.549805 12.5986V3.40137C0.549805 2.57294 1.22138 1.90137 2.0498 1.90137H4.7666Z" fill="currentColor"></path></svg>` },
  "folder-close": { size: 16, svg: (strokeWidth) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke-width="${strokeWidth}"><path d="M1.50439 3.11059C1.50439 2.55831 1.95211 2.1106 2.50439 2.1106H5.43389C5.67773 2.1106 5.91318 2.19969 6.09593 2.36113L7.71649 3.79265C7.89924 3.95409 8.1347 4.04319 8.3785 4.04319H13.4958C14.0481 4.04319 14.4958 4.4909 14.4958 5.04319V12.8894C14.4958 13.4417 14.0481 13.8894 13.4958 13.8894H2.50439C1.95211 13.8894 1.50439 13.4417 1.50439 12.8894V4.04319V3.11059Z" stroke="currentColor"></path><path d="M3.63501 7.66614H12.3647" stroke="currentColor"></path></svg>` },
  "tree-corner": { size: 10, aspect: [8, 10], svg: (strokeWidth) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 9 11" fill="none" stroke-width="${strokeWidth}"><path d="M0.5 0V7C0.5 7.79565 0.81607 8.55871 1.37868 9.12132C1.94129 9.68393 2.70435 10 3.5 10H8.5" stroke="currentColor"></path></svg>` },
  "light-outline": { size: 16, svg: (strokeWidth) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke-width="${strokeWidth}"><path d="M8.00007 11.8117C10.1052 11.8117 11.8117 10.1052 11.8117 8.00007C11.8117 5.89499 10.1052 4.18848 8.00007 4.18848C5.89499 4.18848 4.18848 5.89499 4.18848 8.00007C4.18848 10.1052 5.89499 11.8117 8.00007 11.8117Z" stroke="currentColor"></path><path d="M13.3899 8H15.1499" stroke="currentColor"></path><path d="M11.8115 11.8115L13.0556 13.0556" stroke="currentColor"></path><path d="M8 13.3901V15.1501" stroke="currentColor"></path><path d="M4.18868 11.8115L2.94458 13.0556" stroke="currentColor"></path><path d="M2.6101 8H0.850098" stroke="currentColor"></path><path d="M4.18868 4.18856L2.94458 2.94446" stroke="currentColor"></path><path d="M8 2.6101V0.850098" stroke="currentColor"></path><path d="M11.8115 4.18856L13.0556 2.94446" stroke="currentColor"></path></svg>` },
  "dark-outline": { size: 16, svg: (strokeWidth) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke-width="${strokeWidth}"><path d="M14.1127 8.70663C14.2576 8.60602 14.4627 8.71355 14.4386 8.88834C14.2901 9.96567 13.8731 10.9912 13.2229 11.8692C12.479 12.8735 11.4613 13.6421 10.2917 14.0829C9.1222 14.5236 7.85038 14.6179 6.62865 14.3543C5.40692 14.0907 4.28709 13.4805 3.40332 12.5967C2.51955 11.7129 1.90931 10.5931 1.64572 9.37135C1.38212 8.14962 1.47635 6.87779 1.91711 5.70825C2.35787 4.5387 3.12647 3.52103 4.13083 2.77714C5.00878 2.12689 6.03433 1.70994 7.11166 1.5614C7.28645 1.5373 7.39397 1.74238 7.29337 1.88734C6.68703 2.76099 6.37885 3.81241 6.42313 4.88345C6.47392 6.11194 6.98471 7.27645 7.85413 8.14587C8.72355 9.01529 9.88805 9.52608 11.1166 9.57687C12.1876 9.62114 13.239 9.31296 14.1127 8.70663Z" stroke="currentColor"></path></svg>` },
  "followsystem-outline": { size: 16, svg: (strokeWidth) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke-width="${strokeWidth}"><path d="M13.5 2.5H2.5C1.94772 2.5 1.5 2.94772 1.5 3.5V11.5C1.5 12.0523 1.94772 12.5 2.5 12.5H13.5C14.0523 12.5 14.5 12.0523 14.5 11.5V3.5C14.5 2.94772 14.0523 2.5 13.5 2.5Z" stroke="currentColor"></path><path d="M5 14.5H11" stroke="currentColor"></path></svg>` },
  "data-outline": { size: 16, svg: (strokeWidth) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke-width="${strokeWidth}"><path d="M7.8667 0.349609C8.96906 0.349634 10.0601 0.481272 11.0317 0.735352C11.9973 0.987845 12.8453 1.362 13.4644 1.84766C14.0744 2.32629 14.507 2.95539 14.5161 3.69336H14.5171V8.53516C14.0843 8.32076 13.6108 8.17679 13.1108 8.11816C13.1831 7.96848 13.2162 7.82856 13.2163 7.70312V5.76758C12.6269 6.16618 11.8739 6.47995 11.0317 6.7002C10.0602 6.95423 8.96896 7.08494 7.8667 7.08496C6.76461 7.08493 5.67411 6.95415 4.70264 6.7002C3.85994 6.48006 3.10694 6.1662 2.51709 5.76758V7.70312L2.521 7.78418C2.56374 8.19554 2.93361 8.74414 3.91357 9.23145C4.9281 9.73585 6.35004 10.0371 7.8667 10.0371C8.26373 10.0371 8.6543 10.0141 9.03271 9.97461C8.75596 10.3799 8.54664 10.8349 8.42041 11.3232C8.23666 11.3313 8.0518 11.3369 7.8667 11.3369C6.20108 11.3369 4.57025 11.01 3.33447 10.3955C3.04163 10.2499 2.76658 10.0836 2.51709 9.90039V11.6738C2.51728 12.1379 2.88589 12.7556 3.92236 13.292C4.93457 13.8157 6.35342 14.1289 7.8667 14.1289C8.12318 14.1289 8.37694 14.1161 8.62646 14.0986C8.82021 14.5535 9.08999 14.9682 9.41943 15.3271C8.91285 15.3934 8.39149 15.4287 7.8667 15.4287C6.19761 15.4287 4.56379 15.0869 3.32568 14.4463C2.11244 13.8185 1.21649 12.8562 1.21631 11.6738V3.76367C1.21595 3.74853 1.21438 3.733 1.21436 3.71777C1.21436 2.96917 1.65103 2.33053 2.26807 1.84668C2.88747 1.36112 3.73675 0.987685 4.70264 0.735352C5.67413 0.481376 6.76457 0.349636 7.8667 0.349609ZM7.8667 1.65039C6.86269 1.65042 5.88326 1.77028 5.03076 1.99316C4.17183 2.2176 3.50421 2.52956 3.06982 2.87012C2.65043 3.19909 2.52622 3.48898 2.51709 3.69336V3.74414C2.52719 3.94845 2.65185 4.23772 3.06982 4.56543C3.50425 4.90601 4.17172 5.21795 5.03076 5.44238C5.88326 5.66527 6.8627 5.78513 7.8667 5.78516C8.8707 5.78513 9.85015 5.66525 10.7026 5.44238C11.5611 5.21787 12.2286 4.9049 12.6626 4.56445C13.0982 4.22252 13.2163 3.9231 13.2163 3.71777L13.2104 3.63574C13.1818 3.43623 13.044 3.16941 12.6626 2.87012C12.2286 2.52957 11.5614 2.21773 10.7026 1.99316C9.85009 1.77025 8.8708 1.65041 7.8667 1.65039Z" fill="currentColor"></path><path d="M12.8936 10.0361L13.2061 10.5566C13.2296 10.5959 13.2651 10.6562 13.3027 10.707C13.3469 10.7666 13.4148 10.8431 13.5195 10.9023C13.6244 10.9617 13.725 10.9801 13.7988 10.9873C13.8619 10.9934 13.9318 10.9932 13.9775 10.9932H14.6162L14.8896 11.4502L14.5947 11.9443C14.5698 11.9859 14.5312 12.0483 14.5029 12.1084C14.4781 12.1611 14.4514 12.2312 14.4395 12.3164L14.4326 12.4072L14.4395 12.4971C14.4514 12.5825 14.4781 12.6532 14.5029 12.7061C14.5312 12.7661 14.5689 12.8287 14.5938 12.8701L14.8896 13.3633L14.6162 13.8213H13.9775C13.9318 13.8213 13.8619 13.821 13.7988 13.8271C13.7433 13.8326 13.6728 13.8442 13.5967 13.875L13.5195 13.9121C13.4148 13.9714 13.3469 14.0478 13.3027 14.1074C13.265 14.1583 13.2296 14.2186 13.2061 14.2578L12.8936 14.7783H12.3115L11.999 14.2578C11.9755 14.2186 11.9401 14.1583 11.9023 14.1074C11.8693 14.0628 11.823 14.0083 11.7578 13.959L11.6855 13.9121L11.6074 13.875C11.5316 13.8445 11.4615 13.8325 11.4062 13.8271C11.3432 13.821 11.2733 13.8213 11.2275 13.8213H10.5889L10.3135 13.3633L10.6104 12.8701C10.6352 12.8287 10.6739 12.7661 10.7021 12.7061C10.7352 12.6357 10.7724 12.534 10.7725 12.4072C10.7724 12.2804 10.7352 12.1788 10.7021 12.1084C10.6739 12.0483 10.6353 11.9859 10.6104 11.9443L10.3135 11.4502L10.5889 10.9932H11.2275C11.2733 10.9932 11.3432 10.9934 11.4062 10.9873C11.4801 10.9801 11.5808 10.9616 11.6855 10.9023C11.7903 10.843 11.8582 10.7666 11.9023 10.707C11.94 10.6562 11.9755 10.5959 11.999 10.5566L12.3115 10.0361H12.8936Z" stroke="currentColor" stroke-miterlimit="10"></path></svg>` },
  "database-outline": { size: 16, svg: (strokeWidth) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke-width="${strokeWidth}"><path d="M13.1967 5.1869C13.7232 4.77378 14.0003 4.30517 14.0001 3.82819C14.0003 3.3512 13.7232 2.88259 13.1967 2.46947C12.6702 2.05635 11.9128 1.71328 11.0006 1.47475C10.0885 1.23621 9.05371 1.11062 8.00039 1.1106C6.94707 1.11057 5.9123 1.23612 5.00009 1.47461C4.08742 1.71301 3.32948 2.05604 2.80249 2.46919C2.2755 2.88235 1.99805 3.35106 1.99805 3.82819C1.99805 4.30531 2.2755 4.77402 2.80249 5.18718C3.32948 5.60033 4.08742 5.94336 5.00009 6.18176C5.9123 6.42025 6.94707 6.5458 8.00039 6.54578C9.05371 6.54575 10.0885 6.42016 11.0006 6.18163C11.9128 5.94309 12.6702 5.60002 13.1967 5.1869Z" stroke="currentColor"></path><path d="M2 3.80371V11.7848" stroke="currentColor"></path><path d="M14 3.80371V11.7848" stroke="currentColor"></path><path d="M2 7.81396C2 8.60524 2.63214 9.36411 3.75736 9.92363C4.88258 10.4832 6.4087 10.7975 8 10.7975C9.5913 10.7975 11.1174 10.4832 12.2426 9.92363C13.3679 9.36411 14 8.60524 14 7.81396" stroke="currentColor"></path><path d="M2 11.7847C2 12.6081 2.63214 13.3977 3.75736 13.98C4.88258 14.5622 6.4087 14.8893 8 14.8893C9.5913 14.8893 11.1174 14.5622 12.2426 13.98C13.3679 13.3977 14 12.6081 14 11.7847" stroke="currentColor"></path></svg>` },
  "clock-outline": { size: 16, svg: (strokeWidth) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke-width="${strokeWidth}"><path d="M8 14C11.3137 14 14 11.3137 14 8C14 4.68629 11.3137 2 8 2C4.68629 2 2 4.68629 2 8C2 11.3137 4.68629 14 8 14Z" stroke="currentColor"></path><path d="M8 4.31V8.46L11 10.08" stroke="currentColor"></path></svg>` },
  "gauge-outline": { size: 16, svg: (strokeWidth) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke-width="${strokeWidth}"><path d="M3.4041 13.096C2.49514 12.187 1.87614 11.0288 1.62537 9.76798C1.37459 8.50716 1.50331 7.20028 1.99525 6.01261C2.48719 4.82494 3.32025 3.80981 4.3891 3.09557C5.45795 2.38134 6.71458 2.00008 8.0001 2C9.28563 2.00008 10.5423 2.38134 11.6111 3.09557C12.68 3.80981 13.513 4.82494 14.005 6.01261C14.4969 7.20028 14.6256 8.50716 14.3748 9.76798C14.1241 11.0288 13.5051 12.187 12.5961 13.096" stroke="currentColor"></path><path d="M8 8.49994L11.6114 4.88855" stroke="currentColor"></path><path d="M8 9.75C8.69036 9.75 9.25 9.19036 9.25 8.5C9.25 7.80964 8.69036 7.25 8 7.25C7.30964 7.25 6.75 7.80964 6.75 8.5C6.75 9.19036 7.30964 9.75 8 9.75Z" fill="currentColor"></path></svg>` },
  "send-outline": { size: 14, svg: (strokeWidth) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke-width="${strokeWidth}"><path d="M6.97211 1.94476C7.55785 1.35914 8.50767 1.35919 9.09343 1.94476L13.921 6.77228L13.2138 7.47939L8.38632 2.65187C8.19108 2.45682 7.87443 2.45677 7.67922 2.65187L2.74397 7.58711L2.03687 6.88L6.97211 1.94476Z" fill="currentColor"></path><path d="M7.97571 14.5732L8.02421 2.34139" stroke="currentColor"></path></svg>` },
  "queue-outline": { size: 14, svg: (strokeWidth) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke-width="${strokeWidth}"><path d="M5 6.75H11" stroke="currentColor"></path><path d="M5 9H8" stroke="currentColor"></path><path d="M2.37067 11.2497C1.5872 9.89252 1.32042 8.29798 1.61945 6.7597C1.91847 5.22141 2.76317 3.84293 3.99801 2.87809C5.23285 1.91325 6.7747 1.427 8.33964 1.50888C9.90458 1.59076 11.3873 2.23526 12.5147 3.32369C13.6422 4.41232 14.3384 5.8717 14.4751 7.43304C14.6118 8.99438 14.1797 10.5525 13.2585 11.8205C12.3372 13.0885 10.9889 13.9809 9.4617 14.3334C8.18666 14.6277 6.8587 14.529 5.64964 14.0601C5.17095 13.8745 4.76937 13.4929 4.26509 13.3963C3.67389 13.2832 2.95232 13.5595 2.0377 14.3334" stroke="currentColor"></path></svg>` },
  "checklist-outline": { size: 14, svg: (strokeWidth) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke-width="${strokeWidth}"><path d="M3.75 6.25C4.7165 6.25 5.5 5.4665 5.5 4.5C5.5 3.5335 4.7165 2.75 3.75 2.75C2.7835 2.75 2 3.5335 2 4.5C2 5.4665 2.7835 6.25 3.75 6.25Z" stroke="currentColor"></path><path d="M7.5 4.5H13.5" stroke="currentColor"></path><path d="M3.75 13.25C4.7165 13.25 5.5 12.4665 5.5 11.5C5.5 10.5335 4.7165 9.75 3.75 9.75C2.7835 9.75 2 10.5335 2 11.5C2 12.4665 2.7835 13.25 3.75 13.25Z" stroke="currentColor"></path><path d="M7.5 11.5H13.5" stroke="currentColor"></path></svg>` },
  "list-pen-outline": { size: 16, svg: (strokeWidth) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke-width="${strokeWidth}"><path d="M4.9375 5.90295H11.0625" stroke="currentColor"></path><path d="M4.9375 9.02991H8.27841" stroke="currentColor"></path><path d="M12.5 1.32617C13.3039 1.32617 14 1.95171 14 2.77637V7.61328L13 8.68164V2.77637C13 2.55186 12.8007 2.32617 12.5 2.32617H3.5C3.1993 2.32617 3 2.55186 3 2.77637V13.2246C3.00044 13.4489 3.19963 13.6738 3.5 13.6738H8.32812L7.39258 14.6738H3.5C2.69637 14.6738 2.00042 14.0489 2 13.2246V2.77637C2 1.95171 2.69613 1.32617 3.5 1.32617H12.5Z" fill="currentColor"></path><path d="M8.97212 14.3693C9.17511 14.5723 9.37811 14.7753 9.5811 14.9783C9.67012 14.8953 9.75914 14.8123 9.84815 14.7293C11.4505 13.2352 13.0528 11.7411 14.6551 10.247C14.7441 10.164 14.8331 10.081 14.9221 9.99803C14.5989 9.6748 14.2756 9.35157 13.9524 9.02834C13.8694 9.11736 13.7864 9.20637 13.7034 9.29539C12.2093 10.8977 10.7152 12.5 9.22113 14.1023C9.13813 14.1913 9.05513 14.2803 8.97212 14.3693Z" fill="currentColor"></path><path d="M11.6323 13.7841C11.6323 14.0395 11.6323 14.295 11.6323 14.5504C11.6812 14.5523 11.7301 14.5543 11.779 14.5562C12.659 14.5913 13.539 14.6263 14.419 14.6614C14.4679 14.6633 14.5168 14.6653 14.5657 14.6672C14.5657 14.3339 14.5657 14.0006 14.5657 13.6672C14.5168 13.6692 14.4679 13.6711 14.419 13.6731C13.539 13.7081 12.659 13.7432 11.779 13.7783C11.7301 13.7802 11.6812 13.7821 11.6323 13.7841Z" fill="currentColor"></path></svg>` },
  "goal-outline": { size: 16, svg: (strokeWidth) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke-width="${strokeWidth}"><path d="M14.5001 8C14.5 9.28552 14.1188 10.5422 13.4045 11.611C12.6903 12.6799 11.6752 13.5129 10.4875 14.0049C9.29982 14.4968 7.99295 14.6255 6.73212 14.3747C5.4713 14.124 4.31314 13.505 3.4041 12.596C2.49514 11.687 1.87614 10.5288 1.62537 9.26798C1.37459 8.00716 1.50331 6.70028 1.99525 5.51261C2.48719 4.32494 3.32025 3.30981 4.3891 2.59557C5.45795 1.88134 6.71458 1.50008 8.0001 1.5" stroke="currentColor"></path><path d="M11.5 8C11.5001 8.69227 11.2948 9.36901 10.9102 9.94463C10.5257 10.5202 9.97901 10.9689 9.33944 11.2338C8.69986 11.4987 7.99609 11.5681 7.31712 11.433C6.63816 11.2979 6.01449 10.9645 5.52501 10.475C5.03548 9.98552 4.70209 9.36185 4.56702 8.68289C4.43195 8.00392 4.50127 7.30015 4.76619 6.66057C5.03112 6.021 5.47976 5.47436 6.05538 5.08978C6.631 4.70519 7.30774 4.49995 8.00001 4.5" stroke="currentColor"></path><path d="M8.00024 7.99976L11.2 4.80005" stroke="currentColor"></path><path d="M12.4719 5.62245C12.4246 5.66972 12.3569 5.69025 12.2913 5.67715L10.7814 5.37555C10.7022 5.35972 10.6402 5.29781 10.6244 5.2186L10.3228 3.70866C10.3097 3.6431 10.3302 3.57533 10.3775 3.52806L12.1826 1.723C12.2863 1.61929 12.4627 1.65879 12.5122 1.79684L12.9271 2.95225C12.9472 3.00847 12.9915 3.05272 13.0477 3.07291L14.2031 3.48774C14.3412 3.5373 14.3807 3.71368 14.277 3.81739L12.4719 5.62245Z" stroke="currentColor"></path></svg>` },
  "sparkle": { size: 16, svg: (strokeWidth) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke-width="${strokeWidth}"><path d="M5.875 3C5.875 6.33333 7.54167 8 10.875 8C7.54167 8 5.875 9.66667 5.875 13C5.875 9.66667 4.20833 8 0.875 8C4.20833 8 5.875 6.33333 5.875 3Z" stroke="currentColor"></path><path d="M12.375 1.55823C12.375 3.39156 13.2917 4.30823 15.125 4.30823C13.2917 4.30823 12.375 5.22489 12.375 7.05823C12.375 5.22489 11.4583 4.30823 9.625 4.30823C11.4583 4.30823 12.375 3.39156 12.375 1.55823Z" stroke="currentColor"></path><path d="M12.375 10.4418C12.375 11.7751 13.0417 12.4418 14.375 12.4418C13.0417 12.4418 12.375 13.1084 12.375 14.4418C12.375 13.1084 11.7083 12.4418 10.375 12.4418C11.7083 12.4418 12.375 11.7751 12.375 10.4418Z" stroke="currentColor"></path></svg>` },
  "inspect-outline": { size: 12, svg: (strokeWidth) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke-width="${strokeWidth}"><path d="M4.67398 4.25061L1.36094 7.86484C1.29085 7.9413 1.29085 8.05866 1.36094 8.13513L4.67398 11.7494" stroke="currentColor"></path><path d="M11.3262 4.25061L14.6392 7.86484C14.7093 7.9413 14.7093 8.05866 14.6392 8.13513L11.3262 11.7494" stroke="currentColor"></path><path d="M9.56222 3.62573L6.43774 12.3743" stroke="currentColor"></path></svg>` },
  "skill-outline": { size: 16, svg: (strokeWidth) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 17 17" fill="none" stroke-width="${strokeWidth}"><path d="M4.57788 5.77124H10.7029" stroke="currentColor"></path><path d="M4.57788 8.89819H7.91879" stroke="currentColor"></path><path d="M12.1404 1.19446C12.9442 1.19446 13.6404 1.81999 13.6404 2.64465V8.89856H12.6404V2.64465C12.6404 2.42015 12.4411 2.19446 12.1404 2.19446H3.14038C2.83968 2.19446 2.64038 2.42015 2.64038 2.64465V13.0929C2.64082 13.3172 2.84001 13.5421 3.14038 13.5421H8.88159V14.5421H3.14038C2.33675 14.5421 1.6408 13.9172 1.64038 13.0929V2.64465C1.64038 1.81999 2.33651 1.19446 3.14038 1.19446H12.1404Z" fill="currentColor"></path><path d="M12.0051 15.1056C12.0051 13.6395 10.8166 12.451 9.35059 12.451C10.8166 12.451 12.0051 11.2626 12.0051 9.79651C12.0051 11.2626 13.1936 12.451 14.6597 12.451C13.1936 12.451 12.0051 13.6395 12.0051 15.1056Z" stroke="currentColor"></path></svg>` },
  "question-outline": { size: 14, svg: (strokeWidth) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke-width="${strokeWidth}"><path d="M8 14.5C11.5899 14.5 14.5 11.5899 14.5 8C14.5 4.41015 11.5899 1.5 8 1.5C4.41015 1.5 1.5 4.41015 1.5 8C1.5 11.5899 4.41015 14.5 8 14.5Z" stroke="currentColor"></path><path d="M5.75 6.69646C5.75 6.29865 5.88196 5.90976 6.12919 5.57899C6.37643 5.24821 6.72783 4.99041 7.13896 4.83817C7.5501 4.68593 8.0025 4.6461 8.43895 4.72371C8.87541 4.80132 9.27632 4.99289 9.59099 5.27419C9.90566 5.55549 10.12 5.91388 10.2068 6.30406C10.2936 6.69423 10.249 7.09866 10.0787 7.4662C9.90843 7.83373 9.62004 8.14787 9.25003 8.36889C9.19476 8.4019 9.13803 8.43262 9.08004 8.46099C8.52566 8.73217 8 9.20817 8 9.82532" stroke="currentColor"></path><path d="M8 10.7416V11.7416" stroke="currentColor"></path></svg>` },
  "info-outline": { size: 14, svg: (strokeWidth) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 14 14" fill="none" stroke-width="${strokeWidth}"><path d="M12.5757 7.00012C12.5757 3.92085 10.0794 1.42463 7.00012 1.42456C3.9208 1.42456 1.42456 3.9208 1.42456 7.00012C1.42463 10.0794 3.92085 12.5757 7.00012 12.5757C10.0793 12.5756 12.5756 10.0793 12.5757 7.00012ZM13.8002 7.00012C13.8001 10.7559 10.7559 13.8001 7.00012 13.8002C3.2443 13.8002 0.199291 10.7559 0.199219 7.00012C0.199219 3.24426 3.24426 0.199219 7.00012 0.199219C10.7559 0.199291 13.8002 3.2443 13.8002 7.00012Z" fill="currentColor"></path><path d="M7.6127 3.18921V4.55986H6.38735V3.18921H7.6127Z" fill="currentColor"></path><path d="M7.6127 5.68921V10.8109H6.38735V5.68921H7.6127Z" fill="currentColor"></path></svg>` },
  "plugin-pinwheel-outline": { size: 16, svg: (strokeWidth) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke-width="${strokeWidth}"><path d="M7.84457 5.06199C11.6605 4.93876 14.7962 6.14848 14.8484 7.76397C14.8875 8.97461 13.1838 10.0696 10.7215 10.5942" stroke="currentColor"></path><path d="M5.12742 8.07731C5.00419 4.26138 6.21391 1.12568 7.8294 1.07351C9.04004 1.03441 10.135 2.73808 10.6596 5.20037" stroke="currentColor"></path><path d="M8.02457 10.6802C4.20865 10.8034 1.07294 9.5937 1.02077 7.97821C0.981678 6.76758 2.68535 5.67262 5.14763 5.14798" stroke="currentColor"></path><path d="M10.7476 7.89535C10.8708 11.7113 9.66109 14.847 8.0456 14.8991C6.83496 14.9382 5.74 13.2346 5.21536 10.7723" stroke="currentColor"></path></svg>` },
  "alarm-clock-outline": { size: 16, svg: (strokeWidth) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 17 17" fill="none" stroke-width="${strokeWidth}"><path d="M4.09372 11.9895L3.11865 14.0387" stroke="currentColor"></path><path d="M12.1392 11.9895L13.1143 14.0387" stroke="currentColor"></path><path d="M8.11646 4.78442V8.03442L10.6165 9.53442" stroke="currentColor"></path><path d="M8.11646 13.4094C11.154 13.4094 13.6165 10.947 13.6165 7.90942C13.6165 4.87186 11.154 2.40942 8.11646 2.40942C5.07889 2.40942 2.61646 4.87186 2.61646 7.90942C2.61646 10.947 5.07889 13.4094 8.11646 13.4094Z" stroke="currentColor"></path><path d="M1.75952 4.74323C2.30657 3.65639 3.12646 2.73047 4.12926 2.05542" stroke="currentColor"></path><path d="M14.3345 4.74323C13.7874 3.65639 12.9675 2.73047 11.9647 2.05542" stroke="currentColor"></path></svg>` },
  "archive-outline": { size: 20, svg: (strokeWidth) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke-width="${strokeWidth}"><path d="M13.5 2.5H2.5C1.94772 2.5 1.5 2.94772 1.5 3.5V4.5C1.5 5.05228 1.94772 5.5 2.5 5.5H13.5C14.0523 5.5 14.5 5.05228 14.5 4.5V3.5C14.5 2.94772 14.0523 2.5 13.5 2.5Z" stroke="currentColor"></path><path d="M2.5 5.5V13.5C2.5 13.7652 2.60536 14.0196 2.79289 14.2071C2.98043 14.3946 3.23478 14.5 3.5 14.5H12.5C12.7652 14.5 13.0196 14.3946 13.2071 14.2071C13.3946 14.0196 13.5 13.7652 13.5 13.5V5.5" stroke="currentColor"></path><path d="M6.5 9.5H9.5" stroke="currentColor"></path></svg>` },
  "wrap-lines-outline": { size: 16, svg: (strokeWidth) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke-width="${strokeWidth}"><path d="M2.3457 3.19299H13.6541" stroke="currentColor"></path><path d="M2.3457 7.46497H9.19332" stroke="currentColor"></path><path d="M2.3457 11.7369H6.4849" stroke="currentColor"></path><path d="M9.1936 7.46497H11.5183C12.6981 7.46497 13.6544 8.42132 13.6544 9.60103C13.6544 10.7808 12.6981 11.7371 11.5183 11.7371H9.1936" stroke="currentColor"></path><path d="M10.9505 9.7677L9.12262 11.5956C9.04452 11.6737 9.04452 11.8003 9.12262 11.8784L10.9505 13.7063" stroke="currentColor"></path></svg>` },
  "nowrap-fill": { size: 16, svg: () => '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none"><path d="M2 15H1V1H2V15Z" fill="currentColor"></path><path d="M12.3535 7.64645C12.5487 7.84171 12.5487 8.15829 12.3535 8.35355L9.85352 10.8535L9.14648 10.1465L10.793 8.5H3.5V7.5H10.793L9.14648 5.85352L9.85352 5.14648L12.3535 7.64645Z" fill="currentColor"></path><path d="M15 15H14V1H15V15Z" fill="currentColor"></path></svg>' },
  "wrap-fill": { size: 16, svg: () => '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none"><path d="M10.9999 8C10.9999 6.89543 10.1046 6 9 6H4.5V5H9C10.6568 5 11.9999 6.34315 11.9999 8C11.9999 9.65685 10.6568 11 9 11H6.20703L6.85351 11.6465L6.14648 12.3535L4.64652 10.8536C4.45126 10.6583 4.45126 10.3417 4.64652 10.1464L6.14648 8.64648L6.85351 9.35352L6.20703 10H9C10.1046 10 10.9999 9.10457 10.9999 8Z" fill="currentColor"></path><path d="M2 15H1V1H2V15Z" fill="currentColor"></path><path d="M15 15H14V1H15V15Z" fill="currentColor"></path></svg>' },
  "compare-split-outline": { size: 16, svg: (strokeWidth) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke-width="${strokeWidth}"><path d="M6 1.5H2.5C1.94772 1.5 1.5 1.94772 1.5 2.5V13.5C1.5 14.0523 1.94772 14.5 2.5 14.5H6C6.55228 14.5 7 14.0523 7 13.5V2.5C7 1.94772 6.55228 1.5 6 1.5Z" stroke="currentColor"></path><path d="M13.5 1.5H10C9.44772 1.5 9 1.94772 9 2.5V13.5C9 14.0523 9.44772 14.5 10 14.5H13.5C14.0523 14.5 14.5 14.0523 14.5 13.5V2.5C14.5 1.94772 14.0523 1.5 13.5 1.5Z" stroke="currentColor"></path></svg>` },
  "plan-outline": { size: 14, svg: (strokeWidth) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke-width="${strokeWidth}"><path d="M4.9375 5.90295H11.0625" stroke="currentColor"></path><path d="M4.9375 9.02991H8.27841" stroke="currentColor"></path><path d="M12.5 1.32617C13.3039 1.32617 14 1.95171 14 2.77637V7.61328L13 8.68164V2.77637C13 2.55186 12.8007 2.32617 12.5 2.32617H3.5C3.1993 2.32617 3 2.55186 3 2.77637V13.2246C3.00044 13.4489 3.19963 13.6738 3.5 13.6738H8.32812L7.39258 14.6738H3.5C2.69637 14.6738 2.00042 14.0489 2 13.2246V2.77637C2 1.95171 2.69613 1.32617 3.5 1.32617H12.5Z" fill="currentColor"></path><path d="M8.97212 14.3693C9.17511 14.5723 9.37811 14.7753 9.5811 14.9783C9.67012 14.8953 9.75914 14.8123 9.84815 14.7293C11.4505 13.2352 13.0528 11.7411 14.6551 10.247C14.7441 10.164 14.8331 10.081 14.9221 9.99803C14.5989 9.6748 14.2756 9.35157 13.9524 9.02834C13.8694 9.11736 13.7864 9.20637 13.7034 9.29539C12.2093 10.8977 10.7152 12.5 9.22113 14.1023C9.13813 14.1913 9.05513 14.2803 8.97212 14.3693Z" fill="currentColor"></path><path d="M11.6323 13.7841C11.6323 14.0395 11.6323 14.295 11.6323 14.5504C11.6812 14.5523 11.7301 14.5543 11.779 14.5562C12.659 14.5913 13.539 14.6263 14.419 14.6614C14.4679 14.6633 14.5168 14.6653 14.5657 14.6672C14.5657 14.3339 14.5657 14.0006 14.5657 13.6672C14.5168 13.6692 14.4679 13.6711 14.419 13.6731C13.539 13.7081 12.659 13.7432 11.779 13.7783C11.7301 13.7802 11.6812 13.7821 11.6323 13.7841Z" fill="currentColor"></path></svg>` },
  "compact-outline": { size: 16, svg: (strokeWidth) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke-width="${strokeWidth}"><path opacity="0.35" d="M8 14.5C11.5899 14.5 14.5 11.5899 14.5 8C14.5 4.41015 11.5899 1.5 8 1.5C4.41015 1.5 1.5 4.41015 1.5 8C1.5 11.5899 4.41015 14.5 8 14.5Z" stroke="currentColor"></path><path d="M8 1.5C8.85359 1.5 9.69883 1.66813 10.4874 1.99478C11.2761 2.32144 11.9926 2.80022 12.5962 3.40381C13.1998 4.00739 13.6786 4.72394 14.0052 5.51256C14.3319 6.30117 14.5 7.14641 14.5 8" stroke="currentColor"></path></svg>` },
  "shield-outline": { size: 16, svg: (strokeWidth) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke-width="${strokeWidth}"><path d="M6.80132 2.14853C7.70663 1.80917 8.70422 1.80919 9.60952 2.14859L14.1296 3.84317V7.11961C14.1296 11.6089 10.7615 13.5975 8.20543 14.5779C5.64931 13.5975 2.28052 11.6089 2.28052 7.11961V3.84317L6.80132 2.14853Z" stroke="currentColor" stroke-linejoin="round"></path></svg>` },
  "check-circle-outline": { size: 16, svg: (strokeWidth) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke-width="${strokeWidth}"><path d="M12.5303 6.53027L8.80273 10.2578C8.54967 10.5109 8.31796 10.7439 8.10645 10.9141C7.88375 11.0932 7.616 11.2602 7.27344 11.3145C7.09229 11.3431 6.90771 11.3431 6.72656 11.3145C6.384 11.2602 6.11625 11.0932 5.89355 10.9141C5.68204 10.7439 5.45033 10.5109 5.19727 10.2578L3.46973 8.53027L4.53027 7.46973L6.25781 9.19727C6.53457 9.47402 6.70036 9.63859 6.83398 9.74609C6.95637 9.84453 6.98241 9.83644 6.96094 9.83301C6.98679 9.83709 7.01321 9.83709 7.03906 9.83301C7.01759 9.83644 7.04363 9.84453 7.16602 9.74609C7.29964 9.63859 7.46543 9.47402 7.74219 9.19727L11.4697 5.46973L12.5303 6.53027Z" fill="currentColor"></path><path d="M14.5996 8C14.5996 4.35492 11.6451 1.40039 8 1.40039C4.35492 1.40039 1.40039 4.35492 1.40039 8C1.40039 11.6451 4.35492 14.5996 8 14.5996C11.6451 14.5996 14.5996 11.6451 14.5996 8ZM15.9004 8C15.9004 12.363 12.363 15.9004 8 15.9004C3.63695 15.9004 0.0996094 12.363 0.0996094 8C0.0996094 3.63695 3.63695 0.0996094 8 0.0996094C12.363 0.0996094 15.9004 3.63695 15.9004 8Z" fill="currentColor"></path></svg>` },
  "unarchive-outline": { size: 20, svg: (strokeWidth) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="none" stroke-width="${strokeWidth}"><path fill-rule="evenodd" clip-rule="evenodd" d="M15.8659 2.05975C17.2603 2.05995 18.3913 3.19096 18.3914 4.58527V5.4874C18.3914 6.02747 18.2192 6.52672 17.9303 6.93735C17.9336 6.96524 17.9388 6.99318 17.9388 7.02195V12.8884C17.9388 13.6345 17.9395 14.2379 17.8996 14.7254C17.8642 15.1593 17.7936 15.5499 17.6373 15.9141L17.5654 16.0685C17.278 16.6328 16.8405 17.1046 16.3038 17.434L16.0679 17.5661C15.66 17.7739 15.2196 17.8598 14.7237 17.9003C14.2362 17.9401 13.6327 17.9405 12.8867 17.9405H7.11122C6.36511 17.9405 5.76171 17.9401 5.27418 17.9003C4.84051 17.8649 4.44949 17.7952 4.08545 17.6391L3.93104 17.5661C3.36673 17.2785 2.89392 16.8414 2.56465 16.3044L2.43245 16.0685C2.22473 15.6608 2.13878 15.2211 2.09825 14.7254C2.05841 14.2379 2.05912 13.6345 2.05912 12.8884V7.02195C2.05912 6.99284 2.06422 6.96449 2.06758 6.93629C1.77931 6.52592 1.60858 6.02687 1.60858 5.4874V4.58527C1.60876 3.19084 2.73962 2.05975 4.1341 2.05975H15.8659ZM16.4984 7.92936C16.296 7.98169 16.0847 8.01288 15.8659 8.01291H4.1341C3.91478 8.01291 3.70246 7.98194 3.49955 7.92936V12.8884C3.49955 13.6582 3.50053 14.1927 3.53445 14.608C3.56769 15.0146 3.62923 15.244 3.71635 15.415L3.7925 15.5514C3.98339 15.8627 4.25749 16.1165 4.58464 16.2833L4.72529 16.3435C4.88095 16.3993 5.08638 16.4402 5.39158 16.4651C5.80685 16.4991 6.34138 16.5001 7.11122 16.5001H12.8867C13.6564 16.5001 14.1911 16.499 14.6063 16.4651C15.0128 16.432 15.2423 16.3703 15.4133 16.2833L15.5508 16.2061C15.8618 16.0152 16.116 15.7419 16.2827 15.415L16.3429 15.2732C16.3985 15.1177 16.4396 14.9128 16.4645 14.608C16.4985 14.1927 16.4984 13.6583 16.4984 12.8884V7.92936ZM4.1341 3.50019C3.53511 3.50019 3.0492 3.98631 3.04902 4.58527V5.4874C3.04902 6.08649 3.535 6.57248 4.1341 6.57248H15.8659C16.4648 6.57228 16.951 6.08638 16.951 5.4874V4.58527C16.9509 3.98644 16.4647 3.50038 15.8659 3.50019H4.1341Z" fill="currentColor"></path><path d="M10 14.1V10.1M7.85 12.05L10 9.9L12.15 12.05" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"></path></svg>` },
  "pin-outline": { size: 16, svg: (strokeWidth) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke-width="${strokeWidth}"><path d="M9.96976 1.70572L13.1554 3.93629L10.9019 8.12317L11.5158 11.605L10.7192 12.7427L2.52767 7.00693L3.3243 5.86922L6.80612 5.25528L9.96976 1.70572Z" stroke="currentColor" stroke-linejoin="round"></path><path d="M6.05285 9.47511C6.27284 9.16094 6.70586 9.08458 7.02003 9.30457C7.3342 9.52455 7.41055 9.95757 7.19057 10.2717L3.98587 14.4708L3.21223 13.9291L6.05285 9.47511Z" fill="currentColor"></path></svg>` },
  "pin-fill": { size: 16, svg: (strokeWidth) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke-width="${strokeWidth}"><path d="M9.96976 1.70572L13.1554 3.93629L10.9019 8.12317L11.5158 11.605L10.7192 12.7427L2.52767 7.00693L3.3243 5.86922L6.80612 5.25528L9.96976 1.70572Z" fill="currentColor" stroke="currentColor" stroke-linejoin="round"></path><path d="M6.05285 9.47511C6.27284 9.16094 6.70586 9.08458 7.02003 9.30457C7.3342 9.52455 7.41055 9.95757 7.19057 10.2717L3.98587 14.4708L3.21223 13.9291L6.05285 9.47511Z" fill="currentColor"></path></svg>` },
  "flat-list-outline": { size: 16, svg: (strokeWidth) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="${strokeWidth}"><path d="M6 3.5h7.5M6 8h7.5M6 12.5h7.5"></path><path d="M2.6 3.5h.01M2.6 8h.01M2.6 12.5h.01"></path></svg>` },
  "workspace-tree-outline": { size: 16, svg: (strokeWidth) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="${strokeWidth}"><path d="M14 12.05c0 .8-.65 1.45-1.46 1.45H3.46C2.65 13.5 2 12.85 2 12.05v-8.1c0-.8.65-1.45 1.46-1.45h2.4c.49 0 .94.24 1.21.65l.5.73c.27.4.73.65 1.21.65h3.76c.8 0 1.46.65 1.46 1.45v6.02Z"></path><path d="M8.7 8.1v3M11.2 8.1v3"></path></svg>` },
  "chevrons-up-down-outline": { size: 16, svg: (strokeWidth) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="${strokeWidth}"><path d="m5.1 6 2.9-2.9L10.9 6"></path><path d="m5.1 10 2.9 2.9 2.9-2.9"></path></svg>` },
  "drag-handle-outline": { size: 16, svg: (strokeWidth) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="${strokeWidth}"><path d="M4 5h8M4 8h8M4 11h8"></path></svg>` },
  "archive-off-outline": { size: 16, svg: (strokeWidth) => strokeWidth === ICON_MEDIUM_STROKE ? `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="${strokeWidth}"><mask id="dsw-icon-archive-off-outline-medium-mask" maskUnits="userSpaceOnUse" x="0" y="0" width="16" height="16"><rect x="0" y="0" width="16" height="16" fill="white" stroke="none"></rect><path d="m2.2 1.3 11.6 12.8" stroke="black" stroke-width="4.3"></path></mask><g mask="url(#dsw-icon-archive-off-outline-medium-mask)"><rect x="1.9" y="2.1" width="12.2" height="3.4" rx="1.1"></rect><path d="M2.95 5.7v4.8a2.9 2.9 0 0 0 2.9 2.9h4.3a2.9 2.9 0 0 0 2.9-2.9V5.7"></path></g><path d="m2.2 1.3 11.6 12.8"></path></svg>` : `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="${strokeWidth}"><mask id="dsw-icon-archive-off-outline-regular-mask" maskUnits="userSpaceOnUse" x="0" y="0" width="16" height="16"><rect x="0" y="0" width="16" height="16" fill="white" stroke="none"></rect><path d="m2.2 1.3 11.6 12.8" stroke="black" stroke-width="4"></path></mask><g mask="url(#dsw-icon-archive-off-outline-regular-mask)"><rect x="1.9" y="2.1" width="12.2" height="3.4" rx="1.1"></rect><path d="M2.95 5.7v4.8a2.9 2.9 0 0 0 2.9 2.9h4.3a2.9 2.9 0 0 0 2.9-2.9V5.7"></path></g><path d="m2.2 1.3 11.6 12.8"></path></svg>` },
  "archive-check-outline": { size: 16, svg: (strokeWidth) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="${strokeWidth}"><rect x="1.9" y="2.1" width="12.2" height="3.4" rx="1.1"></rect><path d="M2.95 5.7v4.8a2.9 2.9 0 0 0 2.9 2.9h4.3a2.9 2.9 0 0 0 2.9-2.9V5.7"></path><path d="m6 9.35 1.4 1.4 2.6-2.6"></path></svg>` },
  "sliders-two-outline": { size: 16, svg: (strokeWidth) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="${strokeWidth}"><path d="M2.3 5h5.85M12.05 5h1.65"></path><circle cx="9.95" cy="5" r="1.45"></circle><path d="M2.3 11h1.65M7.85 11h5.85"></path><circle cx="5.75" cy="11" r="1.45"></circle></svg>` },
  "microphone-outline": { size: 16, svg: (strokeWidth) => strokeWidth === ICON_MEDIUM_STROKE ? `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="${strokeWidth}"><rect x="5.15" y="1.65" width="5.7" height="8.7" rx="2.85"></rect><path d="M2.35 8.675C3.075 11.3 5.2 13.125 8 13.125C10.8 13.125 12.925 11.3 13.65 8.675M8 13.125V15"></path></svg>` : `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="${strokeWidth}"><rect x="5" y="1.5" width="6" height="9" rx="3"></rect><path d="M2.35 8.675C3.075 11.3 5.2 13.125 8 13.125C10.8 13.125 12.925 11.3 13.65 8.675M8 13.125V15"></path></svg>` },
  "apps-add-outline": { size: 16, svg: (strokeWidth) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="${strokeWidth}"><rect x="2.25" y="2.25" width="4" height="4" rx="1"></rect><rect x="2.25" y="9.75" width="4" height="4" rx="1"></rect><rect x="9.75" y="9.75" width="4" height="4" rx="1"></rect><path d="M11.75 1.75v5M9.25 4.25h5"></path></svg>` },
  "apps-add-compact-outline": { size: 16, svg: (strokeWidth) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="${strokeWidth}"><rect x="2.75" y="2.75" width="4" height="4" rx="1"></rect><rect x="2.75" y="9.25" width="4" height="4" rx="1"></rect><rect x="9.25" y="9.25" width="4" height="4" rx="1"></rect><path d="M11.25 2.25v5M8.75 4.75h5"></path></svg>` }
};
var STROKES = { regular: ICON_REGULAR_STROKE, medium: ICON_MEDIUM_STROKE };
function iconSymbolId(glyph, weight) {
  return `dsw-icon-${glyph}-${weight}`;
}
var ICON_SYMBOLS = Object.freeze(Object.fromEntries(
  Object.entries(ICON_ARTWORK).flatMap(([glyph, artwork2]) => Object.keys(STROKES).map((weight) => [iconSymbolId(glyph, weight), artwork2.svg(STROKES[weight])]))
));

// upstream/packages/client/ui-primitives/src/icons/index.tsx.snapshot
import { jsx } from "react/jsx-runtime";
function productIcon(glyph, weight) {
  const { size: defaultSize, aspect: [width, height] = [1, 1] } = ICON_ARTWORK[glyph];
  const id = iconSymbolId(glyph, weight);
  return ({ size = defaultSize, className }) => /* @__PURE__ */ jsx("svg", { width: size * width / height, height: size, className, "data-icon": id, "aria-hidden": "true", children: /* @__PURE__ */ jsx("use", { href: `#${id}` }) });
}
var IconLayersOutlineRegular = productIcon("layers-outline", "regular");
var IconLayersOutlineMedium = productIcon("layers-outline", "medium");
var IconNewChatOutlineRegular = productIcon("new-chat-outline", "regular");
var IconNewChatOutlineMedium = productIcon("new-chat-outline", "medium");
var IconSearchOutlineRegular = productIcon("search-outline", "regular");
var IconSearchOutlineMedium = productIcon("search-outline", "medium");
var IconEyeOutlineRegular = productIcon("eye-outline", "regular");
var IconEyeOutlineMedium = productIcon("eye-outline", "medium");
var IconEyeOffOutlineRegular = productIcon("eye-off-outline", "regular");
var IconEyeOffOutlineMedium = productIcon("eye-off-outline", "medium");
var IconGlobeOutlineRegular = productIcon("globe-outline", "regular");
var IconGlobeOutlineMedium = productIcon("globe-outline", "medium");
var IconSettingsOutlineRegular = productIcon("settings-outline", "regular");
var IconSettingsOutlineMedium = productIcon("settings-outline", "medium");
var IconPanelLeftOutlineRegular = productIcon("panel-left-outline", "regular");
var IconPanelLeftOutlineMedium = productIcon("panel-left-outline", "medium");
var IconEllipsisOutlineRegular = productIcon("ellipsis-outline", "regular");
var IconEllipsisOutlineMedium = productIcon("ellipsis-outline", "medium");
var IconPlusOutlineRegular = productIcon("plus-outline", "regular");
var IconPlusOutlineMedium = productIcon("plus-outline", "medium");
var IconCheckOutlineRegular = productIcon("check-outline", "regular");
var IconCheckOutlineMedium = productIcon("check-outline", "medium");
var IconMailUnreadOutlineRegular = productIcon("mail-unread-outline", "regular");
var IconMailUnreadOutlineMedium = productIcon("mail-unread-outline", "medium");
var IconMailReadOutlineRegular = productIcon("mail-read-outline", "regular");
var IconMailReadOutlineMedium = productIcon("mail-read-outline", "medium");
var IconBranchOutlineRegular = productIcon("branch-outline", "regular");
var IconBranchOutlineMedium = productIcon("branch-outline", "medium");
var IconChevronDownOutlineRegular = productIcon("chevron-down-outline", "regular");
var IconChevronDownOutlineMedium = productIcon("chevron-down-outline", "medium");
var IconChevronLeftOutlineRegular = productIcon("chevron-left-outline", "regular");
var IconChevronLeftOutlineMedium = productIcon("chevron-left-outline", "medium");
var IconChevronRightOutlineRegular = productIcon("chevron-right-outline", "regular");
var IconChevronRightOutlineMedium = productIcon("chevron-right-outline", "medium");
var IconTriangleRightFillRegular = productIcon("triangle-right-fill", "regular");
var IconTriangleRightFillMedium = productIcon("triangle-right-fill", "medium");
var IconChevronUpOutlineRegular = productIcon("chevron-up-outline", "regular");
var IconChevronUpOutlineMedium = productIcon("chevron-up-outline", "medium");
var IconCloseOutlineRegular = productIcon("close-outline", "regular");
var IconCloseOutlineMedium = productIcon("close-outline", "medium");
var IconCloseFillRegular = productIcon("close-fill", "regular");
var IconCloseFillMedium = productIcon("close-fill", "medium");
var IconCloseCircleFillRegular = productIcon("close-circle-fill", "regular");
var IconCloseCircleFillMedium = productIcon("close-circle-fill", "medium");
var IconCopyOutlineRegular = productIcon("copy-outline", "regular");
var IconCopyOutlineMedium = productIcon("copy-outline", "medium");
var IconRefreshOutlineRegular = productIcon("refresh-outline", "regular");
var IconRefreshOutlineMedium = productIcon("refresh-outline", "medium");
var IconLikeOutlineRegular = productIcon("like-outline", "regular");
var IconLikeOutlineMedium = productIcon("like-outline", "medium");
var IconLikeFillRegular = productIcon("like-fill", "regular");
var IconLikeFillMedium = productIcon("like-fill", "medium");
var IconDislikeOutlineRegular = productIcon("dislike-outline", "regular");
var IconDislikeOutlineMedium = productIcon("dislike-outline", "medium");
var IconDislikeFillRegular = productIcon("dislike-fill", "regular");
var IconDislikeFillMedium = productIcon("dislike-fill", "medium");
var IconShareOutlineRegular = productIcon("share-outline", "regular");
var IconShareOutlineMedium = productIcon("share-outline", "medium");
var IconDeliverDocRegular = productIcon("deliver-doc", "regular");
var IconDeliverDocMedium = productIcon("deliver-doc", "medium");
var IconEditOutlineRegular = productIcon("edit-outline", "regular");
var IconEditOutlineMedium = productIcon("edit-outline", "medium");
var IconThinkOutlineRegular = productIcon("think-outline", "regular");
var IconThinkOutlineMedium = productIcon("think-outline", "medium");
var IconAgentPresetOutlineRegular = productIcon("agent-preset-outline", "regular");
var IconAgentPresetOutlineMedium = productIcon("agent-preset-outline", "medium");
var IconBrowseOutlineRegular = productIcon("browse-outline", "regular");
var IconBrowseOutlineMedium = productIcon("browse-outline", "medium");
var IconContextInjectionOutlineRegular = productIcon("context-injection-outline", "regular");
var IconContextInjectionOutlineMedium = productIcon("context-injection-outline", "medium");
var IconLinkOutlineRegular = productIcon("link-outline", "regular");
var IconLinkOutlineMedium = productIcon("link-outline", "medium");
var IconRightUpOutlineRegular = productIcon("right-up-outline", "regular");
var IconRightUpOutlineMedium = productIcon("right-up-outline", "medium");
var IconEnhanceOutlineRegular = productIcon("enhance-outline", "regular");
var IconEnhanceOutlineMedium = productIcon("enhance-outline", "medium");
var IconTrashOutlineRegular = productIcon("trash-outline", "regular");
var IconTrashOutlineMedium = productIcon("trash-outline", "medium");
var IconWarningOutlineRegular = productIcon("warning-outline", "regular");
var IconWarningOutlineMedium = productIcon("warning-outline", "medium");
var IconCheckCircleFillRegular = productIcon("check-circle-fill", "regular");
var IconCheckCircleFillMedium = productIcon("check-circle-fill", "medium");
var IconWarningTriangleOutlineRegular = productIcon("warning-triangle-outline", "regular");
var IconWarningTriangleOutlineMedium = productIcon("warning-triangle-outline", "medium");
var IconUserOutlineRegular = productIcon("user-outline", "regular");
var IconUserOutlineMedium = productIcon("user-outline", "medium");
var IconUsersOutlineRegular = productIcon("users-outline", "regular");
var IconUsersOutlineMedium = productIcon("users-outline", "medium");
var IconPaperPlaneOutlineRegular = productIcon("paper-plane-outline", "regular");
var IconPaperPlaneOutlineMedium = productIcon("paper-plane-outline", "medium");
var IconStopFillRegular = productIcon("stop-fill", "regular");
var IconStopFillMedium = productIcon("stop-fill", "medium");
var IconPaperclipOutlineRegular = productIcon("paperclip-outline", "regular");
var IconPaperclipOutlineMedium = productIcon("paperclip-outline", "medium");
var IconLoadingOutlineRegular = productIcon("loading-outline", "regular");
var IconLoadingOutlineMedium = productIcon("loading-outline", "medium");
var IconDownloadOutlineRegular = productIcon("download-outline", "regular");
var IconDownloadOutlineMedium = productIcon("download-outline", "medium");
var IconUploadOutlineRegular = productIcon("upload-outline", "regular");
var IconUploadOutlineMedium = productIcon("upload-outline", "medium");
var IconPlayOutlineRegular = productIcon("play-outline", "regular");
var IconPlayOutlineMedium = productIcon("play-outline", "medium");
var IconPauseOutlineRegular = productIcon("pause-outline", "regular");
var IconPauseOutlineMedium = productIcon("pause-outline", "medium");
var IconFullscreenOutlineRegular = productIcon("fullscreen-outline", "regular");
var IconFullscreenOutlineMedium = productIcon("fullscreen-outline", "medium");
var IconCodeOutlineRegular = productIcon("code-outline", "regular");
var IconCodeOutlineMedium = productIcon("code-outline", "medium");
var IconCordisPluginOutlineRegular = productIcon("cordis-plugin-outline", "regular");
var IconCordisPluginOutlineMedium = productIcon("cordis-plugin-outline", "medium");
var IconApiOutlineRegular = productIcon("api-outline", "regular");
var IconApiOutlineMedium = productIcon("api-outline", "medium");
var IconPersonalizationOutlineRegular = productIcon("personalization-outline", "regular");
var IconPersonalizationOutlineMedium = productIcon("personalization-outline", "medium");
var IconProjectAddOutlineRegular = productIcon("project-add-outline", "regular");
var IconProjectAddOutlineMedium = productIcon("project-add-outline", "medium");
var IconFolderOpenOutlineRegular = productIcon("folder-open-outline", "regular");
var IconFolderOpenOutlineMedium = productIcon("folder-open-outline", "medium");
var IconFolderOpenRegular = productIcon("folder-open", "regular");
var IconFolderOpenMedium = productIcon("folder-open", "medium");
var IconFolderCloseRegular = productIcon("folder-close", "regular");
var IconFolderCloseMedium = productIcon("folder-close", "medium");
var IconTreeCornerRegular = productIcon("tree-corner", "regular");
var IconTreeCornerMedium = productIcon("tree-corner", "medium");
var IconLightOutlineRegular = productIcon("light-outline", "regular");
var IconLightOutlineMedium = productIcon("light-outline", "medium");
var IconDarkOutlineRegular = productIcon("dark-outline", "regular");
var IconDarkOutlineMedium = productIcon("dark-outline", "medium");
var IconFollowsystemOutlineRegular = productIcon("followsystem-outline", "regular");
var IconFollowsystemOutlineMedium = productIcon("followsystem-outline", "medium");
var IconDataOutlineRegular = productIcon("data-outline", "regular");
var IconDataOutlineMedium = productIcon("data-outline", "medium");
var IconDatabaseOutlineRegular = productIcon("database-outline", "regular");
var IconDatabaseOutlineMedium = productIcon("database-outline", "medium");
var IconClockOutlineRegular = productIcon("clock-outline", "regular");
var IconClockOutlineMedium = productIcon("clock-outline", "medium");
var IconGaugeOutlineRegular = productIcon("gauge-outline", "regular");
var IconGaugeOutlineMedium = productIcon("gauge-outline", "medium");
var IconSendOutlineRegular = productIcon("send-outline", "regular");
var IconSendOutlineMedium = productIcon("send-outline", "medium");
var IconQueueOutlineRegular = productIcon("queue-outline", "regular");
var IconQueueOutlineMedium = productIcon("queue-outline", "medium");
var IconChecklistOutlineRegular = productIcon("checklist-outline", "regular");
var IconChecklistOutlineMedium = productIcon("checklist-outline", "medium");
var IconListPenOutlineRegular = productIcon("list-pen-outline", "regular");
var IconListPenOutlineMedium = productIcon("list-pen-outline", "medium");
var IconGoalOutlineRegular = productIcon("goal-outline", "regular");
var IconGoalOutlineMedium = productIcon("goal-outline", "medium");
var IconSparkleRegular = productIcon("sparkle", "regular");
var IconSparkleMedium = productIcon("sparkle", "medium");
var IconInspectOutlineRegular = productIcon("inspect-outline", "regular");
var IconInspectOutlineMedium = productIcon("inspect-outline", "medium");
var IconSkillOutlineRegular = productIcon("skill-outline", "regular");
var IconSkillOutlineMedium = productIcon("skill-outline", "medium");
var IconQuestionOutlineRegular = productIcon("question-outline", "regular");
var IconQuestionOutlineMedium = productIcon("question-outline", "medium");
var IconInfoOutlineRegular = productIcon("info-outline", "regular");
var IconInfoOutlineMedium = productIcon("info-outline", "medium");
var IconPluginPinwheelOutlineRegular = productIcon("plugin-pinwheel-outline", "regular");
var IconPluginPinwheelOutlineMedium = productIcon("plugin-pinwheel-outline", "medium");
var IconAlarmClockOutlineRegular = productIcon("alarm-clock-outline", "regular");
var IconAlarmClockOutlineMedium = productIcon("alarm-clock-outline", "medium");
var IconArchiveOutlineRegular = productIcon("archive-outline", "regular");
var IconArchiveOutlineMedium = productIcon("archive-outline", "medium");
var IconWrapLinesOutlineRegular = productIcon("wrap-lines-outline", "regular");
var IconWrapLinesOutlineMedium = productIcon("wrap-lines-outline", "medium");
var IconNowrapFillRegular = productIcon("nowrap-fill", "regular");
var IconNowrapFillMedium = productIcon("nowrap-fill", "medium");
var IconWrapFillRegular = productIcon("wrap-fill", "regular");
var IconWrapFillMedium = productIcon("wrap-fill", "medium");
var IconCompareSplitOutlineRegular = productIcon("compare-split-outline", "regular");
var IconCompareSplitOutlineMedium = productIcon("compare-split-outline", "medium");
var IconPlanOutlineRegular = productIcon("plan-outline", "regular");
var IconPlanOutlineMedium = productIcon("plan-outline", "medium");
var IconCompactOutlineRegular = productIcon("compact-outline", "regular");
var IconCompactOutlineMedium = productIcon("compact-outline", "medium");
var IconShieldOutlineRegular = productIcon("shield-outline", "regular");
var IconShieldOutlineMedium = productIcon("shield-outline", "medium");
var IconCheckCircleOutlineRegular = productIcon("check-circle-outline", "regular");
var IconCheckCircleOutlineMedium = productIcon("check-circle-outline", "medium");
var IconUnarchiveOutlineRegular = productIcon("unarchive-outline", "regular");
var IconUnarchiveOutlineMedium = productIcon("unarchive-outline", "medium");
var IconPinOutlineRegular = productIcon("pin-outline", "regular");
var IconPinOutlineMedium = productIcon("pin-outline", "medium");
var IconPinFillRegular = productIcon("pin-fill", "regular");
var IconPinFillMedium = productIcon("pin-fill", "medium");
var IconFlatListOutlineRegular = productIcon("flat-list-outline", "regular");
var IconFlatListOutlineMedium = productIcon("flat-list-outline", "medium");
var IconWorkspaceTreeOutlineRegular = productIcon("workspace-tree-outline", "regular");
var IconWorkspaceTreeOutlineMedium = productIcon("workspace-tree-outline", "medium");
var IconChevronsUpDownOutlineRegular = productIcon("chevrons-up-down-outline", "regular");
var IconChevronsUpDownOutlineMedium = productIcon("chevrons-up-down-outline", "medium");
var IconDragHandleOutlineRegular = productIcon("drag-handle-outline", "regular");
var IconDragHandleOutlineMedium = productIcon("drag-handle-outline", "medium");
var IconArchiveOffOutlineRegular = productIcon("archive-off-outline", "regular");
var IconArchiveOffOutlineMedium = productIcon("archive-off-outline", "medium");
var IconArchiveCheckOutlineRegular = productIcon("archive-check-outline", "regular");
var IconArchiveCheckOutlineMedium = productIcon("archive-check-outline", "medium");
var IconSlidersTwoOutlineRegular = productIcon("sliders-two-outline", "regular");
var IconSlidersTwoOutlineMedium = productIcon("sliders-two-outline", "medium");
var IconMicrophoneOutlineRegular = productIcon("microphone-outline", "regular");
var IconMicrophoneOutlineMedium = productIcon("microphone-outline", "medium");
function appsAddIcon(weight) {
  const Wide = productIcon("apps-add-outline", weight);
  const Compact = productIcon("apps-add-compact-outline", weight);
  return ({ compact = false, ...props }) => compact ? /* @__PURE__ */ jsx(Compact, { ...props }) : /* @__PURE__ */ jsx(Wide, { ...props });
}
var IconAppsAddOutlineRegular = appsAddIcon("regular");
var IconAppsAddOutlineMedium = appsAddIcon("medium");
var IconSaveOutlineRegular = productIcon("save-outline", "regular");
var IconSaveOutlineMedium = productIcon("save-outline", "medium");

// upstream/packages/client/ui-primitives/src/ShortcutKeys.module.css.snapshot
var ShortcutKeys_module_css_default = {
  keys: "ShortcutKeys_module_css_keys",
  key: "ShortcutKeys_module_css_key",
  tooltip: "ShortcutKeys_module_css_tooltip",
  separator: "ShortcutKeys_module_css_separator",
  joined: "ShortcutKeys_module_css_joined"
};

// upstream/packages/client/ui-primitives/src/ShortcutKeys.tsx.snapshot
import clsx from "clsx";
import { jsx as jsx2 } from "react/jsx-runtime";
function ShortcutKeys({ keys, variant = "plain", className }) {
  return /* @__PURE__ */ jsx2("span", { className: clsx(ShortcutKeys_module_css_default.keys, variant === "tooltip" && ShortcutKeys_module_css_default.tooltip, variant === "tooltip" && keys.includes("+") && ShortcutKeys_module_css_default.joined, className), children: keys.map((key, index) => /* @__PURE__ */ jsx2("kbd", { className: key === "+" ? ShortcutKeys_module_css_default.separator : ShortcutKeys_module_css_default.key, children: key }, index)) });
}

// upstream/packages/client/ui-primitives/src/Tooltip.tsx.snapshot
import { cloneElement, createContext, useCallback as useCallback2, useContext, useEffect as useEffect3, useId as useId2, useRef as useRef3, useState as useState2 } from "react";
import { createPortal } from "react-dom";

// upstream/packages/client/ui-primitives/src/tooltip-placement.ts.snapshot
var opposite = { right: "left", left: "right", top: "bottom", bottom: "top" };
function placeTooltip(input) {
  const { anchor, viewportWidth, viewportHeight, side, align, gap } = input;
  let { width, height } = input;
  const margin = 12;
  const maxWidth = Math.max(0, viewportWidth - margin * 2);
  const maxHeight = Math.max(0, viewportHeight - margin * 2);
  width = Math.min(width, maxWidth);
  height = Math.min(height, maxHeight);
  const clampX = (x) => Math.max(margin, Math.min(x, viewportWidth - margin - width));
  const clampY = (y) => Math.max(margin, Math.min(y, viewportHeight - margin - height));
  const horizontal = side === "right" || side === "left";
  const candidates = [side, opposite[side], ...horizontal ? ["bottom", "top"] : ["right", "left"]];
  const positions = {
    right: { left: anchor.right + 10, top: clampY((anchor.top + anchor.bottom - height) / 2) },
    left: { left: anchor.left - 10 - width, top: clampY((anchor.top + anchor.bottom - height) / 2) },
    bottom: { left: clampX(align === "end" ? anchor.right - width : (anchor.left + anchor.right - width) / 2), top: anchor.bottom + gap },
    top: { left: clampX(align === "end" ? anchor.right - width : (anchor.left + anchor.right - width) / 2), top: anchor.top - gap - height }
  };
  for (const candidate of candidates) {
    const position2 = positions[candidate];
    if (position2.left >= margin && position2.top >= margin && position2.left + width <= viewportWidth - margin && position2.top + height <= viewportHeight - margin) {
      return { ...position2, side: candidate, width, height, overflow: false };
    }
  }
  const position = positions[side];
  return { left: clampX(position.left), top: clampY(position.top), side, width, height, overflow: true };
}

// upstream/packages/client/ui-primitives/src/useDismissOnOutsidePointer.ts.snapshot
import { useEffect as useEffect2 } from "react";
function useDismissOnOutsidePointer(root, open, setOpen, portal) {
  useEffect2(() => {
    if (!open) return;
    const closeOutside = (event) => {
      if (event.target instanceof Node && root.current?.contains(event.target) !== true && portal?.current?.contains(event.target) !== true) {
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", closeOutside);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
    };
  }, [root, open, setOpen, portal]);
}

// upstream/packages/client/ui-primitives/src/Tooltip.module.css.snapshot
var Tooltip_module_css_default = {
  bubble: "Tooltip_module_css_bubble",
  "tooltip-in": "Tooltip_module_css_tooltip-in",
  label: "Tooltip_module_css_label"
};

// upstream/packages/client/ui-primitives/src/input-modality.ts.snapshot
var INPUT_MODALITY = { pointer: "pointer", keyboard: "keyboard" };
var INPUT_MODALITY_ATTRIBUTE = "data-input-modality";
var FOCUS_NAVIGATION = /* @__PURE__ */ new Set(["Tab", "Home", "End", "PageUp", "PageDown"]);
var pointer = false;
var pointerOwnsFocus = false;
var keyFocusOrigin;
function publish() {
  document.documentElement.setAttribute(INPUT_MODALITY_ATTRIBUTE, pointerOwnsFocus ? INPUT_MODALITY.pointer : INPUT_MODALITY.keyboard);
}
function pointerModality() {
  return pointer;
}
if (typeof window !== "undefined") {
  window.addEventListener("pointerdown", () => {
    pointer = true;
    pointerOwnsFocus = true;
    keyFocusOrigin = void 0;
    publish();
  }, true);
  window.addEventListener("keydown", (event) => {
    pointer = false;
    if (event.isComposing) {
      keyFocusOrigin = void 0;
      return;
    }
    keyFocusOrigin = event.composedPath()[0];
    if (!FOCUS_NAVIGATION.has(event.key) && !event.key.startsWith("Arrow")) return;
    pointerOwnsFocus = false;
    publish();
  }, true);
  window.addEventListener("focusin", (event) => {
    if (keyFocusOrigin === void 0 || event.composedPath()[0] === keyFocusOrigin) return;
    keyFocusOrigin = void 0;
    if (!pointerOwnsFocus) return;
    pointerOwnsFocus = false;
    publish();
  }, true);
  window.addEventListener("blur", () => {
    keyFocusOrigin = void 0;
  });
}

// upstream/packages/client/ui-primitives/src/Tooltip.tsx.snapshot
import { jsx as jsx3, jsxs } from "react/jsx-runtime";
var TooltipSuppression = createContext(null);
function clipped(anchor) {
  return [anchor, ...anchor.querySelectorAll("*")].some((el) => el instanceof HTMLElement && el.scrollWidth > el.clientWidth);
}
function Tooltip({ label, shortcutKeys, side = "right", align = "center", delayMs = 0, focusDelayMs = 0, gap = 8, disabled = false, portal = false, maxWidth, openOnClick = false, onlyWhenClipped = false, children }) {
  const id = useId2();
  const [pinned, setPinned] = useState2(false);
  const anchor = useRef3(null);
  const childRef = children.ref;
  const mergedRef = useCallback2((el) => {
    anchor.current = el;
    if (typeof childRef === "function") childRef(el);
    else if (childRef != null) childRef.current = el;
  }, [childRef]);
  const [pos, setPos] = useState2(null);
  const bubble = useRef3(null);
  const resolvedLabel = pos === null ? null : typeof label === "function" ? label() : label;
  const showTimer = useRef3(null);
  const triggers = useRef3({ hover: false, focus: false });
  const suppressAncestors = useContext(TooltipSuppression);
  const [suppressed, setSuppressed] = useState2(false);
  const announce = useCallback2((active) => {
    suppressAncestors?.(active);
  }, [suppressAncestors]);
  const visible = pos !== null && !disabled;
  useEffect3(() => {
    const el = bubble.current;
    if (pos === null || !visible || suppressed || el === null) return;
    let size;
    let anchorRect = pos;
    const fit = () => {
      if (size === void 0) return;
      const placement = placeTooltip({
        anchor: anchorRect,
        width: size.inlineSize,
        height: size.blockSize,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        side,
        align,
        gap
      });
      const horizontal = placement.side === "right" || placement.side === "left";
      const offsetX = horizontal ? 0 : align === "end" ? placement.width : placement.width / 2;
      const offsetY = horizontal ? placement.height / 2 : placement.side === "top" ? placement.height : 0;
      el.style.left = `${placement.left + offsetX}px`;
      el.style.top = `${placement.top + offsetY}px`;
      el.dataset.side = placement.side;
      el.style.visibility = "visible";
    };
    const onResize = () => {
      if (anchor.current !== null) anchorRect = anchor.current.getBoundingClientRect();
      fit();
    };
    const observer = new ResizeObserver((entries) => {
      size = entries[0]?.borderBoxSize[0];
      fit();
    });
    observer.observe(el, { box: "border-box" });
    window.addEventListener("resize", onResize);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", onResize);
    };
  }, [align, gap, pos, side, suppressed, visible]);
  useEffect3(() => {
    announce(visible);
    return () => {
      announce(false);
    };
  }, [announce, visible]);
  const cancelShow = useCallback2(() => {
    if (showTimer.current === null) return;
    clearTimeout(showTimer.current);
    showTimer.current = null;
  }, []);
  useEffect3(() => {
    if (pinned && (disabled || !openOnClick)) setPinned(false);
    if (disabled) {
      cancelShow();
      triggers.current = { hover: false, focus: false };
      setPos(null);
    }
    return cancelShow;
  }, [cancelShow, disabled, openOnClick, pinned]);
  const show = () => {
    if (disabled) return;
    const el = anchor.current;
    if (el === null) return;
    if (onlyWhenClipped && !clipped(el)) return;
    setPos(el.getBoundingClientRect());
    announce(true);
  };
  const showAfterDelay = (delay) => {
    cancelShow();
    if (delay <= 0) {
      show();
      return;
    }
    showTimer.current = setTimeout(() => {
      showTimer.current = null;
      show();
    }, delay);
  };
  const withdraw = useCallback2(() => {
    setPinned(false);
    setPos(null);
    announce(false);
  }, [announce]);
  const hide = () => {
    cancelShow();
    if (!triggers.current.hover && !triggers.current.focus && !pinned) withdraw();
  };
  const dismiss = useCallback2(() => {
    cancelShow();
    triggers.current = { hover: false, focus: false };
    withdraw();
  }, [cancelShow, withdraw]);
  useDismissOnOutsidePointer(anchor, openOnClick && visible, dismiss, bubble);
  useEffect3(() => {
    if (!openOnClick || !visible) return;
    const onKeyDown = (event) => {
      if (event.key !== "Escape" && event.key !== "Tab") return;
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
      }
      dismiss();
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, [dismiss, openOnClick, visible]);
  const content = visible && !suppressed && /* @__PURE__ */ jsxs(
    "span",
    {
      ref: bubble,
      id: openOnClick ? id : void 0,
      className: Tooltip_module_css_default.bubble,
      "data-side": side,
      "data-portal": portal || void 0,
      "data-pinned": pinned || void 0,
      "data-align": align,
      "data-has-shortcut": shortcutKeys?.length ? true : void 0,
      style: { left: pos.left, top: pos.top, visibility: "hidden", ...maxWidth === void 0 ? {} : { maxWidth: `min(${maxWidth}px, calc(100vw - 24px))` } },
      role: "tooltip",
      "aria-label": shortcutKeys?.length ? [resolvedLabel, shortcutKeys.join(" ")].filter(Boolean).join(" ") : void 0,
      children: [
        resolvedLabel && /* @__PURE__ */ jsx3("span", { className: Tooltip_module_css_default.label, children: resolvedLabel }),
        shortcutKeys !== void 0 && shortcutKeys.length > 0 && /* @__PURE__ */ jsx3(ShortcutKeys, { keys: shortcutKeys, variant: "tooltip" })
      ]
    }
  );
  return /* @__PURE__ */ jsxs(TooltipSuppression.Provider, { value: setSuppressed, children: [
    cloneElement(children, {
      ref: mergedRef,
      "aria-describedby": openOnClick && visible ? [children.props["aria-describedby"], id].filter(Boolean).join(" ") : children.props["aria-describedby"],
      onPointerEnter: (e) => {
        children.props.onPointerEnter?.(e);
        if (e.pointerType === "touch") return;
        if (e.pointerType === "mouse" && !window.matchMedia("(any-hover: hover)").matches) return;
        triggers.current.hover = true;
        showAfterDelay(delayMs);
      },
      onPointerLeave: (e) => {
        children.props.onPointerLeave?.(e);
        triggers.current.hover = false;
        cancelShow();
        if (!pinned) withdraw();
      },
      onPointerDown: (e) => {
        children.props.onPointerDown?.(e);
        if (e.pointerType === "touch" && !pinned) dismiss();
      },
      // Activating an ordinary action dismisses the bubble: it often changes
      // what the anchor now does (pin → unpin), and the click leaves the
      // anchor focused, which would otherwise pin the relabelled bubble up.
      onClick: (e) => {
        children.props.onClick?.(e);
        triggers.current.focus = false;
        cancelShow();
        if (openOnClick && !disabled && !pinned) {
          setPinned(true);
          show();
        } else withdraw();
      },
      onFocus: (e) => {
        children.props.onFocus?.(e);
        if (pointerModality()) return;
        triggers.current.focus = true;
        showAfterDelay(focusDelayMs);
      },
      onBlur: (e) => {
        children.props.onBlur?.(e);
        triggers.current.focus = false;
        hide();
      }
    }),
    portal ? content !== false && createPortal(content, document.body) : content
  ] });
}

// upstream/packages/client/ui-primitives/src/Menu.module.css.snapshot
var Menu_module_css_default = {
  root: "Menu_module_css_root",
  list: "Menu_module_css_list",
  submenu: "Menu_module_css_submenu",
  portal: "Menu_module_css_portal",
  sideTop: "Menu_module_css_sideTop",
  alignEnd: "Menu_module_css_alignEnd",
  scrollable: "Menu_module_css_scrollable",
  viewport: "Menu_module_css_viewport",
  footer: "Menu_module_css_footer",
  separator: "Menu_module_css_separator",
  itemWrap: "Menu_module_css_itemWrap",
  item: "Menu_module_css_item",
  denseList: "Menu_module_css_denseList",
  label: "Menu_module_css_label",
  compactList: "Menu_module_css_compactList",
  itemIcon: "Menu_module_css_itemIcon",
  check: "Menu_module_css_check",
  itemLabel: "Menu_module_css_itemLabel",
  shortcut: "Menu_module_css_shortcut",
  shortcutKeys: "Menu_module_css_shortcutKeys",
  selected: "Menu_module_css_selected",
  selectedFill: "Menu_module_css_selectedFill",
  danger: "Menu_module_css_danger",
  submenuAnchor: "Menu_module_css_submenuAnchor",
  parentPage: "Menu_module_css_parentPage"
};

// upstream/packages/client/ui-primitives/src/MenuRow.tsx.snapshot
import { jsx as jsx4, jsxs as jsxs2 } from "react/jsx-runtime";
function MenuRow({
  children,
  icon,
  shortcut,
  current: current2,
  disabled = false,
  disabledReason,
  danger,
  separatorBefore,
  selected,
  selection = "check",
  reserveIcon,
  decorativeIcon = true,
  wrapperProps,
  ...button
}) {
  const reasonId = useId3();
  const explained = disabled && disabledReason !== void 0;
  return /* @__PURE__ */ jsxs2("div", { ...wrapperProps, className: Menu_module_css_default.itemWrap, children: [
    separatorBefore && /* @__PURE__ */ jsx4("div", { className: Menu_module_css_default.separator, role: "separator" }),
    /* @__PURE__ */ jsx4(Tooltip, { label: disabledReason ?? "", disabled: !explained, side: "bottom", delayMs: 500, maxWidth: 300, portal: true, children: /* @__PURE__ */ jsxs2(
      "button",
      {
        ...button,
        type: "button",
        role: "menuitem",
        className: clsx2(Menu_module_css_default.item, selected && (selection === "fill" ? Menu_module_css_default.selectedFill : Menu_module_css_default.selected), danger && Menu_module_css_default.danger),
        disabled: disabled && !explained,
        "aria-disabled": explained || void 0,
        "aria-describedby": explained ? reasonId : void 0,
        "aria-keyshortcuts": shortcut?.aria,
        "aria-current": current2 === true ? "page" : void 0,
        onClick: explained ? void 0 : button.onClick,
        children: [
          (icon !== void 0 || reserveIcon) && /* @__PURE__ */ jsx4("span", { "aria-hidden": decorativeIcon || void 0, className: Menu_module_css_default.itemIcon, children: icon }),
          /* @__PURE__ */ jsx4("span", { className: Menu_module_css_default.itemLabel, children }),
          shortcut !== void 0 && /* @__PURE__ */ jsx4("span", { "aria-hidden": "true", className: Menu_module_css_default.shortcut, children: /* @__PURE__ */ jsx4(ShortcutKeys, { keys: shortcut.keys, className: Menu_module_css_default.shortcutKeys }) }),
          selected && selection === "check" && /* @__PURE__ */ jsx4(IconCheckOutlineRegular, { className: Menu_module_css_default.check }),
          button["aria-haspopup"] === "menu" && /* @__PURE__ */ jsx4(IconChevronRightOutlineRegular, { "aria-hidden": "true", className: Menu_module_css_default.check })
        ]
      }
    ) }),
    explained && /* @__PURE__ */ jsx4("span", { id: reasonId, hidden: true, children: disabledReason })
  ] });
}
function menuIconColumns(entries, contextual) {
  const aligned = /* @__PURE__ */ new Set();
  if (!contextual) return aligned;
  let group = [];
  const finish = () => {
    if (group.some((entry) => !("type" in entry) && entry.icon !== void 0)) {
      for (const entry of group) aligned.add(entry);
    }
    group = [];
  };
  for (const entry of entries) {
    if ("type" in entry && entry.type === "separator") finish();
    else group.push(entry);
  }
  finish();
  return aligned;
}
function renderMenuDecoration(entry) {
  return entry.type === "separator" ? /* @__PURE__ */ jsx4("div", { className: Menu_module_css_default.separator, role: "separator" }, entry.id) : /* @__PURE__ */ jsx4("div", { className: Menu_module_css_default.label, role: "presentation", children: entry.text }, entry.id);
}

// upstream/packages/client/ui-primitives/src/SubmenuPanel.tsx.snapshot
import { createPortal as createPortal3 } from "react-dom";
import clsx4 from "clsx";

// upstream/packages/client/ui-primitives/src/MenuSurface.tsx.snapshot
import { forwardRef, useId as useId4, useLayoutEffect as useLayoutEffect2, useRef as useRef4 } from "react";
import { createPortal as createPortal2 } from "react-dom";
import clsx3 from "clsx";

// upstream/packages/client/ui-primitives/src/MenuSurface.module.css.snapshot
var MenuSurface_module_css_default = {
  surface: "MenuSurface_module_css_surface",
  backing: "MenuSurface_module_css_backing",
  compact: "MenuSurface_module_css_compact",
  material: "MenuSurface_module_css_material",
  "dsh-context-menu-in": "MenuSurface_module_css_dsh-context-menu-in",
  "dsh-context-menu-out": "MenuSurface_module_css_dsh-context-menu-out"
};

// upstream/packages/client/ui-primitives/src/MenuSurface.tsx.snapshot
import { Fragment, jsx as jsx5, jsxs as jsxs3 } from "react/jsx-runtime";
var MENU_TRANSITION_MS = Object.freeze({ enter: 40, dismiss: 80, replace: 10, prepare: 20 });
var MenuSurface = forwardRef(function MenuSurface2({
  compact = false,
  phase,
  className,
  style,
  children,
  ...props
}, ref) {
  const id = useId4();
  const backingRef = useRef4(null);
  useLayoutEffect2(() => {
    document.body.appendChild(backingRef.current);
  }, []);
  const anchorStyle = {
    "--dsh-menu-anchor": `--dsh-menu-${id.replaceAll(":", "")}`,
    "--dsh-menu-enter": `${MENU_TRANSITION_MS.enter}ms`,
    "--dsh-menu-dismiss": `${MENU_TRANSITION_MS.dismiss}ms`,
    "--dsh-menu-replace": `${MENU_TRANSITION_MS.replace}ms`
  };
  return /* @__PURE__ */ jsxs3(Fragment, { children: [
    /* @__PURE__ */ jsxs3(
      "div",
      {
        ...props,
        ref,
        "data-menu-material": "translucent",
        "data-menu-phase": phase,
        className: clsx3(MenuSurface_module_css_default.surface, compact && MenuSurface_module_css_default.compact, className),
        style: { ...style, ...anchorStyle },
        children: [
          /* @__PURE__ */ jsx5("div", { "aria-hidden": "true", className: MenuSurface_module_css_default.material }),
          children
        ]
      }
    ),
    createPortal2(
      /* @__PURE__ */ jsx5(
        "div",
        {
          ref: backingRef,
          "aria-hidden": "true",
          "data-menu-backing": "",
          "data-menu-phase": phase,
          className: clsx3(MenuSurface_module_css_default.backing, compact && MenuSurface_module_css_default.compact),
          style: { ...anchorStyle, visibility: style?.visibility }
        }
      ),
      document.body
    )
  ] });
});

// upstream/packages/client/ui-primitives/src/SubmenuPanel.tsx.snapshot
import { Fragment as Fragment2, jsx as jsx6, jsxs as jsxs4 } from "react/jsx-runtime";
function anchors(submenu, hidden) {
  return { "--dsh-submenu-parent": submenu.parentAnchor, ...hidden ? { visibility: "hidden" } : {} };
}
function SubmenuPanel({ entry, submenu, compact, dense, contextual, backLabel, onSelect, onClose, afterSelection }) {
  const columns = menuIconColumns(entry.submenu, contextual);
  return createPortal3(/* @__PURE__ */ jsxs4(
    MenuSurface,
    {
      ref: submenu.panelRef,
      compact,
      className: clsx4(Menu_module_css_default.submenu, Menu_module_css_default.scrollable, dense && Menu_module_css_default.denseList, compact && Menu_module_css_default.compactList),
      style: anchors(submenu, submenu.hidden),
      "data-submenu-layout": submenu.measured ? submenu.page ? "page" : "side" : void 0,
      "data-contextual": contextual ? "" : void 0,
      role: "menu",
      onPointerEnter: submenu.cancelClose,
      onPointerLeave: (event) => {
        if (menuHoverAllowed(event)) submenu.leave();
      },
      onContextMenu: contextual ? (event) => {
        event.preventDefault();
        event.stopPropagation();
        onClose();
      } : void 0,
      onClick: (event) => {
        event.stopPropagation();
        afterSelection();
      },
      children: [
        submenu.page && /* @__PURE__ */ jsxs4(Fragment2, { children: [
          /* @__PURE__ */ jsx6(
            MenuRow,
            {
              "data-menu-back": "",
              icon: /* @__PURE__ */ jsx6(IconChevronLeftOutlineRegular, { className: Menu_module_css_default.check }),
              onClick: submenu.returnToParent,
              children: backLabel
            }
          ),
          /* @__PURE__ */ jsx6("div", { className: Menu_module_css_default.separator, role: "separator" })
        ] }),
        /* @__PURE__ */ jsx6("div", { className: Menu_module_css_default.viewport, role: "presentation", children: entry.submenu.map((sub) => "type" in sub ? renderMenuDecoration(sub) : /* @__PURE__ */ jsx6(
          MenuRow,
          {
            icon: sub.icon,
            reserveIcon: columns.has(sub),
            disabled: sub.disabled,
            danger: sub.danger,
            shortcut: sub.shortcut,
            onClick: () => {
              onSelect?.(sub.id);
            },
            children: sub.label
          },
          sub.id
        )) })
      ]
    }
  ), document.body);
}

// upstream/packages/client/ui-primitives/src/useModalLayer.ts.snapshot
import { useLayoutEffect as useLayoutEffect3, useRef as useRef5 } from "react";

// upstream/packages/client/ui-primitives/src/keyboard-composition.ts.snapshot
function observeComposition(document2) {
  let composing = false;
  let ended = false;
  const start = () => {
    composing = true;
  };
  const end = () => {
    composing = false;
    ended = true;
  };
  const release = () => {
    ended = false;
  };
  const blur = () => {
    composing = false;
    ended = false;
  };
  document2.addEventListener("compositionstart", start, true);
  document2.addEventListener("compositionend", end, true);
  document2.addEventListener("keyup", release, true);
  document2.defaultView?.addEventListener("blur", blur);
  return {
    guards: (event) => {
      const guarded = composing || ended || event.isComposing || event.keyCode === 229;
      ended = false;
      return guarded;
    },
    dispose: () => {
      document2.removeEventListener("compositionstart", start, true);
      document2.removeEventListener("compositionend", end, true);
      document2.removeEventListener("keyup", release, true);
      document2.defaultView?.removeEventListener("blur", blur);
    }
  };
}

// upstream/packages/client/ui-primitives/src/focus.ts.snapshot
var releases = /* @__PURE__ */ new WeakMap();
var navigationKeys = /* @__PURE__ */ new Set(["Tab", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Home", "End"]);
function focusWithoutRing(element, options) {
  releases.get(element)?.();
  const release = () => {
    element.removeAttribute("data-dsh-automatic-focus");
    element.removeEventListener("blur", release);
    element.removeEventListener("keydown", navigate, true);
    releases.delete(element);
  };
  const navigate = (event) => {
    if (!event.isComposing && !event.ctrlKey && !event.altKey && !event.metaKey && navigationKeys.has(event.key)) release();
  };
  releases.set(element, release);
  element.setAttribute("data-dsh-automatic-focus", "");
  element.addEventListener("blur", release);
  element.addEventListener("keydown", navigate, true);
  element.focus(options);
  if (!element.matches(":focus")) release();
}

// upstream/packages/client/ui-primitives/src/useModalLayer.ts.snapshot
var modalSelector = '[role="dialog"][aria-modal="true"], [role="menu"]';
var layers = /* @__PURE__ */ new WeakMap();
function closeTopModal(document2) {
  const top = layers.get(document2)?.at(-1);
  if (top === void 0) return;
  const foreground = [...document2.querySelectorAll(modalSelector)].at(-1);
  if (foreground === top.element) top.close();
}
function isBehindModal(anchor) {
  if (anchor === null) return false;
  const top = layers.get(anchor.ownerDocument)?.at(-1);
  return top !== void 0 && !top.element.contains(anchor);
}
var focusable = 'button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), a[href], [tabindex="0"]';
function useModalLayer(dialog, open, onClose) {
  const close = useRef5(onClose);
  const pendingRestore = useRef5(void 0);
  close.current = onClose;
  useLayoutEffect3(() => {
    const target = pendingRestore.current;
    pendingRestore.current = void 0;
    const element = dialog.current;
    if (!open && element?.contains(element.ownerDocument.activeElement) && target?.isConnected && !target.closest("[inert], [hidden]") && !isBehindModal(target)) {
      focusWithoutRing(target, { preventScroll: true });
    }
    if (!open || element === null) return;
    const document2 = element.ownerDocument;
    const composition = observeComposition(document2);
    const previous = document2.activeElement;
    const stack = layers.get(document2) ?? [];
    layers.set(document2, stack);
    const layer = { element, close: () => {
      close.current();
    } };
    stack.push(layer);
    const initial = element.querySelector("[data-modal-autofocus]") ?? element.querySelector(focusable) ?? element;
    if (!element.contains(document2.activeElement)) focusWithoutRing(initial);
    const keydown = (event) => {
      const composing = composition.guards(event);
      if (stack.at(-1) !== layer || event.defaultPrevented || composing || event.ctrlKey || event.altKey || event.metaKey) return;
      if (event.key === "Escape" && !event.shiftKey) {
        event.preventDefault();
        if (!event.repeat) close.current();
      }
      if (event.key !== "Tab") return;
      if (document2.activeElement?.closest('[role="menu"]')) return;
      const items = [...element.querySelectorAll(focusable)].filter((item) => !item.closest("[inert], [hidden]"));
      const first = items[0] ?? element;
      const last = items.at(-1) ?? element;
      const atEdge = event.shiftKey ? document2.activeElement === first : document2.activeElement === last;
      if (document2.activeElement === element || !element.contains(document2.activeElement) || atEdge) {
        event.preventDefault();
        const target2 = event.shiftKey ? last : first;
        target2.focus();
      }
    };
    document2.addEventListener("keydown", keydown);
    return () => {
      composition.dispose();
      const wasTop = stack.at(-1) === layer;
      stack.splice(stack.indexOf(layer), 1);
      document2.removeEventListener("keydown", keydown);
      if (stack.length === 0) layers.delete(document2);
      if (wasTop) {
        const target2 = previous instanceof HTMLElement && previous.isConnected ? previous : stack.at(-1)?.element;
        if (target2 !== void 0) {
          pendingRestore.current = target2;
          focusWithoutRing(target2);
        }
      }
    };
  }, [dialog, open]);
}

// upstream/packages/client/ui-primitives/src/Menu.tsx.snapshot
import { jsx as jsx7, jsxs as jsxs5 } from "react/jsx-runtime";
function Menu({ open, anchor, items = [], children, submenuBackLabel, selectedId, selectedIds, onSelect, onClose, align = "start", side = "bottom", portal = false, closeOnPointerLeave = false, dense = false, compact = false, autoFocus = false, selection = "check", anchorRef, anchorPoint, minWidthFromAnchor = false, footer, className, listClassName, contextual = false, exiting, returnFocus, isExternalTrigger }) {
  const rootRef = useRef6(null);
  const listRef = useRef6(null);
  const menuId = useId5();
  const pointX = anchorPoint?.x;
  const pointY = anchorPoint?.y;
  const point = useMemo(() => {
    if (pointX === void 0 || pointY === void 0) return void 0;
    const visualOrigin = open && typeof window.CSS !== "undefined" && window.CSS.supports("-webkit-backdrop-filter", "none");
    const viewport = visualOrigin ? window.visualViewport : void 0;
    return { x: pointX + (viewport?.offsetLeft ?? 0), y: pointY + (viewport?.offsetTop ?? 0) };
  }, [open, pointX, pointY]);
  useLayoutEffect4(() => {
    const trigger = returnFocus?.();
    if (!open || !contextual || trigger == null) return;
    const previous = trigger.getAttribute("aria-controls");
    trigger.setAttribute("aria-controls", [previous, menuId].filter(Boolean).join(" "));
    return () => {
      if (previous === null) trigger.removeAttribute("aria-controls");
      else trigger.setAttribute("aria-controls", previous);
    };
  }, [open, contextual, returnFocus, menuId]);
  const walkIndex = useRef6(null);
  const triggerRef = useRef6(null);
  const selectingWithTab = useRef6(false);
  const refocusAnchor = (navigation = false) => {
    const remembered = triggerRef.current;
    const trigger = returnFocus?.() ?? (remembered?.isConnected ? remembered : anchorRef?.current) ?? null;
    const target = trigger !== null && document.contains(trigger) && !trigger.disabled ? trigger : rootRef.current?.querySelector("button:not(:disabled)");
    if (target == null) return;
    if (navigation) target.focus();
    else focusWithoutRing(target);
  };
  const refocusAfterSelection = () => {
    const navigation = selectingWithTab.current;
    queueMicrotask(() => {
      if (openRef.current && exitingRef.current === void 0) return;
      const active = document.activeElement;
      if (active === null || active === document.body || listRef.current?.contains(active) === true || submenu.contains(active)) refocusAnchor(navigation);
    });
  };
  const exitingRef = useRef6(exiting);
  exitingRef.current = exiting;
  const openRef = useRef6(open);
  openRef.current = open;
  const submenu = useMenuSubmenu({ open: open && exiting === void 0, items, footer, listRef, refocusAnchor });
  const submenuEvents = useRef6(submenu);
  submenuEvents.current = submenu;
  const close = useRef6(onClose);
  close.current = onClose;
  const anchorName = `--dsh-menu-trigger-${menuId.replaceAll(":", "")}`;
  const [externalAnchor, setExternalAnchor] = useState3(null);
  const positioned = !portal || anchorRef === void 0 || externalAnchor !== null;
  useEffect4(() => {
    if (!open || !portal || anchorRef === void 0) {
      setExternalAnchor(null);
      return;
    }
    const element = anchorRef.current;
    setExternalAnchor(element);
    if (element === null) return;
    const previous = element.style.getPropertyValue("anchor-name");
    const priority = element.style.getPropertyPriority("anchor-name");
    element.style.setProperty("anchor-name", anchorName);
    return () => {
      element.style.setProperty("anchor-name", previous, priority);
    };
  });
  useEffect4(() => {
    if (!open || !portal || exiting !== void 0) return;
    const currentAnchor = () => returnFocus?.() ?? (anchorRef === void 0 ? rootRef.current : anchorRef.current);
    const element = currentAnchor();
    if (element === null) return;
    let dismissed = false;
    const check = () => {
      const current2 = currentAnchor();
      if (dismissed || current2 !== null && current2.isConnected && current2.closest("[inert], [hidden]") === null) return;
      dismissed = true;
      close.current();
    };
    const observer = new MutationObserver(check);
    observer.observe(element.ownerDocument.documentElement, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["inert", "hidden"]
    });
    check();
    return () => {
      observer.disconnect();
    };
  }, [open, portal, exiting, anchorRef, externalAnchor, returnFocus]);
  const { arm: armClose, cancel: cancelClose } = usePointerGrace(onClose);
  useEffect4(() => {
    if (!open) return;
    const active = document.activeElement;
    triggerRef.current = active instanceof HTMLElement && active !== document.body && (anchorRef !== void 0 || anchorPoint !== void 0 || rootRef.current?.contains(active) === true) ? active : null;
  }, [open]);
  useEffect4(() => {
    if (!open || !positioned || exiting !== void 0 || !autoFocus || listRef.current?.contains(document.activeElement) || submenu.contains(document.activeElement)) return;
    const first = listRef.current?.querySelector("button:not(:disabled)");
    walkIndex.current = first === void 0 || first === null ? null : 0;
    if (first != null) focusWithoutRing(first);
  }, [open, autoFocus, items.length, footer?.length, positioned, exiting]);
  useEffect4(() => {
    if (!open || exiting !== void 0) {
      walkIndex.current = null;
      return;
    }
    const composition = observeComposition(document);
    const onPointerDown = (e) => {
      if (!(e.target instanceof Node) || contextual && e.button === 2) return;
      if (rootRef.current?.contains(e.target) === true || anchorRef?.current?.contains(e.target) === true) return;
      if (isExternalTrigger?.(e.target) === true) return;
      if (listRef.current?.contains(e.target) === true || submenuEvents.current.contains(e.target)) return;
      onClose();
    };
    const onKeyDown = (e) => {
      if (composition.guards(e) || isBehindModal(triggerRef.current ?? rootRef.current) || e.defaultPrevented || e.ctrlKey || e.altKey || e.metaKey) return;
      const focused = document.activeElement;
      const insideList = listRef.current?.contains(focused) === true || submenuEvents.current.contains(focused);
      const anchored = focused === returnFocus?.() || anchorRef?.current?.contains(focused) === true || rootRef.current?.contains(focused) === true || insideList;
      if (e.key === "Escape" && !e.shiftKey) {
        e.preventDefault();
        if (e.repeat) return;
        if (submenuEvents.current.returnToParent()) return;
        onClose();
        if (anchored || autoFocus) refocusAnchor();
      }
      if (e.key === "ArrowLeft" && anchored && submenuEvents.current.returnToParent()) {
        e.preventDefault();
        return;
      }
      if (e.key === "ArrowRight" && insideList && focused instanceof HTMLButtonElement && focused.getAttribute("aria-haspopup") === "menu") {
        e.preventDefault();
        focused.click();
        return;
      }
      if (e.key === "Tab") {
        const list3 = submenuEvents.current.activeList(focused);
        if (list3 === null || !anchored) return;
        if (e.shiftKey) {
          e.preventDefault();
          onClose();
          refocusAnchor(true);
          return;
        }
        if (insideList) {
          if (focused instanceof Element && focused.getAttribute("role") === "menuitem") {
            e.preventDefault();
            if (focused.getAttribute("aria-disabled") === "true") {
              onClose();
              refocusAnchor(true);
              return;
            }
            selectingWithTab.current = true;
            try {
              focused.click();
            } finally {
              selectingWithTab.current = false;
            }
          }
          return;
        }
        const row = list3.querySelector("button:not(:disabled)");
        if (row === null) return;
        e.preventDefault();
        row.focus();
        walkIndex.current = 0;
        return;
      }
      if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) return;
      const list2 = submenuEvents.current.activeList(focused);
      if (list2 === null || !anchored) return;
      const buttons = Array.from(list2.querySelectorAll("button:not(:disabled)"));
      if (buttons.length === 0) return;
      const index = buttons.indexOf(focused);
      const from = index >= 0 ? index : walkIndex.current;
      const next = e.key === "Home" ? 0 : e.key === "End" ? buttons.length - 1 : from === null ? e.key === "ArrowDown" ? 0 : buttons.length - 1 : (from + (e.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length;
      e.preventDefault();
      walkIndex.current = next;
      buttons[next]?.focus();
    };
    const onWindowBlur = () => {
      if (document.activeElement instanceof HTMLIFrameElement) onClose();
    };
    document.addEventListener("pointerdown", onPointerDown);
    const onEscape = (event) => {
      if (event.key === "Escape") onKeyDown(event);
    };
    const onOtherKey = (event) => {
      if (event.key !== "Escape") onKeyDown(event);
    };
    document.addEventListener("keydown", onOtherKey);
    document.addEventListener("keydown", onEscape, true);
    window.addEventListener("blur", onWindowBlur);
    return () => {
      composition.dispose();
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onOtherKey);
      document.removeEventListener("keydown", onEscape, true);
      window.removeEventListener("blur", onWindowBlur);
    };
  }, [open, onClose, autoFocus, contextual, exiting, anchorRef, returnFocus, isExternalTrigger]);
  useLayoutEffect4(() => {
    if (exiting === "dismiss" && listRef.current?.contains(document.activeElement)) refocusAnchor();
  }, [exiting]);
  useEffect4(() => {
    if (!open) cancelClose();
  }, [open, cancelClose]);
  const itemColumns = menuIconColumns(items, contextual);
  const footerColumns = menuIconColumns(footer ?? [], contextual);
  const renderEntry = (entry, columns) => {
    if ("type" in entry) return renderMenuDecoration(entry);
    const hasSub = entry.submenu !== void 0 && entry.submenu.length > 0;
    return /* @__PURE__ */ jsx7(
      MenuRow,
      {
        icon: entry.icon,
        reserveIcon: columns.has(entry),
        disabled: entry.disabled,
        danger: entry.danger,
        shortcut: entry.shortcut,
        selected: entry.id === selectedId || selectedIds?.includes(entry.id) === true,
        selection,
        "aria-haspopup": hasSub ? "menu" : void 0,
        "aria-expanded": hasSub ? submenu.entry?.id === entry.id && !submenu.hidden : void 0,
        wrapperProps: hasSub ? {
          onPointerEnter: (event) => {
            if (!menuHoverAllowed(event) || entry.disabled) return;
            const trigger = event.currentTarget.querySelector("button");
            if (trigger !== null) submenu.openChild(entry.id, trigger);
          },
          onPointerLeave: (event) => {
            if (menuHoverAllowed(event)) submenu.leave();
          }
        } : void 0,
        onFocus: hasSub ? (event) => {
          submenu.focusParent(entry.id, event.currentTarget);
        } : void 0,
        onClick: (event) => {
          if (hasSub) submenu.openChild(entry.id, event.currentTarget, true);
          else onSelect?.(entry.id);
        },
        children: entry.label
      },
      entry.id
    );
  };
  const list = open && positioned && /* @__PURE__ */ jsxs5(
    MenuSurface,
    {
      compact,
      id: contextual ? menuId : void 0,
      ref: listRef,
      className: clsx5(Menu_module_css_default.list, listClassName, dense && Menu_module_css_default.denseList, compact && Menu_module_css_default.compactList, Menu_module_css_default.scrollable, submenu.page && Menu_module_css_default.parentPage, portal && Menu_module_css_default.portal, side === "top" && !portal && Menu_module_css_default.sideTop, align === "end" && !portal && Menu_module_css_default.alignEnd),
      style: portal ? { positionAnchor: anchorName } : void 0,
      "data-anchor-side": portal ? side : void 0,
      "data-anchor-align": portal ? align : void 0,
      "data-match-anchor-width": portal && minWidthFromAnchor ? "" : void 0,
      role: exiting === void 0 && !submenu.page ? "menu" : void 0,
      "aria-hidden": exiting === void 0 && !submenu.page ? void 0 : true,
      "data-context-menu": contextual ? "" : void 0,
      phase: contextual ? exiting ?? "enter" : void 0,
      onClick: (e) => {
        e.stopPropagation();
        const row = e.target instanceof Element ? e.target.closest('button[role="menuitem"]') : null;
        if (row !== null && row.getAttribute("aria-haspopup") !== "menu") refocusAfterSelection();
      },
      onContextMenu: contextual ? (event) => {
        event.preventDefault();
        event.stopPropagation();
        onClose();
      } : void 0,
      onPointerOver: (event) => {
        if (menuHoverAllowed(event)) submenu.collapseFrom(event);
      },
      onFocus: submenu.collapseFrom,
      children: [
        submenu.entry !== void 0 && /* @__PURE__ */ jsx7("span", { "aria-hidden": "true", className: Menu_module_css_default.submenuAnchor, style: { anchorName: submenu.parentAnchor } }),
        /* @__PURE__ */ jsxs5("div", { className: Menu_module_css_default.viewport, role: "presentation", children: [
          items.map((entry) => renderEntry(entry, itemColumns)),
          children
        ] }),
        footer !== void 0 && footer.length > 0 && /* @__PURE__ */ jsx7("div", { className: Menu_module_css_default.footer, role: "presentation", children: footer.map((entry) => renderEntry(entry, footerColumns)) })
      ]
    }
  );
  return /* @__PURE__ */ jsxs5(
    "span",
    {
      ref: rootRef,
      className: clsx5(Menu_module_css_default.root, className),
      style: { anchorName: anchorRef === void 0 ? anchorName : void 0, ...point === void 0 ? {} : {
        position: "fixed",
        left: point.x,
        top: point.y,
        width: 0,
        height: 0
      } },
      onPointerEnter: closeOnPointerLeave ? cancelClose : void 0,
      onPointerLeave: closeOnPointerLeave ? (event) => {
        if (open && menuHoverAllowed(event)) armClose();
      } : void 0,
      children: [
        anchor,
        portal ? list !== false && createPortal4(list, document.body) : list,
        open && exiting === void 0 && submenu.entry !== void 0 && /* @__PURE__ */ jsx7(
          SubmenuPanel,
          {
            entry: submenu.entry,
            submenu,
            compact,
            dense,
            contextual,
            backLabel: submenuBackLabel ?? submenu.entry.label,
            onSelect,
            onClose,
            afterSelection: refocusAfterSelection
          },
          submenu.entry.id
        )
      ]
    }
  );
}

// upstream/packages/client/ui-primitives/src/Toast.tsx.snapshot
import { Fragment as Fragment3, useEffect as useEffect5, useLayoutEffect as useLayoutEffect5, useRef as useRef7, useState as useState4 } from "react";
import { createPortal as createPortal5 } from "react-dom";

// upstream/packages/client/ui-primitives/src/Toast.module.css.snapshot
var Toast_module_css_default = {
  toast: "Toast_module_css_toast",
  "dsh-toast-in": "Toast_module_css_dsh-toast-in",
  "dsh-toast-fade": "Toast_module_css_dsh-toast-fade",
  icon: "Toast_module_css_icon",
  success: "Toast_module_css_success",
  text: "Toast_module_css_text",
  action: "Toast_module_css_action"
};

// upstream/packages/client/ui-primitives/src/Toast.tsx.snapshot
import { jsx as jsx8, jsxs as jsxs6 } from "react/jsx-runtime";
var HOLD_MS = 3e3;
var FADE_MS = 1e3;
function Toast({ text, icon, tone, anchor, holdMs = HOLD_MS, actions, onDone }) {
  const latestOnDone = useRef7(onDone);
  useLayoutEffect5(() => {
    latestOnDone.current = onDone;
  }, [onDone]);
  useEffect5(() => {
    const timer = setTimeout(() => {
      latestOnDone.current();
    }, holdMs + FADE_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [holdMs]);
  const [left, setLeft] = useState4(null);
  useLayoutEffect5(() => {
    if (anchor == null) return;
    const measure = () => {
      const rect = anchor.getBoundingClientRect();
      setLeft(rect.left + rect.width / 2);
    };
    measure();
    window.addEventListener("resize", measure);
    return () => {
      window.removeEventListener("resize", measure);
    };
  }, [anchor]);
  return createPortal5(
    /* @__PURE__ */ jsxs6(
      "div",
      {
        className: Toast_module_css_default.toast,
        role: "alert",
        style: {
          ...left === null ? {} : { left },
          "--dsh-toast-hold": `${String(holdMs)}ms`
        },
        children: [
          tone === "success" ? /* @__PURE__ */ jsx8("span", { className: `${Toast_module_css_default.icon} ${Toast_module_css_default.success}`, "aria-hidden": true, children: /* @__PURE__ */ jsx8(IconCheckCircleOutlineRegular, {}) }) : icon !== void 0 && /* @__PURE__ */ jsx8("span", { className: Toast_module_css_default.icon, "aria-hidden": true, children: icon }),
          /* @__PURE__ */ jsxs6("span", { className: Toast_module_css_default.text, children: [
            text,
            actions?.map((action) => /* @__PURE__ */ jsxs6(Fragment3, { children: [
              action.prefix,
              /* @__PURE__ */ jsx8("button", { type: "button", className: Toast_module_css_default.action, onClick: action.onClick, children: action.label })
            ] }, action.label))
          ] })
        ]
      }
    ),
    document.body
  );
}

// upstream/packages/client/ui-primitives/src/Button.tsx.snapshot
import { forwardRef as forwardRef2 } from "react";
import clsx6 from "clsx";

// upstream/packages/client/ui-primitives/src/Button.module.css.snapshot
var Button_module_css_default = {
  button: "Button_module_css_button",
  md: "Button_module_css_md",
  sm: "Button_module_css_sm",
  primary: "Button_module_css_primary",
  ghost: "Button_module_css_ghost",
  outline: "Button_module_css_outline",
  toolbar: "Button_module_css_toolbar",
  icon: "Button_module_css_icon"
};

// upstream/packages/client/ui-primitives/src/Button.tsx.snapshot
import { jsx as jsx9, jsxs as jsxs7 } from "react/jsx-runtime";
var Button = forwardRef2(function Button2({
  variant = "ghost",
  size = "md",
  icon,
  className,
  children,
  ...rest
}, ref) {
  return /* @__PURE__ */ jsxs7("button", { ref, type: "button", className: clsx6(Button_module_css_default.button, Button_module_css_default[variant], Button_module_css_default[size], className), ...rest, children: [
    icon != null && /* @__PURE__ */ jsx9("span", { className: Button_module_css_default.icon, children: icon }),
    children
  ] });
});

// upstream/packages/client/ui-primitives/src/Modal.tsx.snapshot
import { useRef as useRef8 } from "react";
import { createPortal as createPortal6 } from "react-dom";
import clsx7 from "clsx";

// upstream/packages/client/ui-primitives/src/Modal.module.css.snapshot
var Modal_module_css_default = {
  root: "Modal_module_css_root",
  mask: "Modal_module_css_mask",
  modalEnter: "Modal_module_css_modalEnter",
  dialog: "Modal_module_css_dialog",
  content: "Modal_module_css_content",
  header: "Modal_module_css_header",
  title: "Modal_module_css_title",
  warning: "Modal_module_css_warning",
  warningIcon: "Modal_module_css_warningIcon",
  body: "Modal_module_css_body",
  close: "Modal_module_css_close",
  description: "Modal_module_css_description",
  footer: "Modal_module_css_footer"
};

// upstream/packages/client/ui-primitives/src/Modal.tsx.snapshot
import { Fragment as Fragment4, jsx as jsx10, jsxs as jsxs8 } from "react/jsx-runtime";
function Modal({
  open,
  onClose,
  title,
  closeLabel,
  description,
  children,
  footer,
  className,
  contentClassName,
  onKeyDownCapture,
  headless = false,
  backdropBlur = true,
  shortcutModal,
  tone
}) {
  const dialog = useRef8(null);
  useModalLayer(dialog, open, onClose);
  if (!open) return null;
  return createPortal6(/* @__PURE__ */ jsxs8("div", { className: Modal_module_css_default.root, role: "presentation", onKeyDownCapture, children: [
    /* @__PURE__ */ jsx10("div", { className: Modal_module_css_default.mask, style: backdropBlur ? void 0 : { backdropFilter: "none" }, "aria-hidden": "true", onClick: onClose }),
    /* @__PURE__ */ jsx10(
      "div",
      {
        ref: dialog,
        tabIndex: -1,
        "data-shortcut-modal": shortcutModal,
        className: clsx7(Modal_module_css_default.dialog, !headless && tone === "warning" && Modal_module_css_default.warning, className),
        role: "dialog",
        "aria-modal": "true",
        "aria-label": title,
        children: headless ? children : /* @__PURE__ */ jsxs8(Fragment4, { children: [
          /* @__PURE__ */ jsxs8("div", { className: clsx7(Modal_module_css_default.content, contentClassName), children: [
            /* @__PURE__ */ jsxs8("div", { className: Modal_module_css_default.header, children: [
              /* @__PURE__ */ jsxs8("h2", { className: Modal_module_css_default.title, children: [
                tone === "warning" && /* @__PURE__ */ jsx10(IconWarningOutlineRegular, { size: 18, className: Modal_module_css_default.warningIcon, "aria-hidden": "true" }),
                title
              ] }),
              /* @__PURE__ */ jsx10("button", { type: "button", className: Modal_module_css_default.close, "aria-label": closeLabel, onClick: onClose, children: /* @__PURE__ */ jsx10(IconCloseOutlineRegular, { size: 14 }) })
            ] }),
            description !== void 0 && description !== "" && /* @__PURE__ */ jsx10("p", { className: Modal_module_css_default.description, children: description }),
            children !== void 0 && /* @__PURE__ */ jsx10("div", { className: Modal_module_css_default.body, children })
          ] }),
          footer !== void 0 && /* @__PURE__ */ jsx10("div", { className: Modal_module_css_default.footer, children: footer })
        ] })
      }
    )
  ] }), document.body);
}

// ../../node_modules/.pnpm/zustand@5.0.8_@types+react@18.3.27_immer@10.1.3_react@18.3.1/node_modules/zustand/esm/vanilla.mjs
var createStoreImpl = (createState) => {
  let state;
  const listeners = /* @__PURE__ */ new Set();
  const setState = (partial, replace) => {
    const nextState = typeof partial === "function" ? partial(state) : partial;
    if (!Object.is(nextState, state)) {
      const previousState = state;
      state = (replace != null ? replace : typeof nextState !== "object" || nextState === null) ? nextState : Object.assign({}, state, nextState);
      listeners.forEach((listener) => listener(state, previousState));
    }
  };
  const getState = () => state;
  const getInitialState = () => initialState;
  const subscribe = (listener) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  };
  const api = { setState, getState, getInitialState, subscribe };
  const initialState = state = createState(setState, getState, api);
  return api;
};
var createStore = ((createState) => createState ? createStoreImpl(createState) : createStoreImpl);

// ../../node_modules/.pnpm/zustand@5.0.8_@types+react@18.3.27_immer@10.1.3_react@18.3.1/node_modules/zustand/esm/middleware.mjs
var subscribeWithSelectorImpl = (fn) => (set2, get, api) => {
  const origSubscribe = api.subscribe;
  api.subscribe = ((selector, optListener, options) => {
    let listener = selector;
    if (optListener) {
      const equalityFn = (options == null ? void 0 : options.equalityFn) || Object.is;
      let currentSlice = selector(api.getState());
      listener = (state) => {
        const nextSlice = selector(state);
        if (!equalityFn(currentSlice, nextSlice)) {
          const previousSlice = currentSlice;
          optListener(currentSlice = nextSlice, previousSlice);
        }
      };
      if (options == null ? void 0 : options.fireImmediately) {
        optListener(currentSlice, currentSlice);
      }
    }
    return origSubscribe(listener);
  });
  const initialState = fn(set2, get, api);
  return initialState;
};
var subscribeWithSelector = subscribeWithSelectorImpl;

// ../../node_modules/.pnpm/immer@10.1.3/node_modules/immer/dist/immer.mjs
var NOTHING = Symbol.for("immer-nothing");
var DRAFTABLE = Symbol.for("immer-draftable");
var DRAFT_STATE = Symbol.for("immer-state");
var errors = true ? [
  // All error codes, starting by 0:
  function(plugin) {
    return `The plugin for '${plugin}' has not been loaded into Immer. To enable the plugin, import and call \`enable${plugin}()\` when initializing your application.`;
  },
  function(thing) {
    return `produce can only be called on things that are draftable: plain objects, arrays, Map, Set or classes that are marked with '[immerable]: true'. Got '${thing}'`;
  },
  "This object has been frozen and should not be mutated",
  function(data) {
    return "Cannot use a proxy that has been revoked. Did you pass an object from inside an immer function to an async process? " + data;
  },
  "An immer producer returned a new value *and* modified its draft. Either return a new value *or* modify the draft.",
  "Immer forbids circular references",
  "The first or second argument to `produce` must be a function",
  "The third argument to `produce` must be a function or undefined",
  "First argument to `createDraft` must be a plain object, an array, or an immerable object",
  "First argument to `finishDraft` must be a draft returned by `createDraft`",
  function(thing) {
    return `'current' expects a draft, got: ${thing}`;
  },
  "Object.defineProperty() cannot be used on an Immer draft",
  "Object.setPrototypeOf() cannot be used on an Immer draft",
  "Immer only supports deleting array indices",
  "Immer only supports setting array indices and the 'length' property",
  function(thing) {
    return `'original' expects a draft, got: ${thing}`;
  }
  // Note: if more errors are added, the errorOffset in Patches.ts should be increased
  // See Patches.ts for additional errors
] : [];
function die(error, ...args) {
  if (true) {
    const e = errors[error];
    const msg = typeof e === "function" ? e.apply(null, args) : e;
    throw new Error(`[Immer] ${msg}`);
  }
  throw new Error(
    `[Immer] minified error nr: ${error}. Full error at: https://bit.ly/3cXEKWf`
  );
}
var getPrototypeOf = Object.getPrototypeOf;
function isDraft(value) {
  return !!value && !!value[DRAFT_STATE];
}
function isDraftable(value) {
  if (!value)
    return false;
  return isPlainObject(value) || Array.isArray(value) || !!value[DRAFTABLE] || !!value.constructor?.[DRAFTABLE] || isMap(value) || isSet(value);
}
var objectCtorString = Object.prototype.constructor.toString();
function isPlainObject(value) {
  if (!value || typeof value !== "object")
    return false;
  const proto = getPrototypeOf(value);
  if (proto === null) {
    return true;
  }
  const Ctor = Object.hasOwnProperty.call(proto, "constructor") && proto.constructor;
  if (Ctor === Object)
    return true;
  return typeof Ctor == "function" && Function.toString.call(Ctor) === objectCtorString;
}
function each(obj, iter) {
  if (getArchtype(obj) === 0) {
    Reflect.ownKeys(obj).forEach((key) => {
      iter(key, obj[key], obj);
    });
  } else {
    obj.forEach((entry, index) => iter(index, entry, obj));
  }
}
function getArchtype(thing) {
  const state = thing[DRAFT_STATE];
  return state ? state.type_ : Array.isArray(thing) ? 1 : isMap(thing) ? 2 : isSet(thing) ? 3 : 0;
}
function has(thing, prop) {
  return getArchtype(thing) === 2 ? thing.has(prop) : Object.prototype.hasOwnProperty.call(thing, prop);
}
function set(thing, propOrOldValue, value) {
  const t = getArchtype(thing);
  if (t === 2)
    thing.set(propOrOldValue, value);
  else if (t === 3) {
    thing.add(value);
  } else
    thing[propOrOldValue] = value;
}
function is(x, y) {
  if (x === y) {
    return x !== 0 || 1 / x === 1 / y;
  } else {
    return x !== x && y !== y;
  }
}
function isMap(target) {
  return target instanceof Map;
}
function isSet(target) {
  return target instanceof Set;
}
function latest(state) {
  return state.copy_ || state.base_;
}
function shallowCopy(base, strict) {
  if (isMap(base)) {
    return new Map(base);
  }
  if (isSet(base)) {
    return new Set(base);
  }
  if (Array.isArray(base))
    return Array.prototype.slice.call(base);
  const isPlain = isPlainObject(base);
  if (strict === true || strict === "class_only" && !isPlain) {
    const descriptors = Object.getOwnPropertyDescriptors(base);
    delete descriptors[DRAFT_STATE];
    let keys = Reflect.ownKeys(descriptors);
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      const desc = descriptors[key];
      if (desc.writable === false) {
        desc.writable = true;
        desc.configurable = true;
      }
      if (desc.get || desc.set)
        descriptors[key] = {
          configurable: true,
          writable: true,
          // could live with !!desc.set as well here...
          enumerable: desc.enumerable,
          value: base[key]
        };
    }
    return Object.create(getPrototypeOf(base), descriptors);
  } else {
    const proto = getPrototypeOf(base);
    if (proto !== null && isPlain) {
      return { ...base };
    }
    const obj = Object.create(proto);
    return Object.assign(obj, base);
  }
}
function freeze(obj, deep = false) {
  if (isFrozen(obj) || isDraft(obj) || !isDraftable(obj))
    return obj;
  if (getArchtype(obj) > 1) {
    Object.defineProperties(obj, {
      set: { value: dontMutateFrozenCollections },
      add: { value: dontMutateFrozenCollections },
      clear: { value: dontMutateFrozenCollections },
      delete: { value: dontMutateFrozenCollections }
    });
  }
  Object.freeze(obj);
  if (deep)
    Object.values(obj).forEach((value) => freeze(value, true));
  return obj;
}
function dontMutateFrozenCollections() {
  die(2);
}
function isFrozen(obj) {
  return Object.isFrozen(obj);
}
var plugins = {};
function getPlugin(pluginKey) {
  const plugin = plugins[pluginKey];
  if (!plugin) {
    die(0, pluginKey);
  }
  return plugin;
}
var currentScope;
function getCurrentScope() {
  return currentScope;
}
function createScope(parent_, immer_) {
  return {
    drafts_: [],
    parent_,
    immer_,
    // Whenever the modified draft contains a draft from another scope, we
    // need to prevent auto-freezing so the unowned draft can be finalized.
    canAutoFreeze_: true,
    unfinalizedDrafts_: 0
  };
}
function usePatchesInScope(scope, patchListener) {
  if (patchListener) {
    getPlugin("Patches");
    scope.patches_ = [];
    scope.inversePatches_ = [];
    scope.patchListener_ = patchListener;
  }
}
function revokeScope(scope) {
  leaveScope(scope);
  scope.drafts_.forEach(revokeDraft);
  scope.drafts_ = null;
}
function leaveScope(scope) {
  if (scope === currentScope) {
    currentScope = scope.parent_;
  }
}
function enterScope(immer2) {
  return currentScope = createScope(currentScope, immer2);
}
function revokeDraft(draft) {
  const state = draft[DRAFT_STATE];
  if (state.type_ === 0 || state.type_ === 1)
    state.revoke_();
  else
    state.revoked_ = true;
}
function processResult(result, scope) {
  scope.unfinalizedDrafts_ = scope.drafts_.length;
  const baseDraft = scope.drafts_[0];
  const isReplaced = result !== void 0 && result !== baseDraft;
  if (isReplaced) {
    if (baseDraft[DRAFT_STATE].modified_) {
      revokeScope(scope);
      die(4);
    }
    if (isDraftable(result)) {
      result = finalize(scope, result);
      if (!scope.parent_)
        maybeFreeze(scope, result);
    }
    if (scope.patches_) {
      getPlugin("Patches").generateReplacementPatches_(
        baseDraft[DRAFT_STATE].base_,
        result,
        scope.patches_,
        scope.inversePatches_
      );
    }
  } else {
    result = finalize(scope, baseDraft, []);
  }
  revokeScope(scope);
  if (scope.patches_) {
    scope.patchListener_(scope.patches_, scope.inversePatches_);
  }
  return result !== NOTHING ? result : void 0;
}
function finalize(rootScope, value, path) {
  if (isFrozen(value))
    return value;
  const state = value[DRAFT_STATE];
  if (!state) {
    each(
      value,
      (key, childValue) => finalizeProperty(rootScope, state, value, key, childValue, path)
    );
    return value;
  }
  if (state.scope_ !== rootScope)
    return value;
  if (!state.modified_) {
    maybeFreeze(rootScope, state.base_, true);
    return state.base_;
  }
  if (!state.finalized_) {
    state.finalized_ = true;
    state.scope_.unfinalizedDrafts_--;
    const result = state.copy_;
    let resultEach = result;
    let isSet2 = false;
    if (state.type_ === 3) {
      resultEach = new Set(result);
      result.clear();
      isSet2 = true;
    }
    each(
      resultEach,
      (key, childValue) => finalizeProperty(rootScope, state, result, key, childValue, path, isSet2)
    );
    maybeFreeze(rootScope, result, false);
    if (path && rootScope.patches_) {
      getPlugin("Patches").generatePatches_(
        state,
        path,
        rootScope.patches_,
        rootScope.inversePatches_
      );
    }
  }
  return state.copy_;
}
function finalizeProperty(rootScope, parentState, targetObject, prop, childValue, rootPath, targetIsSet) {
  if (childValue === targetObject)
    die(5);
  if (isDraft(childValue)) {
    const path = rootPath && parentState && parentState.type_ !== 3 && // Set objects are atomic since they have no keys.
    !has(parentState.assigned_, prop) ? rootPath.concat(prop) : void 0;
    const res = finalize(rootScope, childValue, path);
    set(targetObject, prop, res);
    if (isDraft(res)) {
      rootScope.canAutoFreeze_ = false;
    } else
      return;
  } else if (targetIsSet) {
    targetObject.add(childValue);
  }
  if (isDraftable(childValue) && !isFrozen(childValue)) {
    if (!rootScope.immer_.autoFreeze_ && rootScope.unfinalizedDrafts_ < 1) {
      return;
    }
    finalize(rootScope, childValue);
    if ((!parentState || !parentState.scope_.parent_) && typeof prop !== "symbol" && (isMap(targetObject) ? targetObject.has(prop) : Object.prototype.propertyIsEnumerable.call(targetObject, prop)))
      maybeFreeze(rootScope, childValue);
  }
}
function maybeFreeze(scope, value, deep = false) {
  if (!scope.parent_ && scope.immer_.autoFreeze_ && scope.canAutoFreeze_) {
    freeze(value, deep);
  }
}
function createProxyProxy(base, parent) {
  const isArray = Array.isArray(base);
  const state = {
    type_: isArray ? 1 : 0,
    // Track which produce call this is associated with.
    scope_: parent ? parent.scope_ : getCurrentScope(),
    // True for both shallow and deep changes.
    modified_: false,
    // Used during finalization.
    finalized_: false,
    // Track which properties have been assigned (true) or deleted (false).
    assigned_: {},
    // The parent draft state.
    parent_: parent,
    // The base state.
    base_: base,
    // The base proxy.
    draft_: null,
    // set below
    // The base copy with any updated values.
    copy_: null,
    // Called by the `produce` function.
    revoke_: null,
    isManual_: false
  };
  let target = state;
  let traps = objectTraps;
  if (isArray) {
    target = [state];
    traps = arrayTraps;
  }
  const { revoke, proxy } = Proxy.revocable(target, traps);
  state.draft_ = proxy;
  state.revoke_ = revoke;
  return proxy;
}
var objectTraps = {
  get(state, prop) {
    if (prop === DRAFT_STATE)
      return state;
    const source = latest(state);
    if (!has(source, prop)) {
      return readPropFromProto(state, source, prop);
    }
    const value = source[prop];
    if (state.finalized_ || !isDraftable(value)) {
      return value;
    }
    if (value === peek(state.base_, prop)) {
      prepareCopy(state);
      return state.copy_[prop] = createProxy(value, state);
    }
    return value;
  },
  has(state, prop) {
    return prop in latest(state);
  },
  ownKeys(state) {
    return Reflect.ownKeys(latest(state));
  },
  set(state, prop, value) {
    const desc = getDescriptorFromProto(latest(state), prop);
    if (desc?.set) {
      desc.set.call(state.draft_, value);
      return true;
    }
    if (!state.modified_) {
      const current2 = peek(latest(state), prop);
      const currentState = current2?.[DRAFT_STATE];
      if (currentState && currentState.base_ === value) {
        state.copy_[prop] = value;
        state.assigned_[prop] = false;
        return true;
      }
      if (is(value, current2) && (value !== void 0 || has(state.base_, prop)))
        return true;
      prepareCopy(state);
      markChanged(state);
    }
    if (state.copy_[prop] === value && // special case: handle new props with value 'undefined'
    (value !== void 0 || prop in state.copy_) || // special case: NaN
    Number.isNaN(value) && Number.isNaN(state.copy_[prop]))
      return true;
    state.copy_[prop] = value;
    state.assigned_[prop] = true;
    return true;
  },
  deleteProperty(state, prop) {
    if (peek(state.base_, prop) !== void 0 || prop in state.base_) {
      state.assigned_[prop] = false;
      prepareCopy(state);
      markChanged(state);
    } else {
      delete state.assigned_[prop];
    }
    if (state.copy_) {
      delete state.copy_[prop];
    }
    return true;
  },
  // Note: We never coerce `desc.value` into an Immer draft, because we can't make
  // the same guarantee in ES5 mode.
  getOwnPropertyDescriptor(state, prop) {
    const owner = latest(state);
    const desc = Reflect.getOwnPropertyDescriptor(owner, prop);
    if (!desc)
      return desc;
    return {
      writable: true,
      configurable: state.type_ !== 1 || prop !== "length",
      enumerable: desc.enumerable,
      value: owner[prop]
    };
  },
  defineProperty() {
    die(11);
  },
  getPrototypeOf(state) {
    return getPrototypeOf(state.base_);
  },
  setPrototypeOf() {
    die(12);
  }
};
var arrayTraps = {};
each(objectTraps, (key, fn) => {
  arrayTraps[key] = function() {
    arguments[0] = arguments[0][0];
    return fn.apply(this, arguments);
  };
});
arrayTraps.deleteProperty = function(state, prop) {
  if (isNaN(parseInt(prop)))
    die(13);
  return arrayTraps.set.call(this, state, prop, void 0);
};
arrayTraps.set = function(state, prop, value) {
  if (prop !== "length" && isNaN(parseInt(prop)))
    die(14);
  return objectTraps.set.call(this, state[0], prop, value, state[0]);
};
function peek(draft, prop) {
  const state = draft[DRAFT_STATE];
  const source = state ? latest(state) : draft;
  return source[prop];
}
function readPropFromProto(state, source, prop) {
  const desc = getDescriptorFromProto(source, prop);
  return desc ? `value` in desc ? desc.value : (
    // This is a very special case, if the prop is a getter defined by the
    // prototype, we should invoke it with the draft as context!
    desc.get?.call(state.draft_)
  ) : void 0;
}
function getDescriptorFromProto(source, prop) {
  if (!(prop in source))
    return void 0;
  let proto = getPrototypeOf(source);
  while (proto) {
    const desc = Object.getOwnPropertyDescriptor(proto, prop);
    if (desc)
      return desc;
    proto = getPrototypeOf(proto);
  }
  return void 0;
}
function markChanged(state) {
  if (!state.modified_) {
    state.modified_ = true;
    if (state.parent_) {
      markChanged(state.parent_);
    }
  }
}
function prepareCopy(state) {
  if (!state.copy_) {
    state.copy_ = shallowCopy(
      state.base_,
      state.scope_.immer_.useStrictShallowCopy_
    );
  }
}
var Immer2 = class {
  constructor(config) {
    this.autoFreeze_ = true;
    this.useStrictShallowCopy_ = false;
    this.produce = (base, recipe, patchListener) => {
      if (typeof base === "function" && typeof recipe !== "function") {
        const defaultBase = recipe;
        recipe = base;
        const self = this;
        return function curriedProduce(base2 = defaultBase, ...args) {
          return self.produce(base2, (draft) => recipe.call(this, draft, ...args));
        };
      }
      if (typeof recipe !== "function")
        die(6);
      if (patchListener !== void 0 && typeof patchListener !== "function")
        die(7);
      let result;
      if (isDraftable(base)) {
        const scope = enterScope(this);
        const proxy = createProxy(base, void 0);
        let hasError = true;
        try {
          result = recipe(proxy);
          hasError = false;
        } finally {
          if (hasError)
            revokeScope(scope);
          else
            leaveScope(scope);
        }
        usePatchesInScope(scope, patchListener);
        return processResult(result, scope);
      } else if (!base || typeof base !== "object") {
        result = recipe(base);
        if (result === void 0)
          result = base;
        if (result === NOTHING)
          result = void 0;
        if (this.autoFreeze_)
          freeze(result, true);
        if (patchListener) {
          const p = [];
          const ip = [];
          getPlugin("Patches").generateReplacementPatches_(base, result, p, ip);
          patchListener(p, ip);
        }
        return result;
      } else
        die(1, base);
    };
    this.produceWithPatches = (base, recipe) => {
      if (typeof base === "function") {
        return (state, ...args) => this.produceWithPatches(state, (draft) => base(draft, ...args));
      }
      let patches, inversePatches;
      const result = this.produce(base, recipe, (p, ip) => {
        patches = p;
        inversePatches = ip;
      });
      return [result, patches, inversePatches];
    };
    if (typeof config?.autoFreeze === "boolean")
      this.setAutoFreeze(config.autoFreeze);
    if (typeof config?.useStrictShallowCopy === "boolean")
      this.setUseStrictShallowCopy(config.useStrictShallowCopy);
  }
  createDraft(base) {
    if (!isDraftable(base))
      die(8);
    if (isDraft(base))
      base = current(base);
    const scope = enterScope(this);
    const proxy = createProxy(base, void 0);
    proxy[DRAFT_STATE].isManual_ = true;
    leaveScope(scope);
    return proxy;
  }
  finishDraft(draft, patchListener) {
    const state = draft && draft[DRAFT_STATE];
    if (!state || !state.isManual_)
      die(9);
    const { scope_: scope } = state;
    usePatchesInScope(scope, patchListener);
    return processResult(void 0, scope);
  }
  /**
   * Pass true to automatically freeze all copies created by Immer.
   *
   * By default, auto-freezing is enabled.
   */
  setAutoFreeze(value) {
    this.autoFreeze_ = value;
  }
  /**
   * Pass true to enable strict shallow copy.
   *
   * By default, immer does not copy the object descriptors such as getter, setter and non-enumrable properties.
   */
  setUseStrictShallowCopy(value) {
    this.useStrictShallowCopy_ = value;
  }
  applyPatches(base, patches) {
    let i;
    for (i = patches.length - 1; i >= 0; i--) {
      const patch = patches[i];
      if (patch.path.length === 0 && patch.op === "replace") {
        base = patch.value;
        break;
      }
    }
    if (i > -1) {
      patches = patches.slice(i + 1);
    }
    const applyPatchesImpl = getPlugin("Patches").applyPatches_;
    if (isDraft(base)) {
      return applyPatchesImpl(base, patches);
    }
    return this.produce(
      base,
      (draft) => applyPatchesImpl(draft, patches)
    );
  }
};
function createProxy(value, parent) {
  const draft = isMap(value) ? getPlugin("MapSet").proxyMap_(value, parent) : isSet(value) ? getPlugin("MapSet").proxySet_(value, parent) : createProxyProxy(value, parent);
  const scope = parent ? parent.scope_ : getCurrentScope();
  scope.drafts_.push(draft);
  return draft;
}
function current(value) {
  if (!isDraft(value))
    die(10, value);
  return currentImpl(value);
}
function currentImpl(value) {
  if (!isDraftable(value) || isFrozen(value))
    return value;
  const state = value[DRAFT_STATE];
  let copy;
  if (state) {
    if (!state.modified_)
      return state.base_;
    state.finalized_ = true;
    copy = shallowCopy(value, state.scope_.immer_.useStrictShallowCopy_);
  } else {
    copy = shallowCopy(value, true);
  }
  each(copy, (key, childValue) => {
    set(copy, key, currentImpl(childValue));
  });
  if (state) {
    state.finalized_ = false;
  }
  return copy;
}
var immer = new Immer2();
var produce = immer.produce;

// upstream/packages/client/store/src/index.ts.snapshot
function notifySubscribers(listeners, label, ...args) {
  for (const listener of [...listeners]) {
    try {
      listener(...args);
    } catch (error) {
      console.error(`${label} subscriber failed:`, error);
    }
  }
}
function rafBatch(notify) {
  const schedule = typeof requestAnimationFrame === "function" ? (fn) => {
    requestAnimationFrame(() => {
      fn();
    });
  } : (fn) => {
    queueMicrotask(fn);
  };
  let scheduled = false;
  return () => {
    if (scheduled) return;
    scheduled = true;
    schedule(() => {
      scheduled = false;
      notify();
    });
  };
}
function createSnapshotStore(init, opts) {
  const withSelector = subscribeWithSelector(() => init);
  const api = createStore()(withSelector);
  if (opts?.persist) attachPersistence(api, opts.persist.name);
  let subscribe = (fn) => api.subscribe(() => {
    notifySubscribers([fn], "[client-store]");
  });
  if (opts?.flush === "raf") {
    const listeners = /* @__PURE__ */ new Set();
    const flush = rafBatch(() => {
      notifySubscribers(listeners, "[client-store]");
    });
    api.subscribe(flush);
    subscribe = (fn) => {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    };
  }
  return {
    getSnapshot: () => api.getState(),
    subscribe: (fn) => subscribe(fn),
    update: (mutator) => {
      api.setState(produce(api.getState(), (draft) => {
        mutator(draft);
      }), true);
    },
    set: (next) => {
      api.setState(devFreeze(next), true);
    }
  };
}
function attachPersistence(api, name) {
  if (typeof localStorage === "undefined") return;
  try {
    const raw = localStorage.getItem(name);
    if (raw !== null) {
      api.setState(devFreeze(JSON.parse(raw)), true);
    }
  } catch (error) {
    console.error(`snapshot store '${name}' rehydration failed:`, error);
  }
  api.subscribe((state) => {
    try {
      localStorage.setItem(name, JSON.stringify(state));
    } catch (error) {
      console.error(`snapshot store '${name}' persistence failed:`, error);
    }
  });
}
function devFreeze(value) {
  if (false) return value;
  return freeze(value, true);
}
function defineStore(decl) {
  return {
    spec: decl,
    create(scopeKey) {
      const persistKey = decl.persist === void 0 ? void 0 : scopeKey === void 0 ? decl.persist : `${decl.persist}.${scopeKey}`;
      const store = createSnapshotStore(
        decl.init(),
        persistKey !== void 0 ? { persist: { name: persistKey } } : void 0
      );
      const actions = {};
      for (const key of Object.keys(decl.actions)) {
        const mutate = decl.actions[key];
        actions[key] = (...params) => {
          store.update((draft) => {
            mutate(draft, ...params);
          });
        };
      }
      return {
        actions,
        getSnapshot: () => store.getSnapshot(),
        subscribe: (fn) => store.subscribe(fn),
        store,
        clearPersisted: () => {
          if (persistKey === void 0 || typeof localStorage === "undefined") return;
          try {
            localStorage.removeItem(persistKey);
          } catch {
          }
        }
      };
    }
  };
}

// upstream/packages/client/ui-shortcuts/src/client/store.ts.snapshot
function createShortcutsStore() {
  return defineStore({
    init: () => ({ open: false, query: "", focusRequest: 0 }),
    actions: {
      open: (d) => {
        d.open = true;
        d.focusRequest++;
      },
      close: (d) => {
        d.open = false;
        d.query = "";
      },
      search: (d, query) => {
        d.query = query;
      }
    }
  });
}

// upstream/packages/client/ui-shortcuts/src/client/Reference.tsx.snapshot
import { useCallback as useCallback3, useEffect as useEffect7, useLayoutEffect as useLayoutEffect7, useMemo as useMemo2, useRef as useRef10, useState as useState6 } from "react";

// ../../node_modules/.pnpm/fuzzysort@4.0.2/node_modules/fuzzysort/fuzzysort.js
function single(search, target) {
  if (!search || !target) return null;
  let query = getQuery(search);
  if (!isPrepared(target)) target = getPrepared(target);
  if ((query.bitflags & target._bitflags) !== query.bitflags) return null;
  let result = !query.hasSpace && query.lowerCodes.length === 2 ? algorithm2(query, target) : algorithm(query, target);
  return result && materialize(result);
}
function go(search, targets, options) {
  if (targets instanceof SnapshotTargets) return goSnapshot(search, targets, options);
  let key = options?.key;
  let keys = !key && options?.keys;
  let firstTarget = targets[0];
  if (!key && !keys && typeof firstTarget === "object" && firstTarget !== null && !isPrepared(firstTarget)) {
    throw new Error("fuzzysort: key or keys is required when searching object targets");
  }
  if (!search) return all(targets, options);
  let query = getQuery(search);
  if (keys) return goKeys(query, targets, options);
  let searchBitflags = query.bitflags;
  let twoChar = !query.hasSpace && query.lowerCodes.length === 2;
  let threshold = denormalizeScore(options?.threshold ?? 0.5);
  let limit = getLimit(options);
  let scoreFn = options?.scoreFn;
  let resultCount = 0;
  let limited = 0;
  let getter = key && makeGetter(key);
  for (let i = 0; i < targets.length; i++) {
    let obj = targets[i];
    let target = key ? getter === null ? obj[key] : getter(obj) : obj;
    if (!target) continue;
    if (!isPrepared(target)) target = getPrepared(target);
    if ((searchBitflags & target._bitflags) !== searchBitflags) continue;
    let result = twoChar ? algorithm2(query, target) : algorithm(query, target);
    if (result === null) continue;
    let resultScore = result._score;
    if (scoreFn) {
      result = materialize(result, key ? obj : void 0);
      resultScore = scoreFn(result);
      if (!resultScore) continue;
      result._score = resultScore = denormalizeScore(resultScore);
    }
    if (resultScore < threshold) continue;
    let room = resultCount < limit;
    if (room) resultCount++;
    else {
      limited++;
      if (resultScore <= heap.peek()._score) continue;
    }
    if (!scoreFn) result = materialize(result, key ? obj : void 0);
    room ? heap.add(result) : heap.replaceTop(result);
  }
  return finishResults(resultCount, limited);
}
function highlight(result, open = "<b>", close = "</b>", threshold = 0.5) {
  let callback = typeof open === "function" ? open : null;
  let target = result.target;
  if (result._bestKeyScore !== void 0 && normalizeScore(result._score) < normalizeScore(result._bestKeyScore) * threshold) return callback ? [target] : target;
  let raw = result._indexes;
  let indexes = raw === void 0 ? result.indexes : raw.slice(0, raw.len ?? raw.length).sort((a, b) => a - b);
  if (!indexes.length) return callback ? [target] : target;
  let output = callback ? [] : "";
  let lastIndex = 0;
  let matchI = 0;
  for (let i = 0; i < indexes.length; ) {
    let start = indexes[i++];
    let end = start + 1;
    while (indexes[i] === end) {
      i++;
      end++;
    }
    let before = target.slice(lastIndex, start);
    let match = target.slice(start, end);
    if (callback) output.push(before, callback(match, matchI++));
    else output += before + open + match + close;
    lastIndex = end;
  }
  if (callback) output.push(target.slice(lastIndex));
  else output += target.slice(lastIndex);
  return output;
}
function score(result) {
  let value = result.score;
  return value === void 0 ? normalizeScore(result._score) : value;
}
function remap(mappings) {
  for (let char in mappings) {
    remappings[char] = mappings[char];
    if (char.charCodeAt(0) < 128) customAsciiRemappings = true;
  }
  cleanup();
}
function prepare(target) {
  return prepTarget(target);
}
function snapshot(targets, options) {
  return new SnapshotTargets(targets, options);
}
function cleanup() {
  targetCache.clear();
  searchCache.clear();
  heap.clear();
  simpleMatch = [];
  strictMatch = [];
  seen = [];
  seenAt = [];
  changes = [];
  partials = [];
  spaceScores = [];
  partIndexes = [];
  winnerIndexes = [];
  winnerScores = [];
  winnerKeys = [];
  keyTargets = [];
  keyResults = [];
  candidateBitOffsets = [];
  seenGeneration = 0;
}
function goSnapshotValues(search, snapshot2, options, singleChar) {
  let targets = snapshot2._targets;
  let objects = snapshot2._objects;
  let threshold = denormalizeScore(options?.threshold ?? 0.5);
  let limit = getLimit(options);
  let scoreFn = options?.scoreFn;
  let searchLen = search.lowerCodes.length;
  let shortSearch = !search.hasSpace && searchLen <= 3;
  let twoChar = !search.hasSpace && searchLen === 2;
  let rows = snapshot2._candidateRows;
  let rowsLength = snapshot2._candidateLength;
  let matchedRows = snapshot2._rows;
  let matchedCount = 0;
  let resultCount = 0;
  let limited = 0;
  for (let n = 0; n < rowsLength; n++) {
    let i = rows === null ? n : rows[n];
    let target = targets[i];
    if (target === noTarget || (search.bitflags & target._bitflags) !== search.bitflags) continue;
    let targetShort = shortSearch && target.target.length < 65535;
    let cutoff = !scoreFn && threshold === -INF && resultCount >= limit ? heap.peek()._score : -INF;
    let result;
    if (singleChar && targetShort) result = algorithm1(search, target, snapshot2._first, i);
    else if (twoChar && targetShort) {
      let start = snapshot2._offsets[i];
      let end = snapshot2._offsets[i + 1];
      result = algorithm2(search, target, snapshot2._beginnings, start, end, cutoff);
    } else if (twoChar) result = algorithm2(search, target, null, 0, 0, cutoff);
    else if (targetShort) {
      let start = snapshot2._offsets[i];
      let end = snapshot2._offsets[i + 1];
      result = algorithm(search, target, false, false, false, true, snapshot2._beginnings, start, end, cutoff);
    } else result = algorithm(search, target, false, false, false, true, null, 0, 0, cutoff);
    if (result === null) continue;
    matchedRows[matchedCount++] = i;
    if (result === prunedMatch) {
      limited++;
      continue;
    }
    let resultScore = result._score;
    if (scoreFn) {
      result = materialize(result, objects?.[i]);
      resultScore = scoreFn(result);
      if (!resultScore) continue;
      result._score = resultScore = denormalizeScore(resultScore);
    }
    if (resultScore < threshold) continue;
    let room = resultCount < limit;
    if (room) resultCount++;
    else {
      limited++;
      if (resultScore <= heap.peek()._score) continue;
    }
    if (objects && !scoreFn) result = materialize(result, objects[i]);
    room ? heap.add(result) : heap.replaceTop(result);
  }
  snapshot2._matchedRowsLen = matchedCount;
  return finishResults(resultCount, limited, !objects && !scoreFn && materialize);
}
function goSnapshot(search, snapshot2, options) {
  if (options?.key || options?.keys) throw new Error("fuzzysort: key/keys must be provided to snapshot(), not go()");
  snapshot2._finish();
  if (!search) return allSnapshot(snapshot2, options);
  let query = getQuery(search);
  let backtrack = snapshot2._backtrack(query, options);
  if (backtrack) return backtrack;
  snapshot2._beginSearch(query);
  try {
    let results;
    if (snapshot2._mode < 2) {
      let searchLen = query.lowerCodes.length;
      let code = query.lowerCodes[0];
      let singleChar = searchLen === 1 && code >= 97 && code <= 122;
      results = goSnapshotValues(query, snapshot2, options, singleChar);
    } else results = goKeys(query, snapshot2._objects, options, snapshot2);
    snapshot2._endSearch(query);
    snapshot2._remember(query, results, options);
    return results;
  } catch (error) {
    snapshot2._resetSearch();
    throw error;
  }
}
function goKeys(query, objects, options, snapshot2) {
  let indexed = snapshot2 !== void 0;
  let keys = indexed ? null : options.keys;
  let getters = indexed ? null : keys.map(makeGetter);
  let targets = indexed ? snapshot2._targets : null;
  let keysLength = indexed ? snapshot2._keysLength : keys.length;
  let searchBitflags = query.bitflags;
  let hasSpace = query.hasSpace;
  let spaceCount = query.parts.length;
  let threshold = denormalizeScore(options?.threshold ?? 0.5);
  let limit = getLimit(options);
  let searchLen = query.lowerCodes.length;
  let short = indexed && !hasSpace && searchLen <= 3;
  let twoChar = !hasSpace && searchLen === 2;
  let code = query.lowerCodes[0];
  let singleChar = short && searchLen === 1 && code >= 97 && code <= 122;
  let scoreFn = options?.scoreFn;
  let deferMaterialization = indexed && !scoreFn && (limit !== INF || threshold > -INF);
  let rows = indexed ? snapshot2._candidateRows : null;
  let rowsLength = indexed ? snapshot2._candidateLength : objects.length;
  let matchedRows = indexed ? snapshot2._rows : null;
  let matchedCount = 0;
  let resultCount = 0;
  let limited = 0;
  outer: for (let n = 0; n < rowsLength; n++) {
    let i = rows === null ? n : rows[n];
    let row = i * keysLength;
    if (indexed) {
      if ((searchBitflags & snapshot2._bitflags[i]) !== searchBitflags) continue;
    } else {
      let obj = objects[i];
      let keysBitflags = 0;
      for (let k = 0; k < keysLength; k++) {
        let target = getters[k] === null ? obj[keys[k]] : getters[k](obj);
        if (!target) target = noTarget;
        else if (!isPrepared(target)) target = getPrepared(target);
        keyTargets[k] = target;
        keysBitflags |= target._bitflags;
      }
      if ((searchBitflags & keysBitflags) !== searchBitflags) continue;
    }
    if (hasSpace) for (let s = 0; s < spaceCount; s++) {
      spaceScores[s] = winnerScores[s] = -INF;
      winnerKeys[s] = -1;
    }
    for (let k = 0; k < keysLength; k++) {
      let target = indexed ? targets[row + k] : keyTargets[k];
      if (target === noTarget) {
        keyResults[k] = noTarget;
        continue;
      }
      if (hasSpace && indexed) {
        let possible = false;
        for (let s = 0; s < spaceCount; s++) {
          let partBitflags = query.parts[s].bitflags;
          if ((partBitflags & target._bitflags) === partBitflags) {
            possible = true;
            break;
          }
        }
        if (!possible) {
          keyResults[k] = noTarget;
          continue;
        }
      } else if (!hasSpace && (searchBitflags & target._bitflags) !== searchBitflags) {
        keyResults[k] = noTarget;
        continue;
      }
      let match;
      if (indexed) {
        let valueRow = row + k;
        let targetShort = short && target.target.length < 65535;
        if (singleChar && targetShort) match = algorithm1(query, target, snapshot2._first, valueRow);
        else if (twoChar && targetShort) {
          let start = snapshot2._offsets[valueRow];
          let end = snapshot2._offsets[valueRow + 1];
          match = algorithm2(query, target, snapshot2._beginnings, start, end);
        } else if (twoChar) match = algorithm2(query, target);
        else if (targetShort) {
          let start = snapshot2._offsets[valueRow];
          let end = snapshot2._offsets[valueRow + 1];
          match = algorithm(query, target, false, false, false, true, snapshot2._beginnings, start, end);
        } else match = algorithm(query, target, false, hasSpace);
      } else match = twoChar ? algorithm2(query, target) : algorithm(query, target, false, hasSpace);
      if (match === null) {
        keyResults[k] = noTarget;
        continue;
      }
      keyResults[k] = deferMaterialization ? match : materialize(match);
      if (hasSpace) {
        mergePartScores(spaceCount);
        for (let s = 0; s < spaceCount; s++) {
          let partScore = partials[s];
          if (partScore <= winnerScores[s]) continue;
          winnerScores[s] = partScore;
          winnerKeys[s] = k;
          let source = partIndexes[s];
          let winner = winnerIndexes[s] ||= [];
          winner.length = source.length;
          for (let j = 0; j < source.length; j++) winner[j] = source[j];
        }
      }
    }
    if (hasSpace) {
      for (let s = 0; s < spaceCount; s++) if (winnerKeys[s] !== -1) {
        appendIndexes(keyResults[winnerKeys[s]]._indexes, winnerIndexes[s]);
      }
    }
    let resultScore;
    if (hasSpace) {
      resultScore = 0;
      for (let s = 0; s < spaceCount; s++) {
        let partScore = spaceScores[s];
        if (partScore === -INF) continue outer;
        resultScore += partScore;
      }
    } else {
      resultScore = mergeScores(keyResults, keysLength);
      if (resultScore === -INF) continue;
    }
    if (indexed) matchedRows[matchedCount++] = i;
    let result = deferMaterialization ? null : captureKeysResult(keyResults, keysLength, objects[i], resultScore, hasSpace);
    if (scoreFn) {
      resultScore = scoreFn(result);
      if (!resultScore) continue;
      result._score = resultScore = denormalizeScore(resultScore);
    }
    if (resultScore < threshold) continue;
    let room = resultCount < limit;
    if (room) resultCount++;
    else {
      limited++;
      if (resultScore <= heap.peek()._score) continue;
    }
    if (result === null) result = captureKeysResult(keyResults, keysLength, objects[i], resultScore, hasSpace);
    room ? heap.add(result) : heap.replaceTop(result);
  }
  if (indexed) snapshot2._matchedRowsLen = matchedCount;
  return finishResults(resultCount, limited, deferMaterialization && materializeKeys);
}
function allSnapshot(snapshot2, options) {
  let results = [];
  let targets = snapshot2._targets;
  let objects = snapshot2._objects;
  let keysLength = snapshot2._keysLength;
  let total = keysLength === void 0 ? targets.length : objects.length;
  results.total = total;
  let limit = getLimit(options);
  for (let i = 0, length = Math.min(total, limit); i < length; i++) {
    if (keysLength === void 0) {
      results.push(newResult(targets[i].target, -INF, objects?.[i]));
      continue;
    }
    let row = i * keysLength;
    for (let k = 0; k < keysLength; k++) {
      let target = targets[row + k];
      keyResults[k] = target === noTarget ? noTarget : newResult(target.target, -INF);
    }
    results.push(captureKeysResult(keyResults, keysLength, objects[i], -INF));
  }
  return results;
}
function all(targets, options) {
  let results = [];
  results.total = targets.length;
  let limit = getLimit(options);
  let key = options?.key;
  let keys = !key && options?.keys;
  if (keys) {
    let getters = keys.map(makeGetter);
    for (let obj of targets) {
      for (let k = keys.length - 1; k >= 0; k--) {
        let target = getters[k] === null ? obj[keys[k]] : getters[k](obj);
        if (!target) keyResults[k] = noTarget;
        else {
          if (!isPrepared(target)) target = getPrepared(target);
          target._score = -INF;
          target._indexes.len = 0;
          keyResults[k] = target;
        }
      }
      results.push(captureKeysResult(keyResults, keys.length, obj, -INF));
      if (results.length >= limit) break;
    }
    return results;
  }
  let getter = key && makeGetter(key);
  for (let obj of targets) {
    let target = key ? getter === null ? obj[key] : getter(obj) : obj;
    if (target == null) continue;
    if (!isPrepared(target)) target = getPrepared(target);
    if (key) target = newResult(target.target, -INF, obj);
    else {
      target._score = -INF;
      target._indexes.len = 0;
    }
    results.push(target);
    if (results.length >= limit) break;
  }
  return results;
}
function finishResults(length, limited, transform) {
  if (!length) return noResults;
  let results = new Array(length);
  for (let i = length - 1; i >= 0; i--) {
    let result = heap.poll();
    if (transform) result = transform(result);
    if (result instanceof KeysResult && !result._partWinners) markBestKeyScore(result);
    results[i] = result;
  }
  results.total = length + limited;
  return results;
}
function materializeKeys(result) {
  for (let k = 0; k < result.length; k++) if (result[k] !== noTarget) result[k] = materialize(result[k]);
  return result;
}
function algorithm1(search, target, firstTable, row) {
  let matchI = target._targetLower.indexOf(search._lower);
  if (matchI === -1) return null;
  let beginning = firstTable[row * 26 + search.lowerCodes[0] - 97];
  let strict = beginning !== 0;
  if (strict) matchI = beginning - 1;
  let score2 = matchI === 0 ? 0 : -matchI * matchI * 0.2;
  if (!strict) score2 *= 1e3;
  else if (target._beginningsLen > 24) score2 *= (target._beginningsLen - 24) * 10;
  target._score = score2 - target._targetLowerCodes.length + 1;
  target._indexes[0] = matchI;
  target._indexes.len = 1;
  return target;
}
function algorithm2(search, target, beginnings = null, start = 0, end = 0, cutoff = -INF) {
  let targetCodes = target._targetLowerCodes;
  let targetLen = targetCodes.length;
  let firstCode = search.lowerCodes[0];
  let secondCode = search.lowerCodes[1];
  let first = 0;
  while (targetCodes[first] !== firstCode) if (++first >= targetLen) return null;
  let second = first + 1;
  while (targetCodes[second] !== secondCode) if (++second >= targetLen) return null;
  if (cutoff !== -INF && scoreCeiling(2, targetLen) <= cutoff) return prunedMatch;
  if (beginnings === null) {
    beginnings = target._beginnings;
    if (beginnings === null) target._beginnings = beginnings = makeBeginnings(target);
    end = beginnings.length;
  }
  let substringI = target._targetLower.indexOf(search._lower, first);
  let substring = substringI !== -1;
  let low = lowerBound(beginnings, start, end, substringI);
  let substringStart = substring && low < end && beginnings[low] === substringI;
  let strict = substringStart && substringI === first;
  if (!strict) {
    let firstBeginning = start;
    while (firstBeginning < end && beginnings[firstBeginning] < first) firstBeginning++;
    for (let backtracks = 0; firstBeginning < end; ) {
      let strictFirst = beginnings[firstBeginning];
      if (targetCodes[strictFirst] !== firstCode) {
        firstBeginning++;
        continue;
      }
      let consecutive = strictFirst + 1;
      if (targetCodes[consecutive] === secondCode) {
        first = strictFirst;
        second = consecutive;
        strict = true;
        break;
      }
      let secondBeginning = firstBeginning + 1;
      while (secondBeginning < end && beginnings[secondBeginning] <= consecutive) secondBeginning++;
      while (secondBeginning < end && targetCodes[beginnings[secondBeginning]] !== secondCode) secondBeginning++;
      if (secondBeginning < end) {
        first = strictFirst;
        second = beginnings[secondBeginning];
        strict = true;
        break;
      }
      if (++backtracks > 200) break;
      firstBeginning++;
    }
  }
  if (substring && !substringStart) {
    while (low < end && beginnings[low] <= substringI) low++;
    for (; low < end; low++) {
      let index = beginnings[low];
      if (targetCodes[index] === firstCode && targetCodes[index + 1] === secondCode) {
        substringI = index;
        substringStart = true;
        break;
      }
    }
  }
  if (substring && (!strict || substringStart)) {
    first = substringI;
    second = substringI + 1;
  }
  let resultScore = second - first === 1 ? 0 : first - second * 2 - 11;
  if (first) resultScore -= first * first * 0.2;
  if (!strict) resultScore *= 1e3;
  else if (end - start > 24) resultScore *= (end - start - 24) * 10;
  let lengthPenalty = (targetLen - 2) / 2;
  resultScore -= lengthPenalty;
  if (substring) resultScore /= 5;
  if (substringStart) resultScore /= 5;
  resultScore -= lengthPenalty;
  let substringEnd = substring && second === first + 1 && (second + 1 === targetLen || isBeginning(beginnings, start, end, second + 1));
  target._score = substringEnd ? resultScore + Math.min(4, -resultScore / 2) : resultScore;
  target._indexes[0] = first;
  target._indexes[1] = second;
  target._indexes.len = 2;
  return target;
}
function algorithm(search, target, spaces = false, partial = false, changed = false, singleMatch = true, beginnings = null, start = 0, end = 0, cutoff = -INF) {
  if (!spaces && search.hasSpace) return algorithmSpaces(search, target, partial);
  let searchCodes = search.lowerCodes;
  let targetCodes = target._targetLowerCodes;
  let searchLen = searchCodes.length;
  let targetLen = targetCodes.length;
  let searchCode = searchCodes[0];
  let searchI = 0;
  let targetI = 0;
  for (; ; ) {
    if (searchCode === targetCodes[targetI]) {
      simpleMatch[searchI] = targetI;
      if (++searchI === searchLen) break;
      searchCode = searchCodes[searchI];
    }
    if (++targetI >= targetLen) return null;
  }
  if (cutoff !== -INF && searchLen > 1 && scoreCeiling(searchLen, targetLen) <= cutoff) return prunedMatch;
  if (searchLen === 1 && !changed && singleMatch) {
    let matchI;
    let strict2;
    if (target._singleMatchCode === searchCode) {
      matchI = target._singleMatchIndex;
      strict2 = target._singleMatchStrict;
    } else if (target._nextBeginningIndexes !== null) {
      let next2 = target._nextBeginningIndexes;
      targetI = simpleMatch[0] === 0 ? 0 : next2[simpleMatch[0] - 1];
      while (targetI < targetLen && searchCode !== targetCodes[targetI]) targetI = next2[targetI];
      strict2 = targetI < targetLen;
      matchI = strict2 ? targetI : simpleMatch[0];
    } else {
      prepareSingleMatch(target, searchCode, simpleMatch[0]);
      matchI = target._singleMatchIndex;
      strict2 = target._singleMatchStrict;
    }
    let resultScore = matchI === 0 ? 0 : -matchI * matchI * 0.2;
    if (!strict2) resultScore *= 1e3;
    else if (target._beginningsLen > 24) resultScore *= (target._beginningsLen - 24) * 10;
    target._score = resultScore - (targetLen - 1);
    target._indexes[0] = matchI;
    target._indexes.len = 1;
    return target;
  }
  searchI = 0;
  let strict = false;
  let strictLen = 0;
  let next = target._nextBeginningIndexes;
  if (beginnings === null && next === null) next = target._nextBeginningIndexes = makeNextBeginnings(target);
  let beginningLen = beginnings === null ? changed ? 0 : target._beginningsLen : end - start;
  if (!beginningLen) {
    beginningLen = 1;
    for (let i = next[0]; i < targetLen; i = next[i]) beginningLen++;
    if (!changed) target._beginningsLen = beginningLen;
  }
  let substringI = searchLen <= 1 ? -1 : target._targetLower.indexOf(search._lower, simpleMatch[0]);
  let isSubstring = substringI !== -1;
  let substringStart = isSubstring && (substringI === 0 || (beginnings ? isBeginning(beginnings, start, end, substringI) : next[substringI - 1] === substringI));
  if (substringStart && substringI === simpleMatch[0]) strict = true;
  else {
    targetI = simpleMatch[0] === 0 ? 0 : beginnings ? nextBeginning(beginnings, start, end, simpleMatch[0] - 1, targetLen) : next[simpleMatch[0] - 1];
    let backtracks = 0;
    if (targetI !== targetLen) for (; ; ) {
      if (targetI >= targetLen) {
        if (searchI <= 0 || ++backtracks > 200) break;
        searchI--;
        let previous = strictMatch[--strictLen];
        targetI = beginnings ? nextBeginning(beginnings, start, end, previous, targetLen) : next[previous];
      } else if (searchCodes[searchI] === targetCodes[targetI]) {
        strictMatch[strictLen++] = targetI;
        if (++searchI === searchLen) {
          strict = true;
          break;
        }
        targetI++;
      } else targetI = beginnings ? nextBeginning(beginnings, start, end, targetI, targetLen) : next[targetI];
    }
  }
  if (isSubstring && !substringStart) {
    if (beginnings) {
      for (let b = start; b < end; b++) {
        let i = beginnings[b];
        if (i <= substringI) continue;
        let s = 0;
        for (; s < searchLen && searchCodes[s] === targetCodes[i + s]; s++) ;
        if (s === searchLen) {
          substringI = i;
          substringStart = true;
          break;
        }
      }
    } else for (let i = 0; i < next.length; i = next[i]) {
      if (i <= substringI) continue;
      let s = 0;
      for (; s < searchLen && searchCodes[s] === targetCodes[i + s]; s++) ;
      if (s === searchLen) {
        substringI = i;
        substringStart = true;
        break;
      }
    }
  }
  let matches;
  if (!strict) {
    if (isSubstring) for (let i = 0; i < searchLen; i++) simpleMatch[i] = substringI + i;
    matches = simpleMatch;
  } else if (substringStart) {
    for (let i = 0; i < searchLen; i++) simpleMatch[i] = substringI + i;
    matches = simpleMatch;
  } else matches = strictMatch;
  let matchEnd = matches[searchLen - 1] + 1;
  let substringEnd = isSubstring && matchEnd - matches[0] === searchLen && (matchEnd === targetLen || (beginnings ? isBeginning(beginnings, start, end, matchEnd) : next[matchEnd - 1] === matchEnd));
  target._score = calculateScore(matches, searchLen, targetLen, strict, beginningLen, isSubstring, substringStart, substringEnd);
  for (let i = 0; i < searchLen; i++) target._indexes[i] = matches[i];
  target._indexes.len = searchLen;
  return target;
}
function mergePartScores(length) {
  for (let i = 0; i < length; i++) {
    let partial = partials[i];
    let best = spaceScores[i];
    if (partial > -1e3 && best > -INF) best = Math.max(best, (best + partial) / 4);
    spaceScores[i] = Math.max(best, partial);
  }
}
function appendIndexes(indexes, additions) {
  let length = indexes.len;
  outer: for (let i = 0; i < additions.length; i++) {
    let index = additions[i];
    for (let j = 0; j < length; j++) if (indexes[j] === index) continue outer;
    indexes[length++] = index;
  }
  indexes.len = length;
}
function mergeScores(results, length) {
  let total = -INF;
  for (let i = 0; i < length; i++) {
    let score2 = results[i]._score;
    if (score2 > -1e3 && total > -INF) total = Math.max(total, (total + score2) / 4);
    if (score2 > total) total = score2;
  }
  return total;
}
function calculateScore(matches, searchLen, targetLen, strict, beginningLen, substring, substringStart, substringEnd) {
  let score2 = 0;
  let groups = 0;
  for (let i = 1; i < searchLen; i++) if (matches[i] - matches[i - 1] !== 1) {
    score2 -= matches[i];
    groups++;
  }
  let unmatchedDistance = matches[searchLen - 1] - matches[0] - (searchLen - 1);
  score2 -= (12 + unmatchedDistance) * groups;
  if (matches[0] !== 0) score2 -= matches[0] * matches[0] * 0.2;
  if (!strict) score2 *= 1e3;
  else if (beginningLen > 24) score2 *= (beginningLen - 24) * 10;
  let lengthPenalty = (targetLen - searchLen) / 2;
  score2 -= lengthPenalty;
  let substringBonus = 1 + searchLen * searchLen;
  if (substring) score2 /= substringBonus;
  if (substringStart) score2 /= substringBonus;
  score2 -= lengthPenalty;
  return substringEnd ? score2 + Math.min(4, -score2 / 2) : score2;
}
function algorithmSpaces(search, target, partial) {
  let seenLen = 0;
  let generation = ++seenGeneration;
  let score2 = 0;
  let result = null;
  let previousFirst = 0;
  let searches = search.parts;
  let changesLen = 0;
  let matched = false;
  for (let i = 0; i < searches.length; i++) {
    partials[i] = -INF;
    if (partial) (partIndexes[i] ||= []).length = 0;
    result = algorithm(searches[i], target, false, false, changesLen !== 0, false);
    if (result === null) {
      if (partial) continue;
      resetBeginnings(target, changesLen);
      return null;
    }
    matched = true;
    if (i < searches.length - 1) {
      let indexes = result._indexes;
      let consecutive = true;
      for (let j = 0; j < indexes.len - 1; j++) if (indexes[j + 1] - indexes[j] !== 1) {
        consecutive = false;
        break;
      }
      if (consecutive) {
        let beginning = indexes[indexes.len - 1] + 1;
        let previous = target._nextBeginningIndexes[beginning - 1];
        for (let j = beginning - 1; j >= 0 && target._nextBeginningIndexes[j] === previous; j--) {
          target._nextBeginningIndexes[j] = beginning;
          changes[changesLen * 2] = j;
          changes[changesLen * 2 + 1] = previous;
          changesLen++;
        }
      }
    }
    if (partial) {
      let indexes = partIndexes[i];
      indexes.length = result._indexes.len;
      for (let j = 0; j < indexes.length; j++) indexes[j] = result._indexes[j];
    }
    let partScore = result._score / searches.length;
    score2 += partScore;
    partials[i] = partScore;
    if (result._indexes[0] < previousFirst) score2 -= (previousFirst - result._indexes[0]) * 2;
    previousFirst = result._indexes[0];
    if (!partial) for (let j = 0; j < result._indexes.len; j++) {
      let index = result._indexes[j];
      if (seenAt[index] === generation) continue;
      seenAt[index] = generation;
      seen[seenLen++] = index;
    }
  }
  if (partial && !matched) return null;
  resetBeginnings(target, changesLen);
  if (target._bitflags & SPACE_BIT) {
    let spacedResult = algorithm(search, target, true);
    if (spacedResult !== null && spacedResult._score > score2) {
      if (partial) {
        let searchFrom = 0;
        for (let i = 0; i < searches.length; i++) {
          partials[i] = spacedResult._score / searches.length;
          let part = searches[i]._lower;
          let searchI = search._lower.indexOf(part, searchFrom);
          let indexes = partIndexes[i];
          indexes.length = part.length;
          for (let j = 0; j < part.length; j++) indexes[j] = spacedResult._indexes[searchI + j];
          searchFrom = searchI + part.length;
        }
        if (spacedResult._score < GOOD_PART_SCORE) spacedResult._indexes.len = 0;
      }
      return spacedResult;
    }
  }
  if (partial) {
    result = target;
    let targetLower = target._targetLower;
    for (let i = 1; i < searches.length; i++) {
      let previous = partIndexes[i - 1];
      if (!previous.length || !partIndexes[i].length) continue;
      let previousEnd = previous[previous.length - 1] + 1;
      let at = previousEnd;
      let code;
      while ((code = targetLower.charCodeAt(at)) === 32 || code >= 9 && code <= 13) at++;
      let part = searches[i]._lower;
      if (!targetLower.startsWith(part, at)) continue;
      for (let j = previousEnd; j < at; j++) previous.push(j);
      let indexes = partIndexes[i];
      indexes.length = part.length;
      for (let j = 0; j < part.length; j++) indexes[j] = at + j;
    }
    result._indexes.len = 0;
    for (let i = 0; i < searches.length; i++) if (partials[i] * searches.length >= GOOD_PART_SCORE) {
      appendIndexes(result._indexes, partIndexes[i]);
    }
  } else {
    for (let i = 0; i < seenLen; i++) result._indexes[i] = seen[i];
    result._indexes.len = seenLen;
  }
  result._score = score2;
  return result;
}
function resetBeginnings(target, changesLen) {
  for (let i = changesLen - 1; i >= 0; i--) {
    target._nextBeginningIndexes[changes[i * 2]] = changes[i * 2 + 1];
  }
}
var SnapshotTargets = class {
  constructor(targets, options) {
    this._mode = options?.keys ? 2 : options?.key ? 1 : 0;
    this._keys = this._mode === 2 ? options.keys.slice() : [options?.key];
    this._input = targets.slice();
    this._index = 0;
    this._done = false;
    this._error = null;
    this._scheduled = null;
    if (targets.length === 0) this._finish();
    else this._schedule();
  }
  _schedule() {
    if (this._scheduled !== null) return;
    this._scheduled = scheduleTask((deadline) => {
      this._scheduled = null;
      this._run(deadline);
    });
  }
  _cancel() {
    if (this._scheduled !== null) this._scheduled();
    this._scheduled = null;
  }
  _initialize() {
    if (this._targets) return;
    let keysLength = this._mode === 2 ? this._keys.length : 1;
    let valueCount = this._input.length * keysLength;
    let rowCount = this._input.length;
    this._targets = new Array(valueCount);
    this._first = new Uint16Array(valueCount * 26);
    this._offsets = new Uint32Array(valueCount + 1);
    this._buildingBeginnings = [];
    this._rowCount = rowCount;
    this._rowWords = rowCount + 31 >> 5;
    this._rowBits = new Uint32Array(this._rowWords * 32);
    this._rows = new Uint32Array(rowCount);
    this._lastRowsLen = 0;
    this._matchedRowsLen = 0;
    this._lastQuery = null;
    this._candidateRows = null;
    this._candidateLength = rowCount;
    this._history = [];
    if (this._mode) {
      this._objects = this._input;
      this._getters = this._keys.map(makeGetter);
    }
    if (this._mode === 2) {
      this._keysLength = keysLength;
      this._bitflags = new Int32Array(rowCount);
    }
  }
  _run(deadline) {
    if (this._done || this._error) return;
    let end = Date.now() + 4;
    let hasTime = () => deadline && !deadline.didTimeout ? deadline.timeRemaining() > 1 : Date.now() < end;
    try {
      this._initialize();
      do
        this._prepareOne();
      while (this._index < this._input.length && hasTime());
      if (this._index === this._input.length) this._complete();
      else this._schedule();
    } catch (error) {
      this._error = error;
      this._done = true;
    }
  }
  _indexRow(row, bitflags) {
    let flags = bitflags >>> 0;
    let word = row >> 5;
    let mask = 1 << (row & 31);
    let words = this._rowWords;
    let bits = this._rowBits;
    while (flags) {
      let lowest = flags & -flags;
      let bit = 31 - Math.clz32(lowest);
      bits[bit * words + word] |= mask;
      flags = (flags & flags - 1) >>> 0;
    }
  }
  _prepareOne() {
    let i = this._index++;
    let mode = this._mode;
    let obj = this._input[i];
    let keysLength = mode === 2 ? this._keysLength : 1;
    let bitflags = 0;
    for (let k = 0; k < keysLength; k++) {
      let value = mode === 0 ? obj : this._getters[k] === null ? obj[this._keys[k]] : this._getters[k](obj);
      let row = mode === 2 ? i * keysLength + k : i;
      let prepared = this._targets[row] = value ? prepTarget(value) : noTarget;
      if (prepared !== noTarget) indexBeginnings(prepared, this._first, row, this._buildingBeginnings);
      this._offsets[row + 1] = this._buildingBeginnings.length;
      bitflags |= prepared._bitflags;
    }
    if (mode === 2) this._bitflags[i] = bitflags;
    this._indexRow(i, bitflags);
  }
  _complete() {
    this._beginnings = Uint16Array.from(this._buildingBeginnings);
    this._buildingBeginnings = this._input = this._getters = this._keys = null;
    this._done = true;
  }
  _bitOffsets(bitflags) {
    let offsetsLen = 0;
    let words = this._rowWords;
    for (let bit = 0; bit < 32; bit++) if (bitflags & 1 << bit) candidateBitOffsets[offsetsLen++] = bit * words;
    return offsetsLen;
  }
  _matchRows(bitflags, fill = false, stop = INF) {
    let offsetsLen = this._bitOffsets(bitflags);
    if (!offsetsLen) {
      if (fill) {
        this._candidateRows = null;
        this._candidateLength = this._rowCount;
      }
      return this._rowCount;
    }
    let bits = this._rowBits;
    let words = this._rowWords;
    let rowsLen = 0;
    for (let word = 0; word < words; word++) {
      let matches = bits[candidateBitOffsets[0] + word];
      for (let i = 1; i < offsetsLen && matches; i++) matches &= bits[candidateBitOffsets[i] + word];
      if (!fill) {
        rowsLen += bitCount(matches);
        if (rowsLen >= stop) return rowsLen;
        continue;
      }
      while (matches) {
        let lowest = matches & -matches;
        this._rows[rowsLen++] = (word << 5) + 31 - Math.clz32(lowest);
        matches = (matches & matches - 1) >>> 0;
      }
    }
    if (fill) {
      this._candidateRows = this._rows;
      this._candidateLength = rowsLen;
    }
    return rowsLen;
  }
  _beginSearch(query) {
    this._matchedRowsLen = 0;
    let previousQuery = this._lastQuery;
    let previousLength = this._lastRowsLen;
    this._lastQuery = null;
    let bitflags = query.bitflags >>> 0;
    if (previousQuery !== null && query._lower.startsWith(previousQuery)) {
      let staticCount = this._matchRows(bitflags, false, previousLength);
      if (previousLength <= staticCount) {
        this._candidateRows = this._rows;
        this._candidateLength = previousLength;
        return;
      }
    }
    this._matchRows(bitflags, true);
  }
  _endSearch(query) {
    this._lastRowsLen = this._matchedRowsLen;
    this._matchedRowsLen = 0;
    this._lastQuery = query._lower || null;
    this._candidateRows = null;
    this._candidateLength = 0;
  }
  _backtrack(query, options) {
    let history = this._history;
    if (history.length < 2 || options?.scoreFn || options?.threshold !== void 0) return null;
    let limit = getLimit(options);
    if (limit === INF) return null;
    let current2 = history[history.length - 1];
    let value = query._lower;
    if (current2.query === value && current2.limit === limit && current2.results) return copyResults(current2.results);
    if (value.length >= current2.query.length || !current2.query.startsWith(value)) return null;
    let i = history.length - 2;
    while (i >= 0 && history[i].query.length > value.length) i--;
    let entry = history[i];
    if (!entry || entry.query !== value || entry.limit !== limit) return null;
    history.length = i + 1;
    if (!entry.results) return null;
    this._resetSearch();
    return copyResults(entry.results);
  }
  _remember(query, results, options) {
    let history = this._history;
    let limit = getLimit(options);
    if (options?.scoreFn || options?.threshold !== void 0 || limit === INF || results.length > 256) {
      history.length = 0;
      return;
    }
    let value = query._lower;
    let last = history[history.length - 1];
    if (last && !value.startsWith(last.query)) history.length = 0;
    else if (last?.query === value && last.limit === limit) history.pop();
    history.push({ query: value, limit, results: value.length <= 32 ? copyResults(results) : null });
  }
  _resetSearch() {
    this._lastQuery = null;
    this._lastRowsLen = this._matchedRowsLen = this._candidateLength = 0;
    this._candidateRows = null;
  }
  _finish() {
    if (this._error) throw this._error;
    if (this._done) return;
    this._cancel();
    try {
      this._initialize();
      while (this._index < this._input.length) this._prepareOne();
      this._complete();
    } catch (error) {
      this._error = error;
      this._done = true;
      throw error;
    }
  }
};
function copyResult(result) {
  if (result === noTarget) return noTarget;
  if (result instanceof KeysResult) {
    let copy2 = result.map(copyResult);
    copy2.obj = result.obj;
    copy2._score = result._score;
    if (result._partWinners) copy2._partWinners = true;
    return copy2;
  }
  let copy = materialize(result, result.obj);
  if (result._bestKeyScore !== void 0) copy._bestKeyScore = result._bestKeyScore;
  let indexes = result._indexes;
  copy._indexes = indexes.slice(0, indexes.len ?? indexes.length);
  copy._indexes.len = copy._indexes.length;
  return copy;
}
function copyResults(results) {
  let copies = results.map(copyResult);
  copies.total = results.total;
  return copies;
}
function prepTarget(target) {
  if (isPrepared(target)) target = target.target;
  else if (typeof target === "number") target = "" + target;
  else if (typeof target !== "string") target = "";
  let info = lowerInfo(target);
  return newResult(target, -INF, null, info._lower, info.lowerCodes, info.bitflags);
}
function prepQuery(search) {
  if (typeof search === "number") search = "" + search;
  else if (typeof search !== "string") search = "";
  search = remapChars(search).trim();
  let info = lowerInfoRemapped(search);
  info.bitflags &= ~SPACE_BIT;
  info.parts = info.hasSpace ? [...new Set(info._lower.split(/\s+/))].map(prepQuery) : [];
  return info;
}
function getPrepared(target) {
  if (target.length > 999) return prepTarget(target);
  let prepared = targetCache.get(target);
  if (prepared === void 0) targetCache.set(target, prepared = prepTarget(target));
  return prepared;
}
function getQuery(search) {
  if (search.length > 999) return prepQuery(search);
  let prepared = searchCache.get(search);
  if (prepared === void 0) {
    if (searchCache.size >= 512) searchCache.clear();
    searchCache.set(search, prepared = prepQuery(search));
  }
  return prepared;
}
function scanBeginnings(prepared, visit) {
  let target = remapChars(prepared.target);
  let wasUpper = false;
  let wasAlnum = false;
  let count = 0;
  for (let i = 0; i < target.length; i++) {
    let code = target.charCodeAt(i);
    let upper = code >= 65 && code <= 90;
    let alnum = upper || code >= 97 && code <= 122 || code >= 48 && code <= 57;
    let beginning = upper && !wasUpper || !wasAlnum || !alnum;
    wasUpper = upper;
    wasAlnum = alnum;
    if (beginning) {
      count++;
      visit(i);
    }
  }
  prepared._beginningsLen = count;
}
function indexBeginnings(prepared, firstTable, row, packed) {
  if (prepared.target.length >= 65535) return;
  let target = remapChars(prepared.target);
  let lowerCodes = prepared._targetLowerCodes;
  let offset = row * 26;
  let wasUpper = false;
  let wasAlnum = false;
  let count = 0;
  for (let i = 0; i < target.length; i++) {
    let code = target.charCodeAt(i);
    let upper = code >= 65 && code <= 90;
    let alnum = upper || code >= 97 && code <= 122 || code >= 48 && code <= 57;
    let beginning = upper && !wasUpper || !wasAlnum || !alnum;
    wasUpper = upper;
    wasAlnum = alnum;
    if (!beginning) continue;
    count++;
    packed.push(i);
    code = lowerCodes[i];
    if (code >= 97 && code <= 122) {
      let slot = offset + code - 97;
      if (firstTable[slot] === 0) firstTable[slot] = i + 1;
    }
  }
  prepared._beginningsLen = count;
}
function prepareSingleMatch(prepared, searchCode, fallbackIndex) {
  let matchI = fallbackIndex;
  let strict = false;
  scanBeginnings(prepared, (i) => {
    if (!strict && searchCode === prepared._targetLowerCodes[i]) {
      matchI = i;
      strict = true;
    }
  });
  prepared._singleMatchCode = searchCode;
  prepared._singleMatchIndex = matchI;
  prepared._singleMatchStrict = strict;
}
function makeBeginnings(prepared) {
  let beginnings = [];
  scanBeginnings(prepared, (i) => beginnings.push(i));
  return beginnings;
}
function makeNextBeginnings(prepared) {
  let next = [];
  let fill = 0;
  scanBeginnings(prepared, (i) => {
    for (; fill < i; fill++) next[fill] = i;
  });
  for (; fill < prepared.target.length; fill++) next[fill] = prepared.target.length;
  return next;
}
function remapCharacter(char) {
  let remapped = remappings[char];
  if (remapped !== void 0) return remapped;
  if (char.charCodeAt(0) < 128) return char;
  remapped = char.normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
  return remapped.length === 1 ? remapped : char;
}
function remapChars(value) {
  if (customAsciiRemappings) return value.replace(/[\s\S]/g, remapCharacter);
  return /[^\x00-\x7F]|[\\"`]/.test(value) ? value.replace(/[^\x00-\x7F]|[\\"`]/g, remapCharacter) : value;
}
function lowerInfo(value) {
  return lowerInfoRemapped(remapChars(value));
}
function lowerInfoRemapped(value) {
  let lower = value.toLowerCase();
  let lowerCodes = [];
  let bitflags = 0;
  let hasSpace = false;
  for (let i = 0; i < lower.length; i++) {
    let code = lowerCodes[i] = lower.charCodeAt(i);
    if (code === 32) {
      hasSpace = true;
      bitflags |= SPACE_BIT;
      continue;
    }
    let bit = code >= 97 && code <= 122 ? code - 97 : code >= 48 && code <= 57 ? 26 : code <= 127 ? 30 : 31;
    bitflags |= 1 << bit;
  }
  return { lowerCodes, bitflags, hasSpace, _lower: lower };
}
var Result = class {
  get ["indexes"]() {
    return this._indexes.slice(0, this._indexes.len).sort((a, b) => a - b);
  }
  set ["indexes"](value) {
    this._indexes = value;
  }
  ["highlight"](open, close, threshold) {
    return highlight(this, open, close, threshold);
  }
  get ["score"]() {
    return normalizeScore(this._score);
  }
};
var KeysResult = class extends Array {
  get ["score"]() {
    return normalizeScore(this._score);
  }
};
function newResult(target, score2 = -INF, obj = null, lower = "", lowerCodes = null, bitflags = 0) {
  let result = new Result();
  result.target = target;
  result.obj = obj;
  result._score = score2;
  result._indexes = [];
  result._targetLower = lower;
  result._targetLowerCodes = lowerCodes;
  result._nextBeginningIndexes = null;
  result._beginnings = null;
  result._beginningsLen = 0;
  result._singleMatchCode = result._singleMatchIndex = -1;
  result._singleMatchStrict = false;
  result._bitflags = bitflags;
  return result;
}
function materialize(prepared, obj = null) {
  let result = new Result();
  result.target = prepared.target;
  result.obj = obj;
  result._score = prepared._score;
  result._indexes = prepared._indexes;
  return result;
}
function markBestKeyScore(result) {
  let best = -INF;
  for (let i = 0; i < result.length; i++) if (result[i] !== noTarget && result[i]._score > best) best = result[i]._score;
  for (let i = 0; i < result.length; i++) if (result[i] !== noTarget) result[i]._bestKeyScore = best;
  return result;
}
function captureKeysResult(matches, keysLength, obj, score2, partWinners = false) {
  let result = new KeysResult(keysLength);
  for (let k = 0; k < keysLength; k++) result[k] = matches[k];
  result.obj = obj;
  result._score = score2;
  if (partWinners) result._partWinners = true;
  return result;
}
var normalizeScore = (value) => value === -INF ? 0 : value > 1 ? value : Math.E ** (((-value + 1) ** 0.04307 - 1) * -2);
var denormalizeScore = (value) => value === 0 ? -INF : value > 1 ? value : 1 - Math.pow(Math.log(value) / -2 + 1, 1 / 0.04307);
var GOOD_PART_SCORE = denormalizeScore(0.5);
var isPrepared = (value) => typeof value === "object" && typeof value?._bitflags === "number";
function makeGetter(key) {
  if (typeof key === "function") return key;
  let path = Array.isArray(key) ? key : typeof key === "string" && key.includes(".") ? key.split(".") : null;
  if (path === null) return null;
  return (obj) => {
    if (path !== key) {
      let direct = obj[key];
      if (direct !== void 0) return direct;
    }
    for (let i = 0; obj && i < path.length; i++) obj = obj[path[i]];
    return obj;
  };
}
function scoreCeiling(searchLen, targetLen) {
  let lengthPenalty = (targetLen - searchLen) / 2;
  let bonus = 1 + searchLen * searchLen;
  let score2 = -lengthPenalty - lengthPenalty / (bonus * bonus);
  return score2 + Math.min(4, -score2 / 2);
}
function bitCount(value) {
  value -= value >>> 1 & 1431655765;
  value = (value & 858993459) + (value >>> 2 & 858993459);
  return (value + (value >>> 4) & 252645135) * 16843009 >>> 24;
}
function lowerBound(values, start, end, value) {
  while (start < end) {
    let middle = start + end >> 1;
    if (values[middle] < value) start = middle + 1;
    else end = middle;
  }
  return start;
}
function nextBeginning(indexes, start, end, index, targetLen) {
  let next = lowerBound(indexes, start, end, index + 1);
  return next < end ? indexes[next] : targetLen;
}
function isBeginning(indexes, start, end, index) {
  let found = lowerBound(indexes, start, end, index);
  return found < end && indexes[found] === index;
}
function getLimit(options) {
  return (options?.limit ?? 10) || INF;
}
function scheduleTask(run) {
  let id;
  if (typeof requestIdleCallback === "function") {
    id = requestIdleCallback(run, { timeout: 100 });
    return () => typeof cancelIdleCallback === "function" && cancelIdleCallback(id);
  }
  if (typeof setImmediate === "function") {
    id = setImmediate(run);
    return () => typeof clearImmediate === "function" && clearImmediate(id);
  }
  id = setTimeout(run);
  return () => clearTimeout(id);
}
function createHeap() {
  let items = [];
  let length = 0;
  function down() {
    let index = 0;
    let item = items[0];
    for (let child = 1; child < length; child = 1 + index * 2) {
      let right = child + 1;
      index = right < length && items[right]._score < items[child]._score ? right : child;
      items[index - 1 >> 1] = items[index];
    }
    for (let parent = index - 1 >> 1; index > 0 && item._score < items[parent]._score; parent = (index = parent) - 1 >> 1) {
      items[index] = items[parent];
    }
    items[index] = item;
  }
  return {
    add(item) {
      let index = length++;
      for (let parent = index - 1 >> 1; index > 0 && item._score < items[parent]._score; parent = (index = parent) - 1 >> 1) {
        items[index] = items[parent];
      }
      items[index] = item;
    },
    poll() {
      if (!length) return;
      let root = items[0];
      let last = items[--length];
      items[length] = void 0;
      if (length) {
        items[0] = last;
        down();
      }
      return root;
    },
    peek() {
      return length ? items[0] : void 0;
    },
    replaceTop(item) {
      items[0] = item;
      down();
    },
    clear() {
      items.length = length = 0;
    }
  };
}
var INF = Infinity;
var SPACE_BIT = 1 << 27;
var noResults = [];
noResults.total = 0;
var targetCache = /* @__PURE__ */ new Map();
var searchCache = /* @__PURE__ */ new Map();
var simpleMatch = [];
var strictMatch = [];
var seen = [];
var seenAt = [];
var changes = [];
var partials = [];
var spaceScores = [];
var partIndexes = [];
var winnerIndexes = [];
var winnerScores = [];
var winnerKeys = [];
var keyTargets = [];
var keyResults = [];
var candidateBitOffsets = [];
var seenGeneration = 0;
var remappings = {};
var remapFrom = '\\"`\u2018\u2019\u201A\u201B\u201C\u201D\u201E\u201F\xAB\xBB\u2039\u203A\u2010\u2013\u2014\u2212\u2044\u2215\u2026\xF8\xD8\u0142\u0141\u0111\u0110\xF0\xD0\u0131\u0127\u0126\u0167\u0166';
var remapTo = "/''''''''''''''----//.oOlLdDdDihHtT";
for (let i = 0; i < remapFrom.length; i++) remappings[remapFrom[i]] = remapTo[i];
var customAsciiRemappings = false;
var heap = createHeap();
var noTarget = prepTarget("");
var prunedMatch = {};
var fuzzysort_default = { single, go, highlight, score, remap, prepare, snapshot, cleanup };

// upstream/packages/util/text-search/src/index.ts.snapshot
var FUZZY_PREFIX = 4;
var FUZZY_SUBSTRING = 3;
var FUZZY_SUBSEQUENCE = 2;
var SUBSTRING = 1;
var WORD_CHAR = /[\p{L}\p{N}]/u;
var UPPER = /\p{Lu}/u;
var LOWER = /\p{Ll}/u;
var UNSPACED = /[\p{scx=Han}\p{scx=Hira}\p{scx=Kana}\p{scx=Hang}]/u;
function codePointAt(text, index) {
  return String.fromCodePoint(text.codePointAt(index));
}
function codePointBefore(text, index) {
  const low = text.charCodeAt(index - 1);
  const start = low >= 56320 && low <= 57343 && index >= 2 ? index - 2 : index - 1;
  return codePointAt(text, start);
}
function wordStart(text, index) {
  if (index === 0) return true;
  const char = codePointAt(text, index);
  const previous = codePointBefore(text, index);
  return !WORD_CHAR.test(previous) || UNSPACED.test(char) || UPPER.test(char) && LOWER.test(previous);
}
var PRINTABLE_ASCII = /^[\x20-\x7e]*$/;
var DIACRITIC = /[\u0300-\u036f]/gu;
var STROKED = {
  "\xF8": "o",
  "\xD8": "O",
  "\u0142": "l",
  "\u0141": "L",
  "\u0111": "d",
  "\u0110": "D",
  "\xF0": "d",
  "\xD0": "D",
  "\u0131": "i",
  "\u0127": "h",
  "\u0126": "H",
  "\u0167": "t",
  "\u0166": "T"
};
var STROKED_CHAR = /[øØłŁđĐðÐıħĦŧŦ]/gu;
function strip(value) {
  if (PRINTABLE_ASCII.test(value)) return value;
  return value.normalize("NFKD").replace(DIACRITIC, "").normalize("NFKC").replace(STROKED_CHAR, (char) => STROKED[char]);
}
function fold(value) {
  return strip(value).toLowerCase();
}
function prepareKeys(keys, reuse, into) {
  const fuzzy = (keys.fuzzy ?? []).flatMap((value) => {
    if (value === void 0 || value === "") return [];
    let name = into.fuzzy.get(value) ?? reuse?.fuzzy.get(value);
    if (name === void 0) {
      const stripped = strip(value);
      name = { stripped, folded: stripped.toLowerCase(), starts: void 0, tails: /* @__PURE__ */ new Map() };
    }
    into.fuzzy.set(value, name);
    return [name];
  });
  const substring = (keys.substring ?? []).flatMap((value) => {
    if (value === void 0 || value === "") return [];
    const folded = into.substring.get(value) ?? reuse?.substring.get(value) ?? fold(value);
    into.substring.set(value, folded);
    return [folded];
  });
  return { fuzzy, substring };
}
function build(items, keys, reuse) {
  const preparations = { fuzzy: /* @__PURE__ */ new Map(), substring: /* @__PURE__ */ new Map() };
  return { keys: items.map((item) => prepareKeys(keys(item), reuse, preparations)), preparations };
}
function inOrder(term, text) {
  let at = 0;
  for (const char of term) {
    at = text.indexOf(char, at);
    if (at === -1) return false;
    at += char.length;
  }
  return true;
}
function fuzzyNameScore(term, name) {
  if (!inOrder(term.folded, name.folded)) return void 0;
  if (name.starts === void 0) {
    const starts = [];
    let index = 0;
    for (const char of name.stripped) {
      if (wordStart(name.stripped, index)) starts.push(index);
      index += char.length;
    }
    name.starts = starts;
  }
  const first = codePointAt(term.stripped, 0).toLowerCase();
  let best;
  for (const start of name.starts) {
    if (codePointAt(name.stripped, start).toLowerCase() !== first) continue;
    let tail = name.tails.get(start);
    if (tail === void 0) {
      tail = fuzzysort_default.prepare(name.stripped.slice(start));
      name.tails.set(start, tail);
    }
    const result = fuzzysort_default.single(term.stripped, tail);
    if (result !== null && wordStart(name.stripped, start + result.indexes[0])) {
      best = best === void 0 ? result.score : Math.max(best, result.score);
    }
  }
  return best;
}
function termScore(term, keys) {
  let best;
  const take = (score2) => {
    best = best === void 0 ? score2 : Math.max(best, score2);
  };
  for (const name of keys.fuzzy) {
    const at = name.folded.indexOf(term.folded);
    if (at === 0) take(FUZZY_PREFIX);
    else if (at > 0) take(FUZZY_SUBSTRING);
    else {
      const score2 = fuzzyNameScore(term, name);
      if (score2 !== void 0) take(FUZZY_SUBSEQUENCE + Math.min(score2, 0.99));
    }
  }
  for (const text of keys.substring) {
    if (text.includes(term.folded)) take(SUBSTRING);
  }
  return best;
}
var TextSearchIndex = class _TextSearchIndex {
  #items;
  #keys;
  #preparations;
  /**
   * Prepare every key of every item.
   * @param items - candidates in their display order, which ties keep.
   * @param keys - the search text of one item, called once per item here.
   */
  constructor(items, keys) {
    const built = build(items, keys, void 0);
    this.#items = items;
    this.#keys = built.keys;
    this.#preparations = built.preparations;
  }
  /**
   * Build the index of a changed list. Items added, removed, reordered, or
   * changed are all expressed by the complete new list; a key string that this
   * index already prepared is reused instead of prepared again, and strings no
   * item uses any more are not carried over. This index stays valid.
   * @param items - the complete new list in display order.
   * @param keys - the search text of one item, called once per item here.
   * @returns a new index over `items`.
   */
  update(items, keys) {
    const next = new _TextSearchIndex([], keys);
    const built = build(items, keys, this.#preparations);
    next.#items = items;
    next.#keys = built.keys;
    next.#preparations = built.preparations;
    return next;
  }
  /**
   * Filter and rank the indexed items by a query.
   * @param query - the user's search text.
   * @returns the build list itself when the query is blank or holds only
   * combining marks; otherwise the items matching every query term, best total
   * score first and build order on ties.
   */
  search(query) {
    const terms = query.trim().split(/\s+/u).map((term) => ({ stripped: strip(term), folded: fold(term) })).filter((term) => term.folded !== "");
    if (terms.length === 0) return this.#items;
    const ranked = [];
    this.#keys.forEach((itemKeys, index) => {
      let score2 = 0;
      for (const term of terms) {
        const hit = termScore(term, itemKeys);
        if (hit === void 0) return;
        score2 += hit;
      }
      ranked.push({ index, score: score2 });
    });
    ranked.sort((left, right) => right.score - left.score || left.index - right.index);
    return ranked.map((entry) => this.#items[entry.index]);
  }
};

// upstream/packages/client/ui-shortcuts/src/client/Editor.tsx.snapshot
import { useEffect as useEffect6, useId as useId6, useLayoutEffect as useLayoutEffect6, useRef as useRef9, useState as useState5 } from "react";
import clsx8 from "clsx";

// upstream/packages/client/ui-shortcuts/src/client/feedback.ts.snapshot
function shortcutReadFailure(config, runtime, t) {
  const location2 = t(runtime === "desktop" ? "desktop-document" : "web-document");
  const reload = t(runtime === "desktop" ? "desktop-reload" : "web-reload");
  return `${t(config.error ?? "read", { location: location2, reload })} ${t(config.usingDefaults ? "using-defaults" : "using-accepted")}`;
}
function shortcutFailure(result, catalog, t, runtime) {
  if (result.status === "unreadable") return shortcutReadFailure(result.snapshot, runtime, t);
  return result.issue ? t(result.issue) : result.status === "conflict" ? t("conflict", { commands: result.conflicts?.map((id) => catalog.find((row) => row.id === id)?.label ?? id).join(", ") ?? "" }) : t(result.status);
}

// upstream/packages/client/ui-shortcuts/src/client/Reference.module.css.snapshot
var Reference_module_css_default = {
  setting: "Reference_module_css_setting",
  row: "Reference_module_css_row",
  binding: "Reference_module_css_binding",
  settingText: "Reference_module_css_settingText",
  settingTitle: "Reference_module_css_settingTitle",
  settingDescription: "Reference_module_css_settingDescription",
  button: "Reference_module_css_button",
  dialog: "Reference_module_css_dialog",
  contents: "Reference_module_css_contents",
  header: "Reference_module_css_header",
  title: "Reference_module_css_title",
  close: "Reference_module_css_close",
  searchRow: "Reference_module_css_searchRow",
  searchField: "Reference_module_css_searchField",
  searchIcon: "Reference_module_css_searchIcon",
  search: "Reference_module_css_search",
  list: "Reference_module_css_list",
  footer: "Reference_module_css_footer",
  resetAll: "Reference_module_css_resetAll",
  modifiedCount: "Reference_module_css_modifiedCount",
  group: "Reference_module_css_group",
  rows: "Reference_module_css_rows",
  inlineEditor: "Reference_module_css_inlineEditor",
  commandLabel: "Reference_module_css_commandLabel",
  hint: "Reference_module_css_hint",
  rowActions: "Reference_module_css_rowActions",
  inlineAction: "Reference_module_css_inlineAction",
  rowButton: "Reference_module_css_rowButton",
  keyBadge: "Reference_module_css_keyBadge",
  fixedKeyBadge: "Reference_module_css_fixedKeyBadge",
  unbound: "Reference_module_css_unbound",
  inlineControls: "Reference_module_css_inlineControls",
  recorder: "Reference_module_css_recorder",
  invalid: "Reference_module_css_invalid",
  recorded: "Reference_module_css_recorded",
  review: "Reference_module_css_review",
  toastSuccess: "Reference_module_css_toastSuccess",
  toastError: "Reference_module_css_toastError",
  srOnly: "Reference_module_css_srOnly",
  clearSearch: "Reference_module_css_clearSearch"
};

// upstream/packages/client/ui-shortcuts/src/client/Editor.tsx.snapshot
import { jsx as jsx11, jsxs as jsxs9 } from "react/jsx-runtime";
function ShortcutEditor({
  target,
  onClose,
  onSaved,
  onError,
  useCatalog,
  useConfig,
  useFixedCatalog,
  edit,
  recording,
  describeBinding,
  runtime,
  platform,
  t
}) {
  const config = useConfig((value) => value);
  const catalog = useCatalog((value) => value);
  const fixed = useFixedCatalog((value) => value);
  const [revision, setRevision] = useState5(config.revision);
  const [candidate, setCandidate] = useState5(null);
  const [captured, setCaptured] = useState5(false);
  const [busy, setBusy] = useState5(false);
  const [nativeReady, setNativeReady] = useState5(runtime === "web");
  const [message, setMessage] = useState5("");
  const [retry, setRetry] = useState5(null);
  const descriptionId = useId6();
  const recorder = useRef9(null);
  const mounted = useRef9(true);
  const writing = useRef9(false);
  const restart = useRef9(() => {
  });
  const desktopChords = runtime === "desktop" && (platform === "macos" || platform === "windows");
  const targetId = target.id;
  const stale = revision !== config.revision;
  const report = (text) => {
    setMessage(text);
    onError(text);
  };
  const save = async (operation, reviewedRevision = revision) => {
    if (writing.current) return;
    writing.current = true;
    setBusy(true);
    const result = await edit(operation, reviewedRevision);
    if (!mounted.current) return;
    writing.current = false;
    setBusy(false);
    if (result.status === "saved") onSaved();
    else {
      setRetry(operation.type === "set" ? operation.binding : null);
      report(shortcutFailure(result, [...catalog, ...fixed], t, runtime));
    }
  };
  const capture = (binding, id) => {
    setCandidate(binding);
    setCaptured(true);
    setRetry(null);
    const described = describeBinding(binding);
    const conflicts = described.conflicts.filter((value) => value !== id).map((value) => [...catalog, ...fixed].find((row) => row.id === value)?.label ?? value);
    if (described.issue !== null) {
      report(t(described.issue));
      return;
    }
    if (conflicts.length > 0) {
      report(t("conflict", { commands: conflicts.join(", ") }));
      return;
    }
    if (stale) {
      setRetry(binding);
      report(t("stale"));
      return;
    }
    if (config.status !== "ready") {
      report(config.status === "loading" ? t("not-ready") : shortcutReadFailure(config, runtime, t));
      return;
    }
    void save({ type: "set", id, binding });
  };
  const handlers = useRef9({ capture, report, onClose });
  useLayoutEffect6(() => {
    handlers.current = { capture, report, onClose };
  });
  useEffect6(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect6(() => {
    let disposed = false;
    void recording(true).then(() => {
      if (!disposed) setNativeReady(true);
    }, () => {
      if (!disposed) handlers.current.report(t("native-failed"));
    });
    const composition = observeComposition(document);
    let pending = null;
    let dead = false;
    let blocked = false;
    const held = /* @__PURE__ */ new Set();
    const reset = () => {
      pending = null;
      held.clear();
      blocked = false;
      dead = false;
    };
    restart.current = reset;
    const down = (event) => {
      if (composition.guards(event) || event.getModifierState("AltGraph")) {
        if (desktopChords) reset();
        return;
      }
      if ((!desktopChords || document.activeElement !== recorder.current) && event.key === "Escape" && !event.ctrlKey && !event.altKey && !event.metaKey && !event.shiftKey) {
        event.preventDefault();
        event.stopPropagation();
        if (!event.repeat && !writing.current) handlers.current.onClose();
        return;
      }
      const commandDeadKey = runtime === "web" && platform === "macos" && document.activeElement === recorder.current && event.code === "KeyN" && event.metaKey && event.altKey && !event.ctrlKey && !event.shiftKey;
      if (event.key === "Dead" && !commandDeadKey) {
        if (desktopChords) reset();
        dead = true;
        return;
      }
      if (dead) {
        dead = false;
        return;
      }
      const modifiers = ["control", "alt", "shift", "meta"].filter((value) => ({
        control: event.ctrlKey,
        alt: event.altKey,
        shift: event.shiftKey,
        meta: event.metaKey
      })[value]);
      const recordTab = desktopChords || (platform === "macos" || platform === "windows") && modifiers.length >= 3;
      if (document.activeElement !== recorder.current || event.key === "Tab" && !recordTab) return;
      event.preventDefault();
      event.stopPropagation();
      if (writing.current || event.repeat) return;
      if (/^(Control|Alt|Shift|Meta)(Left|Right)$/u.test(event.code)) {
        if (desktopChords && pending !== null) {
          reset();
          setCandidate(null);
          setCaptured(false);
        }
        return;
      }
      if (desktopChords) {
        held.add(event.code);
        if (blocked) return;
        if (held.size > 2) {
          blocked = true;
          pending = null;
          handlers.current.report(t("too-many-keys"));
          return;
        }
      }
      try {
        const codes = [event.code, ...desktopChords ? [...held].filter((value) => value !== event.code) : []];
        pending = describeBinding({ code: codes[0], ...codes[1] === void 0 ? {} : { secondCode: codes[1] }, modifiers }).binding;
        setCandidate(pending);
        setCaptured(desktopChords);
        setMessage("");
        setRetry(null);
      } catch (_error) {
        blocked = desktopChords;
        pending = null;
        handlers.current.report(t("unsupported-key"));
      }
    };
    const up = (event) => {
      held.delete(event.code);
      if (desktopChords && document.activeElement === recorder.current) {
        event.preventDefault();
        event.stopPropagation();
      }
      const binding = pending !== null && (pending.code === event.code || pending.secondCode === event.code || pending.modifiers.some((modifier) => modifier === event.code.replace(/(Left|Right)$/u, "").toLowerCase())) ? pending : null;
      if (binding !== null) {
        pending = null;
        blocked = desktopChords;
      }
      if (desktopChords && (held.size === 0 || platform === "macos" && /^Meta(Left|Right)$/u.test(event.code))) {
        held.clear();
        blocked = false;
      }
      if (binding === null) return;
      handlers.current.capture(binding, targetId);
    };
    const blur = () => {
      reset();
      if (desktopChords) {
        setCandidate(null);
        setCaptured(false);
      }
    };
    const focus = () => {
      if (document.activeElement !== recorder.current) blur();
    };
    document.addEventListener("keydown", down, true);
    document.addEventListener("keyup", up, true);
    window.addEventListener("blur", blur);
    if (desktopChords) {
      document.addEventListener("focusin", focus, true);
      document.addEventListener("compositionstart", blur, true);
    }
    return () => {
      disposed = true;
      composition.dispose();
      document.removeEventListener("keydown", down, true);
      document.removeEventListener("keyup", up, true);
      window.removeEventListener("blur", blur);
      document.removeEventListener("focusin", focus, true);
      document.removeEventListener("compositionstart", blur, true);
      void recording(false).catch(() => {
      });
    };
  }, [describeBinding, recording, t, targetId, runtime, platform, desktopChords]);
  useEffect6(() => {
    const element = recorder.current;
    if (nativeReady && element !== null) focusWithoutRing(element);
  }, [nativeReady]);
  const readonly = busy || stale || config.status !== "ready";
  const review = stale && /* @__PURE__ */ jsxs9("div", { className: Reference_module_css_default.review, children: [
    /* @__PURE__ */ jsx11("span", { children: t("stale") }),
    /* @__PURE__ */ jsx11(
      "button",
      {
        type: "button",
        className: Reference_module_css_default.inlineAction,
        disabled: busy,
        onClick: () => {
          setRevision(config.revision);
          setMessage("");
        },
        children: t("review")
      }
    )
  ] });
  return /* @__PURE__ */ jsxs9("div", { className: Reference_module_css_default.inlineEditor, role: "group", "aria-label": target.label, "data-shortcut-modal": "shortcut-edit", "aria-busy": busy, children: [
    /* @__PURE__ */ jsxs9("div", { className: Reference_module_css_default.inlineControls, children: [
      /* @__PURE__ */ jsx11("button", { type: "button", className: Reference_module_css_default.inlineAction, disabled: readonly, onClick: () => {
        void save({ type: "reset", id: target.id });
      }, children: t("reset") }),
      target.binding !== null && /* @__PURE__ */ jsx11(
        "button",
        {
          type: "button",
          className: Reference_module_css_default.inlineAction,
          disabled: readonly,
          onClick: () => {
            void save({ type: "set", id: target.id, binding: null });
          },
          children: t("clear")
        }
      ),
      /* @__PURE__ */ jsx11(
        "button",
        {
          ref: recorder,
          type: "button",
          className: clsx8(Reference_module_css_default.recorder, message && Reference_module_css_default.invalid),
          disabled: !nativeReady,
          "aria-disabled": busy || !nativeReady,
          onBlur: () => {
            restart.current();
          },
          "aria-label": t("record"),
          "aria-invalid": message !== "",
          "aria-describedby": descriptionId,
          onClick: () => {
            if (!writing.current) {
              restart.current();
              setCaptured(false);
              setMessage("");
              setRetry(null);
            }
          },
          children: captured && message === "" ? /* @__PURE__ */ jsx11(ShortcutKeys, { keys: describeBinding(candidate).keys, className: Reference_module_css_default.recorded }) : t("record")
        }
      )
    ] }),
    /* @__PURE__ */ jsx11("span", { id: descriptionId, className: Reference_module_css_default.srOnly, children: message || (desktopChords ? "" : t(runtime === "web" ? platform === "windows" ? "windows-web-help" : platform === "macos" ? "macos-web-help" : "web-help" : "record-help")) }),
    review,
    retry !== null && !stale && /* @__PURE__ */ jsx11(
      "button",
      {
        type: "button",
        className: Reference_module_css_default.inlineAction,
        disabled: readonly,
        onClick: () => {
          capture(retry, target.id);
        },
        children: t("retry-save")
      }
    )
  ] });
}

// upstream/packages/client/ui-shortcuts/src/client/Icons.tsx.snapshot
import { Fragment as Fragment5, jsx as jsx12, jsxs as jsxs10 } from "react/jsx-runtime";
var artwork = {
  edit: /* @__PURE__ */ jsx12(Fragment5, { children: /* @__PURE__ */ jsx12("path", { d: "M7.4553 1.01221C8.02829 0.676881 8.73746 0.676959 9.31048 1.01221C9.52928 1.14026 9.72631 1.34353 9.98255 1.59978C10.2388 1.85601 10.4421 2.05305 10.5701 2.27185C10.9053 2.84485 10.9054 3.55407 10.5701 4.12703C10.4421 4.34576 10.2387 4.54293 9.98255 4.7991L4.99422 9.78744C4.71024 10.0714 4.50494 10.2832 4.2488 10.4324C3.99266 10.5815 3.70709 10.6557 3.32001 10.7625L2.43268 11.0072C2.08118 11.1042 1.75876 11.1948 1.50071 11.2265C1.2387 11.2585 0.884455 11.2512 0.607798 10.9745C0.331166 10.6979 0.323805 10.3436 0.35587 10.0816C0.387501 9.82358 0.47815 9.50112 0.575111 9.14964L0.819864 8.26232C0.926638 7.87525 1.00083 7.58966 1.14992 7.33353C1.2991 7.07739 1.5109 6.87209 1.79489 6.58811L6.78322 1.59978C7.03941 1.34359 7.23656 1.14027 7.4553 1.01221ZM11.6568 11.13H5.6639L6.72503 10.0689H11.6568V11.13ZM2.54509 7.33831C2.22348 7.65993 2.13155 7.75784 2.06755 7.86768C2.0036 7.97757 1.96369 8.10606 1.84272 8.54454L1.59797 9.43187C1.5011 9.78304 1.44118 10.0065 1.4162 10.1653C1.57504 10.1404 1.79876 10.0814 2.15046 9.98436L3.03779 9.7396C3.47631 9.61863 3.60475 9.57874 3.71464 9.51478C3.82448 9.45077 3.92239 9.35885 4.24401 9.03723L8.04047 5.23998L6.34155 3.54106L2.54509 7.33831ZM8.77473 1.92824C8.53277 1.78664 8.233 1.78664 7.99104 1.92824C7.91987 1.97 7.83628 2.04713 7.53343 2.34998L7.09176 2.79085L8.79068 4.48977L9.23235 4.0489C9.53517 3.74608 9.61232 3.66245 9.65409 3.59128C9.79567 3.34935 9.79564 3.04954 9.65409 2.8076C9.61237 2.73635 9.53565 2.65329 9.23235 2.34998C8.92899 2.04662 8.84598 1.96995 8.77473 1.92824Z" }) }),
  error: /* @__PURE__ */ jsxs10(Fragment5, { children: [
    /* @__PURE__ */ jsx12("path", { d: "M8.90039 3.97328V9.07973H7.09961V3.97328H8.90039Z" }),
    /* @__PURE__ */ jsx12("path", { d: "M8.90039 10.341V12.3654H7.09961V10.341H8.90039Z" }),
    /* @__PURE__ */ jsx12("path", { d: "M14.5996 8C14.5996 4.35492 11.6451 1.40039 8 1.40039C4.35492 1.40039 1.40039 4.35492 1.40039 8C1.40039 11.6451 4.35492 14.5996 8 14.5996C11.6451 14.5996 14.5996 11.6451 14.5996 8ZM15.9004 8C15.9004 12.363 12.363 15.9004 8 15.9004C3.63695 15.9004 0.0996094 12.363 0.0996094 8C0.0996094 3.63695 3.63695 0.0996094 8 0.0996094C12.363 0.0996094 15.9004 3.63695 15.9004 8Z" })
  ] }),
  success: /* @__PURE__ */ jsxs10(Fragment5, { children: [
    /* @__PURE__ */ jsx12("path", { d: "M12.5303 6.53027L8.80273 10.2578C8.54967 10.5109 8.31796 10.7439 8.10645 10.9141C7.88375 11.0932 7.616 11.2602 7.27344 11.3145C7.09229 11.3431 6.90771 11.3431 6.72656 11.3145C6.384 11.2602 6.11625 11.0932 5.89355 10.9141C5.68204 10.7439 5.45033 10.5109 5.19727 10.2578L3.46973 8.53027L4.53027 7.46973L6.25781 9.19727C6.53457 9.47402 6.70036 9.63859 6.83398 9.74609C6.95637 9.84453 6.98241 9.83644 6.96094 9.83301C6.98679 9.83709 7.01321 9.83709 7.03906 9.83301C7.01759 9.83644 7.04363 9.84453 7.16602 9.74609C7.29964 9.63859 7.46543 9.47402 7.74219 9.19727L11.4697 5.46973L12.5303 6.53027Z" }),
    /* @__PURE__ */ jsx12("path", { d: "M14.5996 8C14.5996 4.35492 11.6451 1.40039 8 1.40039C4.35492 1.40039 1.40039 4.35492 1.40039 8C1.40039 11.6451 4.35492 14.5996 8 14.5996C11.6451 14.5996 14.5996 11.6451 14.5996 8ZM15.9004 8C15.9004 12.363 12.363 15.9004 8 15.9004C3.63695 15.9004 0.0996094 12.363 0.0996094 8C0.0996094 3.63695 3.63695 0.0996094 8 0.0996094C12.363 0.0996094 15.9004 3.63695 15.9004 8Z" })
  ] })
};
function ShortcutIcon({ kind, className }) {
  const size = kind === "edit" ? 12 : 16;
  return /* @__PURE__ */ jsx12("svg", { width: size, height: size, viewBox: `0 0 ${size} ${size}`, fill: "currentColor", className, "aria-hidden": "true", children: artwork[kind] });
}

// upstream/packages/client/ui-shortcuts/src/client/Reference.tsx.snapshot
import { Fragment as Fragment6, jsx as jsx13, jsxs as jsxs11 } from "react/jsx-runtime";
var coreActionOrder = new Map([
  "shortcuts.open",
  "session.new",
  "sidebar.left.toggle",
  "session.search",
  "workspace.add",
  "session.rename",
  "session.fork",
  "session.archive",
  "settings.open",
  "fontSize.increase",
  "fontSize.decrease",
  "workspace.openLocal",
  "sidebar.right.toggle",
  "workspace.files",
  "browser.new",
  "terminal.new",
  "pane.split",
  "pane.fullscreen.toggle",
  "page.refresh",
  "page.close"
].map((id, index) => [id, index]));
function ShortcutsRow({ actions, t, useCatalog }) {
  const shortcut = useCatalog((rows) => rows.find((row) => row.id === "shortcuts.open"));
  return /* @__PURE__ */ jsxs11("div", { className: Reference_module_css_default.setting, children: [
    /* @__PURE__ */ jsxs11("div", { className: Reference_module_css_default.settingText, children: [
      /* @__PURE__ */ jsx13("div", { className: Reference_module_css_default.settingTitle, children: t("settings") }),
      /* @__PURE__ */ jsx13("p", { className: Reference_module_css_default.settingDescription, children: t("description") })
    ] }),
    /* @__PURE__ */ jsx13(Tooltip, { disabled: !shortcut?.keys.length, label: t("global-hint"), shortcutKeys: shortcut?.keys, children: /* @__PURE__ */ jsx13(
      "button",
      {
        className: Reference_module_css_default.button,
        type: "button",
        "aria-label": t("view"),
        "aria-keyshortcuts": shortcut?.aria,
        onClick: () => {
          actions.open();
        },
        children: t("view")
      }
    ) })
  ] });
}
function ShortcutReference({
  useStore,
  actions,
  useCatalog,
  useConfig,
  useFixedCatalog,
  platform,
  runtime,
  edit,
  recording,
  describeBinding,
  t
}) {
  const { open, query, focusRequest } = useStore((state) => state);
  const catalog = useCatalog((value) => value);
  const config = useConfig((value) => value);
  const fixedCatalog = useFixedCatalog((value) => value);
  const [target, setTarget] = useState6(null);
  const [resetRevision, setResetRevision] = useState6(null);
  const [busy, setBusy] = useState6(false);
  const [toast, setToast] = useState6(null);
  const mounted = useRef10(true);
  const search = useRef10(null);
  useEffect7(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const dismissToast = useCallback3(() => {
    setToast(null);
  }, []);
  const notify = useCallback3((text, error = false) => {
    setToast((previous) => {
      if (error && previous?.error && previous.text === text) return previous;
      return { text, error, seq: (previous?.seq ?? 0) + 1 };
    });
  }, []);
  useEffect7(() => {
    if (open && config.status === "unreadable") notify(shortcutReadFailure(config, runtime, t), true);
  }, [open, config, runtime, notify, t]);
  const closeEditor = () => {
    setTarget(null);
    const dialog = search.current?.closest('[role="dialog"]');
    if (dialog != null) focusWithoutRing(dialog, { preventScroll: true });
  };
  const closeReference = () => {
    if (busy) return;
    if (resetRevision !== null) setResetRevision(null);
    else if (target !== null) closeEditor();
    else actions.close();
  };
  useEffect7(() => {
    if (!open) setResetRevision(null);
  }, [open]);
  const persist = async (...args) => {
    setBusy(true);
    const result = await edit(...args);
    if (mounted.current) setBusy(false);
    return result;
  };
  const resetAll = async () => {
    if (resetRevision === null) return;
    const result = await persist({ type: "reset-all" }, resetRevision);
    if (!mounted.current) return;
    if (result.status === "saved" || result.status === "stale") setResetRevision(null);
    notify(result.status === "saved" ? t("reset-saved") : result.status === "write-failed" ? t("reset-failed") : shortcutFailure(result, catalog, t, runtime), result.status !== "saved");
  };
  const editorProps = {
    useCatalog,
    useConfig,
    useFixedCatalog,
    platform,
    runtime,
    edit: persist,
    recording,
    describeBinding,
    t,
    onClose: closeEditor,
    onSaved: () => {
      notify(t("saved"));
      closeEditor();
    },
    onError: (message) => {
      notify(message, true);
    }
  };
  useLayoutEffect7(() => {
    const input = search.current;
    if (open && input !== null && !isBehindModal(input)) focusWithoutRing(input);
  }, [open, focusRequest]);
  const entryIndex = useMemo2(() => new TextSearchIndex([
    ...catalog.map((row) => ({
      ...row,
      names: [...row.aliases, row.keys.filter((key) => key !== "+").join("+"), row.keys.filter((key) => key !== "+").join(""), row.aria ?? "", row.aria?.replace("Meta", "Cmd") ?? ""],
      group: "application"
    })),
    ...fixedCatalog.map((row) => ({ ...row, names: [row.id, row.keys.join(" ")] }))
  ].sort((left, right) => Number(left.id === "response.stop") - Number(right.id === "response.stop") || (coreActionOrder.get(left.id) ?? coreActionOrder.size) - (coreActionOrder.get(right.id) ?? coreActionOrder.size) || Number(left.id > right.id) - Number(left.id < right.id)), (row) => ({ fuzzy: [row.label, ...row.names] })), [catalog, fixedCatalog]);
  const matches = entryIndex.search(query);
  const modifiedCount = Object.keys(config.document.profiles[`${runtime}:${platform}`] ?? {}).length;
  useLayoutEffect7(() => {
    const input = search.current;
    if (open && resetRevision === null && modifiedCount === 0 && document.activeElement === document.body && input !== null) {
      focusWithoutRing(input);
    }
  }, [open, resetRevision, modifiedCount]);
  return /* @__PURE__ */ jsxs11(Fragment6, { children: [
    /* @__PURE__ */ jsx13(
      Modal,
      {
        open,
        onClose: closeReference,
        title: t("title"),
        headless: true,
        shortcutModal: "shortcuts",
        className: Reference_module_css_default.dialog,
        children: /* @__PURE__ */ jsxs11("div", { className: Reference_module_css_default.contents, onPointerDownCapture: (event) => {
          if (target === null || busy || !(event.target instanceof Element) || event.target.closest('button, input, a, [contenteditable="true"], [role="group"]') !== null) return;
          event.preventDefault();
          closeEditor();
        }, children: [
          /* @__PURE__ */ jsxs11("header", { className: Reference_module_css_default.header, children: [
            /* @__PURE__ */ jsx13("h2", { className: Reference_module_css_default.title, children: t("title") }),
            /* @__PURE__ */ jsx13("button", { type: "button", className: Reference_module_css_default.close, "aria-label": t("close"), disabled: busy, onClick: closeReference, children: /* @__PURE__ */ jsx13(IconCloseOutlineRegular, { size: 14 }) })
          ] }),
          /* @__PURE__ */ jsx13("div", { className: Reference_module_css_default.searchRow, children: /* @__PURE__ */ jsxs11("div", { className: Reference_module_css_default.searchField, role: "search", "aria-label": t("search"), children: [
            /* @__PURE__ */ jsxs11("svg", { className: Reference_module_css_default.searchIcon, width: "14", height: "14", viewBox: "0 0 14 14", fill: "none", "aria-hidden": "true", children: [
              /* @__PURE__ */ jsx13("path", { d: "M10.28 5.86536C10.28 3.41381 8.29245 1.42644 5.84094 1.42627C3.38929 1.42627 1.40186 3.4137 1.40186 5.86536C1.40203 8.31686 3.38939 10.3044 5.84094 10.3044C8.29234 10.3043 10.2799 8.31676 10.28 5.86536ZM11.4174 5.86536C11.4172 8.94498 8.92057 11.4416 5.84094 11.4418C2.76117 11.4418 0.263843 8.94509 0.263672 5.86536C0.263672 2.78548 2.76106 0.288086 5.84094 0.288086C8.92067 0.288258 11.4174 2.78559 11.4174 5.86536Z", fill: "currentColor" }),
              /* @__PURE__ */ jsx13("path", { d: "M13.7372 12.9078L12.9323 13.7127L9.9732 10.7536L10.7781 9.94867L13.7372 12.9078Z", fill: "currentColor" })
            ] }),
            /* @__PURE__ */ jsx13(
              "input",
              {
                ref: search,
                "data-modal-autofocus": true,
                className: Reference_module_css_default.search,
                type: "search",
                "aria-label": t("search"),
                placeholder: t("search"),
                value: query,
                onChange: (event) => {
                  actions.search(event.target.value);
                }
              }
            ),
            query !== "" && /* @__PURE__ */ jsx13(
              "button",
              {
                type: "button",
                className: Reference_module_css_default.clearSearch,
                "aria-label": t("clear-search"),
                onClick: () => {
                  actions.search("");
                  search.current?.focus();
                },
                children: /* @__PURE__ */ jsx13(IconCloseOutlineRegular, { size: 10 })
              }
            )
          ] }) }),
          /* @__PURE__ */ jsxs11("div", { className: Reference_module_css_default.list, "aria-busy": config.status === "loading", children: [
            ["application", "input", "menus", "approval"].map((group) => {
              const rows = matches.filter((row) => row.group === group);
              if (rows.length === 0) return null;
              return /* @__PURE__ */ jsxs11("section", { "aria-label": t(group), children: [
                group !== "application" && /* @__PURE__ */ jsx13("h3", { className: Reference_module_css_default.group, children: t(group) }),
                /* @__PURE__ */ jsx13("ul", { className: Reference_module_css_default.rows, children: rows.map((row) => /* @__PURE__ */ jsxs11("li", { className: Reference_module_css_default.row, children: [
                  "modified" in row && target?.id !== row.id && /* @__PURE__ */ jsx13(
                    "button",
                    {
                      type: "button",
                      className: Reference_module_css_default.rowButton,
                      "aria-label": t("edit-label", { command: row.label }),
                      disabled: busy || config.status !== "ready",
                      onClick: () => {
                        setTarget(row);
                      }
                    }
                  ),
                  /* @__PURE__ */ jsx13("span", { className: Reference_module_css_default.commandLabel, children: row.label }),
                  /* @__PURE__ */ jsx13("span", { className: Reference_module_css_default.binding, children: "modified" in row ? target?.id === row.id ? /* @__PURE__ */ jsx13(ShortcutEditor, { target: row, ...editorProps }, row.id) : /* @__PURE__ */ jsxs11(Fragment6, { children: [
                    /* @__PURE__ */ jsx13("span", { className: Reference_module_css_default.rowActions, children: /* @__PURE__ */ jsx13(ShortcutIcon, { kind: "edit" }) }),
                    row.keys.length === 0 ? /* @__PURE__ */ jsx13("span", { className: Reference_module_css_default.unbound, children: t("unbound") }) : /* @__PURE__ */ jsx13(ShortcutKeys, { keys: row.keys, className: Reference_module_css_default.keyBadge })
                  ] }) : /* @__PURE__ */ jsx13(ShortcutKeys, { keys: row.keys, className: Reference_module_css_default.fixedKeyBadge }) })
                ] }, row.id)) })
              ] }, group);
            }),
            matches.length === 0 && /* @__PURE__ */ jsx13("p", { className: Reference_module_css_default.hint, role: "status", children: t("empty") })
          ] }),
          /* @__PURE__ */ jsxs11("footer", { className: Reference_module_css_default.footer, children: [
            /* @__PURE__ */ jsxs11(
              "button",
              {
                type: "button",
                className: Reference_module_css_default.resetAll,
                disabled: busy || config.status !== "ready" || modifiedCount === 0,
                onClick: (event) => {
                  event.currentTarget.focus();
                  setTarget(null);
                  setResetRevision(config.revision);
                },
                children: [
                  /* @__PURE__ */ jsx13(IconRefreshOutlineRegular, { size: 12 }),
                  t("reset-all")
                ]
              }
            ),
            modifiedCount > 0 && /* @__PURE__ */ jsx13("span", { className: Reference_module_css_default.modifiedCount, children: t("modified-count", { count: modifiedCount }) })
          ] })
        ] })
      }
    ),
    /* @__PURE__ */ jsx13(
      Modal,
      {
        open: open && resetRevision !== null,
        title: t("reset-title"),
        description: t("reset-description"),
        closeLabel: t("close-confirmation"),
        onClose: () => {
          if (!busy) setResetRevision(null);
        },
        footer: /* @__PURE__ */ jsxs11(Fragment6, { children: [
          /* @__PURE__ */ jsx13(Button, { "data-modal-autofocus": true, disabled: busy, onClick: () => {
            setResetRevision(null);
          }, children: t("cancel") }),
          /* @__PURE__ */ jsx13(Button, { variant: "primary", disabled: busy || config.status !== "ready", onClick: () => {
            void resetAll();
          }, children: t("reset") })
        ] })
      }
    ),
    toast !== null && /* @__PURE__ */ jsx13(
      Toast,
      {
        text: toast.text,
        onDone: dismissToast,
        icon: /* @__PURE__ */ jsx13(ShortcutIcon, { kind: toast.error ? "error" : "success", className: toast.error ? Reference_module_css_default.toastError : Reference_module_css_default.toastSuccess })
      },
      toast.seq
    )
  ] });
}

// upstream/packages/client/ui-shortcuts/src/client/locales.ts.snapshot
var zh = {
  "edit-label": "\u4FEE\u6539{command}\u5FEB\u6377\u952E",
  record: "\u6309\u4E0B\u5FEB\u6377\u952E",
  "record-help": "\u677E\u5F00\u7EC4\u5408\u952E\u5373\u4FDD\u5B58\u3002Tab \u5207\u6362\u64CD\u4F5C\uFF0CEsc \u9000\u51FA\u5F55\u952E\u3002",
  "web-help": "\u6D4F\u89C8\u5668\u53EF\u7528\u7EC4\u5408\uFF1AMod+/\u3001Mod+Shift+,\u3001Mod+Shift+.\u3002Mod \u5728 Mac \u4E0A\u4E3A Command\uFF0C\u5176\u4ED6\u7CFB\u7EDF\u4E3A Ctrl\u3002",
  "unsupported-key": "\u6682\u4E0D\u652F\u6301\u8FD9\u4E2A\u6309\u952E\u3002",
  reserved: "\u6B64\u7EC4\u5408\u7531\u7CFB\u7EDF\u6216\u6587\u672C\u7F16\u8F91\u64CD\u4F5C\u4FDD\u7559\u3002",
  "modifier-required": "\u8BF7\u540C\u65F6\u6309\u4E0B Command\u3001Ctrl \u6216 Alt \u4FEE\u9970\u952E\u3002",
  "too-many-keys": "\u6700\u591A\u540C\u65F6\u6309\u4E0B\u4E24\u4E2A\u975E\u4FEE\u9970\u952E\u3002\u8BF7\u677E\u5F00\u540E\u91CD\u8BD5\u3002",
  "macos-web-help": "\u53EF\u8BBE\u7F6E Command+/\u3001Command+,\u3001Command+\u53CD\u659C\u6760\u3001Control+\u53CD\u5F15\u53F7\u3001Command+Option+\u6309\u952E\u6216 Command+Shift+\u6309\u952E\u3002\u4E5F\u652F\u6301\u4E09\u4E2A\u6216\u56DB\u4E2A\u4E0D\u540C\u4FEE\u9970\u952E\u7684\u7EC4\u5408\u3002\u6D4F\u89C8\u5668\u6216\u7CFB\u7EDF\u5360\u7528\u7684\u7EC4\u5408\u53EF\u80FD\u65E0\u6CD5\u9001\u8FBE\u9875\u9762\u3002",
  "windows-web-help": "\u53EF\u8BBE\u7F6E Ctrl+/\u3001Ctrl+,\u3001Ctrl+Alt+\u6309\u952E\u6216 Ctrl+Shift+\u6309\u952E\u3002\u4E5F\u652F\u6301\u4E09\u4E2A\u6216\u56DB\u4E2A\u4E0D\u540C\u4FEE\u9970\u952E\u7684\u7EC4\u5408\u3002\u6D4F\u89C8\u5668\u6216\u7CFB\u7EDF\u5360\u7528\u7684\u7EC4\u5408\u53EF\u80FD\u65E0\u6CD5\u9001\u8FBE\u9875\u9762\u3002",
  "unsupported-browser": "\u6B64\u6D4F\u89C8\u5668\u6682\u4E0D\u652F\u6301\u8BE5\u7EC4\u5408\u3002",
  conflict: "\u5DF2\u88AB\u300C{commands}\u300D\u5360\u7528",
  saved: "\u5DF2\u4FEE\u6539",
  clear: "\u79FB\u9664",
  "retry-save": "\u91CD\u8BD5\u4FDD\u5B58",
  reset: "\u6062\u590D\u9ED8\u8BA4",
  "reset-all": "\u6062\u590D\u5168\u90E8\u9ED8\u8BA4",
  "modified-count": "{count} \u9879\u5DF2\u81EA\u5B9A\u4E49",
  "reset-title": "\u6062\u590D\u5168\u90E8\u9ED8\u8BA4\u5FEB\u6377\u952E\uFF1F",
  "reset-description": "\u5C06\u6062\u590D\u5F53\u524D\u5E73\u53F0\u7684\u9ED8\u8BA4\u5FEB\u6377\u952E\u3002\u4F60\u4FEE\u6539\u6216\u79FB\u9664\u7684\u5FEB\u6377\u952E\u90FD\u4F1A\u6062\u590D\uFF0C\u5176\u4ED6\u5E73\u53F0\u4E0D\u53D7\u5F71\u54CD\u3002",
  cancel: "\u53D6\u6D88",
  "reset-saved": "\u5DF2\u6062\u590D\u9ED8\u8BA4\u5FEB\u6377\u952E",
  "close-confirmation": "\u5173\u95ED\u786E\u8BA4",
  "reset-failed": "\u6062\u590D\u9ED8\u8BA4\u5931\u8D25\u3002\u539F\u5FEB\u6377\u952E\u5DF2\u4FDD\u7559\uFF0C\u8BF7\u91CD\u8BD5\u3002",
  review: "\u5DF2\u6838\u5BF9\u6700\u65B0\u914D\u7F6E",
  stale: "\u5FEB\u6377\u952E\u914D\u7F6E\u6216\u53EF\u7528\u547D\u4EE4\u5DF2\u66F4\u65B0\u3002\u8BF7\u6838\u5BF9\u6700\u65B0\u952E\u4F4D\u540E\u518D\u4FDD\u5B58\u3002",
  "write-failed": "\u4FDD\u5B58\u5931\u8D25\u3002\u539F\u5FEB\u6377\u952E\u548C\u5F53\u524D\u8349\u7A3F\u5DF2\u4FDD\u7559\uFF0C\u8BF7\u91CD\u8BD5\u3002",
  "not-ready": "\u5FEB\u6377\u952E\u5C1A\u672A\u51C6\u5907\u597D\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5\u3002",
  read: "\u65E0\u6CD5\u8BFB\u53D6 {location}\u3002\u8BF7\u68C0\u67E5\u8BBF\u95EE\u6743\u9650\u540E{reload}\u3002",
  invalid: "{location} \u7684\u5FEB\u6377\u952E\u914D\u7F6E\u5185\u5BB9\u635F\u574F\u3002\u8BF7\u5148\u5907\u4EFD\u5E76\u4FEE\u590D\u8BE5\u914D\u7F6E\uFF0C\u7136\u540E{reload}\u3002",
  future: "{location} \u7684\u5FEB\u6377\u952E\u914D\u7F6E\u7531\u66F4\u65B0\u7248\u672C\u521B\u5EFA\u3002\u8BF7\u5347\u7EA7 Harness \u540E\u91CD\u8BD5\u3002",
  "web-document": "\u5F53\u524D\u7F51\u7AD9\u672C\u5730\u5B58\u50A8\u4E2D\u7684 dsh.keybindings.v1",
  "desktop-document": "userData/keybindings.json",
  "web-reload": "\u5237\u65B0\u9875\u9762",
  "desktop-reload": "\u91CD\u65B0\u542F\u52A8 Harness",
  "using-defaults": "\u5F53\u524D\u4F7F\u7528\u9ED8\u8BA4\u952E\u4F4D\u3002",
  "using-accepted": "\u5F53\u524D\u7EE7\u7EED\u4F7F\u7528\u4E0A\u6B21\u8BFB\u53D6\u6210\u529F\u7684\u952E\u4F4D\u3002",
  "native-failed": "\u65E0\u6CD5\u542F\u7528\u684C\u9762\u5F55\u952E\u4FDD\u62A4\uFF0C\u8BF7\u5173\u95ED\u540E\u91CD\u8BD5\u3002",
  "global-hint": "\u5168\u5C40\u5524\u8D77\u67E5\u770B",
  "clear-search": "\u6E05\u7A7A\u641C\u7D22",
  title: "\u5FEB\u6377\u952E",
  open: "\u5FEB\u6377\u952E\u901F\u67E5",
  settings: "\u5FEB\u6377\u952E",
  view: "\u7F16\u8F91\u5FEB\u6377\u952E",
  description: "\u67E5\u770B\u548C\u7F16\u8F91\u5F53\u524D\u53EF\u7528\u7684\u5FEB\u6377\u952E\u548C\u8F93\u5165\u64CD\u4F5C",
  search: "\u641C\u7D22\u5FEB\u6377\u952E",
  close: "\u5173\u95ED\u5FEB\u6377\u952E",
  application: "\u5E94\u7528\u64CD\u4F5C",
  input: "\u6D88\u606F\u8F93\u5165",
  menus: "\u83DC\u5355\u4E0E\u5F39\u5C42",
  approval: "\u5BA1\u6279\u533A\u57DF",
  unbound: "\u6682\u65E0\u5FEB\u6377\u952E",
  empty: "\u6CA1\u6709\u5339\u914D\u7684\u5FEB\u6377\u952E",
  move: "\u79FB\u52A8\u83DC\u5355\u9009\u62E9",
  select: "\u9009\u62E9\u83DC\u5355\u9879",
  dismiss: "\u5173\u95ED\u83DC\u5355\u6216\u9876\u5C42\u5F39\u7A97"
};
var en = {
  "edit-label": "Edit shortcut for {command}",
  record: "Press a shortcut",
  "record-help": "Release the keys to save. Tab moves between actions; Esc cancels.",
  "web-help": "Browser combinations: Mod+/, Mod+Shift+,, Mod+Shift+.. Mod is Command on Mac and Ctrl elsewhere.",
  "unsupported-key": "This key is not supported.",
  reserved: "This combination is reserved for system or text editing actions.",
  "modifier-required": "Include Command, Ctrl, or Alt in the combination.",
  "too-many-keys": "Hold at most two non-modifier keys. Release the keys to try again.",
  "macos-web-help": "Use Command+/, Command+,, Command+Backslash, Control+Backquote, Command+Option+key, or Command+Shift+key. Combinations with three or four distinct modifiers are also supported. Browser or system shortcuts may not reach the page.",
  "windows-web-help": "Use Ctrl+/, Ctrl+,, Ctrl+Alt+key, or Ctrl+Shift+key. Combinations with three or four distinct modifiers are also supported. Browser or system shortcuts may not reach the page.",
  "unsupported-browser": "This browser does not support this combination yet.",
  conflict: "Already used by \u201C{commands}\u201D",
  saved: "Modified",
  clear: "Remove",
  "retry-save": "Retry save",
  reset: "Restore default",
  "reset-all": "Restore all defaults",
  "modified-count": "{count} customized",
  "reset-title": "Restore all default shortcuts?",
  "reset-description": "Restore the default shortcuts for this platform. All modified or removed shortcuts will be restored. Other platforms are unaffected.",
  cancel: "Cancel",
  "reset-saved": "Default shortcuts restored",
  "close-confirmation": "Close confirmation",
  "reset-failed": "Could not restore defaults. Your shortcuts are unchanged. Please retry.",
  review: "I have reviewed the latest configuration",
  stale: "Shortcut configuration or available commands changed. Review the latest bindings before saving.",
  "write-failed": "Could not save. Your previous shortcuts and current draft are preserved. Please retry.",
  "not-ready": "Shortcuts are not ready. Please try again.",
  read: "Could not read {location}. Check access permissions, then {reload}.",
  invalid: "Shortcut configuration in {location} is damaged. Back up and repair this configuration, then {reload}.",
  future: "Shortcut configuration in {location} was created by a newer version. Upgrade Harness and try again.",
  "web-document": "this site\u2019s localStorage entry dsh.keybindings.v1",
  "desktop-document": "userData/keybindings.json",
  "web-reload": "reload the page",
  "desktop-reload": "restart Harness",
  "using-defaults": "Default bindings are active.",
  "using-accepted": "The last successfully read bindings remain active.",
  "native-failed": "Could not protect desktop key recording. Exit recording and try again.",
  "global-hint": "Open from anywhere",
  "clear-search": "Clear search",
  title: "Keyboard shortcuts",
  open: "Open keyboard shortcuts",
  settings: "Keyboard shortcuts",
  view: "Edit shortcuts",
  description: "View and edit available shortcuts and input actions",
  search: "Search shortcuts",
  close: "Close keyboard shortcuts",
  application: "Application",
  input: "Message input",
  menus: "Menus and dialogs",
  approval: "Approval area",
  unbound: "No shortcut",
  empty: "No matching shortcuts",
  move: "Move menu selection",
  select: "Select menu item",
  dismiss: "Close menu or top dialog"
};
var ja = {
  "edit-label": "{command}\u306E\u30B7\u30E7\u30FC\u30C8\u30AB\u30C3\u30C8\u3092\u7DE8\u96C6",
  "record": "\u30B7\u30E7\u30FC\u30C8\u30AB\u30C3\u30C8\u3092\u62BC\u3057\u3066\u304F\u3060\u3055\u3044",
  "record-help": "\u30AD\u30FC\u3092\u96E2\u3059\u3068\u4FDD\u5B58\u3055\u308C\u307E\u3059\u3002Tab \u3067\u30A2\u30AF\u30B7\u30E7\u30F3\u9593\u3092\u79FB\u52D5\u3001Esc \u3067\u30AD\u30E3\u30F3\u30BB\u30EB\u3057\u307E\u3059\u3002",
  "web-help": "\u30D6\u30E9\u30A6\u30B6\u306E\u7D44\u307F\u5408\u308F\u305B: Mod+/\u3001Mod+Shift+,\u3001Mod+Shift+.\u3002Mod \u306F Mac \u3067\u306F Command\u3001\u305D\u308C\u4EE5\u5916\u3067\u306F Ctrl \u3067\u3059\u3002",
  "unsupported-key": "\u3053\u306E\u30AD\u30FC\u306F\u30B5\u30DD\u30FC\u30C8\u3055\u308C\u3066\u3044\u307E\u305B\u3093\u3002",
  "reserved": "\u3053\u306E\u7D44\u307F\u5408\u308F\u305B\u306F\u30B7\u30B9\u30C6\u30E0\u64CD\u4F5C\u307E\u305F\u306F\u30C6\u30AD\u30B9\u30C8\u7DE8\u96C6\u64CD\u4F5C\u306B\u4E88\u7D04\u3055\u308C\u3066\u3044\u307E\u3059\u3002",
  "modifier-required": "\u7D44\u307F\u5408\u308F\u305B\u306B Command\u3001Ctrl\u3001\u307E\u305F\u306F Alt \u3092\u542B\u3081\u3066\u304F\u3060\u3055\u3044\u3002",
  "too-many-keys": "\u4FEE\u98FE\u30AD\u30FC\u4EE5\u5916\u306E\u30AD\u30FC\u306F\u6700\u5927 2 \u3064\u307E\u3067\u3067\u3059\u3002\u30AD\u30FC\u3092\u96E2\u3057\u3066\u518D\u8A66\u884C\u3057\u3066\u304F\u3060\u3055\u3044\u3002",
  "macos-web-help": "Command+/\u3001Command+,\u3001Command+\u30D0\u30C3\u30AF\u30B9\u30E9\u30C3\u30B7\u30E5\u3001Control+\u30D0\u30C3\u30AF\u30AF\u30A9\u30FC\u30C8\u3001Command+Option+\u30AD\u30FC\u3001\u307E\u305F\u306F Command+Shift+\u30AD\u30FC\u3092\u4F7F\u7528\u3057\u3066\u304F\u3060\u3055\u3044\u30023 \u3064\u307E\u305F\u306F 4 \u3064\u306E\u7570\u306A\u308B\u4FEE\u98FE\u30AD\u30FC\u3092\u4F7F\u3063\u305F\u7D44\u307F\u5408\u308F\u305B\u3082\u30B5\u30DD\u30FC\u30C8\u3055\u308C\u3066\u3044\u307E\u3059\u3002\u30D6\u30E9\u30A6\u30B6\u3084\u30B7\u30B9\u30C6\u30E0\u306E\u30B7\u30E7\u30FC\u30C8\u30AB\u30C3\u30C8\u306F\u30DA\u30FC\u30B8\u306B\u5C4A\u304B\u306A\u3044\u5834\u5408\u304C\u3042\u308A\u307E\u3059\u3002",
  "windows-web-help": "Ctrl+/\u3001Ctrl+,\u3001Ctrl+Alt+\u30AD\u30FC\u3001\u307E\u305F\u306F Ctrl+Shift+\u30AD\u30FC\u3092\u4F7F\u7528\u3057\u3066\u304F\u3060\u3055\u3044\u30023 \u3064\u307E\u305F\u306F 4 \u3064\u306E\u7570\u306A\u308B\u4FEE\u98FE\u30AD\u30FC\u3092\u4F7F\u3063\u305F\u7D44\u307F\u5408\u308F\u305B\u3082\u30B5\u30DD\u30FC\u30C8\u3055\u308C\u3066\u3044\u307E\u3059\u3002\u30D6\u30E9\u30A6\u30B6\u3084\u30B7\u30B9\u30C6\u30E0\u306E\u30B7\u30E7\u30FC\u30C8\u30AB\u30C3\u30C8\u306F\u30DA\u30FC\u30B8\u306B\u5C4A\u304B\u306A\u3044\u5834\u5408\u304C\u3042\u308A\u307E\u3059\u3002",
  "unsupported-browser": "\u3053\u306E\u30D6\u30E9\u30A6\u30B6\u306F\u3053\u306E\u7D44\u307F\u5408\u308F\u305B\u306B\u307E\u3060\u5BFE\u5FDC\u3057\u3066\u3044\u307E\u305B\u3093\u3002",
  "conflict": "\u300C{commands}\u300D\u3067\u65E2\u306B\u4F7F\u7528\u3055\u308C\u3066\u3044\u307E\u3059",
  "saved": "\u5909\u66F4\u6E08\u307F",
  "clear": "\u524A\u9664",
  "retry-save": "\u4FDD\u5B58\u3092\u518D\u8A66\u884C",
  "reset": "\u30C7\u30D5\u30A9\u30EB\u30C8\u306B\u623B\u3059",
  "reset-all": "\u3059\u3079\u3066\u30C7\u30D5\u30A9\u30EB\u30C8\u306B\u623B\u3059",
  "modified-count": "{count} \u4EF6\u304C\u30AB\u30B9\u30BF\u30DE\u30A4\u30BA\u6E08\u307F",
  "reset-title": "\u3059\u3079\u3066\u306E\u30B7\u30E7\u30FC\u30C8\u30AB\u30C3\u30C8\u3092\u30C7\u30D5\u30A9\u30EB\u30C8\u306B\u623B\u3057\u307E\u3059\u304B\uFF1F",
  "reset-description": "\u3053\u306E\u30D7\u30E9\u30C3\u30C8\u30D5\u30A9\u30FC\u30E0\u306E\u30B7\u30E7\u30FC\u30C8\u30AB\u30C3\u30C8\u3092\u30C7\u30D5\u30A9\u30EB\u30C8\u306B\u623B\u3057\u307E\u3059\u3002\u5909\u66F4\u307E\u305F\u306F\u524A\u9664\u3055\u308C\u305F\u3059\u3079\u3066\u306E\u30B7\u30E7\u30FC\u30C8\u30AB\u30C3\u30C8\u304C\u5FA9\u5143\u3055\u308C\u307E\u3059\u3002\u4ED6\u306E\u30D7\u30E9\u30C3\u30C8\u30D5\u30A9\u30FC\u30E0\u306B\u306F\u5F71\u97FF\u3057\u307E\u305B\u3093\u3002",
  "cancel": "\u30AD\u30E3\u30F3\u30BB\u30EB",
  "reset-saved": "\u30C7\u30D5\u30A9\u30EB\u30C8\u306E\u30B7\u30E7\u30FC\u30C8\u30AB\u30C3\u30C8\u3092\u5FA9\u5143\u3057\u307E\u3057\u305F",
  "close-confirmation": "\u78BA\u8A8D\u3092\u9589\u3058\u308B",
  "reset-failed": "\u30C7\u30D5\u30A9\u30EB\u30C8\u3092\u5FA9\u5143\u3067\u304D\u307E\u305B\u3093\u3067\u3057\u305F\u3002\u30B7\u30E7\u30FC\u30C8\u30AB\u30C3\u30C8\u306F\u5909\u66F4\u3055\u308C\u3066\u3044\u307E\u305B\u3093\u3002\u518D\u8A66\u884C\u3057\u3066\u304F\u3060\u3055\u3044\u3002",
  "review": "\u6700\u65B0\u306E\u69CB\u6210\u3092\u78BA\u8A8D\u3057\u307E\u3057\u305F",
  "stale": "\u30B7\u30E7\u30FC\u30C8\u30AB\u30C3\u30C8\u69CB\u6210\u307E\u305F\u306F\u5229\u7528\u53EF\u80FD\u306A\u30B3\u30DE\u30F3\u30C9\u304C\u5909\u66F4\u3055\u308C\u307E\u3057\u305F\u3002\u4FDD\u5B58\u3059\u308B\u524D\u306B\u6700\u65B0\u306E\u30D0\u30A4\u30F3\u30C9\u3092\u78BA\u8A8D\u3057\u3066\u304F\u3060\u3055\u3044\u3002",
  "write-failed": "\u4FDD\u5B58\u3067\u304D\u307E\u305B\u3093\u3067\u3057\u305F\u3002\u4EE5\u524D\u306E\u30B7\u30E7\u30FC\u30C8\u30AB\u30C3\u30C8\u3068\u73FE\u5728\u306E\u4E0B\u66F8\u304D\u306F\u4FDD\u6301\u3055\u308C\u3066\u3044\u307E\u3059\u3002\u518D\u8A66\u884C\u3057\u3066\u304F\u3060\u3055\u3044\u3002",
  "not-ready": "\u30B7\u30E7\u30FC\u30C8\u30AB\u30C3\u30C8\u306E\u6E96\u5099\u304C\u3067\u304D\u3066\u3044\u307E\u305B\u3093\u3002\u3082\u3046\u4E00\u5EA6\u304A\u8A66\u3057\u304F\u3060\u3055\u3044\u3002",
  "read": "{location} \u3092\u8AAD\u307F\u53D6\u308C\u307E\u305B\u3093\u3067\u3057\u305F\u3002\u30A2\u30AF\u30BB\u30B9\u6A29\u9650\u3092\u78BA\u8A8D\u3057\u3066\u304B\u3089\u3001{reload}\u3057\u3066\u304F\u3060\u3055\u3044\u3002",
  "invalid": "{location} \u306E\u30B7\u30E7\u30FC\u30C8\u30AB\u30C3\u30C8\u69CB\u6210\u304C\u7834\u640D\u3057\u3066\u3044\u307E\u3059\u3002\u3053\u306E\u69CB\u6210\u3092\u30D0\u30C3\u30AF\u30A2\u30C3\u30D7\u3057\u3066\u4FEE\u5FA9\u3057\u3066\u304B\u3089\u3001{reload}\u3057\u3066\u304F\u3060\u3055\u3044\u3002",
  "future": "{location} \u306E\u30B7\u30E7\u30FC\u30C8\u30AB\u30C3\u30C8\u69CB\u6210\u306F\u65B0\u3057\u3044\u30D0\u30FC\u30B8\u30E7\u30F3\u3067\u4F5C\u6210\u3055\u308C\u3066\u3044\u307E\u3059\u3002Harness \u3092\u30A2\u30C3\u30D7\u30B0\u30EC\u30FC\u30C9\u3057\u3066\u518D\u8A66\u884C\u3057\u3066\u304F\u3060\u3055\u3044\u3002",
  "web-document": "\u3053\u306E\u30B5\u30A4\u30C8\u306E localStorage \u30A8\u30F3\u30C8\u30EA dsh.keybindings.v1",
  "desktop-document": "userData/keybindings.json",
  "web-reload": "\u30DA\u30FC\u30B8\u3092\u518D\u8AAD\u307F\u8FBC\u307F",
  "desktop-reload": "Harness \u3092\u518D\u8D77\u52D5",
  "using-defaults": "\u30C7\u30D5\u30A9\u30EB\u30C8\u306E\u30D0\u30A4\u30F3\u30C9\u304C\u6709\u52B9\u3067\u3059\u3002",
  "using-accepted": "\u6700\u5F8C\u306B\u6B63\u5E38\u306B\u8AAD\u307F\u53D6\u3089\u308C\u305F\u30D0\u30A4\u30F3\u30C9\u304C\u6709\u52B9\u306A\u307E\u307E\u3067\u3059\u3002",
  "native-failed": "\u30C7\u30B9\u30AF\u30C8\u30C3\u30D7\u3067\u306E\u30AD\u30FC\u8A18\u9332\u3092\u4FDD\u8B77\u3067\u304D\u307E\u305B\u3093\u3067\u3057\u305F\u3002\u8A18\u9332\u3092\u7D42\u4E86\u3057\u3066\u518D\u8A66\u884C\u3057\u3066\u304F\u3060\u3055\u3044\u3002",
  "global-hint": "\u3069\u3053\u304B\u3089\u3067\u3082\u958B\u304F",
  "clear-search": "\u691C\u7D22\u3092\u30AF\u30EA\u30A2",
  "title": "\u30AD\u30FC\u30DC\u30FC\u30C9\u30B7\u30E7\u30FC\u30C8\u30AB\u30C3\u30C8",
  "open": "\u30AD\u30FC\u30DC\u30FC\u30C9\u30B7\u30E7\u30FC\u30C8\u30AB\u30C3\u30C8\u3092\u958B\u304F",
  "settings": "\u30AD\u30FC\u30DC\u30FC\u30C9\u30B7\u30E7\u30FC\u30C8\u30AB\u30C3\u30C8",
  "view": "\u30B7\u30E7\u30FC\u30C8\u30AB\u30C3\u30C8\u3092\u7DE8\u96C6",
  "description": "\u5229\u7528\u53EF\u80FD\u306A\u30B7\u30E7\u30FC\u30C8\u30AB\u30C3\u30C8\u3068\u5165\u529B\u30A2\u30AF\u30B7\u30E7\u30F3\u3092\u8868\u793A\u30FB\u7DE8\u96C6",
  "search": "\u30B7\u30E7\u30FC\u30C8\u30AB\u30C3\u30C8\u3092\u691C\u7D22",
  "close": "\u30AD\u30FC\u30DC\u30FC\u30C9\u30B7\u30E7\u30FC\u30C8\u30AB\u30C3\u30C8\u3092\u9589\u3058\u308B",
  "application": "\u30A2\u30D7\u30EA\u30B1\u30FC\u30B7\u30E7\u30F3",
  "input": "\u30E1\u30C3\u30BB\u30FC\u30B8\u5165\u529B",
  "menus": "\u30E1\u30CB\u30E5\u30FC\u3068\u30C0\u30A4\u30A2\u30ED\u30B0",
  "approval": "\u627F\u8A8D\u30A8\u30EA\u30A2",
  "unbound": "\u30B7\u30E7\u30FC\u30C8\u30AB\u30C3\u30C8\u306A\u3057",
  "empty": "\u4E00\u81F4\u3059\u308B\u30B7\u30E7\u30FC\u30C8\u30AB\u30C3\u30C8\u304C\u3042\u308A\u307E\u305B\u3093",
  "move": "\u30E1\u30CB\u30E5\u30FC\u9078\u629E\u3092\u79FB\u52D5",
  "select": "\u30E1\u30CB\u30E5\u30FC\u9805\u76EE\u3092\u9078\u629E",
  "dismiss": "\u30E1\u30CB\u30E5\u30FC\u307E\u305F\u306F\u6700\u4E0A\u4F4D\u30C0\u30A4\u30A2\u30ED\u30B0\u3092\u9589\u3058\u308B"
};
var es = {
  "edit-label": "Editar acceso directo para {command}",
  record: "Presione un atajo",
  "record-help": "Suelta las teclas para guardar. La pesta\xF1a se mueve entre acciones; Esc se cancela.",
  "web-help": "Combinaciones de navegador: Mod+/, Mod+Shift+, Mod+Shift+... Mod es Comando en Mac y Ctrl en otros lugares.",
  "unsupported-key": "Esta clave no es compatible.",
  reserved: "Esta combinaci\xF3n est\xE1 reservada para acciones de edici\xF3n de texto o del sistema.",
  "modifier-required": "Incluya Comando, Ctrl o Alt en la combinaci\xF3n.",
  "too-many-keys": "Mantenga presionadas como m\xE1ximo dos teclas no modificadoras. Suelta las teclas para volver a intentarlo.",
  "macos-web-help": "Utilice Comando+/, Comando+, Comando+barra invertida, Control+comillas invertidas, Comando+Opci\xF3n+tecla o Comando+May\xFAs+tecla. Tambi\xE9n se admiten combinaciones con tres o cuatro modificadores distintos. Es posible que los accesos directos del navegador o del sistema no lleguen a la p\xE1gina.",
  "windows-web-help": "Utilice Ctrl+/, Ctrl+, Ctrl+Alt+tecla o Ctrl+Shift+tecla. Tambi\xE9n se admiten combinaciones con tres o cuatro modificadores distintos. Es posible que los accesos directos del navegador o del sistema no lleguen a la p\xE1gina.",
  "unsupported-browser": "Este navegador a\xFAn no admite esta combinaci\xF3n.",
  conflict: "Ya utilizado por \u201C{commands}\u201D",
  saved: "Modificado",
  clear: "Quitar",
  "retry-save": "Reintentar guardar",
  reset: "Restaurar valor predeterminado",
  "reset-all": "Restaurar todos los valores predeterminados",
  "modified-count": "{count} personalizado",
  "reset-title": "\xBFRestaurar todos los atajos predeterminados?",
  "reset-description": "Restaure los accesos directos predeterminados para esta plataforma. Se restaurar\xE1n todos los accesos directos modificados o eliminados. Otras plataformas no se ven afectadas.",
  cancel: "Cancelar",
  "reset-saved": "Accesos directos predeterminados restaurados",
  "close-confirmation": "Cerrar confirmaci\xF3n",
  "reset-failed": "No se pudieron restaurar los valores predeterminados. Tus atajos no han cambiado. Vuelva a intentarlo.",
  review: "He revisado la \xFAltima configuraci\xF3n.",
  stale: "La configuraci\xF3n de accesos directos o los comandos disponibles cambiaron. Revise los enlaces m\xE1s recientes antes de guardar.",
  "write-failed": "No se pudo guardar. Se conservan sus atajos anteriores y el borrador actual. Vuelva a intentarlo.",
  "not-ready": "Los atajos no est\xE1n listos. Por favor int\xE9ntalo de nuevo.",
  read: "No se pudo leer {location}. Verifique los permisos de acceso, luego {reload}.",
  invalid: "La configuraci\xF3n de acceso directo en {location} est\xE1 da\xF1ada. Haga una copia de seguridad y repare esta configuraci\xF3n, luego {reload}.",
  future: "La configuraci\xF3n de acceso directo en {location} fue creada por una versi\xF3n m\xE1s reciente. Actualice el arn\xE9s e int\xE9ntelo de nuevo.",
  "web-document": "la entrada de almacenamiento local de este sitio dsh.keybindings.v1",
  "desktop-document": "datos de usuario/bindings.json",
  "web-reload": "recargar la pagina",
  "desktop-reload": "reiniciar el arn\xE9s",
  "using-defaults": "Los enlaces predeterminados est\xE1n activos.",
  "using-accepted": "Los \xFAltimos enlaces le\xEDdos correctamente permanecen activos.",
  "native-failed": "No se pudo proteger la grabaci\xF3n de claves del escritorio. Salga de la grabaci\xF3n y vuelva a intentarlo.",
  "global-hint": "Abierto desde cualquier lugar",
  "clear-search": "Borrar b\xFAsqueda",
  title: "Atajos de teclado",
  open: "Abrir atajos de teclado",
  settings: "Atajos de teclado",
  view: "Editar atajos",
  description: "Ver y editar atajos disponibles y acciones de entrada",
  search: "Buscar atajos",
  close: "Cerrar atajos de teclado",
  application: "Solicitud",
  input: "Entrada de mensaje",
  menus: "Men\xFAs y cuadros de di\xE1logo",
  approval: "\xC1rea de aprobaci\xF3n",
  unbound: "Sin atajos",
  empty: "No hay atajos coincidentes",
  move: "Mover selecci\xF3n de men\xFA",
  select: "Seleccionar elemento del men\xFA",
  dismiss: "Cerrar men\xFA o cuadro de di\xE1logo superior"
};
var fr = {
  "edit-label": "Modifier le raccourci pour {command}",
  record: "Appuyez sur un raccourci",
  "record-help": "Rel\xE2chez les touches pour enregistrer. L'onglet se d\xE9place entre les actions\xA0; Esc annule.",
  "web-help": "Combinaisons de navigateur\xA0: Mod+/, Mod+Shift+,, Mod+Shift+.. Mod est Command sur Mac et Ctrl ailleurs.",
  "unsupported-key": "Cette cl\xE9 n'est pas prise en charge.",
  reserved: "Cette combinaison est r\xE9serv\xE9e aux actions syst\xE8me ou d'\xE9dition de texte.",
  "modifier-required": "Incluez Commande, Ctrl ou Alt dans la combinaison.",
  "too-many-keys": "Tenez au plus deux cl\xE9s non modificatrices. Rel\xE2chez les touches pour r\xE9essayer.",
  "macos-web-help": "Utilisez Command+/, Command+,, Command+Backslash, Control+Backquote, Command+Option+key ou Command+Shift+key. Les combinaisons avec trois ou quatre modificateurs distincts sont \xE9galement prises en charge. Les raccourcis du navigateur ou du syst\xE8me peuvent ne pas atteindre la page.",
  "windows-web-help": "Utilisez Ctrl+/, Ctrl+,, Ctrl+Alt+touche ou Ctrl+Shift+touche. Les combinaisons avec trois ou quatre modificateurs distincts sont \xE9galement prises en charge. Les raccourcis du navigateur ou du syst\xE8me peuvent ne pas atteindre la page.",
  "unsupported-browser": "Ce navigateur ne prend pas encore en charge cette combinaison.",
  conflict: "D\xE9j\xE0 utilis\xE9 par \xAB\xA0{commands}\xA0\xBB",
  saved: "Modifi\xE9",
  clear: "Supprimer",
  "retry-save": "R\xE9essayez d'enregistrer",
  reset: "Restaurer les valeurs par d\xE9faut",
  "reset-all": "Restaurer tous les param\xE8tres par d\xE9faut",
  "modified-count": "{count} personnalis\xE9",
  "reset-title": "Restaurer tous les raccourcis par d\xE9faut\xA0?",
  "reset-description": "Restaurez les raccourcis par d\xE9faut pour cette plateforme. Tous les raccourcis modifi\xE9s ou supprim\xE9s seront restaur\xE9s. Les autres plateformes ne sont pas affect\xE9es.",
  cancel: "Annuler",
  "reset-saved": "Raccourcis par d\xE9faut restaur\xE9s",
  "close-confirmation": "Fermer la confirmation",
  "reset-failed": "Impossible de restaurer les valeurs par d\xE9faut. Vos raccourcis restent inchang\xE9s. Veuillez r\xE9essayer.",
  review: "J'ai examin\xE9 la derni\xE8re configuration",
  stale: "La configuration des raccourcis ou les commandes disponibles ont \xE9t\xE9 modifi\xE9es. V\xE9rifiez les derni\xE8res liaisons avant de les enregistrer.",
  "write-failed": "Impossible d'enregistrer. Vos raccourcis pr\xE9c\xE9dents et votre brouillon actuel sont conserv\xE9s. Veuillez r\xE9essayer.",
  "not-ready": "Les raccourcis ne sont pas pr\xEAts. Veuillez r\xE9essayer.",
  read: "Impossible de lire {location}. V\xE9rifiez les autorisations d'acc\xE8s, puis {reload}.",
  invalid: "La configuration des raccourcis dans {location} est endommag\xE9e. Sauvegardez et r\xE9parez cette configuration, puis {reload}.",
  future: "La configuration des raccourcis dans {location} a \xE9t\xE9 cr\xE9\xE9e par une version plus r\xE9cente. Mettez \xE0 niveau le harnais et r\xE9essayez.",
  "web-document": "l'entr\xE9e localStorage de ce site dsh.keybindings.v1",
  "desktop-document": "userData/keybindings.json",
  "web-reload": "recharger la page",
  "desktop-reload": "red\xE9marrer le harnais",
  "using-defaults": "Les liaisons par d\xE9faut sont actives.",
  "using-accepted": "Les derni\xE8res liaisons lues avec succ\xE8s restent actives.",
  "native-failed": "Impossible de prot\xE9ger l'enregistrement des cl\xE9s du bureau. Quittez l'enregistrement et r\xE9essayez.",
  "global-hint": "Ouvert de n'importe o\xF9",
  "clear-search": "Effacer la recherche",
  title: "Raccourcis clavier",
  open: "Ouvrir les raccourcis clavier",
  settings: "Raccourcis clavier",
  view: "Modifier les raccourcis",
  description: "Afficher et modifier les raccourcis et les actions de saisie disponibles",
  search: "Raccourcis de recherche",
  close: "Fermer les raccourcis clavier",
  application: "Demande",
  input: "Saisie des messages",
  menus: "Menus et bo\xEEtes de dialogue",
  approval: "Zone d'approbation",
  unbound: "Pas de raccourci",
  empty: "Aucun raccourci correspondant",
  move: "D\xE9placer la s\xE9lection du menu",
  select: "S\xE9lectionner un \xE9l\xE9ment de menu",
  dismiss: "Fermer le menu ou la bo\xEEte de dialogue sup\xE9rieure"
};
var de = {
  "edit-label": "Verkn\xFCpfung f\xFCr {command} bearbeiten",
  record: "Dr\xFCcken Sie eine Verkn\xFCpfung",
  "record-help": "Lassen Sie die Tasten los, um zu speichern. Tab bewegt sich zwischen Aktionen; Esc bricht ab.",
  "web-help": "Browserkombinationen: Mod+/, Mod+Umschalt+,, Mod+Umschalt+.. Mod ist Befehl auf dem Mac und Strg anderswo.",
  "unsupported-key": "Dieser Schl\xFCssel wird nicht unterst\xFCtzt.",
  reserved: "Diese Kombination ist f\xFCr System- oder Textbearbeitungsaktionen reserviert.",
  "modifier-required": "F\xFCgen Sie Befehl, Strg oder Alt in die Kombination ein.",
  "too-many-keys": "Halten Sie h\xF6chstens zwei nicht modifizierbare Tasten gedr\xFCckt. Lassen Sie die Tasten los, um es erneut zu versuchen.",
  "macos-web-help": "Verwenden Sie Befehl+/, Befehl+,, Befehl+Backslash, Strg+Backquote, Befehl+Wahl+Taste oder Befehl+Umschalt+Taste. Kombinationen mit drei oder vier unterschiedlichen Modifikatoren werden ebenfalls unterst\xFCtzt. Browser- oder Systemverkn\xFCpfungen erreichen die Seite m\xF6glicherweise nicht.",
  "windows-web-help": "Verwenden Sie Strg+/, Strg+,, Strg+Alt+Taste oder Strg+Umschalt+Taste. Kombinationen mit drei oder vier unterschiedlichen Modifikatoren werden ebenfalls unterst\xFCtzt. Browser- oder Systemverkn\xFCpfungen erreichen die Seite m\xF6glicherweise nicht.",
  "unsupported-browser": "Dieser Browser unterst\xFCtzt diese Kombination noch nicht.",
  conflict: "Bereits verwendet von \u201E{commands}\u201C",
  saved: "Ge\xE4ndert",
  clear: "Entfernen",
  "retry-save": "Speichern Sie erneut",
  reset: "Standard wiederherstellen",
  "reset-all": "Alle Standardeinstellungen wiederherstellen",
  "modified-count": "{count} angepasst",
  "reset-title": "Alle Standardverkn\xFCpfungen wiederherstellen?",
  "reset-description": "Stellen Sie die Standardverkn\xFCpfungen f\xFCr diese Plattform wieder her. Alle ge\xE4nderten oder entfernten Verkn\xFCpfungen werden wiederhergestellt. Andere Plattformen sind davon nicht betroffen.",
  cancel: "Abbrechen",
  "reset-saved": "Standardverkn\xFCpfungen wiederhergestellt",
  "close-confirmation": "Best\xE4tigung schlie\xDFen",
  "reset-failed": "Die Standardeinstellungen konnten nicht wiederhergestellt werden. Ihre Verkn\xFCpfungen bleiben unver\xE4ndert. Bitte versuchen Sie es erneut.",
  review: "Ich habe die neueste Konfiguration \xFCberpr\xFCft",
  stale: "Verkn\xFCpfungskonfiguration oder verf\xFCgbare Befehle ge\xE4ndert. \xDCberpr\xFCfen Sie vor dem Speichern die neuesten Bindungen.",
  "write-failed": "Konnte nicht gespeichert werden. Ihre vorherigen Verkn\xFCpfungen und Ihr aktueller Entwurf bleiben erhalten. Bitte versuchen Sie es erneut.",
  "not-ready": "Verkn\xFCpfungen sind nicht bereit. Bitte versuchen Sie es erneut.",
  read: "{location} konnte nicht gelesen werden. Zugriffsberechtigungen pr\xFCfen, dann {reload}.",
  invalid: "Die Verkn\xFCpfungskonfiguration in {location} ist besch\xE4digt. Sichern und reparieren Sie diese Konfiguration, dann {reload}.",
  future: "Die Verkn\xFCpfungskonfiguration in {location} wurde von einer neueren Version erstellt. Aktualisieren Sie Harness und versuchen Sie es erneut.",
  "web-document": "Der localStorage-Eintrag dieser Site dsh.keybindings.v1",
  "desktop-document": "userData/keybindings.json",
  "web-reload": "Laden Sie die Seite neu",
  "desktop-reload": "Starten Sie Harness neu",
  "using-defaults": "Standardbindungen sind aktiv.",
  "using-accepted": "Die zuletzt erfolgreich gelesenen Bindungen bleiben aktiv.",
  "native-failed": "Die Desktop-Schl\xFCsselaufzeichnung konnte nicht gesch\xFCtzt werden. Beenden Sie die Aufnahme und versuchen Sie es erneut.",
  "global-hint": "Von \xFCberall aus \xF6ffnen",
  "clear-search": "Suche l\xF6schen",
  title: "Tastaturk\xFCrzel",
  open: "\xD6ffnen Sie Tastaturk\xFCrzel",
  settings: "Tastaturk\xFCrzel",
  view: "Verkn\xFCpfungen bearbeiten",
  description: "Verf\xFCgbare Verkn\xFCpfungen und Eingabeaktionen anzeigen und bearbeiten",
  search: "Suchverkn\xFCpfungen",
  close: "Tastaturk\xFCrzel schlie\xDFen",
  application: "Anwendung",
  input: "Nachrichteneingabe",
  menus: "Men\xFCs und Dialoge",
  approval: "Genehmigungsbereich",
  unbound: "Keine Abk\xFCrzung",
  empty: "Keine passenden Verkn\xFCpfungen",
  move: "Men\xFCauswahl verschieben",
  select: "Men\xFCpunkt ausw\xE4hlen",
  dismiss: "Men\xFC oder oberen Dialog schlie\xDFen"
};
var ru = {
  "edit-label": "\u0418\u0437\u043C\u0435\u043D\u0438\u0442\u044C \u044F\u0440\u043B\u044B\u043A \u0434\u043B\u044F {command}",
  record: "\u041D\u0430\u0436\u043C\u0438\u0442\u0435 \u044F\u0440\u043B\u044B\u043A",
  "record-help": "\u041E\u0442\u043F\u0443\u0441\u0442\u0438\u0442\u0435 \u043A\u043B\u0430\u0432\u0438\u0448\u0438 \u0434\u043B\u044F \u0441\u043E\u0445\u0440\u0430\u043D\u0435\u043D\u0438\u044F. Tab \u043F\u0435\u0440\u0435\u043C\u0435\u0449\u0430\u0435\u0442\u0441\u044F \u043C\u0435\u0436\u0434\u0443 \u0434\u0435\u0439\u0441\u0442\u0432\u0438\u044F\u043C\u0438; Esc \u043E\u0442\u043C\u0435\u043D\u044F\u0435\u0442.",
  "web-help": "\u041A\u043E\u043C\u0431\u0438\u043D\u0430\u0446\u0438\u0438 \u0431\u0440\u0430\u0443\u0437\u0435\u0440\u0430: Mod+/, Mod+Shift+, Mod+Shift+.. Mod \u2014 \u044D\u0442\u043E \u043A\u043E\u043C\u0430\u043D\u0434\u0430 \u043D\u0430 Mac, \u0430 \u0432 \u0434\u0440\u0443\u0433\u0438\u0445 \u043C\u0435\u0441\u0442\u0430\u0445 \u2014 Ctrl.",
  "unsupported-key": "\u042D\u0442\u043E\u0442 \u043A\u043B\u044E\u0447 \u043D\u0435 \u043F\u043E\u0434\u0434\u0435\u0440\u0436\u0438\u0432\u0430\u0435\u0442\u0441\u044F.",
  reserved: "\u042D\u0442\u0430 \u043A\u043E\u043C\u0431\u0438\u043D\u0430\u0446\u0438\u044F \u0437\u0430\u0440\u0435\u0437\u0435\u0440\u0432\u0438\u0440\u043E\u0432\u0430\u043D\u0430 \u0434\u043B\u044F \u0441\u0438\u0441\u0442\u0435\u043C\u043D\u044B\u0445 \u0434\u0435\u0439\u0441\u0442\u0432\u0438\u0439 \u0438\u043B\u0438 \u0434\u0435\u0439\u0441\u0442\u0432\u0438\u0439 \u043F\u043E \u0440\u0435\u0434\u0430\u043A\u0442\u0438\u0440\u043E\u0432\u0430\u043D\u0438\u044E \u0442\u0435\u043A\u0441\u0442\u0430.",
  "modifier-required": "\u0412\u043A\u043B\u044E\u0447\u0438\u0442\u0435 \u0432 \u043A\u043E\u043C\u0431\u0438\u043D\u0430\u0446\u0438\u044E Command, Ctrl \u0438\u043B\u0438 Alt.",
  "too-many-keys": "\u0423\u0434\u0435\u0440\u0436\u0438\u0432\u0430\u0439\u0442\u0435 \u043D\u0435 \u0431\u043E\u043B\u0435\u0435 \u0434\u0432\u0443\u0445 \u043D\u0435\u043C\u043E\u0434\u0438\u0444\u0438\u0446\u0438\u0440\u0443\u044E\u0449\u0438\u0445 \u043A\u043B\u0430\u0432\u0438\u0448. \u041E\u0442\u043F\u0443\u0441\u0442\u0438\u0442\u0435 \u043A\u043B\u0430\u0432\u0438\u0448\u0438, \u0447\u0442\u043E\u0431\u044B \u043F\u043E\u0432\u0442\u043E\u0440\u0438\u0442\u044C \u043F\u043E\u043F\u044B\u0442\u043A\u0443.",
  "macos-web-help": "\u0418\u0441\u043F\u043E\u043B\u044C\u0437\u0443\u0439\u0442\u0435 Command+/, Command+,, Command+\u043E\u0431\u0440\u0430\u0442\u043D\u0430\u044F \u043A\u043E\u0441\u0430\u044F \u0447\u0435\u0440\u0442\u0430, Control+\u043E\u0431\u0440\u0430\u0442\u043D\u0430\u044F \u043A\u0430\u0432\u044B\u0447\u043A\u0430, Command+Option+\u043A\u043B\u0430\u0432\u0438\u0448\u0430 \u0438\u043B\u0438 Command+Shift+\u043A\u043B\u0430\u0432\u0438\u0448\u0430. \u0422\u0430\u043A\u0436\u0435 \u043F\u043E\u0434\u0434\u0435\u0440\u0436\u0438\u0432\u0430\u044E\u0442\u0441\u044F \u043A\u043E\u043C\u0431\u0438\u043D\u0430\u0446\u0438\u0438 \u0441 \u0442\u0440\u0435\u043C\u044F \u0438\u043B\u0438 \u0447\u0435\u0442\u044B\u0440\u044C\u043C\u044F \u0440\u0430\u0437\u043B\u0438\u0447\u043D\u044B\u043C\u0438 \u043C\u043E\u0434\u0438\u0444\u0438\u043A\u0430\u0442\u043E\u0440\u0430\u043C\u0438. \u042F\u0440\u043B\u044B\u043A\u0438 \u0431\u0440\u0430\u0443\u0437\u0435\u0440\u0430 \u0438\u043B\u0438 \u0441\u0438\u0441\u0442\u0435\u043C\u044B \u043C\u043E\u0433\u0443\u0442 \u043D\u0435 \u0434\u043E\u0445\u043E\u0434\u0438\u0442\u044C \u0434\u043E \u0441\u0442\u0440\u0430\u043D\u0438\u0446\u044B.",
  "windows-web-help": "\u0418\u0441\u043F\u043E\u043B\u044C\u0437\u0443\u0439\u0442\u0435 Ctrl+/, Ctrl+, Ctrl+Alt+\u043A\u043B\u0430\u0432\u0438\u0448\u0430 \u0438\u043B\u0438 Ctrl+Shift+\u043A\u043B\u0430\u0432\u0438\u0448\u0430. \u0422\u0430\u043A\u0436\u0435 \u043F\u043E\u0434\u0434\u0435\u0440\u0436\u0438\u0432\u0430\u044E\u0442\u0441\u044F \u043A\u043E\u043C\u0431\u0438\u043D\u0430\u0446\u0438\u0438 \u0441 \u0442\u0440\u0435\u043C\u044F \u0438\u043B\u0438 \u0447\u0435\u0442\u044B\u0440\u044C\u043C\u044F \u0440\u0430\u0437\u043B\u0438\u0447\u043D\u044B\u043C\u0438 \u043C\u043E\u0434\u0438\u0444\u0438\u043A\u0430\u0442\u043E\u0440\u0430\u043C\u0438. \u042F\u0440\u043B\u044B\u043A\u0438 \u0431\u0440\u0430\u0443\u0437\u0435\u0440\u0430 \u0438\u043B\u0438 \u0441\u0438\u0441\u0442\u0435\u043C\u044B \u043C\u043E\u0433\u0443\u0442 \u043D\u0435 \u0434\u043E\u0445\u043E\u0434\u0438\u0442\u044C \u0434\u043E \u0441\u0442\u0440\u0430\u043D\u0438\u0446\u044B.",
  "unsupported-browser": "\u042D\u0442\u043E\u0442 \u0431\u0440\u0430\u0443\u0437\u0435\u0440 \u043F\u043E\u043A\u0430 \u043D\u0435 \u043F\u043E\u0434\u0434\u0435\u0440\u0436\u0438\u0432\u0430\u0435\u0442 \u044D\u0442\u0443 \u043A\u043E\u043C\u0431\u0438\u043D\u0430\u0446\u0438\u044E.",
  conflict: "\u0423\u0436\u0435 \u0438\u0441\u043F\u043E\u043B\u044C\u0437\u0443\u0435\u0442\u0441\u044F \xAB{commands}\xBB",
  saved: "\u041C\u043E\u0434\u0438\u0444\u0438\u0446\u0438\u0440\u043E\u0432\u0430\u043D\u043D\u044B\u0439",
  clear: "\u0423\u0434\u0430\u043B\u0438\u0442\u044C",
  "retry-save": "\u041F\u043E\u0432\u0442\u043E\u0440\u0438\u0442\u044C \u043F\u043E\u043F\u044B\u0442\u043A\u0443 \u0441\u043E\u0445\u0440\u0430\u043D\u0435\u043D\u0438\u044F",
  reset: "\u0412\u043E\u0441\u0441\u0442\u0430\u043D\u043E\u0432\u0438\u0442\u044C \u043D\u0430\u0441\u0442\u0440\u043E\u0439\u043A\u0438 \u043F\u043E \u0443\u043C\u043E\u043B\u0447\u0430\u043D\u0438\u044E",
  "reset-all": "\u0412\u043E\u0441\u0441\u0442\u0430\u043D\u043E\u0432\u0438\u0442\u044C \u0432\u0441\u0435 \u043D\u0430\u0441\u0442\u0440\u043E\u0439\u043A\u0438 \u043F\u043E \u0443\u043C\u043E\u043B\u0447\u0430\u043D\u0438\u044E",
  "modified-count": "{count} \u043F\u043E \u0438\u043D\u0434\u0438\u0432\u0438\u0434\u0443\u0430\u043B\u044C\u043D\u043E\u043C\u0443 \u0437\u0430\u043A\u0430\u0437\u0443",
  "reset-title": "\u0412\u043E\u0441\u0441\u0442\u0430\u043D\u043E\u0432\u0438\u0442\u044C \u0432\u0441\u0435 \u044F\u0440\u043B\u044B\u043A\u0438 \u043F\u043E \u0443\u043C\u043E\u043B\u0447\u0430\u043D\u0438\u044E?",
  "reset-description": "\u0412\u043E\u0441\u0441\u0442\u0430\u043D\u043E\u0432\u0438\u0442\u0435 \u044F\u0440\u043B\u044B\u043A\u0438 \u043F\u043E \u0443\u043C\u043E\u043B\u0447\u0430\u043D\u0438\u044E \u0434\u043B\u044F \u044D\u0442\u043E\u0439 \u043F\u043B\u0430\u0442\u0444\u043E\u0440\u043C\u044B. \u0412\u0441\u0435 \u0438\u0437\u043C\u0435\u043D\u0435\u043D\u043D\u044B\u0435 \u0438\u043B\u0438 \u0443\u0434\u0430\u043B\u0435\u043D\u043D\u044B\u0435 \u044F\u0440\u043B\u044B\u043A\u0438 \u0431\u0443\u0434\u0443\u0442 \u0432\u043E\u0441\u0441\u0442\u0430\u043D\u043E\u0432\u043B\u0435\u043D\u044B. \u0414\u0440\u0443\u0433\u0438\u0435 \u043F\u043B\u0430\u0442\u0444\u043E\u0440\u043C\u044B \u043D\u0435 \u0437\u0430\u0442\u0440\u043E\u043D\u0443\u0442\u044B.",
  cancel: "\u041E\u0442\u043C\u0435\u043D\u0430",
  "reset-saved": "\u042F\u0440\u043B\u044B\u043A\u0438 \u043F\u043E \u0443\u043C\u043E\u043B\u0447\u0430\u043D\u0438\u044E \u0432\u043E\u0441\u0441\u0442\u0430\u043D\u043E\u0432\u043B\u0435\u043D\u044B.",
  "close-confirmation": "\u0417\u0430\u043A\u0440\u044B\u0442\u044C \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043D\u0438\u0435",
  "reset-failed": "\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u0432\u043E\u0441\u0441\u0442\u0430\u043D\u043E\u0432\u0438\u0442\u044C \u043D\u0430\u0441\u0442\u0440\u043E\u0439\u043A\u0438 \u043F\u043E \u0443\u043C\u043E\u043B\u0447\u0430\u043D\u0438\u044E. \u0412\u0430\u0448\u0438 \u044F\u0440\u043B\u044B\u043A\u0438 \u043D\u0435 \u0438\u0437\u043C\u0435\u043D\u0438\u043B\u0438\u0441\u044C. \u041F\u043E\u0436\u0430\u043B\u0443\u0439\u0441\u0442\u0430, \u043F\u043E\u0432\u0442\u043E\u0440\u0438\u0442\u0435 \u043F\u043E\u043F\u044B\u0442\u043A\u0443.",
  review: "\u042F \u0440\u0430\u0441\u0441\u043C\u043E\u0442\u0440\u0435\u043B \u043F\u043E\u0441\u043B\u0435\u0434\u043D\u044E\u044E \u043A\u043E\u043D\u0444\u0438\u0433\u0443\u0440\u0430\u0446\u0438\u044E",
  stale: "\u041A\u043E\u043D\u0444\u0438\u0433\u0443\u0440\u0430\u0446\u0438\u044F \u044F\u0440\u043B\u044B\u043A\u0430 \u0438\u043B\u0438 \u0434\u043E\u0441\u0442\u0443\u043F\u043D\u044B\u0435 \u043A\u043E\u043C\u0430\u043D\u0434\u044B \u0438\u0437\u043C\u0435\u043D\u0435\u043D\u044B. \u041F\u0435\u0440\u0435\u0434 \u0441\u043E\u0445\u0440\u0430\u043D\u0435\u043D\u0438\u0435\u043C \u043F\u0440\u043E\u0441\u043C\u043E\u0442\u0440\u0438\u0442\u0435 \u043F\u043E\u0441\u043B\u0435\u0434\u043D\u0438\u0435 \u043F\u0440\u0438\u0432\u044F\u0437\u043A\u0438.",
  "write-failed": "\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u0441\u043E\u0445\u0440\u0430\u043D\u0438\u0442\u044C. \u0412\u0430\u0448\u0438 \u043F\u0440\u0435\u0434\u044B\u0434\u0443\u0449\u0438\u0435 \u044F\u0440\u043B\u044B\u043A\u0438 \u0438 \u0442\u0435\u043A\u0443\u0449\u0438\u0439 \u0447\u0435\u0440\u043D\u043E\u0432\u0438\u043A \u0441\u043E\u0445\u0440\u0430\u043D\u044F\u044E\u0442\u0441\u044F. \u041F\u043E\u0436\u0430\u043B\u0443\u0439\u0441\u0442\u0430, \u043F\u043E\u0432\u0442\u043E\u0440\u0438\u0442\u0435 \u043F\u043E\u043F\u044B\u0442\u043A\u0443.",
  "not-ready": "\u042F\u0440\u043B\u044B\u043A\u0438 \u043D\u0435 \u0433\u043E\u0442\u043E\u0432\u044B. \u041F\u043E\u0436\u0430\u043B\u0443\u0439\u0441\u0442\u0430, \u043F\u043E\u043F\u0440\u043E\u0431\u0443\u0439\u0442\u0435 \u0435\u0449\u0435 \u0440\u0430\u0437.",
  read: "\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u043F\u0440\u043E\u0447\u0438\u0442\u0430\u0442\u044C {location}. \u041F\u0440\u043E\u0432\u0435\u0440\u044C\u0442\u0435 \u043F\u0440\u0430\u0432\u0430 \u0434\u043E\u0441\u0442\u0443\u043F\u0430, \u0437\u0430\u0442\u0435\u043C {reload}.",
  invalid: "\u041A\u043E\u043D\u0444\u0438\u0433\u0443\u0440\u0430\u0446\u0438\u044F \u044F\u0440\u043B\u044B\u043A\u0430 \u0432 {location} \u043F\u043E\u0432\u0440\u0435\u0436\u0434\u0435\u043D\u0430. \u0421\u043E\u0437\u0434\u0430\u0439\u0442\u0435 \u0440\u0435\u0437\u0435\u0440\u0432\u043D\u0443\u044E \u043A\u043E\u043F\u0438\u044E \u0438 \u0438\u0441\u043F\u0440\u0430\u0432\u044C\u0442\u0435 \u044D\u0442\u0443 \u043A\u043E\u043D\u0444\u0438\u0433\u0443\u0440\u0430\u0446\u0438\u044E, \u0437\u0430\u0442\u0435\u043C {reload}.",
  future: "\u041A\u043E\u043D\u0444\u0438\u0433\u0443\u0440\u0430\u0446\u0438\u044F \u044F\u0440\u043B\u044B\u043A\u0430 \u0432 {location} \u0431\u044B\u043B\u0430 \u0441\u043E\u0437\u0434\u0430\u043D\u0430 \u0431\u043E\u043B\u0435\u0435 \u043D\u043E\u0432\u043E\u0439 \u0432\u0435\u0440\u0441\u0438\u0435\u0439. \u041E\u0431\u043D\u043E\u0432\u0438\u0442\u0435 Harness \u0438 \u043F\u043E\u0432\u0442\u043E\u0440\u0438\u0442\u0435 \u043F\u043E\u043F\u044B\u0442\u043A\u0443.",
  "web-document": "\u0437\u0430\u043F\u0438\u0441\u044C localStorage \u044D\u0442\u043E\u0433\u043E \u0441\u0430\u0439\u0442\u0430 dsh.keybindings.v1",
  "desktop-document": "userData/keybindings.json",
  "web-reload": "\u043F\u0435\u0440\u0435\u0437\u0430\u0433\u0440\u0443\u0437\u0438\u0442\u044C \u0441\u0442\u0440\u0430\u043D\u0438\u0446\u0443",
  "desktop-reload": "\u043F\u0435\u0440\u0435\u0437\u0430\u043F\u0443\u0441\u0442\u0438\u0442\u044C Harness",
  "using-defaults": "\u041F\u0440\u0438\u0432\u044F\u0437\u043A\u0438 \u043F\u043E \u0443\u043C\u043E\u043B\u0447\u0430\u043D\u0438\u044E \u0430\u043A\u0442\u0438\u0432\u043D\u044B.",
  "using-accepted": "\u041F\u043E\u0441\u043B\u0435\u0434\u043D\u0438\u0435 \u0443\u0441\u043F\u0435\u0448\u043D\u043E \u043F\u0440\u043E\u0447\u0438\u0442\u0430\u043D\u043D\u044B\u0435 \u043F\u0440\u0438\u0432\u044F\u0437\u043A\u0438 \u043E\u0441\u0442\u0430\u044E\u0442\u0441\u044F \u0430\u043A\u0442\u0438\u0432\u043D\u044B\u043C\u0438.",
  "native-failed": "\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u0437\u0430\u0449\u0438\u0442\u0438\u0442\u044C \u0437\u0430\u043F\u0438\u0441\u044C \u043A\u043B\u0430\u0432\u0438\u0448 \u0440\u0430\u0431\u043E\u0447\u0435\u0433\u043E \u0441\u0442\u043E\u043B\u0430. \u0412\u044B\u0439\u0434\u0438\u0442\u0435 \u0438\u0437 \u0437\u0430\u043F\u0438\u0441\u0438 \u0438 \u043F\u043E\u0432\u0442\u043E\u0440\u0438\u0442\u0435 \u043F\u043E\u043F\u044B\u0442\u043A\u0443.",
  "global-hint": "\u041E\u0442\u043A\u0440\u044B\u0442\u043E \u0438\u0437 \u043B\u044E\u0431\u043E\u0433\u043E \u043C\u0435\u0441\u0442\u0430",
  "clear-search": "\u041E\u0447\u0438\u0441\u0442\u0438\u0442\u044C \u043F\u043E\u0438\u0441\u043A",
  title: "\u0421\u043E\u0447\u0435\u0442\u0430\u043D\u0438\u044F \u043A\u043B\u0430\u0432\u0438\u0448",
  open: "\u041E\u0442\u043A\u0440\u044B\u0442\u0438\u0435 \u0441\u043E\u0447\u0435\u0442\u0430\u043D\u0438\u0439 \u043A\u043B\u0430\u0432\u0438\u0448",
  settings: "\u0421\u043E\u0447\u0435\u0442\u0430\u043D\u0438\u044F \u043A\u043B\u0430\u0432\u0438\u0448",
  view: "\u0420\u0435\u0434\u0430\u043A\u0442\u0438\u0440\u043E\u0432\u0430\u0442\u044C \u044F\u0440\u043B\u044B\u043A\u0438",
  description: "\u041F\u0440\u043E\u0441\u043C\u043E\u0442\u0440 \u0438 \u0440\u0435\u0434\u0430\u043A\u0442\u0438\u0440\u043E\u0432\u0430\u043D\u0438\u0435 \u0434\u043E\u0441\u0442\u0443\u043F\u043D\u044B\u0445 \u044F\u0440\u043B\u044B\u043A\u043E\u0432 \u0438 \u0434\u0435\u0439\u0441\u0442\u0432\u0438\u0439 \u0432\u0432\u043E\u0434\u0430",
  search: "\u041F\u043E\u0438\u0441\u043A \u044F\u0440\u043B\u044B\u043A\u043E\u0432",
  close: "\u0417\u0430\u043A\u0440\u044B\u0442\u044C \u0441\u043E\u0447\u0435\u0442\u0430\u043D\u0438\u044F \u043A\u043B\u0430\u0432\u0438\u0448",
  application: "\u041F\u0440\u0438\u043B\u043E\u0436\u0435\u043D\u0438\u0435",
  input: "\u0412\u0432\u043E\u0434 \u0441\u043E\u043E\u0431\u0449\u0435\u043D\u0438\u044F",
  menus: "\u041C\u0435\u043D\u044E \u0438 \u0434\u0438\u0430\u043B\u043E\u0433\u0438",
  approval: "\u041E\u0431\u043B\u0430\u0441\u0442\u044C \u0443\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043D\u0438\u044F",
  unbound: "\u041D\u0435\u0442 \u044F\u0440\u043B\u044B\u043A\u0430",
  empty: "\u041D\u0435\u0442 \u043F\u043E\u0434\u0445\u043E\u0434\u044F\u0449\u0438\u0445 \u044F\u0440\u043B\u044B\u043A\u043E\u0432",
  move: "\u041F\u0435\u0440\u0435\u043C\u0435\u0441\u0442\u0438\u0442\u044C \u0432\u044B\u0431\u043E\u0440 \u043C\u0435\u043D\u044E",
  select: "\u0412\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u043F\u0443\u043D\u043A\u0442 \u043C\u0435\u043D\u044E",
  dismiss: "\u0417\u0430\u043A\u0440\u044B\u0442\u044C \u043C\u0435\u043D\u044E \u0438\u043B\u0438 \u0432\u0435\u0440\u0445\u043D\u0438\u0439 \u0434\u0438\u0430\u043B\u043E\u0433"
};
var pt = {
  "edit-label": "Editar atalho para {command}",
  record: "Pressione um atalho",
  "record-help": "Solte as teclas para salvar. A guia se move entre as a\xE7\xF5es; Esc cancela.",
  "web-help": "Combina\xE7\xF5es de navegador: Mod+/, Mod+Shift+,, Mod+Shift+.. Mod \xE9 Command no Mac e Ctrl em outros lugares.",
  "unsupported-key": "Esta chave n\xE3o \xE9 suportada.",
  reserved: "Esta combina\xE7\xE3o \xE9 reservada para a\xE7\xF5es de sistema ou edi\xE7\xE3o de texto.",
  "modifier-required": "Inclua Command, Ctrl ou Alt na combina\xE7\xE3o.",
  "too-many-keys": "Segure no m\xE1ximo duas teclas n\xE3o modificadoras. Solte as teclas para tentar novamente.",
  "macos-web-help": "Use Command+/, Command+,, Command+Barra invertida, Control+Backquote, Command+Option+key ou Command+Shift+key. Combina\xE7\xF5es com tr\xEAs ou quatro modificadores distintos tamb\xE9m s\xE3o suportadas. Os atalhos do navegador ou do sistema podem n\xE3o chegar \xE0 p\xE1gina.",
  "windows-web-help": "Use Ctrl+/, Ctrl+,, Ctrl+Alt+tecla ou Ctrl+Shift+tecla. Combina\xE7\xF5es com tr\xEAs ou quatro modificadores distintos tamb\xE9m s\xE3o suportadas. Os atalhos do navegador ou do sistema podem n\xE3o chegar \xE0 p\xE1gina.",
  "unsupported-browser": "Este navegador ainda n\xE3o suporta esta combina\xE7\xE3o.",
  conflict: "J\xE1 usado por \u201C{commands}\u201D",
  saved: "Modificado",
  clear: "Remover",
  "retry-save": "Tentar salvar novamente",
  reset: "Restaurar padr\xE3o",
  "reset-all": "Restaurar todos os padr\xF5es",
  "modified-count": "{count} personalizado",
  "reset-title": "Restaurar todos os atalhos padr\xE3o?",
  "reset-description": "Restaure os atalhos padr\xE3o desta plataforma. Todos os atalhos modificados ou removidos ser\xE3o restaurados. Outras plataformas n\xE3o s\xE3o afetadas.",
  cancel: "Cancelar",
  "reset-saved": "Atalhos padr\xE3o restaurados",
  "close-confirmation": "Fechar confirma\xE7\xE3o",
  "reset-failed": "N\xE3o foi poss\xEDvel restaurar os padr\xF5es. Seus atalhos permanecem inalterados. Por favor, tente novamente.",
  review: "Eu revisei a configura\xE7\xE3o mais recente",
  stale: "Configura\xE7\xE3o de atalhos ou comandos dispon\xEDveis alterados. Revise as liga\xE7\xF5es mais recentes antes de salvar.",
  "write-failed": "N\xE3o foi poss\xEDvel salvar. Seus atalhos anteriores e o rascunho atual ser\xE3o preservados. Por favor, tente novamente.",
  "not-ready": "Os atalhos n\xE3o est\xE3o prontos. Por favor, tente novamente.",
  read: "N\xE3o foi poss\xEDvel ler {location}. Verifique as permiss\xF5es de acesso e depois {reload}.",
  invalid: "A configura\xE7\xE3o do atalho em {location} est\xE1 danificada. Fa\xE7a backup e repare esta configura\xE7\xE3o e ent\xE3o {reload}.",
  future: "A configura\xE7\xE3o do atalho em {location} foi criada por uma vers\xE3o mais recente. Atualize o Harness e tente novamente.",
  "web-document": "a entrada localStorage deste site dsh.keybindings.v1",
  "desktop-document": "userData/keybindings.json",
  "web-reload": "recarregar a p\xE1gina",
  "desktop-reload": "reinicie o chicote",
  "using-defaults": "As liga\xE7\xF5es padr\xE3o est\xE3o ativas.",
  "using-accepted": "As \xFAltimas liga\xE7\xF5es lidas com sucesso permanecem ativas.",
  "native-failed": "N\xE3o foi poss\xEDvel proteger a grava\xE7\xE3o de teclas da \xE1rea de trabalho. Saia da grava\xE7\xE3o e tente novamente.",
  "global-hint": "Abra de qualquer lugar",
  "clear-search": "Limpar pesquisa",
  title: "Atalhos de teclado",
  open: "Abra atalhos de teclado",
  settings: "Atalhos de teclado",
  view: "Editar atalhos",
  description: "Visualize e edite atalhos e a\xE7\xF5es de entrada dispon\xEDveis",
  search: "Atalhos de pesquisa",
  close: "Fechar atalhos de teclado",
  application: "Aplica\xE7\xE3o",
  input: "Entrada de mensagem",
  menus: "Menus e caixas de di\xE1logo",
  approval: "\xC1rea de aprova\xE7\xE3o",
  unbound: "Sem atalho",
  empty: "Nenhum atalho correspondente",
  move: "Mover sele\xE7\xE3o de menu",
  select: "Selecione o item do menu",
  dismiss: "Fechar menu ou caixa de di\xE1logo superior"
};

// upstream/packages/client/ui-shortcuts/src/client/fixed.ts.snapshot
function fixedCommands(t) {
  const rows = [
    { id: "move", keys: ["\u2191", "\u2193"], bindings: [{ code: "ArrowUp", modifiers: [] }, { code: "ArrowDown", modifiers: [] }], group: "menus" },
    { id: "select", keys: ["Enter"], bindings: [{ code: "Enter", modifiers: [] }], group: "menus" },
    { id: "dismiss", keys: ["Esc"], bindings: [{ code: "Escape", modifiers: [] }], group: "menus" }
  ];
  return rows.map((row) => ({ ...row, id: `fixed.${row.id}`, label: () => t(row.id) }));
}

// upstream/packages/client/ui-shortcuts/src/client/index.ts.snapshot
var inject = ["shortcuts", "locale", "slots"];
function apply(ctx) {
  ctx.effect(() => ctx.locale.register("shortcuts", { zh, en, ja, es, fr, de, ru, pt }), "shortcuts: dictionaries");
  const t = ctx.locale.bind("shortcuts");
  const handle = createShortcutsStore();
  const instance = handle.create();
  const store = { ...handle, create: () => instance };
  const edit = (...args) => ctx.shortcuts.edit(...args);
  const recording = (active) => ctx.shortcuts.recording(active);
  const describeBinding = (binding) => ctx.shortcuts.describeBinding(binding);
  for (const command of fixedCommands(t)) {
    ctx.effect(() => ctx.shortcuts.registerFixed(command), `shortcuts: ${command.id}`);
  }
  const injected = () => ({
    platform: ctx.shortcuts.platform,
    runtime: ctx.shortcuts.runtime,
    edit,
    recording,
    describeBinding,
    hooks: { catalog: ctx.shortcuts.catalog, config: ctx.shortcuts.config, fixedCatalog: ctx.shortcuts.fixedCatalog }
  });
  ctx.slots.inject("settings.general.item", () => ctx.slots.register({
    name: "settings.general.item",
    id: "shortcuts",
    order: 16,
    locale: "shortcuts",
    store,
    inject: injected
  }, ShortcutsRow));
  ctx.slots.inject("shell.overlay", () => {
    const disposeCommand = ctx.shortcuts.register({
      id: "shortcuts.open",
      label: () => t("open"),
      aliases: ["shortcuts", "keyboard shortcuts"],
      defaults: {
        "desktop:macos": { code: "Slash", modifiers: ["primary"] },
        "desktop:windows": { code: "Slash", modifiers: ["primary"] },
        "desktop:linux": { code: "Slash", modifiers: ["primary"] },
        "web:macos": { code: "Slash", modifiers: ["primary"] },
        "web:windows": { code: "Slash", modifiers: ["primary"] },
        "web:linux": { code: "Slash", modifiers: ["primary"] }
      },
      regions: ["page", "editable", "terminal"],
      modals: ["settings", "shortcuts"],
      resolve: ({ modal }) => {
        if (modal !== null && modal !== "settings" && modal !== "shortcuts") return { status: "blocked", reason: "modal" };
        return { status: "handled", run: () => {
          if (modal === "shortcuts") closeTopModal(document);
          else instance.actions.open();
        } };
      }
    });
    const disposeSlot = ctx.slots.register({
      name: "shell.overlay",
      id: "shortcuts",
      locale: "shortcuts",
      store,
      inject: injected
    }, ShortcutReference);
    return () => {
      disposeCommand();
      disposeSlot();
    };
  });
}

// upstream/packages/client/ui-file-actions/src/client/index.ts.snapshot
var index_ts_exports2 = {};
__export(index_ts_exports2, {
  apply: () => apply2,
  inject: () => inject2
});

// upstream/packages/util/workspace-path/src/index.ts.snapshot
function isWindowsStylePath(value) {
  return /^[A-Za-z]:[/\\]/.test(value) || value.startsWith("\\\\");
}
function isAbsoluteWorkspacePath(path) {
  return path.startsWith("/") || isWindowsStylePath(path);
}
function fileMediaUrl(base, path) {
  if (!/^https?:/u.test(base) && !base.startsWith("dsh-app://app/") || !isAbsoluteWorkspacePath(path) || /^[/\\]{2}/u.test(path) || /[\u0000-\u001f\u007f]/u.test(path)) return void 0;
  return new URL(`api/file?path=${encodeURIComponent(path)}`, base).href;
}

// ../../node_modules/.pnpm/mime@4.1.1/node_modules/mime/dist/types/other.js
var types = {
  "application/prs.cww": ["cww"],
  "application/prs.xsf+xml": ["xsf"],
  "application/vnd.1000minds.decision-model+xml": ["1km"],
  "application/vnd.3gpp.pic-bw-large": ["plb"],
  "application/vnd.3gpp.pic-bw-small": ["psb"],
  "application/vnd.3gpp.pic-bw-var": ["pvb"],
  "application/vnd.3gpp2.tcap": ["tcap"],
  "application/vnd.3m.post-it-notes": ["pwn"],
  "application/vnd.accpac.simply.aso": ["aso"],
  "application/vnd.accpac.simply.imp": ["imp"],
  "application/vnd.acucobol": ["acu"],
  "application/vnd.acucorp": ["atc", "acutc"],
  "application/vnd.adobe.air-application-installer-package+zip": ["air"],
  "application/vnd.adobe.formscentral.fcdt": ["fcdt"],
  "application/vnd.adobe.fxp": ["fxp", "fxpl"],
  "application/vnd.adobe.xdp+xml": ["xdp"],
  "application/vnd.adobe.xfdf": ["*xfdf"],
  "application/vnd.age": ["age"],
  "application/vnd.ahead.space": ["ahead"],
  "application/vnd.airzip.filesecure.azf": ["azf"],
  "application/vnd.airzip.filesecure.azs": ["azs"],
  "application/vnd.amazon.ebook": ["azw"],
  "application/vnd.americandynamics.acc": ["acc"],
  "application/vnd.amiga.ami": ["ami"],
  "application/vnd.android.package-archive": ["apk"],
  "application/vnd.anser-web-certificate-issue-initiation": ["cii"],
  "application/vnd.anser-web-funds-transfer-initiation": ["fti"],
  "application/vnd.antix.game-component": ["atx"],
  "application/vnd.apple.installer+xml": ["mpkg"],
  "application/vnd.apple.keynote": ["key"],
  "application/vnd.apple.mpegurl": ["m3u8"],
  "application/vnd.apple.numbers": ["numbers"],
  "application/vnd.apple.pages": ["pages"],
  "application/vnd.apple.pkpass": ["pkpass"],
  "application/vnd.aristanetworks.swi": ["swi"],
  "application/vnd.astraea-software.iota": ["iota"],
  "application/vnd.audiograph": ["aep"],
  "application/vnd.autodesk.fbx": ["fbx"],
  "application/vnd.balsamiq.bmml+xml": ["bmml"],
  "application/vnd.blueice.multipass": ["mpm"],
  "application/vnd.bmi": ["bmi"],
  "application/vnd.businessobjects": ["rep"],
  "application/vnd.chemdraw+xml": ["cdxml"],
  "application/vnd.chipnuts.karaoke-mmd": ["mmd"],
  "application/vnd.cinderella": ["cdy"],
  "application/vnd.citationstyles.style+xml": ["csl"],
  "application/vnd.claymore": ["cla"],
  "application/vnd.cloanto.rp9": ["rp9"],
  "application/vnd.clonk.c4group": ["c4g", "c4d", "c4f", "c4p", "c4u"],
  "application/vnd.cluetrust.cartomobile-config": ["c11amc"],
  "application/vnd.cluetrust.cartomobile-config-pkg": ["c11amz"],
  "application/vnd.commonspace": ["csp"],
  "application/vnd.contact.cmsg": ["cdbcmsg"],
  "application/vnd.cosmocaller": ["cmc"],
  "application/vnd.crick.clicker": ["clkx"],
  "application/vnd.crick.clicker.keyboard": ["clkk"],
  "application/vnd.crick.clicker.palette": ["clkp"],
  "application/vnd.crick.clicker.template": ["clkt"],
  "application/vnd.crick.clicker.wordbank": ["clkw"],
  "application/vnd.criticaltools.wbs+xml": ["wbs"],
  "application/vnd.ctc-posml": ["pml"],
  "application/vnd.cups-ppd": ["ppd"],
  "application/vnd.curl.car": ["car"],
  "application/vnd.curl.pcurl": ["pcurl"],
  "application/vnd.dart": ["dart"],
  "application/vnd.data-vision.rdz": ["rdz"],
  "application/vnd.dbf": ["dbf"],
  "application/vnd.dcmp+xml": ["dcmp"],
  "application/vnd.dece.data": ["uvf", "uvvf", "uvd", "uvvd"],
  "application/vnd.dece.ttml+xml": ["uvt", "uvvt"],
  "application/vnd.dece.unspecified": ["uvx", "uvvx"],
  "application/vnd.dece.zip": ["uvz", "uvvz"],
  "application/vnd.denovo.fcselayout-link": ["fe_launch"],
  "application/vnd.dna": ["dna"],
  "application/vnd.dolby.mlp": ["mlp"],
  "application/vnd.dpgraph": ["dpg"],
  "application/vnd.dreamfactory": ["dfac"],
  "application/vnd.ds-keypoint": ["kpxx"],
  "application/vnd.dvb.ait": ["ait"],
  "application/vnd.dvb.service": ["svc"],
  "application/vnd.dynageo": ["geo"],
  "application/vnd.ecowin.chart": ["mag"],
  "application/vnd.enliven": ["nml"],
  "application/vnd.epson.esf": ["esf"],
  "application/vnd.epson.msf": ["msf"],
  "application/vnd.epson.quickanime": ["qam"],
  "application/vnd.epson.salt": ["slt"],
  "application/vnd.epson.ssf": ["ssf"],
  "application/vnd.eszigno3+xml": ["es3", "et3"],
  "application/vnd.ezpix-album": ["ez2"],
  "application/vnd.ezpix-package": ["ez3"],
  "application/vnd.fdf": ["*fdf"],
  "application/vnd.fdsn.mseed": ["mseed"],
  "application/vnd.fdsn.seed": ["seed", "dataless"],
  "application/vnd.flographit": ["gph"],
  "application/vnd.fluxtime.clip": ["ftc"],
  "application/vnd.framemaker": ["fm", "frame", "maker", "book"],
  "application/vnd.frogans.fnc": ["fnc"],
  "application/vnd.frogans.ltf": ["ltf"],
  "application/vnd.fsc.weblaunch": ["fsc"],
  "application/vnd.fujitsu.oasys": ["oas"],
  "application/vnd.fujitsu.oasys2": ["oa2"],
  "application/vnd.fujitsu.oasys3": ["oa3"],
  "application/vnd.fujitsu.oasysgp": ["fg5"],
  "application/vnd.fujitsu.oasysprs": ["bh2"],
  "application/vnd.fujixerox.ddd": ["ddd"],
  "application/vnd.fujixerox.docuworks": ["xdw"],
  "application/vnd.fujixerox.docuworks.binder": ["xbd"],
  "application/vnd.fuzzysheet": ["fzs"],
  "application/vnd.genomatix.tuxedo": ["txd"],
  "application/vnd.geogebra.file": ["ggb"],
  "application/vnd.geogebra.slides": ["ggs"],
  "application/vnd.geogebra.tool": ["ggt"],
  "application/vnd.geometry-explorer": ["gex", "gre"],
  "application/vnd.geonext": ["gxt"],
  "application/vnd.geoplan": ["g2w"],
  "application/vnd.geospace": ["g3w"],
  "application/vnd.gmx": ["gmx"],
  "application/vnd.google-apps.document": ["gdoc"],
  "application/vnd.google-apps.drawing": ["gdraw"],
  "application/vnd.google-apps.form": ["gform"],
  "application/vnd.google-apps.jam": ["gjam"],
  "application/vnd.google-apps.map": ["gmap"],
  "application/vnd.google-apps.presentation": ["gslides"],
  "application/vnd.google-apps.script": ["gscript"],
  "application/vnd.google-apps.site": ["gsite"],
  "application/vnd.google-apps.spreadsheet": ["gsheet"],
  "application/vnd.google-earth.kml+xml": ["kml"],
  "application/vnd.google-earth.kmz": ["kmz"],
  "application/vnd.gov.sk.xmldatacontainer+xml": ["xdcf"],
  "application/vnd.grafeq": ["gqf", "gqs"],
  "application/vnd.groove-account": ["gac"],
  "application/vnd.groove-help": ["ghf"],
  "application/vnd.groove-identity-message": ["gim"],
  "application/vnd.groove-injector": ["grv"],
  "application/vnd.groove-tool-message": ["gtm"],
  "application/vnd.groove-tool-template": ["tpl"],
  "application/vnd.groove-vcard": ["vcg"],
  "application/vnd.hal+xml": ["hal"],
  "application/vnd.handheld-entertainment+xml": ["zmm"],
  "application/vnd.hbci": ["hbci"],
  "application/vnd.hhe.lesson-player": ["les"],
  "application/vnd.hp-hpgl": ["hpgl"],
  "application/vnd.hp-hpid": ["hpid"],
  "application/vnd.hp-hps": ["hps"],
  "application/vnd.hp-jlyt": ["jlt"],
  "application/vnd.hp-pcl": ["pcl"],
  "application/vnd.hp-pclxl": ["pclxl"],
  "application/vnd.hydrostatix.sof-data": ["sfd-hdstx"],
  "application/vnd.ibm.minipay": ["mpy"],
  "application/vnd.ibm.modcap": ["afp", "listafp", "list3820"],
  "application/vnd.ibm.rights-management": ["irm"],
  "application/vnd.ibm.secure-container": ["sc"],
  "application/vnd.iccprofile": ["icc", "icm"],
  "application/vnd.igloader": ["igl"],
  "application/vnd.immervision-ivp": ["ivp"],
  "application/vnd.immervision-ivu": ["ivu"],
  "application/vnd.insors.igm": ["igm"],
  "application/vnd.intercon.formnet": ["xpw", "xpx"],
  "application/vnd.intergeo": ["i2g"],
  "application/vnd.intu.qbo": ["qbo"],
  "application/vnd.intu.qfx": ["qfx"],
  "application/vnd.ipunplugged.rcprofile": ["rcprofile"],
  "application/vnd.irepository.package+xml": ["irp"],
  "application/vnd.is-xpr": ["xpr"],
  "application/vnd.isac.fcs": ["fcs"],
  "application/vnd.jam": ["jam"],
  "application/vnd.jcp.javame.midlet-rms": ["rms"],
  "application/vnd.jisp": ["jisp"],
  "application/vnd.joost.joda-archive": ["joda"],
  "application/vnd.kahootz": ["ktz", "ktr"],
  "application/vnd.kde.karbon": ["karbon"],
  "application/vnd.kde.kchart": ["chrt"],
  "application/vnd.kde.kformula": ["kfo"],
  "application/vnd.kde.kivio": ["flw"],
  "application/vnd.kde.kontour": ["kon"],
  "application/vnd.kde.kpresenter": ["kpr", "kpt"],
  "application/vnd.kde.kspread": ["ksp"],
  "application/vnd.kde.kword": ["kwd", "kwt"],
  "application/vnd.kenameaapp": ["htke"],
  "application/vnd.kidspiration": ["kia"],
  "application/vnd.kinar": ["kne", "knp"],
  "application/vnd.koan": ["skp", "skd", "skt", "skm"],
  "application/vnd.kodak-descriptor": ["sse"],
  "application/vnd.las.las+xml": ["lasxml"],
  "application/vnd.llamagraphics.life-balance.desktop": ["lbd"],
  "application/vnd.llamagraphics.life-balance.exchange+xml": ["lbe"],
  "application/vnd.lotus-1-2-3": ["123"],
  "application/vnd.lotus-approach": ["apr"],
  "application/vnd.lotus-freelance": ["pre"],
  "application/vnd.lotus-notes": ["nsf"],
  "application/vnd.lotus-organizer": ["org"],
  "application/vnd.lotus-screencam": ["scm"],
  "application/vnd.lotus-wordpro": ["lwp"],
  "application/vnd.macports.portpkg": ["portpkg"],
  "application/vnd.mapbox-vector-tile": ["mvt"],
  "application/vnd.mcd": ["mcd"],
  "application/vnd.medcalcdata": ["mc1"],
  "application/vnd.mediastation.cdkey": ["cdkey"],
  "application/vnd.mfer": ["mwf"],
  "application/vnd.mfmp": ["mfm"],
  "application/vnd.micrografx.flo": ["flo"],
  "application/vnd.micrografx.igx": ["igx"],
  "application/vnd.mif": ["mif"],
  "application/vnd.mobius.daf": ["daf"],
  "application/vnd.mobius.dis": ["dis"],
  "application/vnd.mobius.mbk": ["mbk"],
  "application/vnd.mobius.mqy": ["mqy"],
  "application/vnd.mobius.msl": ["msl"],
  "application/vnd.mobius.plc": ["plc"],
  "application/vnd.mobius.txf": ["txf"],
  "application/vnd.mophun.application": ["mpn"],
  "application/vnd.mophun.certificate": ["mpc"],
  "application/vnd.mozilla.xul+xml": ["xul"],
  "application/vnd.ms-artgalry": ["cil"],
  "application/vnd.ms-cab-compressed": ["cab"],
  "application/vnd.ms-excel": ["xls", "xlm", "xla", "xlc", "xlt", "xlw"],
  "application/vnd.ms-excel.addin.macroenabled.12": ["xlam"],
  "application/vnd.ms-excel.sheet.binary.macroenabled.12": ["xlsb"],
  "application/vnd.ms-excel.sheet.macroenabled.12": ["xlsm"],
  "application/vnd.ms-excel.template.macroenabled.12": ["xltm"],
  "application/vnd.ms-fontobject": ["eot"],
  "application/vnd.ms-htmlhelp": ["chm"],
  "application/vnd.ms-ims": ["ims"],
  "application/vnd.ms-lrm": ["lrm"],
  "application/vnd.ms-officetheme": ["thmx"],
  "application/vnd.ms-outlook": ["msg"],
  "application/vnd.ms-pki.seccat": ["cat"],
  "application/vnd.ms-pki.stl": ["*stl"],
  "application/vnd.ms-powerpoint": ["ppt", "pps", "pot"],
  "application/vnd.ms-powerpoint.addin.macroenabled.12": ["ppam"],
  "application/vnd.ms-powerpoint.presentation.macroenabled.12": ["pptm"],
  "application/vnd.ms-powerpoint.slide.macroenabled.12": ["sldm"],
  "application/vnd.ms-powerpoint.slideshow.macroenabled.12": ["ppsm"],
  "application/vnd.ms-powerpoint.template.macroenabled.12": ["potm"],
  "application/vnd.ms-project": ["*mpp", "mpt"],
  "application/vnd.ms-visio.viewer": ["vdx"],
  "application/vnd.ms-word.document.macroenabled.12": ["docm"],
  "application/vnd.ms-word.template.macroenabled.12": ["dotm"],
  "application/vnd.ms-works": ["wps", "wks", "wcm", "wdb"],
  "application/vnd.ms-wpl": ["wpl"],
  "application/vnd.ms-xpsdocument": ["xps"],
  "application/vnd.mseq": ["mseq"],
  "application/vnd.musician": ["mus"],
  "application/vnd.muvee.style": ["msty"],
  "application/vnd.mynfc": ["taglet"],
  "application/vnd.nato.bindingdataobject+xml": ["bdo"],
  "application/vnd.neurolanguage.nlu": ["nlu"],
  "application/vnd.nitf": ["ntf", "nitf"],
  "application/vnd.noblenet-directory": ["nnd"],
  "application/vnd.noblenet-sealer": ["nns"],
  "application/vnd.noblenet-web": ["nnw"],
  "application/vnd.nokia.n-gage.ac+xml": ["*ac"],
  "application/vnd.nokia.n-gage.data": ["ngdat"],
  "application/vnd.nokia.n-gage.symbian.install": ["n-gage"],
  "application/vnd.nokia.radio-preset": ["rpst"],
  "application/vnd.nokia.radio-presets": ["rpss"],
  "application/vnd.novadigm.edm": ["edm"],
  "application/vnd.novadigm.edx": ["edx"],
  "application/vnd.novadigm.ext": ["ext"],
  "application/vnd.oasis.opendocument.chart": ["odc"],
  "application/vnd.oasis.opendocument.chart-template": ["otc"],
  "application/vnd.oasis.opendocument.database": ["odb"],
  "application/vnd.oasis.opendocument.formula": ["odf"],
  "application/vnd.oasis.opendocument.formula-template": ["odft"],
  "application/vnd.oasis.opendocument.graphics": ["odg"],
  "application/vnd.oasis.opendocument.graphics-template": ["otg"],
  "application/vnd.oasis.opendocument.image": ["odi"],
  "application/vnd.oasis.opendocument.image-template": ["oti"],
  "application/vnd.oasis.opendocument.presentation": ["odp"],
  "application/vnd.oasis.opendocument.presentation-template": ["otp"],
  "application/vnd.oasis.opendocument.spreadsheet": ["ods"],
  "application/vnd.oasis.opendocument.spreadsheet-template": ["ots"],
  "application/vnd.oasis.opendocument.text": ["odt"],
  "application/vnd.oasis.opendocument.text-master": ["odm"],
  "application/vnd.oasis.opendocument.text-template": ["ott"],
  "application/vnd.oasis.opendocument.text-web": ["oth"],
  "application/vnd.olpc-sugar": ["xo"],
  "application/vnd.oma.dd2+xml": ["dd2"],
  "application/vnd.openblox.game+xml": ["obgx"],
  "application/vnd.openofficeorg.extension": ["oxt"],
  "application/vnd.openstreetmap.data+xml": ["osm"],
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": [
    "pptx"
  ],
  "application/vnd.openxmlformats-officedocument.presentationml.slide": [
    "sldx"
  ],
  "application/vnd.openxmlformats-officedocument.presentationml.slideshow": [
    "ppsx"
  ],
  "application/vnd.openxmlformats-officedocument.presentationml.template": [
    "potx"
  ],
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ["xlsx"],
  "application/vnd.openxmlformats-officedocument.spreadsheetml.template": [
    "xltx"
  ],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [
    "docx"
  ],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.template": [
    "dotx"
  ],
  "application/vnd.osgeo.mapguide.package": ["mgp"],
  "application/vnd.osgi.dp": ["dp"],
  "application/vnd.osgi.subsystem": ["esa"],
  "application/vnd.palm": ["pdb", "pqa", "oprc"],
  "application/vnd.pawaafile": ["paw"],
  "application/vnd.pg.format": ["str"],
  "application/vnd.pg.osasli": ["ei6"],
  "application/vnd.picsel": ["efif"],
  "application/vnd.pmi.widget": ["wg"],
  "application/vnd.pocketlearn": ["plf"],
  "application/vnd.powerbuilder6": ["pbd"],
  "application/vnd.previewsystems.box": ["box"],
  "application/vnd.procrate.brushset": ["brushset"],
  "application/vnd.procreate.brush": ["brush"],
  "application/vnd.procreate.dream": ["drm"],
  "application/vnd.proteus.magazine": ["mgz"],
  "application/vnd.publishare-delta-tree": ["qps"],
  "application/vnd.pvi.ptid1": ["ptid"],
  "application/vnd.pwg-xhtml-print+xml": ["xhtm"],
  "application/vnd.quark.quarkxpress": [
    "qxd",
    "qxt",
    "qwd",
    "qwt",
    "qxl",
    "qxb"
  ],
  "application/vnd.rar": ["rar"],
  "application/vnd.realvnc.bed": ["bed"],
  "application/vnd.recordare.musicxml": ["mxl"],
  "application/vnd.recordare.musicxml+xml": ["musicxml"],
  "application/vnd.rig.cryptonote": ["cryptonote"],
  "application/vnd.rim.cod": ["cod"],
  "application/vnd.rn-realmedia": ["rm"],
  "application/vnd.rn-realmedia-vbr": ["rmvb"],
  "application/vnd.route66.link66+xml": ["link66"],
  "application/vnd.sailingtracker.track": ["st"],
  "application/vnd.seemail": ["see"],
  "application/vnd.sema": ["sema"],
  "application/vnd.semd": ["semd"],
  "application/vnd.semf": ["semf"],
  "application/vnd.shana.informed.formdata": ["ifm"],
  "application/vnd.shana.informed.formtemplate": ["itp"],
  "application/vnd.shana.informed.interchange": ["iif"],
  "application/vnd.shana.informed.package": ["ipk"],
  "application/vnd.simtech-mindmapper": ["twd", "twds"],
  "application/vnd.smaf": ["mmf"],
  "application/vnd.smart.teacher": ["teacher"],
  "application/vnd.software602.filler.form+xml": ["fo"],
  "application/vnd.solent.sdkm+xml": ["sdkm", "sdkd"],
  "application/vnd.spotfire.dxp": ["dxp"],
  "application/vnd.spotfire.sfs": ["sfs"],
  "application/vnd.stardivision.calc": ["sdc"],
  "application/vnd.stardivision.draw": ["sda"],
  "application/vnd.stardivision.impress": ["sdd"],
  "application/vnd.stardivision.math": ["smf"],
  "application/vnd.stardivision.writer": ["sdw", "vor"],
  "application/vnd.stardivision.writer-global": ["sgl"],
  "application/vnd.stepmania.package": ["smzip"],
  "application/vnd.stepmania.stepchart": ["sm"],
  "application/vnd.sun.wadl+xml": ["wadl"],
  "application/vnd.sun.xml.calc": ["sxc"],
  "application/vnd.sun.xml.calc.template": ["stc"],
  "application/vnd.sun.xml.draw": ["sxd"],
  "application/vnd.sun.xml.draw.template": ["std"],
  "application/vnd.sun.xml.impress": ["sxi"],
  "application/vnd.sun.xml.impress.template": ["sti"],
  "application/vnd.sun.xml.math": ["sxm"],
  "application/vnd.sun.xml.writer": ["sxw"],
  "application/vnd.sun.xml.writer.global": ["sxg"],
  "application/vnd.sun.xml.writer.template": ["stw"],
  "application/vnd.sus-calendar": ["sus", "susp"],
  "application/vnd.svd": ["svd"],
  "application/vnd.symbian.install": ["sis", "sisx"],
  "application/vnd.syncml+xml": ["xsm"],
  "application/vnd.syncml.dm+wbxml": ["bdm"],
  "application/vnd.syncml.dm+xml": ["xdm"],
  "application/vnd.syncml.dmddf+xml": ["ddf"],
  "application/vnd.tao.intent-module-archive": ["tao"],
  "application/vnd.tcpdump.pcap": ["pcap", "cap", "dmp"],
  "application/vnd.tmobile-livetv": ["tmo"],
  "application/vnd.trid.tpt": ["tpt"],
  "application/vnd.triscape.mxs": ["mxs"],
  "application/vnd.trueapp": ["tra"],
  "application/vnd.ufdl": ["ufd", "ufdl"],
  "application/vnd.uiq.theme": ["utz"],
  "application/vnd.umajin": ["umj"],
  "application/vnd.unity": ["unityweb"],
  "application/vnd.uoml+xml": ["uoml", "uo"],
  "application/vnd.vcx": ["vcx"],
  "application/vnd.visio": ["vsd", "vst", "vss", "vsw", "vsdx", "vtx"],
  "application/vnd.visionary": ["vis"],
  "application/vnd.vsf": ["vsf"],
  "application/vnd.wap.wbxml": ["wbxml"],
  "application/vnd.wap.wmlc": ["wmlc"],
  "application/vnd.wap.wmlscriptc": ["wmlsc"],
  "application/vnd.webturbo": ["wtb"],
  "application/vnd.wolfram.player": ["nbp"],
  "application/vnd.wordperfect": ["wpd"],
  "application/vnd.wqd": ["wqd"],
  "application/vnd.wt.stf": ["stf"],
  "application/vnd.xara": ["xar"],
  "application/vnd.xfdl": ["xfdl"],
  "application/vnd.yamaha.hv-dic": ["hvd"],
  "application/vnd.yamaha.hv-script": ["hvs"],
  "application/vnd.yamaha.hv-voice": ["hvp"],
  "application/vnd.yamaha.openscoreformat": ["osf"],
  "application/vnd.yamaha.openscoreformat.osfpvg+xml": ["osfpvg"],
  "application/vnd.yamaha.smaf-audio": ["saf"],
  "application/vnd.yamaha.smaf-phrase": ["spf"],
  "application/vnd.yellowriver-custom-menu": ["cmp"],
  "application/vnd.zul": ["zir", "zirz"],
  "application/vnd.zzazz.deck+xml": ["zaz"],
  "application/x-7z-compressed": ["7z"],
  "application/x-abiword": ["abw"],
  "application/x-ace-compressed": ["ace"],
  "application/x-apple-diskimage": ["*dmg"],
  "application/x-arj": ["arj"],
  "application/x-authorware-bin": ["aab", "x32", "u32", "vox"],
  "application/x-authorware-map": ["aam"],
  "application/x-authorware-seg": ["aas"],
  "application/x-bcpio": ["bcpio"],
  "application/x-bdoc": ["*bdoc"],
  "application/x-bittorrent": ["torrent"],
  "application/x-blender": ["blend"],
  "application/x-blorb": ["blb", "blorb"],
  "application/x-bzip": ["bz"],
  "application/x-bzip2": ["bz2", "boz"],
  "application/x-cbr": ["cbr", "cba", "cbt", "cbz", "cb7"],
  "application/x-cdlink": ["vcd"],
  "application/x-cfs-compressed": ["cfs"],
  "application/x-chat": ["chat"],
  "application/x-chess-pgn": ["pgn"],
  "application/x-chrome-extension": ["crx"],
  "application/x-cocoa": ["cco"],
  "application/x-compressed": ["*rar"],
  "application/x-conference": ["nsc"],
  "application/x-cpio": ["cpio"],
  "application/x-csh": ["csh"],
  "application/x-debian-package": ["*deb", "udeb"],
  "application/x-dgc-compressed": ["dgc"],
  "application/x-director": [
    "dir",
    "dcr",
    "dxr",
    "cst",
    "cct",
    "cxt",
    "w3d",
    "fgd",
    "swa"
  ],
  "application/x-doom": ["wad"],
  "application/x-dtbncx+xml": ["ncx"],
  "application/x-dtbook+xml": ["dtb"],
  "application/x-dtbresource+xml": ["res"],
  "application/x-dvi": ["dvi"],
  "application/x-envoy": ["evy"],
  "application/x-eva": ["eva"],
  "application/x-font-bdf": ["bdf"],
  "application/x-font-ghostscript": ["gsf"],
  "application/x-font-linux-psf": ["psf"],
  "application/x-font-pcf": ["pcf"],
  "application/x-font-snf": ["snf"],
  "application/x-font-type1": ["pfa", "pfb", "pfm", "afm"],
  "application/x-freearc": ["arc"],
  "application/x-futuresplash": ["spl"],
  "application/x-gca-compressed": ["gca"],
  "application/x-glulx": ["ulx"],
  "application/x-gnumeric": ["gnumeric"],
  "application/x-gramps-xml": ["gramps"],
  "application/x-gtar": ["gtar"],
  "application/x-hdf": ["hdf"],
  "application/x-httpd-php": ["php"],
  "application/x-install-instructions": ["install"],
  "application/x-ipynb+json": ["ipynb"],
  "application/x-iso9660-image": ["*iso"],
  "application/x-iwork-keynote-sffkey": ["*key"],
  "application/x-iwork-numbers-sffnumbers": ["*numbers"],
  "application/x-iwork-pages-sffpages": ["*pages"],
  "application/x-java-archive-diff": ["jardiff"],
  "application/x-java-jnlp-file": ["jnlp"],
  "application/x-keepass2": ["kdbx"],
  "application/x-latex": ["latex"],
  "application/x-lua-bytecode": ["luac"],
  "application/x-lzh-compressed": ["lzh", "lha"],
  "application/x-makeself": ["run"],
  "application/x-mie": ["mie"],
  "application/x-mobipocket-ebook": ["*prc", "mobi"],
  "application/x-ms-application": ["application"],
  "application/x-ms-shortcut": ["lnk"],
  "application/x-ms-wmd": ["wmd"],
  "application/x-ms-wmz": ["wmz"],
  "application/x-ms-xbap": ["xbap"],
  "application/x-msaccess": ["mdb"],
  "application/x-msbinder": ["obd"],
  "application/x-mscardfile": ["crd"],
  "application/x-msclip": ["clp"],
  "application/x-msdos-program": ["*exe"],
  "application/x-msdownload": ["*exe", "*dll", "com", "bat", "*msi"],
  "application/x-msmediaview": ["mvb", "m13", "m14"],
  "application/x-msmetafile": ["*wmf", "*wmz", "*emf", "emz"],
  "application/x-msmoney": ["mny"],
  "application/x-mspublisher": ["pub"],
  "application/x-msschedule": ["scd"],
  "application/x-msterminal": ["trm"],
  "application/x-mswrite": ["wri"],
  "application/x-netcdf": ["nc", "cdf"],
  "application/x-ns-proxy-autoconfig": ["pac"],
  "application/x-nzb": ["nzb"],
  "application/x-perl": ["pl", "pm"],
  "application/x-pilot": ["*prc", "*pdb"],
  "application/x-pkcs12": ["p12", "pfx"],
  "application/x-pkcs7-certificates": ["p7b", "spc"],
  "application/x-pkcs7-certreqresp": ["p7r"],
  "application/x-rar-compressed": ["*rar"],
  "application/x-redhat-package-manager": ["rpm"],
  "application/x-research-info-systems": ["ris"],
  "application/x-sea": ["sea"],
  "application/x-sh": ["sh"],
  "application/x-shar": ["shar"],
  "application/x-shockwave-flash": ["swf"],
  "application/x-silverlight-app": ["xap"],
  "application/x-sql": ["*sql"],
  "application/x-stuffit": ["sit"],
  "application/x-stuffitx": ["sitx"],
  "application/x-subrip": ["srt"],
  "application/x-sv4cpio": ["sv4cpio"],
  "application/x-sv4crc": ["sv4crc"],
  "application/x-t3vm-image": ["t3"],
  "application/x-tads": ["gam"],
  "application/x-tar": ["tar"],
  "application/x-tcl": ["tcl", "tk"],
  "application/x-tex": ["tex"],
  "application/x-tex-tfm": ["tfm"],
  "application/x-texinfo": ["texinfo", "texi"],
  "application/x-tgif": ["*obj"],
  "application/x-ustar": ["ustar"],
  "application/x-virtualbox-hdd": ["hdd"],
  "application/x-virtualbox-ova": ["ova"],
  "application/x-virtualbox-ovf": ["ovf"],
  "application/x-virtualbox-vbox": ["vbox"],
  "application/x-virtualbox-vbox-extpack": ["vbox-extpack"],
  "application/x-virtualbox-vdi": ["vdi"],
  "application/x-virtualbox-vhd": ["vhd"],
  "application/x-virtualbox-vmdk": ["vmdk"],
  "application/x-wais-source": ["src"],
  "application/x-web-app-manifest+json": ["webapp"],
  "application/x-x509-ca-cert": ["der", "crt", "pem"],
  "application/x-xfig": ["fig"],
  "application/x-xliff+xml": ["*xlf"],
  "application/x-xpinstall": ["xpi"],
  "application/x-xz": ["xz"],
  "application/x-zip-compressed": ["*zip"],
  "application/x-zmachine": ["z1", "z2", "z3", "z4", "z5", "z6", "z7", "z8"],
  "audio/vnd.dece.audio": ["uva", "uvva"],
  "audio/vnd.digital-winds": ["eol"],
  "audio/vnd.dra": ["dra"],
  "audio/vnd.dts": ["dts"],
  "audio/vnd.dts.hd": ["dtshd"],
  "audio/vnd.lucent.voice": ["lvp"],
  "audio/vnd.ms-playready.media.pya": ["pya"],
  "audio/vnd.nuera.ecelp4800": ["ecelp4800"],
  "audio/vnd.nuera.ecelp7470": ["ecelp7470"],
  "audio/vnd.nuera.ecelp9600": ["ecelp9600"],
  "audio/vnd.rip": ["rip"],
  "audio/x-aac": ["*aac"],
  "audio/x-aiff": ["aif", "aiff", "aifc"],
  "audio/x-caf": ["caf"],
  "audio/x-flac": ["flac"],
  "audio/x-m4a": ["*m4a"],
  "audio/x-matroska": ["mka"],
  "audio/x-mpegurl": ["m3u"],
  "audio/x-ms-wax": ["wax"],
  "audio/x-ms-wma": ["wma"],
  "audio/x-pn-realaudio": ["ram", "ra"],
  "audio/x-pn-realaudio-plugin": ["rmp"],
  "audio/x-realaudio": ["*ra"],
  "audio/x-wav": ["*wav"],
  "chemical/x-cdx": ["cdx"],
  "chemical/x-cif": ["cif"],
  "chemical/x-cmdf": ["cmdf"],
  "chemical/x-cml": ["cml"],
  "chemical/x-csml": ["csml"],
  "chemical/x-xyz": ["xyz"],
  "image/prs.btif": ["btif", "btf"],
  "image/prs.pti": ["pti"],
  "image/vnd.adobe.photoshop": ["psd"],
  "image/vnd.airzip.accelerator.azv": ["azv"],
  "image/vnd.blockfact.facti": ["facti"],
  "image/vnd.dece.graphic": ["uvi", "uvvi", "uvg", "uvvg"],
  "image/vnd.djvu": ["djvu", "djv"],
  "image/vnd.dvb.subtitle": ["*sub"],
  "image/vnd.dwg": ["dwg"],
  "image/vnd.dxf": ["dxf"],
  "image/vnd.fastbidsheet": ["fbs"],
  "image/vnd.fpx": ["fpx"],
  "image/vnd.fst": ["fst"],
  "image/vnd.fujixerox.edmics-mmr": ["mmr"],
  "image/vnd.fujixerox.edmics-rlc": ["rlc"],
  "image/vnd.microsoft.icon": ["ico"],
  "image/vnd.ms-dds": ["dds"],
  "image/vnd.ms-modi": ["mdi"],
  "image/vnd.ms-photo": ["wdp"],
  "image/vnd.net-fpx": ["npx"],
  "image/vnd.pco.b16": ["b16"],
  "image/vnd.tencent.tap": ["tap"],
  "image/vnd.valve.source.texture": ["vtf"],
  "image/vnd.wap.wbmp": ["wbmp"],
  "image/vnd.xiff": ["xif"],
  "image/vnd.zbrush.pcx": ["pcx"],
  "image/x-3ds": ["3ds"],
  "image/x-adobe-dng": ["dng"],
  "image/x-cmu-raster": ["ras"],
  "image/x-cmx": ["cmx"],
  "image/x-freehand": ["fh", "fhc", "fh4", "fh5", "fh7"],
  "image/x-icon": ["*ico"],
  "image/x-jng": ["jng"],
  "image/x-mrsid-image": ["sid"],
  "image/x-ms-bmp": ["*bmp"],
  "image/x-pcx": ["*pcx"],
  "image/x-pict": ["pic", "pct"],
  "image/x-portable-anymap": ["pnm"],
  "image/x-portable-bitmap": ["pbm"],
  "image/x-portable-graymap": ["pgm"],
  "image/x-portable-pixmap": ["ppm"],
  "image/x-rgb": ["rgb"],
  "image/x-tga": ["tga"],
  "image/x-xbitmap": ["xbm"],
  "image/x-xpixmap": ["xpm"],
  "image/x-xwindowdump": ["xwd"],
  "message/vnd.wfa.wsc": ["wsc"],
  "model/vnd.bary": ["bary"],
  "model/vnd.cld": ["cld"],
  "model/vnd.collada+xml": ["dae"],
  "model/vnd.dwf": ["dwf"],
  "model/vnd.gdl": ["gdl"],
  "model/vnd.gtw": ["gtw"],
  "model/vnd.mts": ["*mts"],
  "model/vnd.opengex": ["ogex"],
  "model/vnd.parasolid.transmit.binary": ["x_b"],
  "model/vnd.parasolid.transmit.text": ["x_t"],
  "model/vnd.pytha.pyox": ["pyo", "pyox"],
  "model/vnd.sap.vds": ["vds"],
  "model/vnd.usda": ["usda"],
  "model/vnd.usdz+zip": ["usdz"],
  "model/vnd.valve.source.compiled-map": ["bsp"],
  "model/vnd.vtu": ["vtu"],
  "text/prs.lines.tag": ["dsc"],
  "text/vnd.curl": ["curl"],
  "text/vnd.curl.dcurl": ["dcurl"],
  "text/vnd.curl.mcurl": ["mcurl"],
  "text/vnd.curl.scurl": ["scurl"],
  "text/vnd.dvb.subtitle": ["sub"],
  "text/vnd.familysearch.gedcom": ["ged"],
  "text/vnd.fly": ["fly"],
  "text/vnd.fmi.flexstor": ["flx"],
  "text/vnd.graphviz": ["gv"],
  "text/vnd.in3d.3dml": ["3dml"],
  "text/vnd.in3d.spot": ["spot"],
  "text/vnd.sun.j2me.app-descriptor": ["jad"],
  "text/vnd.wap.wml": ["wml"],
  "text/vnd.wap.wmlscript": ["wmls"],
  "text/x-asm": ["s", "asm"],
  "text/x-c": ["c", "cc", "cxx", "cpp", "h", "hh", "dic"],
  "text/x-component": ["htc"],
  "text/x-fortran": ["f", "for", "f77", "f90"],
  "text/x-handlebars-template": ["hbs"],
  "text/x-java-source": ["java"],
  "text/x-lua": ["lua"],
  "text/x-markdown": ["mkd"],
  "text/x-nfo": ["nfo"],
  "text/x-opml": ["opml"],
  "text/x-org": ["*org"],
  "text/x-pascal": ["p", "pas"],
  "text/x-processing": ["pde"],
  "text/x-sass": ["sass"],
  "text/x-scss": ["scss"],
  "text/x-setext": ["etx"],
  "text/x-sfv": ["sfv"],
  "text/x-suse-ymp": ["ymp"],
  "text/x-uuencode": ["uu"],
  "text/x-vcalendar": ["vcs"],
  "text/x-vcard": ["vcf"],
  "video/vnd.dece.hd": ["uvh", "uvvh"],
  "video/vnd.dece.mobile": ["uvm", "uvvm"],
  "video/vnd.dece.pd": ["uvp", "uvvp"],
  "video/vnd.dece.sd": ["uvs", "uvvs"],
  "video/vnd.dece.video": ["uvv", "uvvv"],
  "video/vnd.dvb.file": ["dvb"],
  "video/vnd.fvt": ["fvt"],
  "video/vnd.mpegurl": ["mxu", "m4u"],
  "video/vnd.ms-playready.media.pyv": ["pyv"],
  "video/vnd.uvvu.mp4": ["uvu", "uvvu"],
  "video/vnd.vivo": ["viv"],
  "video/x-f4v": ["f4v"],
  "video/x-fli": ["fli"],
  "video/x-flv": ["flv"],
  "video/x-m4v": ["m4v"],
  "video/x-matroska": ["mkv", "mk3d", "mks"],
  "video/x-mng": ["mng"],
  "video/x-ms-asf": ["asf", "asx"],
  "video/x-ms-vob": ["vob"],
  "video/x-ms-wm": ["wm"],
  "video/x-ms-wmv": ["wmv"],
  "video/x-ms-wmx": ["wmx"],
  "video/x-ms-wvx": ["wvx"],
  "video/x-msvideo": ["avi"],
  "video/x-sgi-movie": ["movie"],
  "video/x-smv": ["smv"],
  "x-conference/x-cooltalk": ["ice"]
};
Object.freeze(types);
var other_default = types;

// ../../node_modules/.pnpm/mime@4.1.1/node_modules/mime/dist/types/standard.js
var types2 = {
  "application/andrew-inset": ["ez"],
  "application/appinstaller": ["appinstaller"],
  "application/applixware": ["aw"],
  "application/appx": ["appx"],
  "application/appxbundle": ["appxbundle"],
  "application/atom+xml": ["atom"],
  "application/atomcat+xml": ["atomcat"],
  "application/atomdeleted+xml": ["atomdeleted"],
  "application/atomsvc+xml": ["atomsvc"],
  "application/atsc-dwd+xml": ["dwd"],
  "application/atsc-held+xml": ["held"],
  "application/atsc-rsat+xml": ["rsat"],
  "application/automationml-aml+xml": ["aml"],
  "application/automationml-amlx+zip": ["amlx"],
  "application/bdoc": ["bdoc"],
  "application/calendar+xml": ["xcs"],
  "application/ccxml+xml": ["ccxml"],
  "application/cdfx+xml": ["cdfx"],
  "application/cdmi-capability": ["cdmia"],
  "application/cdmi-container": ["cdmic"],
  "application/cdmi-domain": ["cdmid"],
  "application/cdmi-object": ["cdmio"],
  "application/cdmi-queue": ["cdmiq"],
  "application/cpl+xml": ["cpl"],
  "application/cu-seeme": ["cu"],
  "application/cwl": ["cwl"],
  "application/dash+xml": ["mpd"],
  "application/dash-patch+xml": ["mpp"],
  "application/davmount+xml": ["davmount"],
  "application/dicom": ["dcm"],
  "application/docbook+xml": ["dbk"],
  "application/dssc+der": ["dssc"],
  "application/dssc+xml": ["xdssc"],
  "application/ecmascript": ["ecma"],
  "application/emma+xml": ["emma"],
  "application/emotionml+xml": ["emotionml"],
  "application/epub+zip": ["epub"],
  "application/exi": ["exi"],
  "application/express": ["exp"],
  "application/fdf": ["fdf"],
  "application/fdt+xml": ["fdt"],
  "application/font-tdpfr": ["pfr"],
  "application/geo+json": ["geojson"],
  "application/gml+xml": ["gml"],
  "application/gpx+xml": ["gpx"],
  "application/gxf": ["gxf"],
  "application/gzip": ["gz"],
  "application/hjson": ["hjson"],
  "application/hyperstudio": ["stk"],
  "application/inkml+xml": ["ink", "inkml"],
  "application/ipfix": ["ipfix"],
  "application/its+xml": ["its"],
  "application/java-archive": ["jar", "war", "ear"],
  "application/java-serialized-object": ["ser"],
  "application/java-vm": ["class"],
  "application/javascript": ["*js"],
  "application/json": ["json", "map"],
  "application/json5": ["json5"],
  "application/jsonml+json": ["jsonml"],
  "application/ld+json": ["jsonld"],
  "application/lgr+xml": ["lgr"],
  "application/lost+xml": ["lostxml"],
  "application/mac-binhex40": ["hqx"],
  "application/mac-compactpro": ["cpt"],
  "application/mads+xml": ["mads"],
  "application/manifest+json": ["webmanifest"],
  "application/marc": ["mrc"],
  "application/marcxml+xml": ["mrcx"],
  "application/mathematica": ["ma", "nb", "mb"],
  "application/mathml+xml": ["mathml"],
  "application/mbox": ["mbox"],
  "application/media-policy-dataset+xml": ["mpf"],
  "application/mediaservercontrol+xml": ["mscml"],
  "application/metalink+xml": ["metalink"],
  "application/metalink4+xml": ["meta4"],
  "application/mets+xml": ["mets"],
  "application/mmt-aei+xml": ["maei"],
  "application/mmt-usd+xml": ["musd"],
  "application/mods+xml": ["mods"],
  "application/mp21": ["m21", "mp21"],
  "application/mp4": ["*mp4", "*mpg4", "mp4s", "m4p"],
  "application/msix": ["msix"],
  "application/msixbundle": ["msixbundle"],
  "application/msword": ["doc", "dot"],
  "application/mxf": ["mxf"],
  "application/n-quads": ["nq"],
  "application/n-triples": ["nt"],
  "application/node": ["cjs"],
  "application/octet-stream": [
    "bin",
    "dms",
    "lrf",
    "mar",
    "so",
    "dist",
    "distz",
    "pkg",
    "bpk",
    "dump",
    "elc",
    "deploy",
    "exe",
    "dll",
    "deb",
    "dmg",
    "iso",
    "img",
    "msi",
    "msp",
    "msm",
    "buffer"
  ],
  "application/oda": ["oda"],
  "application/oebps-package+xml": ["opf"],
  "application/ogg": ["ogx"],
  "application/omdoc+xml": ["omdoc"],
  "application/onenote": [
    "onetoc",
    "onetoc2",
    "onetmp",
    "onepkg",
    "one",
    "onea"
  ],
  "application/oxps": ["oxps"],
  "application/p2p-overlay+xml": ["relo"],
  "application/patch-ops-error+xml": ["xer"],
  "application/pdf": ["pdf"],
  "application/pgp-encrypted": ["pgp"],
  "application/pgp-keys": ["asc"],
  "application/pgp-signature": ["sig", "*asc"],
  "application/pics-rules": ["prf"],
  "application/pkcs10": ["p10"],
  "application/pkcs7-mime": ["p7m", "p7c"],
  "application/pkcs7-signature": ["p7s"],
  "application/pkcs8": ["p8"],
  "application/pkix-attr-cert": ["ac"],
  "application/pkix-cert": ["cer"],
  "application/pkix-crl": ["crl"],
  "application/pkix-pkipath": ["pkipath"],
  "application/pkixcmp": ["pki"],
  "application/pls+xml": ["pls"],
  "application/postscript": ["ai", "eps", "ps"],
  "application/provenance+xml": ["provx"],
  "application/pskc+xml": ["pskcxml"],
  "application/raml+yaml": ["raml"],
  "application/rdf+xml": ["rdf", "owl"],
  "application/reginfo+xml": ["rif"],
  "application/relax-ng-compact-syntax": ["rnc"],
  "application/resource-lists+xml": ["rl"],
  "application/resource-lists-diff+xml": ["rld"],
  "application/rls-services+xml": ["rs"],
  "application/route-apd+xml": ["rapd"],
  "application/route-s-tsid+xml": ["sls"],
  "application/route-usd+xml": ["rusd"],
  "application/rpki-ghostbusters": ["gbr"],
  "application/rpki-manifest": ["mft"],
  "application/rpki-roa": ["roa"],
  "application/rsd+xml": ["rsd"],
  "application/rss+xml": ["rss"],
  "application/rtf": ["rtf"],
  "application/sbml+xml": ["sbml"],
  "application/scvp-cv-request": ["scq"],
  "application/scvp-cv-response": ["scs"],
  "application/scvp-vp-request": ["spq"],
  "application/scvp-vp-response": ["spp"],
  "application/sdp": ["sdp"],
  "application/senml+xml": ["senmlx"],
  "application/sensml+xml": ["sensmlx"],
  "application/set-payment-initiation": ["setpay"],
  "application/set-registration-initiation": ["setreg"],
  "application/shf+xml": ["shf"],
  "application/sieve": ["siv", "sieve"],
  "application/smil+xml": ["smi", "smil"],
  "application/sparql-query": ["rq"],
  "application/sparql-results+xml": ["srx"],
  "application/sql": ["sql"],
  "application/srgs": ["gram"],
  "application/srgs+xml": ["grxml"],
  "application/sru+xml": ["sru"],
  "application/ssdl+xml": ["ssdl"],
  "application/ssml+xml": ["ssml"],
  "application/swid+xml": ["swidtag"],
  "application/tei+xml": ["tei", "teicorpus"],
  "application/thraud+xml": ["tfi"],
  "application/timestamped-data": ["tsd"],
  "application/toml": ["toml"],
  "application/trig": ["trig"],
  "application/ttml+xml": ["ttml"],
  "application/ubjson": ["ubj"],
  "application/urc-ressheet+xml": ["rsheet"],
  "application/urc-targetdesc+xml": ["td"],
  "application/voicexml+xml": ["vxml"],
  "application/wasm": ["wasm"],
  "application/watcherinfo+xml": ["wif"],
  "application/widget": ["wgt"],
  "application/winhlp": ["hlp"],
  "application/wsdl+xml": ["wsdl"],
  "application/wspolicy+xml": ["wspolicy"],
  "application/xaml+xml": ["xaml"],
  "application/xcap-att+xml": ["xav"],
  "application/xcap-caps+xml": ["xca"],
  "application/xcap-diff+xml": ["xdf"],
  "application/xcap-el+xml": ["xel"],
  "application/xcap-ns+xml": ["xns"],
  "application/xenc+xml": ["xenc"],
  "application/xfdf": ["xfdf"],
  "application/xhtml+xml": ["xhtml", "xht"],
  "application/xliff+xml": ["xlf"],
  "application/xml": ["xml", "xsl", "xsd", "rng"],
  "application/xml-dtd": ["dtd"],
  "application/xop+xml": ["xop"],
  "application/xproc+xml": ["xpl"],
  "application/xslt+xml": ["*xsl", "xslt"],
  "application/xspf+xml": ["xspf"],
  "application/xv+xml": ["mxml", "xhvml", "xvml", "xvm"],
  "application/yang": ["yang"],
  "application/yin+xml": ["yin"],
  "application/zip": ["zip"],
  "application/zip+dotlottie": ["lottie"],
  "audio/3gpp": ["*3gpp"],
  "audio/aac": ["adts", "aac"],
  "audio/adpcm": ["adp"],
  "audio/amr": ["amr"],
  "audio/basic": ["au", "snd"],
  "audio/midi": ["mid", "midi", "kar", "rmi"],
  "audio/mobile-xmf": ["mxmf"],
  "audio/mp3": ["*mp3"],
  "audio/mp4": ["m4a", "mp4a", "m4b"],
  "audio/mpeg": ["mpga", "mp2", "mp2a", "mp3", "m2a", "m3a"],
  "audio/ogg": ["oga", "ogg", "spx", "opus"],
  "audio/s3m": ["s3m"],
  "audio/silk": ["sil"],
  "audio/wav": ["wav"],
  "audio/wave": ["*wav"],
  "audio/webm": ["weba"],
  "audio/xm": ["xm"],
  "font/collection": ["ttc"],
  "font/otf": ["otf"],
  "font/ttf": ["ttf"],
  "font/woff": ["woff"],
  "font/woff2": ["woff2"],
  "image/aces": ["exr"],
  "image/apng": ["apng"],
  "image/avci": ["avci"],
  "image/avcs": ["avcs"],
  "image/avif": ["avif"],
  "image/bmp": ["bmp", "dib"],
  "image/cgm": ["cgm"],
  "image/dicom-rle": ["drle"],
  "image/dpx": ["dpx"],
  "image/emf": ["emf"],
  "image/fits": ["fits"],
  "image/g3fax": ["g3"],
  "image/gif": ["gif"],
  "image/heic": ["heic"],
  "image/heic-sequence": ["heics"],
  "image/heif": ["heif"],
  "image/heif-sequence": ["heifs"],
  "image/hej2k": ["hej2"],
  "image/ief": ["ief"],
  "image/jaii": ["jaii"],
  "image/jais": ["jais"],
  "image/jls": ["jls"],
  "image/jp2": ["jp2", "jpg2"],
  "image/jpeg": ["jpg", "jpeg", "jpe"],
  "image/jph": ["jph"],
  "image/jphc": ["jhc"],
  "image/jpm": ["jpm", "jpgm"],
  "image/jpx": ["jpx", "jpf"],
  "image/jxl": ["jxl"],
  "image/jxr": ["jxr"],
  "image/jxra": ["jxra"],
  "image/jxrs": ["jxrs"],
  "image/jxs": ["jxs"],
  "image/jxsc": ["jxsc"],
  "image/jxsi": ["jxsi"],
  "image/jxss": ["jxss"],
  "image/ktx": ["ktx"],
  "image/ktx2": ["ktx2"],
  "image/pjpeg": ["jfif"],
  "image/png": ["png"],
  "image/sgi": ["sgi"],
  "image/svg+xml": ["svg", "svgz"],
  "image/t38": ["t38"],
  "image/tiff": ["tif", "tiff"],
  "image/tiff-fx": ["tfx"],
  "image/webp": ["webp"],
  "image/wmf": ["wmf"],
  "message/disposition-notification": ["disposition-notification"],
  "message/global": ["u8msg"],
  "message/global-delivery-status": ["u8dsn"],
  "message/global-disposition-notification": ["u8mdn"],
  "message/global-headers": ["u8hdr"],
  "message/rfc822": ["eml", "mime", "mht", "mhtml"],
  "model/3mf": ["3mf"],
  "model/gltf+json": ["gltf"],
  "model/gltf-binary": ["glb"],
  "model/iges": ["igs", "iges"],
  "model/jt": ["jt"],
  "model/mesh": ["msh", "mesh", "silo"],
  "model/mtl": ["mtl"],
  "model/obj": ["obj"],
  "model/prc": ["prc"],
  "model/step": ["step", "stp", "stpnc", "p21", "210"],
  "model/step+xml": ["stpx"],
  "model/step+zip": ["stpz"],
  "model/step-xml+zip": ["stpxz"],
  "model/stl": ["stl"],
  "model/u3d": ["u3d"],
  "model/vrml": ["wrl", "vrml"],
  "model/x3d+binary": ["*x3db", "x3dbz"],
  "model/x3d+fastinfoset": ["x3db"],
  "model/x3d+vrml": ["*x3dv", "x3dvz"],
  "model/x3d+xml": ["x3d", "x3dz"],
  "model/x3d-vrml": ["x3dv"],
  "text/cache-manifest": ["appcache", "manifest"],
  "text/calendar": ["ics", "ifb"],
  "text/coffeescript": ["coffee", "litcoffee"],
  "text/css": ["css"],
  "text/csv": ["csv"],
  "text/html": ["html", "htm", "shtml"],
  "text/jade": ["jade"],
  "text/javascript": ["js", "mjs"],
  "text/jsx": ["jsx"],
  "text/less": ["less"],
  "text/markdown": ["md", "markdown"],
  "text/mathml": ["mml"],
  "text/mdx": ["mdx"],
  "text/n3": ["n3"],
  "text/plain": ["txt", "text", "conf", "def", "list", "log", "in", "ini"],
  "text/richtext": ["rtx"],
  "text/rtf": ["*rtf"],
  "text/sgml": ["sgml", "sgm"],
  "text/shex": ["shex"],
  "text/slim": ["slim", "slm"],
  "text/spdx": ["spdx"],
  "text/stylus": ["stylus", "styl"],
  "text/tab-separated-values": ["tsv"],
  "text/troff": ["t", "tr", "roff", "man", "me", "ms"],
  "text/turtle": ["ttl"],
  "text/uri-list": ["uri", "uris", "urls"],
  "text/vcard": ["vcard"],
  "text/vtt": ["vtt"],
  "text/wgsl": ["wgsl"],
  "text/xml": ["*xml"],
  "text/yaml": ["yaml", "yml"],
  "video/3gpp": ["3gp", "3gpp"],
  "video/3gpp2": ["3g2"],
  "video/h261": ["h261"],
  "video/h263": ["h263"],
  "video/h264": ["h264"],
  "video/iso.segment": ["m4s"],
  "video/jpeg": ["jpgv"],
  "video/jpm": ["*jpm", "*jpgm"],
  "video/mj2": ["mj2", "mjp2"],
  "video/mp2t": ["ts", "m2t", "m2ts", "mts"],
  "video/mp4": ["mp4", "mp4v", "mpg4"],
  "video/mpeg": ["mpeg", "mpg", "mpe", "m1v", "m2v"],
  "video/ogg": ["ogv"],
  "video/quicktime": ["qt", "mov"],
  "video/webm": ["webm"]
};
Object.freeze(types2);
var standard_default = types2;

// ../../node_modules/.pnpm/mime@4.1.1/node_modules/mime/dist/src/Mime.js
var __classPrivateFieldGet = function(receiver, state, kind, f) {
  if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a getter");
  if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot read private member from an object whose class did not declare it");
  return kind === "m" ? f : kind === "a" ? f.call(receiver) : f ? f.value : state.get(receiver);
};
var _Mime_extensionToType;
var _Mime_typeToExtension;
var _Mime_typeToExtensions;
var Mime = class {
  constructor(...args) {
    _Mime_extensionToType.set(this, /* @__PURE__ */ new Map());
    _Mime_typeToExtension.set(this, /* @__PURE__ */ new Map());
    _Mime_typeToExtensions.set(this, /* @__PURE__ */ new Map());
    for (const arg of args) {
      this.define(arg);
    }
  }
  define(typeMap, force = false) {
    for (let [type, extensions] of Object.entries(typeMap)) {
      type = type.toLowerCase();
      extensions = extensions.map((ext) => ext.toLowerCase());
      if (!__classPrivateFieldGet(this, _Mime_typeToExtensions, "f").has(type)) {
        __classPrivateFieldGet(this, _Mime_typeToExtensions, "f").set(type, /* @__PURE__ */ new Set());
      }
      const allExtensions = __classPrivateFieldGet(this, _Mime_typeToExtensions, "f").get(type);
      let first = true;
      for (let extension of extensions) {
        const starred = extension.startsWith("*");
        extension = starred ? extension.slice(1) : extension;
        allExtensions?.add(extension);
        if (first) {
          __classPrivateFieldGet(this, _Mime_typeToExtension, "f").set(type, extension);
        }
        first = false;
        if (starred)
          continue;
        const currentType = __classPrivateFieldGet(this, _Mime_extensionToType, "f").get(extension);
        if (currentType && currentType != type && !force) {
          throw new Error(`"${type} -> ${extension}" conflicts with "${currentType} -> ${extension}". Pass \`force=true\` to override this definition.`);
        }
        __classPrivateFieldGet(this, _Mime_extensionToType, "f").set(extension, type);
      }
    }
    return this;
  }
  getType(path) {
    if (typeof path !== "string")
      return null;
    const last = path.replace(/^.*[/\\]/s, "").toLowerCase();
    const ext = last.replace(/^.*\./s, "").toLowerCase();
    const hasPath = last.length < path.length;
    const hasDot = ext.length < last.length - 1;
    if (!hasDot && hasPath)
      return null;
    return __classPrivateFieldGet(this, _Mime_extensionToType, "f").get(ext) ?? null;
  }
  getExtension(type) {
    if (typeof type !== "string")
      return null;
    type = type?.split?.(";")[0];
    return (type && __classPrivateFieldGet(this, _Mime_typeToExtension, "f").get(type.trim().toLowerCase())) ?? null;
  }
  getAllExtensions(type) {
    if (typeof type !== "string")
      return null;
    type = type.split(";")[0].trim().toLowerCase();
    return __classPrivateFieldGet(this, _Mime_typeToExtensions, "f").get(type) ?? null;
  }
  _freeze() {
    this.define = () => {
      throw new Error("define() not allowed for built-in Mime objects. See https://github.com/broofa/mime/blob/main/README.md#custom-mime-instances");
    };
    Object.freeze(this);
    for (const extensions of __classPrivateFieldGet(this, _Mime_typeToExtensions, "f").values()) {
      Object.freeze(extensions);
    }
    return this;
  }
  _getTestState() {
    return {
      types: __classPrivateFieldGet(this, _Mime_extensionToType, "f"),
      extensions: __classPrivateFieldGet(this, _Mime_typeToExtension, "f")
    };
  }
};
_Mime_extensionToType = /* @__PURE__ */ new WeakMap(), _Mime_typeToExtension = /* @__PURE__ */ new WeakMap(), _Mime_typeToExtensions = /* @__PURE__ */ new WeakMap();
var Mime_default = Mime;

// ../../node_modules/.pnpm/mime@4.1.1/node_modules/mime/dist/src/index.js
var src_default = new Mime_default(standard_default, other_default)._freeze();

// upstream/packages/client/ui-file-actions/src/client/context-menus.tsx.snapshot
function registerFileMenus(ctx, actions, t) {
  const lifetime = new AbortController();
  ctx.effect(() => () => {
    lifetime.abort();
  }, "file actions: feedback lifetime");
  const read = (sessionId, path, mediaType, error) => async (signal) => {
    const result = await ctx.remote.workspaceFiles.readBytes(sessionId, path, {}, signal);
    if (!result.ok) throw new Error(error);
    return new Blob([new Uint8Array(result.value.data)], { type: mediaType });
  };
  const save = async (source, mode) => {
    const result = await actions.save(source, mode);
    lifetime.signal.throwIfAborted();
    if (result.status === "cancelled") return;
    ctx.contextMenus.notify(
      t(result.status === "requested" ? "menu.downloadStarted" : mode === "download" ? "menu.downloaded" : "menu.saved"),
      true,
      result.status !== "saved" ? void 0 : {
        label: t(document.documentElement.dataset.platform === "darwin" ? "menu.finder" : "menu.reveal"),
        failureLabel: t("path.revealError"),
        run: async () => {
          lifetime.signal.throwIfAborted();
          const opened = await ctx.remote.session.openWorkspacePath({ path: result.path, action: "reveal" }, lifetime.signal);
          if (!opened.ok) throw new Error("File location unavailable");
        }
      }
    );
  };
  const copy = async (source) => {
    await actions.copyImage(source);
    ctx.contextMenus.notify(t("menu.copied"), true);
  };
  ctx.effect(() => ctx.contextMenus.register({
    id: "file-actions.file",
    target: "file",
    order: 200,
    resolve: async ({ sessionId, path }, signal) => {
      let absolutePath;
      try {
        const result = await ctx.remote.workspaceFiles.stat(sessionId, path, signal);
        absolutePath = result.ok ? result.value.absolutePath : void 0;
      } catch (_error) {
        signal.throwIfAborted();
      }
      signal.throwIfAborted();
      const available = absolutePath !== void 0;
      const mediaType = src_default.getType(path) ?? "";
      const source = {
        url: fileMediaUrl(document.baseURI, absolutePath ?? path) ?? path,
        name: path.slice(Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\")) + 1),
        mediaType,
        read: read(sessionId, path, mediaType, "Original file unavailable")
      };
      return [
        ...mediaType.startsWith("image/") ? [
          {
            id: "copyImage",
            icon: { key: "file-actions.copy" },
            separatorBefore: true,
            failureLabel: t("menu.copyFailed"),
            label: t("menu.copyImage"),
            disabled: !available,
            run: () => copy(source)
          }
        ] : [],
        ...mediaType.startsWith("image/") || !actions.canSaveAs ? [
          {
            id: "download",
            icon: { key: "file-actions.download" },
            failureLabel: t("menu.saveFailed"),
            label: t("menu.download"),
            disabled: !available,
            run: () => save(source, "download")
          }
        ] : [],
        ...actions.canSaveAs ? [
          {
            id: "saveAs",
            icon: { key: "file-actions.save" },
            failureLabel: t("menu.saveFailed"),
            label: t("menu.saveAs"),
            disabled: !available,
            run: () => save(source, "saveAs")
          }
        ] : []
      ];
    }
  }), "file actions: file menu");
  ctx.effect(() => ctx.contextMenus.register({
    id: "file-actions.image",
    target: "image",
    order: 100,
    resolve: (target) => {
      const { sessionId, path } = target;
      const name = target.name ?? path?.split(/[\\/]/u).pop();
      const mediaType = target.mediaType || src_default.getType(name ?? target.url) || void 0;
      const source = {
        ...target,
        ...name === void 0 ? {} : { name },
        ...mediaType === void 0 ? {} : { mediaType },
        ...path === void 0 || sessionId === void 0 ? {} : {
          read: read(sessionId, path, mediaType ?? "", "Original image unavailable")
        }
      };
      return [
        { id: "copy", icon: { key: "file-actions.copy" }, failureLabel: t("menu.copyFailed"), label: t("menu.copyImage"), run: () => copy(source) },
        { id: "download", icon: { key: "file-actions.download" }, failureLabel: t("menu.saveFailed"), label: t("menu.download"), run: () => save(source, "download") },
        ...actions.canSaveAs ? [
          {
            id: "saveAs",
            icon: { key: "file-actions.save" },
            failureLabel: t("menu.saveFailed"),
            label: t("menu.saveAs"),
            run: () => save(source, "saveAs")
          }
        ] : []
      ];
    }
  }), "file actions: image menu");
}

// upstream/packages/client/ui-file-actions/src/client/locales.ts.snapshot
var zh2 = {
  "menu.finder": "\u5728 Finder \u663E\u793A",
  "menu.reveal": "\u5728\u6587\u4EF6\u5939\u663E\u793A",
  "menu.saveAs": "\u53E6\u5B58\u4E3A\u2026",
  "menu.copied": "\u5DF2\u590D\u5236",
  "menu.copyImage": "\u590D\u5236\u56FE\u7247",
  "menu.download": "\u4E0B\u8F7D",
  "menu.saveFailed": "\u65E0\u6CD5\u4FDD\u5B58\u6587\u4EF6\uFF0C\u8BF7\u68C0\u67E5\u6E90\u6587\u4EF6\u548C\u76EE\u6807\u4F4D\u7F6E\u540E\u91CD\u8BD5",
  "menu.copyFailed": "\u65E0\u6CD5\u590D\u5236\uFF0C\u8BF7\u68C0\u67E5\u5185\u5BB9\u662F\u5426\u53EF\u7528\u540E\u91CD\u8BD5",
  "menu.saved": "\u5DF2\u4FDD\u5B58",
  "menu.downloadStarted": "\u5DF2\u5F00\u59CB\u4E0B\u8F7D",
  "menu.downloaded": "\u4E0B\u8F7D\u5B8C\u6210",
  "path.revealError": "\u65E0\u6CD5\u663E\u793A\u6587\u4EF6\u4F4D\u7F6E\uFF0C\u8BF7\u91CD\u8BD5"
};
var en2 = {
  "menu.finder": "Show in Finder",
  "menu.reveal": "Show in folder",
  "menu.saveAs": "Save as\u2026",
  "menu.copied": "Copied",
  "menu.copyImage": "Copy image",
  "menu.download": "Download",
  "menu.saveFailed": "Could not save. Check the source and destination, then retry.",
  "menu.copyFailed": "Could not copy. Check that the content is available, then retry.",
  "menu.saved": "Saved",
  "menu.downloadStarted": "Download started",
  "menu.downloaded": "Download complete",
  "path.revealError": "Could not show the file location. Try again."
};
var ja2 = {
  "menu.finder": "Finder \u306B\u8868\u793A",
  "menu.reveal": "\u30D5\u30A9\u30EB\u30C0\u30FC\u306B\u8868\u793A",
  "menu.saveAs": "\u540D\u524D\u3092\u4ED8\u3051\u3066\u4FDD\u5B58\u2026",
  "menu.copied": "\u30B3\u30D4\u30FC\u3057\u307E\u3057\u305F",
  "menu.copyImage": "\u753B\u50CF\u3092\u30B3\u30D4\u30FC",
  "menu.download": "\u30C0\u30A6\u30F3\u30ED\u30FC\u30C9",
  "menu.saveFailed": "\u4FDD\u5B58\u3067\u304D\u307E\u305B\u3093\u3002\u5143\u306E\u30D5\u30A1\u30A4\u30EB\u3068\u4FDD\u5B58\u5148\u3092\u78BA\u8A8D\u3057\u3066\u518D\u8A66\u884C\u3057\u3066\u304F\u3060\u3055\u3044\u3002",
  "menu.copyFailed": "\u30B3\u30D4\u30FC\u3067\u304D\u307E\u305B\u3093\u3002\u5185\u5BB9\u3092\u78BA\u8A8D\u3057\u3066\u518D\u8A66\u884C\u3057\u3066\u304F\u3060\u3055\u3044\u3002",
  "menu.saved": "\u4FDD\u5B58\u3057\u307E\u3057\u305F",
  "menu.downloadStarted": "\u30C0\u30A6\u30F3\u30ED\u30FC\u30C9\u3092\u958B\u59CB\u3057\u307E\u3057\u305F",
  "menu.downloaded": "\u30C0\u30A6\u30F3\u30ED\u30FC\u30C9\u3057\u307E\u3057\u305F",
  "path.revealError": "\u30D5\u30A1\u30A4\u30EB\u306E\u5834\u6240\u3092\u8868\u793A\u3067\u304D\u307E\u305B\u3093\u3067\u3057\u305F\u3002\u3082\u3046\u4E00\u5EA6\u304A\u8A66\u3057\u304F\u3060\u3055\u3044\u3002"
};
var es2 = {
  "menu.finder": "Mostrar en Finder",
  "menu.reveal": "Mostrar en la carpeta",
  "menu.saveAs": "Guardar como\u2026",
  "menu.copied": "Copiado",
  "menu.copyImage": "Copiar imagen",
  "menu.download": "Descargar",
  "menu.saveFailed": "No se pudo guardar. Compruebe el origen y el destino e int\xE9ntelo de nuevo.",
  "menu.copyFailed": "No se pudo copiar. Compruebe que el contenido est\xE9 disponible e int\xE9ntelo de nuevo.",
  "menu.saved": "Guardado",
  "menu.downloadStarted": "Descarga iniciada",
  "menu.downloaded": "Descarga completada",
  "path.revealError": "No se pudo mostrar la ubicaci\xF3n del archivo. Intentar otra vez."
};
var fr2 = {
  "menu.finder": "Afficher dans le Finder",
  "menu.reveal": "Afficher dans le dossier",
  "menu.saveAs": "Enregistrer sous\u2026",
  "menu.copied": "Copi\xE9",
  "menu.copyImage": "Copier l\u2019image",
  "menu.download": "T\xE9l\xE9charger",
  "menu.saveFailed": "Impossible d\u2019enregistrer. V\xE9rifiez la source et la destination, puis r\xE9essayez.",
  "menu.copyFailed": "Impossible de copier. V\xE9rifiez que le contenu est disponible, puis r\xE9essayez.",
  "menu.saved": "Enregistr\xE9",
  "menu.downloadStarted": "T\xE9l\xE9chargement d\xE9marr\xE9",
  "menu.downloaded": "T\xE9l\xE9chargement termin\xE9",
  "path.revealError": "Impossible d'afficher l'emplacement du fichier. Essayer \xE0 nouveau."
};
var de2 = {
  "menu.finder": "Im Finder anzeigen",
  "menu.reveal": "Im Ordner anzeigen",
  "menu.saveAs": "Speichern unter\u2026",
  "menu.copied": "Kopiert",
  "menu.copyImage": "Bild kopieren",
  "menu.download": "Herunterladen",
  "menu.saveFailed": "Speichern fehlgeschlagen. Pr\xFCfen Sie Quelle und Ziel und versuchen Sie es erneut.",
  "menu.copyFailed": "Kopieren fehlgeschlagen. Pr\xFCfen Sie, ob der Inhalt verf\xFCgbar ist, und versuchen Sie es erneut.",
  "menu.saved": "Gespeichert",
  "menu.downloadStarted": "Download gestartet",
  "menu.downloaded": "Download abgeschlossen",
  "path.revealError": "Der Dateispeicherort konnte nicht angezeigt werden. Versuchen Sie es erneut."
};
var ru2 = {
  "menu.finder": "\u041F\u043E\u043A\u0430\u0437\u0430\u0442\u044C \u0432 Finder",
  "menu.reveal": "\u041F\u043E\u043A\u0430\u0437\u0430\u0442\u044C \u0432 \u043F\u0430\u043F\u043A\u0435",
  "menu.saveAs": "\u0421\u043E\u0445\u0440\u0430\u043D\u0438\u0442\u044C \u043A\u0430\u043A\u2026",
  "menu.copied": "\u0421\u043A\u043E\u043F\u0438\u0440\u043E\u0432\u0430\u043D\u043E",
  "menu.copyImage": "\u041A\u043E\u043F\u0438\u0440\u043E\u0432\u0430\u0442\u044C \u0438\u0437\u043E\u0431\u0440\u0430\u0436\u0435\u043D\u0438\u0435",
  "menu.download": "\u0421\u043A\u0430\u0447\u0430\u0442\u044C",
  "menu.saveFailed": "\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u0441\u043E\u0445\u0440\u0430\u043D\u0438\u0442\u044C. \u041F\u0440\u043E\u0432\u0435\u0440\u044C\u0442\u0435 \u0438\u0441\u0442\u043E\u0447\u043D\u0438\u043A \u0438 \u043C\u0435\u0441\u0442\u043E \u0441\u043E\u0445\u0440\u0430\u043D\u0435\u043D\u0438\u044F \u0438 \u043F\u043E\u0432\u0442\u043E\u0440\u0438\u0442\u0435 \u043F\u043E\u043F\u044B\u0442\u043A\u0443.",
  "menu.copyFailed": "\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u0441\u043A\u043E\u043F\u0438\u0440\u043E\u0432\u0430\u0442\u044C. \u041F\u0440\u043E\u0432\u0435\u0440\u044C\u0442\u0435 \u0434\u043E\u0441\u0442\u0443\u043F\u043D\u043E\u0441\u0442\u044C \u0441\u043E\u0434\u0435\u0440\u0436\u0438\u043C\u043E\u0433\u043E \u0438 \u043F\u043E\u0432\u0442\u043E\u0440\u0438\u0442\u0435 \u043F\u043E\u043F\u044B\u0442\u043A\u0443.",
  "menu.saved": "\u0421\u043E\u0445\u0440\u0430\u043D\u0435\u043D\u043E",
  "menu.downloadStarted": "\u0421\u043A\u0430\u0447\u0438\u0432\u0430\u043D\u0438\u0435 \u043D\u0430\u0447\u0430\u043B\u043E\u0441\u044C",
  "menu.downloaded": "\u0421\u043A\u0430\u0447\u0438\u0432\u0430\u043D\u0438\u0435 \u0437\u0430\u0432\u0435\u0440\u0448\u0435\u043D\u043E",
  "path.revealError": "\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u043F\u043E\u043A\u0430\u0437\u0430\u0442\u044C \u043C\u0435\u0441\u0442\u043E\u043F\u043E\u043B\u043E\u0436\u0435\u043D\u0438\u0435 \u0444\u0430\u0439\u043B\u0430. \u041F\u043E\u043F\u0440\u043E\u0431\u0443\u0439\u0442\u0435 \u0435\u0449\u0435 \u0440\u0430\u0437."
};
var pt2 = {
  "menu.finder": "Mostrar no Finder",
  "menu.reveal": "Mostrar na pasta",
  "menu.saveAs": "Salvar como\u2026",
  "menu.copied": "Copiado",
  "menu.copyImage": "Copiar imagem",
  "menu.download": "Baixar",
  "menu.saveFailed": "N\xE3o foi poss\xEDvel salvar. Verifique a origem e o destino e tente novamente.",
  "menu.copyFailed": "N\xE3o foi poss\xEDvel copiar. Verifique se o conte\xFAdo est\xE1 dispon\xEDvel e tente novamente.",
  "menu.saved": "Salvo",
  "menu.downloadStarted": "Download iniciado",
  "menu.downloaded": "Download conclu\xEDdo",
  "path.revealError": "N\xE3o foi poss\xEDvel mostrar o local do arquivo. Tente novamente."
};

// upstream/packages/util/file-drag/src/index.ts.snapshot
function resolveDragFileName(request) {
  const { name = "file", mediaType, outputExtension } = request;
  let clean = name.replace(/[<>:"/\\|?*\x00-\x1f]/gu, "_").replace(/^[. ]+|[. ]+$/gu, "") || "file";
  const dot = clean.lastIndexOf(".");
  const suffix = dot < 0 ? "" : clean.slice(dot + 1);
  const declared = mediaType.replace(/;.*$/su, "").trim().toLowerCase();
  const preferred = src_default.getExtension(declared);
  const explicit = outputExtension?.replace(/^\./u, "").replace(/[^a-z\d_-]/giu, "");
  const compatible = src_default.getAllExtensions(declared)?.has(suffix.toLowerCase()) === true;
  const extension = explicit || (suffix === "" || preferred !== null && !compatible ? preferred : suffix);
  if (extension) clean = `${dot < 0 ? clean : clean.slice(0, dot)}.${extension}`;
  if (/^(con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/iu.test(clean)) clean = `_${clean}`;
  const finalDot = clean.lastIndexOf(".");
  const tail = finalDot < 0 ? "" : clean.slice(finalDot);
  const encoder = new TextEncoder();
  const truncate = (value, bytes) => {
    let result = "";
    for (const character of value) {
      const length = encoder.encode(character).length;
      if (length > bytes) break;
      result += character;
      bytes -= length;
    }
    return result;
  };
  const extensionTail = truncate(tail, 32);
  return `${truncate(finalDot < 0 ? clean : clean.slice(0, finalDot), 255 - encoder.encode(extensionTail).length)}${extensionTail}`;
}

// upstream/packages/client/ui-file-actions/src/client/files.ts.snapshot
function exportName(name, mediaType) {
  return resolveDragFileName({ name: name ?? "image", mediaType });
}
var BrowserFileActions = class {
  constructor(desktop) {
    this.desktop = desktop;
    this.canSaveAs = desktop !== void 0;
  }
  downloadUrl;
  lifetime = new AbortController();
  canSaveAs;
  async read(source) {
    this.lifetime.signal.throwIfAborted();
    if (source.read !== void 0) return source.read(this.lifetime.signal);
    const url = new URL(source.url);
    if (!["http:", "https:", "blob:", "data:", "dsh-app:"].includes(url.protocol)) throw new Error("Unsupported file source");
    if (this.desktop !== void 0 && ["http:", "https:"].includes(url.protocol) && url.origin !== location.origin) {
      const content = await this.desktop.readClipboardImage(url.href);
      this.lifetime.signal.throwIfAborted();
      return new Blob([new Uint8Array(content.bytes)], { type: content.mediaType || source.mediaType || "" });
    }
    const response = await fetch(source.url, { signal: this.lifetime.signal, referrerPolicy: "no-referrer" });
    if (!response.ok) throw new Error("Original file unavailable");
    return response.blob();
  }
  async save(source, mode) {
    this.lifetime.signal.throwIfAborted();
    if (this.desktop !== void 0) {
      const blob2 = source.read === void 0 ? void 0 : await source.read(this.lifetime.signal);
      this.lifetime.signal.throwIfAborted();
      const url2 = blob2 === void 0 ? source.url : URL.createObjectURL(blob2);
      try {
        const result = await this.desktop.save({
          url: url2,
          mode,
          ...source.name === void 0 ? {} : { name: source.name },
          ...blob2?.type || source.mediaType ? { mediaType: blob2?.type || source.mediaType } : {}
        });
        this.lifetime.signal.throwIfAborted();
        return result;
      } finally {
        if (blob2 !== void 0) URL.revokeObjectURL(url2);
      }
    }
    if (mode === "saveAs") throw new Error("Save as requires Desktop");
    const suggested = source.name ?? (URL.canParse(source.url) ? new URL(source.url).pathname.split("/").pop() : void 0);
    const blob = await this.read(source);
    this.lifetime.signal.throwIfAborted();
    const name = exportName(suggested, blob.type || source.mediaType || "");
    const url = URL.createObjectURL(blob);
    if (this.downloadUrl !== void 0) URL.revokeObjectURL(this.downloadUrl);
    this.downloadUrl = url;
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = name;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    return { status: "requested" };
  }
  async copyImage(source) {
    this.lifetime.signal.throwIfAborted();
    const png = this.read(source).then(async (blob) => {
      this.lifetime.signal.throwIfAborted();
      if (blob.type === "image/png") return blob;
      const objectUrl = URL.createObjectURL(blob);
      const image = new Image();
      image.src = objectUrl;
      await image.decode().catch((error) => {
        URL.revokeObjectURL(objectUrl);
        throw error;
      });
      try {
        const canvas = document.createElement("canvas");
        canvas.width = image.naturalWidth;
        canvas.height = image.naturalHeight;
        const context = canvas.getContext("2d");
        if (context === null) throw new Error("Image conversion unavailable");
        context.drawImage(image, 0, 0);
        return await new Promise((resolve, reject) => {
          canvas.toBlob((value) => {
            if (value === null) reject(new Error("Image conversion failed"));
            else resolve(value);
          }, "image/png");
        });
      } finally {
        URL.revokeObjectURL(objectUrl);
      }
    });
    await navigator.clipboard.write([new ClipboardItem({ "image/png": png })]);
  }
  /** Cancel reads and release browser download URLs when the plugin unloads. */
  dispose() {
    this.lifetime.abort();
    if (this.downloadUrl !== void 0) URL.revokeObjectURL(this.downloadUrl);
    this.downloadUrl = void 0;
  }
};

// upstream/packages/client/ui-file-actions/src/client/index.ts.snapshot
var inject2 = [];
function apply2(ctx) {
  const desktop = window.dshDesktop?.fileActions;
  const actions = new BrowserFileActions(desktop);
  ctx.provide("fileActions", actions);
  ctx.effect(() => () => {
    actions.dispose();
  }, "file actions: lifetime");
  ctx.inject(["contextMenus", "slots", "locale", "remote", "remote.workspaceFiles", "remote.session"], (child) => {
    child.effect(() => child.locale.register("fileActions", { zh: zh2, en: en2, ja: ja2, es: es2, fr: fr2, de: de2, ru: ru2, pt: pt2 }), "file actions: locale");
    child.slots.inject("contextMenu.icon", function* () {
      for (const [key, Icon] of Object.entries({
        "file-actions.copy": IconCopyOutlineRegular,
        "file-actions.download": IconDownloadOutlineRegular,
        "file-actions.save": IconSaveOutlineRegular
      })) yield child.slots.register({ name: "contextMenu.icon", key }, Icon);
    });
    registerFileMenus(child, actions, child.locale.bind("fileActions"));
  });
}

// upstream/packages/client/ui-context-menu/src/client/index.ts.snapshot
var index_ts_exports3 = {};
__export(index_ts_exports3, {
  Config: () => Config,
  apply: () => apply3,
  createMenuStore: () => createMenuStore,
  inject: () => inject3
});
import z from "@deepseek-ai/schemastery";

// upstream/packages/client/ui-context-menu/src/client/target-key.ts.snapshot
function menuTargetKey(target) {
  return JSON.stringify(target, (_key, value) => {
    if (typeof value !== "object" || value === null || Array.isArray(value)) return value;
    return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)));
  });
}

// upstream/packages/client/ui-context-menu/src/client/registry.ts.snapshot
var MenuRegistry = class {
  constructor(failed, timeoutMs) {
    this.failed = failed;
    this.timeoutMs = timeoutMs;
  }
  kindsSource = createSnapshotStore([]);
  /** Registered target kinds, independent of asynchronous action availability. */
  registeredKinds = this.kindsSource;
  providers = /* @__PURE__ */ new Map();
  occurrences = /* @__PURE__ */ new Set();
  disposed = false;
  /**
   * Register actions for subsequent openings.
   * @param input - provider definition.
   * @returns removal of this contribution and its pending resolutions.
   */
  register(input) {
    if (this.disposed) throw new Error("Menu registry is disposed");
    const key = `${encodeURIComponent(input.target)}/${encodeURIComponent(input.id)}`;
    if (this.providers.has(key)) throw new Error(`Duplicate menu contribution: ${key}`);
    const provider = {
      id: input.id,
      kind: input.target,
      order: input.order,
      lifetime: new AbortController(),
      observe: (target) => input.observe?.(target.value) ?? [],
      resolve: (target, signal) => input.resolve(target.value, signal)
    };
    this.providers.set(key, provider);
    this.publishKinds();
    return () => {
      if (provider.lifetime.signal.aborted) return;
      this.providers.delete(key);
      this.publishKinds();
      provider.lifetime.abort();
    };
  }
  /**
   * Resolve an independently owned occurrence.
   * @param target - captured clicked identity.
   * @returns presentation, selection, and disposal.
   */
  resolve(target) {
    if (this.disposed) throw new Error("Menu registry is disposed");
    const lifetime = new AbortController();
    const source = createSnapshotStore([]);
    const resolved = /* @__PURE__ */ new Map();
    const callbacks = /* @__PURE__ */ new Map();
    const providers = [...this.providers.values()].filter((p) => p.kind === target.kind).sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
    const refresh = () => {
      source.set(providers.flatMap((provider) => provider.lifetime.signal.aborted ? [] : resolved.get(provider) ?? []));
    };
    const cleanup2 = [];
    const dispose = () => {
      if (lifetime.signal.aborted) return;
      lifetime.abort();
      for (const detach of cleanup2) detach();
      callbacks.clear();
      this.occurrences.delete(dispose);
    };
    this.occurrences.add(dispose);
    const pending = [];
    for (const provider of providers) {
      let preparation;
      let actionIds = [];
      let preparing;
      const clear = () => {
        for (const id of actionIds) callbacks.delete(id);
        actionIds = [];
        resolved.delete(provider);
        refresh();
      };
      const prepare2 = () => {
        preparation?.abort();
        const deadline = new AbortController();
        preparation = deadline;
        const signal = AbortSignal.any([lifetime.signal, provider.lifetime.signal, deadline.signal]);
        const accept = (actions) => {
          if (signal.aborted) return;
          const next = /* @__PURE__ */ new Map();
          const project = (action, parent) => {
            const id = `${parent}/${encodeURIComponent(action.id)}`;
            if (next.has(id)) throw new Error(`Duplicate menu action: ${id}`);
            next.set(id, action);
            const { run: _run, failureLabel: _failureLabel, children, ...view } = action;
            return { ...view, id, ...children === void 0 ? {} : { children: children.map((child) => project(child, id)) } };
          };
          const views = actions.map((action) => project(action, encodeURIComponent(provider.id)));
          for (const id of actionIds) callbacks.delete(id);
          for (const [id, action] of next) callbacks.set(id, { provider, action });
          actionIds = [...next.keys()];
          resolved.set(provider, views);
          refresh();
        };
        preparing = void 0;
        try {
          const result = provider.resolve(target, signal);
          if (result instanceof Promise) clear();
          preparing = result instanceof Promise ? new Promise((settle) => {
            const timer = this.timeoutMs === void 0 ? void 0 : setTimeout(() => {
              deadline.abort();
              this.failed();
            }, this.timeoutMs);
            const finish = () => {
              clearTimeout(timer);
              signal.removeEventListener("abort", finish);
              settle();
            };
            signal.addEventListener("abort", finish, { once: true });
            void result.then(accept).catch(() => {
              if (!signal.aborted) this.failed();
            }).finally(finish);
          }) : void 0;
          if (!(result instanceof Promise)) accept(result);
        } catch (_error) {
          if (!signal.aborted) {
            clear();
            this.failed();
          }
        }
      };
      const subscriptions = [];
      const withdraw = () => {
        preparation?.abort();
        for (const detach of subscriptions.splice(0)) detach();
        clear();
      };
      provider.lifetime.signal.addEventListener("abort", withdraw, { once: true });
      cleanup2.push(() => {
        provider.lifetime.signal.removeEventListener("abort", withdraw);
        withdraw();
      });
      try {
        for (const input of provider.observe(target)) subscriptions.push(input.subscribe(prepare2));
        prepare2();
      } catch (_error) {
        if (!lifetime.signal.aborted && !provider.lifetime.signal.aborted) this.failed();
      }
      pending.push((async () => {
        let current2;
        do {
          current2 = preparing;
          await current2;
        } while (current2 !== preparing);
      })());
    }
    return {
      source,
      dispose,
      ready: Promise.all(pending).then(() => {
      }),
      select: (id) => {
        const selected = callbacks.get(id);
        if (lifetime.signal.aborted || selected === void 0 || selected.provider.lifetime.signal.aborted || selected.action.disabled || selected.action.children !== void 0) return;
        const run = selected.action.run;
        dispose();
        try {
          void Promise.resolve(run?.()).catch(() => {
            this.failed(selected.action.failureLabel);
          });
        } catch (_error) {
          this.failed(selected.action.failureLabel);
        }
      }
    };
  }
  /** Cancel every occurrence and reject further registrations or resolutions. */
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    for (const dispose of this.occurrences) dispose();
    for (const provider of this.providers.values()) provider.lifetime.abort();
    this.providers.clear();
    this.publishKinds();
  }
  publishKinds() {
    const kinds = [...new Set([...this.providers.values()].map((provider) => provider.kind))].sort();
    const previous = this.kindsSource.getSnapshot();
    if (kinds.length === previous.length && kinds.every((kind, index) => kind === previous[index])) return;
    this.kindsSource.set(kinds);
  }
};

// upstream/packages/client/ui-context-menu/src/client/store.ts.snapshot
function createMenuStore() {
  return defineStore({
    init: () => ({ occurrence: 0, closing: false, replacing: false, target: null, point: { x: 0, y: 0 }, items: [], notice: null }),
    actions: {
      open(draft, target, point) {
        draft.occurrence++;
        draft.closing = false;
        draft.replacing = false;
        draft.target = target;
        draft.point = point;
        draft.items = [];
      },
      items(draft, items) {
        draft.items = items;
      },
      exit(draft, replacing) {
        draft.closing = true;
        draft.replacing = replacing;
      },
      close(draft) {
        draft.target = null;
        draft.items = [];
      },
      notify(draft, notice) {
        draft.notice = notice;
      }
    }
  });
}

// upstream/packages/client/ui-context-menu/src/client/locales.ts.snapshot
var dictionaries = {
  zh: { back: "\u8FD4\u56DE", failed: "\u64CD\u4F5C\u5931\u8D25\uFF0C\u8BF7\u91CD\u8BD5" },
  en: { back: "Back", failed: "Could not complete the action. Try again." },
  ja: { back: "\u623B\u308B", failed: "\u64CD\u4F5C\u306B\u5931\u6557\u3057\u307E\u3057\u305F\u3002\u518D\u8A66\u884C\u3057\u3066\u304F\u3060\u3055\u3044\u3002" },
  es: { back: "Atr\xE1s", failed: "No se pudo completar la acci\xF3n. Int\xE9ntelo de nuevo." },
  fr: { back: "Retour", failed: "Impossible de terminer l\u2019action. R\xE9essayez." },
  de: { back: "Zur\xFCck", failed: "Die Aktion konnte nicht abgeschlossen werden. Versuchen Sie es erneut." },
  ru: { back: "\u041D\u0430\u0437\u0430\u0434", failed: "\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u0432\u044B\u043F\u043E\u043B\u043D\u0438\u0442\u044C \u0434\u0435\u0439\u0441\u0442\u0432\u0438\u0435. \u041F\u043E\u0432\u0442\u043E\u0440\u0438\u0442\u0435 \u043F\u043E\u043F\u044B\u0442\u043A\u0443." },
  pt: { back: "Voltar", failed: "N\xE3o foi poss\xEDvel concluir a a\xE7\xE3o. Tente novamente." }
};

// upstream/packages/client/ui-context-menu/src/client/external-trigger.ts.snapshot
function isContextMenuTrigger(node) {
  const element = node instanceof Element ? node : node.parentElement;
  return element?.closest("[data-context-menu-trigger]") != null;
}

// upstream/packages/client/ui-context-menu/src/client/View.tsx.snapshot
import { Fragment as Fragment7, jsx as jsx14, jsxs as jsxs12 } from "react/jsx-runtime";
function menuEntries(actions, catalog, renderSlot) {
  return actions.flatMap((action) => {
    const shortcut = catalog.find((entry) => entry.id === action.commandId);
    const item = {
      id: action.id,
      label: action.label,
      ...shortcut === void 0 ? {} : { shortcut },
      ...action.disabled === void 0 ? {} : { disabled: action.disabled },
      ...action.danger === void 0 ? {} : { danger: action.danger },
      ...action.icon === void 0 ? {} : {
        icon: renderSlot("contextMenu.icon", { icon: action.icon }, { entryKey: action.icon.key })
      },
      ...action.children === void 0 ? {} : { submenu: menuEntries(action.children, catalog, renderSlot) }
    };
    return action.separatorBefore ? [{ type: "separator", id: `${action.id}:separator` }, item] : [item];
  });
}
function MenuOverlay({ useStore, actions, renderSlot, close, select, returnFocus, useCatalog, t }) {
  const catalog = useCatalog((value) => value);
  const { target, point, items, notice, occurrence, closing, replacing } = useStore((s) => s);
  return /* @__PURE__ */ jsxs12(Fragment7, { children: [
    /* @__PURE__ */ jsx14(
      Menu,
      {
        open: target !== null,
        anchor: null,
        portal: true,
        autoFocus: true,
        contextual: true,
        returnFocus,
        submenuBackLabel: t("back"),
        isExternalTrigger: isContextMenuTrigger,
        exiting: closing ? replacing ? "replace" : "dismiss" : void 0,
        anchorPoint: point,
        items: menuEntries(items.filter((item) => !item.afterContent), catalog, renderSlot),
        footer: menuEntries(items.filter((item) => item.afterContent), catalog, renderSlot),
        onClose: close,
        onSelect: select,
        children: target !== null && renderSlot("contextMenu.content", { target, dismiss: close }, { entryKey: target.kind })
      },
      occurrence
    ),
    notice !== null && /* @__PURE__ */ jsx14(
      Toast,
      {
        text: notice.text,
        ...notice.action === void 0 ? {} : { actions: [notice.action] },
        ...notice.success ? { tone: "success" } : {},
        onDone: () => {
          actions.notify(null);
        }
      },
      notice.id
    )
  ] });
}

// upstream/packages/client/ui-context-menu/src/client/Button.tsx.snapshot
import { useId as useId7 } from "react";
import { jsx as jsx15 } from "react/jsx-runtime";
function ContextMenuButton({ target, label, className, size, useOpener, useRegisteredKinds, toggle }) {
  const id = useId7();
  const expanded = useOpener((opener) => opener === id);
  const available = useRegisteredKinds((kinds) => kinds.includes(target.kind));
  if (!available) return null;
  const attributes = {
    className,
    "data-context-menu-trigger": "",
    "aria-label": label,
    "aria-haspopup": "menu",
    "aria-expanded": expanded,
    onPointerDown: (event) => {
      event.stopPropagation();
    },
    onClick: (event) => {
      event.stopPropagation();
      event.currentTarget.focus({ preventScroll: true });
      const rect = event.currentTarget.getBoundingClientRect();
      toggle(id, target, { x: rect.left, y: rect.bottom });
    }
  };
  if (size !== "sm") return /* @__PURE__ */ jsx15("button", { ...attributes, type: "button", children: /* @__PURE__ */ jsx15(IconEllipsisOutlineRegular, {}) });
  return /* @__PURE__ */ jsx15(Tooltip, { label, side: "bottom", align: "end", portal: true, children: /* @__PURE__ */ jsx15(Button, { ...attributes, size: "sm", icon: /* @__PURE__ */ jsx15(IconEllipsisOutlineRegular, {}) }) });
}

// upstream/packages/client/ui-context-menu/src/client/trigger.ts.snapshot
function createContextMenuBindings(open, active) {
  return {
    getTriggerProps(target, handlers = {}) {
      if (target === void 0) return handlers;
      const show = (event, x, y) => {
        if (event.defaultPrevented || !active()) return;
        const captured = typeof target === "function" ? target() : target;
        event.preventDefault();
        event.stopPropagation();
        event.currentTarget.focus({ preventScroll: true });
        open(captured, { x, y });
      };
      return {
        ...handlers,
        tabIndex: handlers.tabIndex ?? 0,
        onContextMenu(event) {
          handlers.onContextMenu?.(event);
          const rect = event.clientX === 0 && event.clientY === 0 ? event.currentTarget.getBoundingClientRect() : void 0;
          show(event, rect?.left ?? event.clientX, rect?.bottom ?? event.clientY);
        },
        onKeyDown(event) {
          handlers.onKeyDown?.(event);
          if (event.defaultPrevented || event.repeat || event.nativeEvent.isComposing || event.ctrlKey || event.altKey || event.metaKey || !(event.key === "ContextMenu" || event.key === "F10" && event.shiftKey)) return;
          const rect = event.currentTarget.getBoundingClientRect();
          show(event, rect.left, rect.bottom);
        }
      };
    }
  };
}

// upstream/packages/client/ui-context-menu/src/client/index.ts.snapshot
var Config = z.object({ resolutionTimeoutMs: z.natural().min(1).default(1e3) });
var inject3 = ["slots", "locale", "shortcuts"];
function apply3(ctx, config = Config({})) {
  ctx.effect(() => ctx.locale.register("contextMenu", dictionaries), "context menu: locale");
  const t = ctx.locale.bind("contextMenu");
  const handle = createMenuStore();
  const instance = handle.create();
  const store = { ...handle, create: () => instance };
  const targetSource = createSnapshotStore(null);
  const opener = createSnapshotStore(null);
  let sequence = 0;
  let active;
  let closeTimer;
  let openingTimer;
  let finishOpening;
  let returnFocus = null;
  let disposed = false;
  const notify = (text, success = false, action) => {
    if (disposed) return;
    const id = ++sequence;
    instance.actions.notify({ id, text, success, ...action === void 0 ? {} : { action: {
      label: action.label,
      onClick: () => {
        if (disposed || instance.getSnapshot().notice?.id !== id) return;
        instance.actions.notify(null);
        try {
          void Promise.resolve(action.run()).catch(() => {
            notify(action.failureLabel);
          });
        } catch (_error) {
          notify(action.failureLabel);
        }
      }
    } } });
  };
  const registry = new MenuRegistry((message) => {
    notify(message ?? t("failed"));
  }, config.resolutionTimeoutMs);
  const cancelOpening = () => {
    clearTimeout(openingTimer);
    finishOpening?.();
    finishOpening = void 0;
    active?.unsubscribe();
    active?.resolution.dispose();
    active = void 0;
    targetSource.set(null);
    opener.set(null);
  };
  const dismiss = (replacing) => {
    cancelOpening();
    clearTimeout(closeTimer);
    if (instance.getSnapshot().target === null) return;
    instance.actions.exit(replacing);
    closeTimer = setTimeout(() => {
      instance.actions.close();
    }, replacing ? MENU_TRANSITION_MS.replace : MENU_TRANSITION_MS.dismiss);
  };
  const close = () => {
    dismiss(false);
  };
  const contextMenus = {
    active: targetSource,
    registeredKinds: registry.registeredKinds,
    register: (input) => registry.register(input),
    resolve: (target) => registry.resolve(target),
    notify,
    close,
    open: (target, point, options) => {
      const previous = active;
      if (options === void 0 && previous !== void 0 && Math.hypot(previous.point.x - point.x, previous.point.y - point.y) <= 4 && menuTargetKey(previous.target) === menuTargetKey(target)) {
        close();
        return;
      }
      show(target, point);
      if (options !== void 0) opener.set(options.button);
    }
  };
  function show(target, point) {
    const focused = document.activeElement;
    if (!(focused instanceof Element) || focused.closest("[data-context-menu]") === null) {
      returnFocus = focused instanceof HTMLElement ? focused : null;
    }
    dismiss(true);
    const resolution = registry.resolve(target);
    targetSource.set(target);
    let displayed = false;
    const publish2 = () => {
      if (displayed) instance.actions.items(resolution.source.getSnapshot());
    };
    const occurrence = { resolution, unsubscribe: resolution.source.subscribe(publish2), target, point };
    active = occurrence;
    const delay = new Promise((resolve) => {
      finishOpening = resolve;
      openingTimer = setTimeout(resolve, MENU_TRANSITION_MS.prepare);
    });
    void Promise.all([resolution.ready, delay]).then(() => {
      if (active !== occurrence) return;
      clearTimeout(closeTimer);
      instance.actions.open(target, point);
      displayed = true;
      publish2();
    });
  }
  ctx.provide("contextMenus", contextMenus);
  ctx.slots.registerFactory({
    name: "contextMenu.button",
    scope: "root",
    inject: () => ({
      hooks: { opener, registeredKinds: registry.registeredKinds },
      toggle: (button, target, point) => {
        if (disposed) return;
        if (opener.getSnapshot() === button) {
          close();
          return;
        }
        contextMenus.open(target, point, { button });
      }
    })
  }, ContextMenuButton);
  const bindings = createContextMenuBindings((target, point) => {
    contextMenus.open(target, point);
  }, () => !disposed);
  ctx.slots.provideRoot({ props: { useContextMenu: () => bindings } });
  ctx.effect(() => {
    const outside = (event) => {
      if (event.button === 2 || event.target instanceof Node && isContextMenuTrigger(event.target) || event.target instanceof Element && event.target.closest('[role="menu"]')) return;
      close();
    };
    const context = (event) => {
      if (!event.defaultPrevented) close();
    };
    const escape = (event) => {
      if (active !== void 0 && instance.getSnapshot().target === null && event.key === "Escape") {
        event.preventDefault();
        event.stopImmediatePropagation();
        close();
      }
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("contextmenu", context);
    window.addEventListener("keydown", escape, true);
    return () => {
      disposed = true;
      cancelOpening();
      clearTimeout(closeTimer);
      registry.dispose();
      instance.actions.close();
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("contextmenu", context);
      window.removeEventListener("keydown", escape, true);
    };
  }, "context menu: lifetime");
  ctx.slots.inject("shell.overlay", () => ctx.slots.register({
    name: "shell.overlay",
    id: "context-menu",
    store,
    locale: "contextMenu",
    children: {
      "contextMenu.content": { kind: "keyed", scope: "root" },
      "contextMenu.icon": { kind: "keyed", scope: "root", inline: true }
    },
    inject: () => ({ hooks: { catalog: ctx.shortcuts.catalog }, close, returnFocus: () => returnFocus, select: (id) => {
      const selected = active?.resolution;
      active?.unsubscribe();
      active = void 0;
      targetSource.set(null);
      opener.set(null);
      dismiss(false);
      selected?.select(id);
      selected?.dispose();
    } })
  }, MenuOverlay));
}

// upstream/packages/client/modules/src/client/manifest.ts.snapshot
function optionalStringArray(subject, field, value) {
  if (value === void 0) return void 0;
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error(`client-modules: ${subject} ${field} must be a string array`);
  }
  return value;
}
function stripClientSuffix(spec) {
  return spec.endsWith("/client") ? spec.slice(0, -"/client".length) : spec;
}
function parseBootManifest(wire) {
  if (typeof wire !== "object" || wire === null) {
    throw new Error("client-modules: window.__DSH_BOOT__ is missing or not an object");
  }
  const graph = wire;
  if (typeof graph.rev !== "string") {
    throw new Error("client-modules: boot manifest rev must be a string");
  }
  const release = decodeRelease(graph.release);
  if (release === null) {
    throw new Error("client-modules: boot manifest release must carry a string version and an optional string commit");
  }
  if (!Array.isArray(graph.entries)) {
    throw new Error("client-modules: boot manifest entries must be an array");
  }
  if (!Array.isArray(graph.batches)) {
    throw new Error("client-modules: boot manifest batches must be an array");
  }
  const moduleFields = [];
  const plugins2 = [];
  const seenEntryIds = /* @__PURE__ */ new Set();
  for (const value of graph.entries) {
    if (typeof value !== "object" || value === null) {
      throw new Error("client-modules: boot manifest entry is not an object");
    }
    const row = value;
    const where = typeof row.id === "string" ? `"${row.id}"` : JSON.stringify(row);
    if (typeof row.id !== "string" || typeof row.url !== "string" || typeof row.rev !== "string") {
      throw new Error(`client-modules: boot manifest entry ${where} must carry string id/url/rev`);
    }
    if (seenEntryIds.has(row.id)) throw new Error(`client-modules: duplicate graph entry "${row.id}"`);
    seenEntryIds.add(row.id);
    const subject = `boot manifest entry ${where}`;
    const inject4 = optionalStringArray(subject, "inject", row.inject);
    const external = optionalStringArray(subject, "external", row.external);
    if (row.immediately !== void 0 && typeof row.immediately !== "boolean") {
      throw new Error(`client-modules: boot manifest entry ${where} immediately must be a boolean`);
    }
    moduleFields.push({
      id: row.id,
      url: row.url,
      rev: row.rev,
      inject: inject4 === void 0 ? [] : [...inject4],
      external: external === void 0 ? [] : [...external]
    });
    plugins2.push({
      id: row.id,
      inject: inject4 === void 0 ? [] : [...inject4],
      immediately: row.immediately === true
    });
  }
  const entryIds = new Set(moduleFields.map((row) => row.id));
  const initialUrls = /* @__PURE__ */ new Map();
  const batchUrls = /* @__PURE__ */ new Set();
  for (const value of graph.batches) {
    if (typeof value !== "object" || value === null) {
      throw new Error("client-modules: boot manifest batch is not an object");
    }
    const batch = value;
    const phase = batch.phase;
    if (phase !== "bootstrap" && phase !== "application") {
      throw new Error(`client-modules: boot manifest batch phase must be "bootstrap" or "application", received ${JSON.stringify(phase)}`);
    }
    if (typeof batch.url !== "string" || typeof batch.rev !== "string") {
      throw new Error(`client-modules: boot manifest ${phase} batch must carry string url/rev`);
    }
    if (batchUrls.has(batch.url)) {
      throw new Error(`client-modules: boot manifest carries duplicate batch URL ${JSON.stringify(batch.url)}`);
    }
    batchUrls.add(batch.url);
    const entries = optionalStringArray(`boot manifest ${phase} batch`, "entries", batch.entries);
    if (entries === void 0 || entries.length === 0) {
      throw new Error(`client-modules: boot manifest ${phase} batch entries must be a non-empty string array`);
    }
    for (const id of entries) {
      if (!entryIds.has(id)) {
        throw new Error(`client-modules: boot manifest ${phase} batch names unknown entry "${id}"`);
      }
      if (initialUrls.has(id)) {
        throw new Error(`client-modules: boot manifest entry "${id}" belongs to more than one batch`);
      }
      initialUrls.set(id, batch.url);
    }
  }
  const modules = moduleFields.map((row) => {
    const initialUrl = initialUrls.get(row.id);
    if (initialUrl === void 0) {
      throw new Error(`client-modules: boot manifest entry "${row.id}" belongs to no initial-load batch`);
    }
    return { ...row, initialUrl };
  });
  return { rev: graph.rev, ...release === void 0 ? {} : { release }, modules, plugins: plugins2 };
}
function decodeRelease(value) {
  if (value === void 0) return void 0;
  const release = typeof value === "object" && value !== null ? value : void 0;
  const commit = release?.commit;
  if (release === void 0 || typeof release.version !== "string" || commit !== void 0 && typeof commit !== "string") return null;
  return { version: release.version, ...commit === void 0 ? {} : { commit } };
}
function readRelease(wire) {
  if (typeof wire !== "object" || wire === null) return void 0;
  return decodeRelease(wire.release) ?? void 0;
}

// upstream/packages/client/modules/src/client/notify.ts.snapshot
function notifySubscribers2(listeners, label) {
  for (const listener of [...listeners]) {
    try {
      listener();
    } catch (error) {
      console.error(`client-modules: ${label} subscriber failed`, error);
    }
  }
}

// upstream/packages/client/modules/src/client/release-change.ts.snapshot
function sameRelease(left, right) {
  return left?.version === right?.version && left?.commit === right?.commit;
}
function describeRelease(release) {
  return release === void 0 ? "none" : JSON.stringify(release);
}
var ReleaseChangeGate = class {
  /**
   * Start with the Host that served the boot graph.
   * @param page - boot graph's release identity.
   */
  constructor(page) {
    this.page = page;
    this.host = page;
  }
  /** Prompt-worthy release change; undefined while the Host serves the boot release or a dismissed one. */
  change = {
    getSnapshot: () => this.snapshot,
    subscribe: (listener) => {
      this.listeners.add(listener);
      return () => {
        this.listeners.delete(listener);
      };
    }
  };
  snapshot;
  listeners = /* @__PURE__ */ new Set();
  host;
  /** Host release the page last dismissed; a holder because an unpublished release is itself a value. */
  dismissed;
  /** Whether the connected Host serves the page's boot release; graphs and rebuilt frames apply only then. */
  get matches() {
    return sameRelease(this.host, this.page);
  }
  /**
   * Record the release of a received Host graph and update the announced change.
   * @param release - release identity of the received graph.
   * @returns true when the graph belongs to the page's boot release and may be applied.
   */
  observe(release) {
    const previous = this.host;
    this.host = release;
    const quiet = this.matches || this.dismissed !== void 0 && sameRelease(release, this.dismissed.release);
    if (quiet) {
      if (this.snapshot !== void 0) this.publish(void 0);
    } else if (this.snapshot === void 0 || !sameRelease(this.snapshot.host, release)) {
      console.warn(`client-modules: Host release changed from ${describeRelease(previous)} to ${describeRelease(release)}; plugin updates pause until this page reloads`);
      this.publish({ page: this.page, previous, host: release });
    }
    return this.matches;
  }
  /** Stop announcing the connected Host's release; the page keeps its boot release and still applies no other release. */
  dismiss() {
    if (this.snapshot === void 0) return;
    this.dismissed = { release: this.host };
    this.publish(void 0);
  }
  publish(snapshot2) {
    this.snapshot = snapshot2;
    notifySubscribers2(this.listeners, "release change");
  }
};

// upstream/packages/client/modules/src/client/entry-lifecycle.ts.snapshot
async function tearDownEntryFiber(entry) {
  const fiber = entry.fiber;
  if (fiber === void 0) return;
  const runtime = fiber.runtime;
  if (runtime !== null) entry.ctx.registry.delete(runtime.callback);
  while (fiber.inertia !== void 0) await fiber.inertia;
  delete entry.fiber;
}

// upstream/packages/client/modules/src/client/entries.ts.snapshot
var ACTIVE = 2;
var FAILED = 3;
function entryTargets(manifest) {
  return JSON.stringify(manifest.modules.map((row) => [row.id, row.rev, row.inject, row.external]));
}
var ClientEntries = class {
  /**
   * Construct the page controller before Cordis boot.
   * @param modules - Module arrival and materialization owner.
   * @param index - Private descriptor replacement and unused-module cleanup.
   */
  constructor(modules, index) {
    this.modules = modules;
    this.index = index;
    this.desired = modules.manifest;
    this.release = new ReleaseChangeGate(modules.manifest.release);
  }
  /** Stable observable consumed by page diagnostics through the renderer's injected hook. */
  state = {
    getSnapshot: () => this.snapshot,
    subscribe: (listener) => {
      this.listeners.add(listener);
      return () => {
        this.listeners.delete(listener);
      };
    }
  };
  // The modules bootstrap factory cannot request platform libraries before the shell supplies its seed.
  snapshot = { syncing: false, failures: [] };
  listeners = /* @__PURE__ */ new Set();
  /** Admits only Host graphs of the page's boot release. */
  release;
  managed = /* @__PURE__ */ new Map();
  revisions = /* @__PURE__ */ new Map();
  loader;
  queue = Promise.resolve();
  desired;
  generation = 0;
  stopped = false;
  /** Host release change to announce; undefined while the Host serves the page's boot release or a dismissed one. */
  get releaseChange() {
    return this.release.change;
  }
  /** Stop announcing the connected Host's release; updates stay paused until the Host returns to the boot release or the page reloads. */
  dismissRelease() {
    this.release.dismiss();
  }
  /**
   * Create the initial roster and retain its entry identities for subsequent reconciliation.
   * As the Host Loader group does, a row whose creation rejects (for example a module that exports no
   * plugin) is logged and stays an inactive entry, so one row cannot abort startup before the boot audit.
   * @param loader - Page Loader, already configured with the module system.
   * @param manifest - Initial roster audited by the boot caller.
   * @returns after initial entries and their activation settle; boot owns its activation audit.
   */
  start(loader, manifest) {
    if (this.loader !== void 0) throw new Error("client-modules: entries already started");
    this.loader = loader;
    this.desired = manifest;
    loader.ctx.effect(() => () => {
      this.stopped = true;
      this.generation++;
      return this.queue;
    }, "client-modules: entry reconciliation");
    return this.enqueue(async () => {
      await Promise.all(this.desired.plugins.map(async ({ id }) => {
        await this.create(loader, id).catch((error) => {
          loader.ctx.logger.error(error);
        });
      }));
      await loader.await();
      for (const row of this.modules.manifest.modules) this.revisions.set(row.id, row.rev);
    });
  }
  /**
   * Validate and apply the latest full Host graph. Changed targets cancel obsolete mounts; identical targets share pending loads.
   * The release is compared before the rest of the graph is validated: a graph of another release, including one whose
   * format this page cannot read, is not applied and {@link releaseChange} announces it.
   * @param graph - JSON-decoded graph received from the Host.
   * @returns after the queued reconciliation, or at once for another release; per-package failures remain available in {@link state}.
   */
  sync(graph) {
    if (!this.release.observe(readRelease(graph))) return Promise.resolve();
    const manifest = parseBootManifest(graph);
    if (entryTargets(manifest) !== entryTargets(this.desired)) this.generation++;
    this.desired = manifest;
    const generation = this.generation;
    return this.enqueue(() => this.reconcile(generation));
  }
  /**
   * Retry failed entries against the latest graph, including an unchanged revision.
   * @returns after retry settlement, with remaining errors in {@link state}.
   */
  retry() {
    const generation = ++this.generation;
    return this.enqueue(() => this.reconcile(generation));
  }
  /**
   * Replace one entry's code in the same queue as graph updates; duplicate revisions are ignored.
   * Entries missing after a failed import are reconciled; bootstrap replacement fails before teardown.
   * Ignored while the connected Host serves another release than the page's boot release.
   * @param id - Package id from a rebuilt frame.
   * @param rev - Opaque revision selecting the rebuilt artifact.
   * @returns after queued work; replacement errors reject, while per-package reconciliation errors remain in {@link state}.
   */
  reload(id, rev) {
    if (!this.release.matches) return Promise.resolve();
    this.desired = {
      ...this.desired,
      modules: this.desired.modules.map((row) => row.id === id ? { ...row, rev } : row)
    };
    return this.enqueue(async () => {
      const desired = this.desired.modules.find((row) => row.id === id);
      if (this.stopped || desired === void 0) return;
      const entry = this.managed.get(id);
      if (entry === void 0) {
        this.modules.invalidate(id, desired.rev);
        await this.reconcile(this.generation);
        return;
      }
      if (this.revisions.get(id) === rev) return;
      this.publish({ syncing: true, failures: this.snapshot.failures.filter((failure) => failure.id !== id) });
      await this.replace(entry, id, rev, this.generation);
      this.publish({ syncing: false, failures: this.snapshot.failures });
    }, id);
  }
  publish(snapshot2) {
    this.snapshot = snapshot2;
    notifySubscribers2(this.listeners, "synchronization");
  }
  enqueue(task, subject = "graph") {
    const run = this.queue.then(task);
    this.queue = run.then(() => void 0, (error) => {
      this.publish({ syncing: false, failures: [
        ...this.snapshot.failures.filter((failure) => failure.id !== subject),
        { id: subject, message: String(error) }
      ] });
    });
    return run;
  }
  current(generation) {
    return !this.stopped && generation === this.generation;
  }
  /** Keep ownership even when Loader rejects a module's plugin exports after inserting its entry. */
  async create(loader, id) {
    const options = { name: id };
    const entryId = loader.ensureId(options);
    try {
      await loader.create(options);
    } finally {
      this.managed.set(id, loader.resolve(entryId));
    }
  }
  async replace(entry, id, rev, generation) {
    this.index.invalidateForReplacement(id, rev);
    await this.modules.prefetch(id);
    if (!this.current(generation)) return;
    await tearDownEntryFiber(entry);
    this.index.releaseReplaced(id);
    if (!this.current(generation)) return;
    await this.modules.import(id, "", {});
    if (!this.current(generation)) return;
    await entry.refresh();
    await entry.fiber?.await();
    if (entry.fiber === void 0) throw new Error(`client-modules: ${id} import failed (see console)`);
    this.revisions.set(id, rev);
  }
  async reconcile(generation) {
    if (!this.current(generation)) return;
    const loader = this.loader;
    if (loader === void 0) throw new Error("client-modules: entries have not started");
    const manifest = this.desired;
    this.publish({ syncing: true, failures: [] });
    const failures = [];
    this.index.update(manifest, this.managed.keys());
    const wanted = new Set(manifest.plugins.map((row) => row.id));
    for (const [id, entry] of this.managed) {
      if (wanted.has(id)) continue;
      const fiber = entry.fiber;
      loader.remove(entry.id);
      this.managed.delete(id);
      this.revisions.delete(id);
      while (fiber?.inertia !== void 0) await fiber.inertia;
    }
    for (const row of manifest.modules) {
      if (!this.current(generation)) break;
      try {
        const entry = this.managed.get(row.id);
        if (entry === void 0) {
          await this.modules.prefetch(row.id);
          if (!this.current(generation)) break;
          await this.modules.import(row.id, "", {});
          if (!this.current(generation)) break;
          await this.create(loader, row.id);
          this.revisions.set(row.id, row.rev);
        } else if (this.revisions.get(row.id) !== row.rev) {
          await this.replace(entry, row.id, row.rev, generation);
        } else if (entry.fiber === void 0) {
          await this.replace(entry, row.id, row.rev, generation);
        } else if (entry.fiber.state === FAILED) {
          await entry.fiber.update(entry.options.config, true);
        }
      } catch (error) {
        failures.push({ id: row.id, message: String(error) });
      }
    }
    await loader.await();
    for (const [id, entry] of this.managed) {
      if (failures.some((failure) => failure.id === id)) continue;
      if (entry.fiber?.state === ACTIVE) continue;
      try {
        if (entry.fiber === void 0) throw new Error(`client-modules: ${id} import failed (see console)`);
        await entry.fiber.await();
        failures.push({ id, message: `client-modules: ${id} is waiting for activation` });
      } catch (error) {
        failures.push({ id, message: String(error) });
      }
    }
    this.index.prune([...loader.entries()].map((entry) => entry.options.name));
    if (this.current(generation)) this.publish({ syncing: false, failures });
  }
};

// upstream/packages/client/modules/src/client/main-realm.ts.snapshot
var loadPageBundle = (url) => new Promise((resolve, reject) => {
  const el = document.createElement("script");
  el.async = true;
  el.src = url;
  el.addEventListener("load", () => {
    el.remove();
    resolve();
  }, { once: true });
  el.addEventListener("error", () => {
    el.remove();
    reject(new Error(`client-modules: bundle script ${url} failed to load`));
  }, { once: true });
  document.head.append(el);
});
var MainScriptRealm = class {
  /** @param loadBundle - Carrier execution hook; absent selects the existing page transport. */
  constructor(loadBundle = loadPageBundle) {
    this.loadBundle = loadBundle;
  }
  id = "main";
  pending = /* @__PURE__ */ new Set();
  closed = false;
  disposal;
  /** @param script - Script requested by Modules. @returns The carrier's execution completion. */
  execute(script) {
    if (this.closed) return Promise.reject(new Error("client-modules: Main Realm is disposed"));
    const task = this.loadBundle(script.url);
    this.pending.add(task);
    void task.then(() => {
      this.pending.delete(task);
    }, () => {
      this.pending.delete(task);
    });
    return task;
  }
  /** Stop accepting requests and await existing carrier operations without cancelling them. */
  dispose() {
    if (this.disposal !== void 0) return this.disposal;
    this.closed = true;
    this.disposal = Promise.allSettled([...this.pending]).then(() => {
    });
    return this.disposal;
  }
};

// upstream/packages/client/modules/src/client/system.ts.snapshot
function atRevision(url, rev) {
  if (!/[?&]rev=[^&#]*/.test(url)) {
    throw new Error(`client-modules: bundle URL ${url} has no revision`);
  }
  return url.replace(/([?&]rev=)[^&#]*/, `$1${encodeURIComponent(rev)}`);
}
var CLIENT_CHUNK = /^client\.[A-Za-z0-9][A-Za-z0-9._-]*\.js$/;
function describeError(error) {
  return error instanceof Error ? error.message : String(error);
}
function chunkId(ownerId, fileName) {
  return `${ownerId}/${fileName}`;
}
function chunkUrl(row, fileName, rev) {
  const url = atRevision(row.url, rev);
  const marker = "/??";
  const resourceStart = url.indexOf(marker);
  const revisionStart = url.indexOf("&rev=", resourceStart + marker.length);
  const resource = resourceStart < 0 || revisionStart < 0 ? void 0 : url.slice(resourceStart + marker.length, revisionStart);
  if (resource !== `${row.id}/client.js`) {
    throw new Error(`client-modules: cannot resolve chunk ${JSON.stringify(fileName)} from bundle URL ${url}`);
  }
  return `${url.slice(0, resourceStart)}/${row.id}/${fileName}?${url.slice(revisionStart + 1)}`;
}
var ClientModuleSystem = class {
  version = "client";
  manifest;
  entries;
  loadCache = /* @__PURE__ */ new Map();
  mainRealm;
  /** Previous records of packages under replacement, by package id, until their old runtime is released. */
  replaced = /* @__PURE__ */ new Map();
  moduleListeners = /* @__PURE__ */ new Set();
  factories = /* @__PURE__ */ new Map();
  bootstrapIds = /* @__PURE__ */ new Set();
  staticIds = /* @__PURE__ */ new Set();
  /** In-flight script transport per URL. */
  pendingArrival = /* @__PURE__ */ new Map();
  /** Owner generation captured by in-flight chunk requests and advanced on invalidation. */
  generations = /* @__PURE__ */ new Map();
  /** Single-resource combo URL selected by HMR after invalidating one row. */
  reloadTargets = /* @__PURE__ */ new Map();
  /** Materialization re-entrancy guard: factory-form CJS cannot deliver partial exports, so a cycle is fatal. */
  materializing = /* @__PURE__ */ new Set();
  graphRows = /* @__PURE__ */ new Map();
  resolveAsset;
  /** Last import or prefetch failure per graph row, cleared by a later success or invalidation. */
  importErrors = /* @__PURE__ */ new Map();
  /** Batch URLs whose transport or execution already failed; rows still missing from them go straight to their one-resource URL. */
  failedBundleUrls = /* @__PURE__ */ new Set();
  /** Every URL whose script has executed once; a batch among them is never requested again. */
  executedBundleUrls = /* @__PURE__ */ new Set();
  /**
   * Build the module system over the parsed boot rows.
   * @param options - Parsed graph, delivered manifests, bootstrap module, registration facade, and transport.
   */
  constructor(options) {
    this.manifest = options.manifest;
    this.entries = new ClientEntries(this, {
      update: (manifest, managed) => {
        this.updateManifest(manifest, managed);
      },
      invalidateForReplacement: (id, rev) => {
        if (this.bootstrapIds.has(id)) throw new Error(`client-modules: replacing bootstrap module ${id} requires a page reload`);
        this.drop(id, rev, true);
      },
      releaseReplaced: (id) => {
        if (this.replaced.delete(this.resolveModuleId(id))) this.publishModules();
      },
      prune: (roots) => {
        this.prune(roots);
      }
    });
    this.mainRealm = new MainScriptRealm(options.loadBundle);
    this.resolveAsset = options.resolveAsset ?? ((reference) => reference);
    for (const row of options.manifest.modules) {
      this.graphRows.set(row.id, row);
    }
    const bootstrapId = stripClientSuffix(options.bootstrapModule.id);
    this.bootstrapIds.add(bootstrapId);
    this.loadCache.set(bootstrapId, {
      id: bootstrapId,
      ownerId: bootstrapId,
      exports: options.bootstrapModule.exports,
      edges: /* @__PURE__ */ new Set()
    });
    const target = options.registrationTarget;
    if (target.mode !== "queue") {
      throw new Error("client-modules: window.__ModuleLoader__.create called after module-system boot");
    }
    const pending = target.pendingQueue.splice(0);
    target.mode = "live";
    target.load = (registration) => {
      this.register(registration);
    };
    for (const registration of options.staticModules) {
      this.staticIds.add(registration.id);
      if (registration.id === bootstrapId && registration.chunk === void 0) continue;
      target.load(registration);
    }
    for (const registration of pending) target.load(registration);
  }
  subscribeModules(listener) {
    this.moduleListeners.add(listener);
    return () => {
      this.moduleListeners.delete(listener);
    };
  }
  *activeRecords() {
    for (const records of this.replaced.values()) yield* records;
    yield* this.loadCache.values();
  }
  publishModules() {
    notifySubscribers2(this.moduleListeners, "modules");
  }
  /** Stop accepting script execution and await the startup carrier's pending operations. */
  dispose() {
    return this.mainRealm.dispose();
  }
  resolveModuleId(specifier) {
    return this.staticIds.has(specifier) || this.factories.has(specifier) || this.loadCache.has(specifier) ? specifier : stripClientSuffix(specifier);
  }
  /** Register one bundle factory, rejecting a script that executes twice without invalidation. */
  register(registration) {
    const ownerId = registration.id;
    if (registration.chunk !== void 0 && !CLIENT_CHUNK.test(registration.chunk)) {
      throw new Error(`client-modules: invalid package-local chunk ${JSON.stringify(registration.chunk)}`);
    }
    const id = registration.chunk === void 0 ? ownerId : chunkId(ownerId, registration.chunk);
    if (this.loadCache.has(id) || this.factories.has(id)) {
      const registrationName = registration.chunk === void 0 ? registration.id : id;
      throw new Error(`client-modules: duplicate factory registration for "${registrationName}" (bundle executed twice without invalidate?)`);
    }
    this.factories.set(id, {
      manifest: registration,
      factory: registration.factory,
      rev: this.reloadTargets.get(ownerId)?.rev ?? this.graphRows.get(ownerId)?.rev
    });
  }
  /** Run one shared script transport per URL. */
  loadShared(url) {
    let transport = this.pendingArrival.get(url);
    if (transport === void 0) {
      transport = this.mainRealm.execute({ url }).then(() => {
        this.executedBundleUrls.add(url);
      }).finally(() => {
        this.pendingArrival.delete(url);
      });
      this.pendingArrival.set(url, transport);
    }
    return transport;
  }
  /**
   * Load one graph row so its factory is registered (idempotent per in-flight
   * arrival). A batch script is one classic script that registers every
   * package in sequence, and {@link register} rejects a second registration,
   * so the two failure kinds differ: a transport failure (`error` event, nothing
   * executed) is retried once on the same URL; a script that loaded without
   * registering this row (a parse error registered nothing, or a runtime throw
   * stopped it after registering others) is never re-executed, because a replay
   * would stop again at the first duplicate registration; that holds even when
   * the row that first imports from the batch is one it did register, because
   * every executed batch URL is remembered. Either way the row then falls back
   * to its own one-resource URL, which the Host serves for every package, so one
   * failed batch costs at most three requests per missing row and never fails
   * the rows that were registered.
   */
  async arrive(row) {
    const { id } = row;
    if (this.loadCache.has(id) || this.factories.has(id)) return;
    const reload = this.reloadTargets.get(id);
    const preferred = reload?.url ?? row.initialUrl;
    const fallback = reload === void 0 && row.url !== preferred ? row.url : void 0;
    const failures = [];
    const attempt = async (url) => {
      try {
        await this.loadShared(url);
      } catch (error) {
        failures.push(`${url}: ${describeError(error)}`);
        return "transport-failed";
      }
      if (this.factories.has(id)) return "registered";
      failures.push(`${url}: loaded without registering "${id}" via __ModuleLoader__.load`);
      return "not-registered";
    };
    let outcome = "transport-failed";
    if (this.failedBundleUrls.has(preferred)) {
      failures.push(`${preferred}: skipped after an earlier failure of this bundle`);
    } else if (fallback !== void 0 && this.executedBundleUrls.has(preferred)) {
      failures.push(`${preferred}: already executed without registering "${id}"`);
      outcome = "not-registered";
      this.failedBundleUrls.add(preferred);
    } else {
      outcome = await attempt(preferred);
      if (outcome === "transport-failed") outcome = await attempt(preferred);
      if (outcome !== "registered" && fallback !== void 0) this.failedBundleUrls.add(preferred);
    }
    if (outcome !== "registered" && fallback !== void 0) outcome = await attempt(fallback);
    if (outcome !== "registered") {
      throw new Error(`client-modules: could not load "${id}": ${failures.join("; ")}`);
    }
    if (reload !== void 0 && this.reloadTargets.get(id) === reload) {
      this.reloadTargets.delete(id);
    }
  }
  /** Register each injected package and unresolved dynamic request before its consumer. */
  async arriveGraphRow(row, open = [], visited = /* @__PURE__ */ new Set()) {
    const cycleStart = open.indexOf(row.id);
    if (cycleStart !== -1) {
      throw new Error(
        `client-modules: module arrival cycle ${[...open.slice(cycleStart), row.id].join(" -> ")} (the host must reject this graph before serving it)`
      );
    }
    if (visited.has(row.id)) return;
    visited.add(row.id);
    const next = [...open, row.id];
    for (const request of row.external) {
      const id = this.resolveModuleId(request);
      if (this.loadCache.has(id) || this.factories.has(id) && !this.graphRows.has(id)) continue;
      const dependency = this.graphRows.get(id);
      if (dependency !== void 0) await this.arriveDependency(row.id, dependency, next, visited);
    }
    for (const packageName of row.inject) {
      const dependency = this.graphRows.get(packageName);
      if (dependency !== void 0) await this.arriveDependency(row.id, dependency, [], visited);
    }
    await this.arrive(row);
  }
  /** Arrive one dependency, naming the consumer it failed for so a cascade reads as a chain, not as 44 unrelated failures. */
  async arriveDependency(consumerId, dependency, open, visited) {
    try {
      await this.arriveGraphRow(dependency, open, visited);
    } catch (error) {
      throw new Error(
        `client-modules: "${consumerId}" not loaded because dependency "${dependency.id}" failed: ${describeError(error)}`,
        { cause: error }
      );
    }
  }
  /** Materialize a registered factory (synchronous; memoized in loadCache). */
  materialize(id) {
    const existing = this.loadCache.get(id);
    if (existing !== void 0) return existing;
    const registered = this.factories.get(id);
    if (registered === void 0) throw new Error(`client-modules: no registered factory for "${id}"`);
    if (this.materializing.has(id)) {
      throw new Error(`client-modules: require cycle through "${id}" (factory-form CJS cannot deliver partial exports)`);
    }
    this.materializing.add(id);
    let record2;
    try {
      const edges = /* @__PURE__ */ new Set();
      const exports = registered.factory(this.makeRequire(registered.manifest.id, edges, () => {
        if (this.loadCache.get(id)?.edges === edges) this.publishModules();
      }));
      record2 = {
        id,
        ownerId: registered.manifest.id,
        exports,
        edges,
        ...registered.manifest.meta === void 0 ? {} : { meta: registered.manifest.meta }
      };
      this.loadCache.set(id, record2);
    } finally {
      this.materializing.delete(id);
    }
    this.publishModules();
    return record2;
  }
  /** Build the synchronous module-table require, its asynchronous chunk operation, and its asset resolver. */
  makeRequire(ownerId, edges, onEdgesChanged) {
    const resolve = (spec) => {
      const id = this.resolveModuleId(spec);
      const record2 = this.loadCache.get(id);
      if (record2 !== void 0) return record2.exports;
      if (this.factories.has(id)) return this.materialize(id).exports;
      throw new Error(
        `client-modules: require("${spec}") missed the module table \u2014 not a materialized module, and no registered package factory (a build-time externals drift, or a dynamic dependency that did not arrive)`
      );
    };
    const recordEdge = (spec) => {
      if (edges.has(spec)) return;
      edges.add(spec);
      if (!spec.startsWith("./")) onEdgesChanged();
    };
    const require2 = (spec) => {
      const exports = resolve(spec);
      recordEdge(spec);
      return exports;
    };
    require2.asset = (reference) => this.resolveAsset(reference);
    require2.async = async (spec) => {
      if (!spec.startsWith("./")) {
        const exports2 = await this.import(spec);
        recordEdge(spec);
        return exports2;
      }
      const fileName = spec.slice(2);
      if (!CLIENT_CHUNK.test(fileName)) {
        throw new Error(`client-modules: invalid relative chunk request ${JSON.stringify(spec)}`);
      }
      const exports = await this.importChunk(ownerId, fileName);
      recordEdge(spec);
      return exports;
    };
    return require2;
  }
  /** Load, register, and materialize one package-local dynamic chunk. */
  async importChunk(ownerId, fileName) {
    const id = chunkId(ownerId, fileName);
    const existing = this.loadCache.get(id);
    if (existing !== void 0) return existing.exports;
    if (!this.factories.has(id)) {
      const generation = this.generations.get(ownerId) ?? 0;
      const row = this.graphRows.get(ownerId);
      if (row === void 0) throw new Error(`client-modules: chunk owner "${ownerId}" is not a boot graph entry`);
      const revision = this.factories.get(ownerId)?.rev ?? this.reloadTargets.get(ownerId)?.rev ?? row.rev;
      const url = chunkUrl(row, fileName, revision);
      await this.loadShared(url);
      if ((this.generations.get(ownerId) ?? 0) !== generation) {
        this.factories.delete(id);
        if (this.loadCache.delete(id)) this.publishModules();
        return await this.importChunk(ownerId, fileName);
      }
      if (!this.factories.has(id)) {
        throw new Error(`client-modules: bundle ${url} loaded without registering "${id}" via __ModuleLoader__.load`);
      }
    }
    return this.materialize(id).exports;
  }
  async import(specifier) {
    const id = this.resolveModuleId(specifier);
    const existing = this.loadCache.get(id);
    if (existing !== void 0) return existing.exports;
    const row = this.graphRows.get(id);
    if (row === void 0) {
      if (this.factories.has(id)) return this.materialize(id).exports;
      throw new Error(
        `client-modules: cannot resolve "${specifier}" \u2014 not a materialized module, and not a row in the boot graph (the runtime mirror of the bundle purity gate)`
      );
    }
    return this.recordingImportError(id, async () => {
      await this.arriveGraphRow(row);
      return this.materialize(id).exports;
    });
  }
  async prefetch(id) {
    const normalized = this.resolveModuleId(id);
    if (this.loadCache.has(normalized)) return;
    const row = this.graphRows.get(normalized);
    if (row === void 0 && this.factories.has(normalized)) return;
    if (row === void 0) throw new Error(`client-modules: prefetch("${id}") \u2014 not a graph entry`);
    await this.recordingImportError(normalized, () => this.arriveGraphRow(row));
  }
  importError(id) {
    return this.importErrors.get(stripClientSuffix(id));
  }
  /**
   * Run one graph-row operation, recording its failure for the boot audit and
   * clearing the record on success. Arrival and materialization both run in
   * here, so a factory that throws is recorded as well as a bundle that never
   * arrived; the Loader only sees a missing fiber either way.
   */
  async recordingImportError(id, operation) {
    try {
      const result = await operation();
      this.importErrors.delete(id);
      return result;
    } catch (error) {
      this.importErrors.set(id, error instanceof Error ? error : new Error(describeError(error)));
      throw error;
    }
  }
  /** Refresh descriptors and unowned factory revisions before any entry imports its dependencies. */
  updateManifest(manifest, managed) {
    for (const id of this.bootstrapIds) {
      if (this.manifest.modules.some((row) => row.id === id) && !manifest.modules.some((row) => row.id === id)) {
        throw new Error(`client-modules: removing bootstrap module ${id} requires a page reload`);
      }
    }
    const owned = new Set(managed);
    for (const row of manifest.modules) {
      this.graphRows.set(row.id, { ...row, initialUrl: row.url });
      const cachedRevision = this.factories.get(row.id)?.rev ?? this.reloadTargets.get(row.id)?.rev;
      if (!owned.has(row.id) && cachedRevision !== void 0 && cachedRevision !== row.rev) {
        this.invalidate(row.id, row.rev);
      }
    }
    this.manifest = manifest;
  }
  /** Retain live Loader modules and their transitive requests before evicting unreferenced graph records. */
  prune(roots) {
    const retained = new Set(this.bootstrapIds);
    const visit = (specifier) => {
      const id = this.resolveModuleId(specifier);
      if (retained.has(id)) return;
      retained.add(id);
      const row = this.graphRows.get(id);
      const observed = [this.loadCache.get(id), ...this.replaced.get(id) ?? []].flatMap((record2) => [...record2?.edges ?? []]);
      for (const request of [...row?.external ?? [], ...row?.inject ?? [], ...observed]) {
        visit(request);
      }
    };
    for (const id of this.staticIds) visit(id);
    for (const row of this.manifest.modules) visit(row.id);
    for (const id of roots) visit(id);
    for (const id of this.graphRows.keys()) {
      if (retained.has(id)) continue;
      this.graphRows.delete(id);
      this.invalidate(id);
    }
  }
  invalidate(id, rev) {
    this.drop(id, rev, false);
  }
  /**
   * Reset one package's code. With `retain`, its materialized records stay in {@link activeRecords}
   * until `releaseReplaced`, because the runtime created from them is still running.
   */
  drop(id, rev, retain) {
    const normalized = this.resolveModuleId(id);
    if (this.bootstrapIds.has(normalized)) throw new Error(`client-modules: replacing bootstrap module ${normalized} requires a page reload`);
    if (this.staticIds.has(normalized)) return;
    this.importErrors.delete(normalized);
    this.generations.set(normalized, (this.generations.get(normalized) ?? 0) + 1);
    const row = this.graphRows.get(normalized);
    if (row !== void 0) {
      const revision = rev ?? row.rev;
      this.reloadTargets.set(normalized, { url: atRevision(row.url, revision), rev: revision });
    } else this.reloadTargets.delete(normalized);
    for (const key of this.factories.keys()) {
      if (key === normalized || key.startsWith(`${normalized}/client.`)) this.factories.delete(key);
    }
    const removed = [];
    for (const [key, record2] of this.loadCache) {
      if (key === normalized || key.startsWith(`${normalized}/client.`)) {
        this.loadCache.delete(key);
        removed.push(record2);
      }
    }
    if (retain) {
      if (removed.length > 0) this.replaced.set(normalized, [...this.replaced.get(normalized) ?? [], ...removed]);
      return;
    }
    if (this.replaced.delete(normalized) || removed.length > 0) this.publishModules();
  }
};

// upstream/packages/client/modules/src/client/index.ts.snapshot
function createClientModuleSystem(target, bootstrapModule, options) {
  return new ClientModuleSystem({
    manifest: parseBootManifest(options.boot),
    staticModules: options.staticModules,
    registrationTarget: target,
    bootstrapModule,
    ...options.loadBundle === void 0 ? {} : { loadBundle: options.loadBundle },
    ...options.resolveAsset === void 0 ? {} : { resolveAsset: options.resolveAsset }
  });
}

// upstream/packages/client/locale/src/locale-settings.ts.snapshot
import z2 from "@deepseek-ai/schemastery";
var LOCALE_PREFERENCE_FIELD = "preference";
var LOCALE_ID_PATTERN = /^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{1,8})*$/u;
var LOCALE_IDS = ["zh", "en"];
var LocaleSettingsFields = {
  [LOCALE_PREFERENCE_FIELD]: z2.string().pattern(LOCALE_ID_PATTERN).required(false)
};
var LocaleSettingsSchema = z2.object(LocaleSettingsFields);

// upstream/packages/client/locale/src/client/LanguageRow.tsx.snapshot
import { useState as useState7 } from "react";
import { jsx as jsx16, jsxs as jsxs13 } from "react/jsx-runtime";

// upstream/packages/client/locale/src/client/index.ts.snapshot
var FALLBACK_LOCALE = "en";
var COMMON_NS = "common";
var BUILT_IN_LOCALE_METADATA = {
  zh: { label: "\u4E2D\u6587", fallback: "en" },
  en: { label: "English" }
};
var BUILT_IN_LOCALES = Object.freeze(
  LOCALE_IDS.map((id) => Object.freeze({ id, ...BUILT_IN_LOCALE_METADATA[id] }))
);
function localeKey(value) {
  return value.toLowerCase();
}
function normalizeLanguage(input) {
  if (!LOCALE_ID_PATTERN.test(input.id)) {
    throw new Error(`locale id "${input.id}" is not a BCP 47-style tag`);
  }
  if (input.label.trim() === "") throw new Error("locale label must not be empty");
  if (!LOCALE_ID_PATTERN.test(input.fallback)) {
    throw new Error(`locale fallback "${input.fallback}" is not a BCP 47-style tag`);
  }
  return Object.freeze({ id: input.id, label: input.label, fallback: input.fallback });
}
var LocaleRuntime = class {
  /**
   * @param ctx - owning context (change events are emitted on it; the scope
   * listener is released through ctx.effect on dispose).
   * @param host - durable preference scope owned by the providing plugin;
   * absent compositions (standalone dictionary registries) stay process-local.
   * @param bootstrap - native initialization; absent in ordinary browsers.
   */
  constructor(ctx, host, bootstrap) {
    this.bootstrap = bootstrap;
    this.ctx = ctx;
    this.host = host;
    for (const locale of BUILT_IN_LOCALES) this.catalog.set(localeKey(locale.id), locale);
    const locales = this.localeList();
    this.provisional = resolveInitialLocale(locales, bootstrap?.languages);
    this.preference = bootstrap?.preference ?? void 0;
    this.snapshot = Object.freeze({ active: this.resolveActive(), locales, revision: 0 });
    if (host !== void 0) {
      ctx.effect(() => host.subscribe(() => {
        this.adopt(host);
      }), "locale: settings scope adoption");
      this.adopt(host);
    }
  }
  dicts = /* @__PURE__ */ new Map();
  bound = /* @__PURE__ */ new Map();
  catalog = /* @__PURE__ */ new Map();
  fallbackChains = /* @__PURE__ */ new Map();
  snapshot;
  listeners = /* @__PURE__ */ new Set();
  ctx;
  host;
  /** Browser-derived locale standing wherever no explicit Host selection does. */
  provisional;
  /** Last explicit selection, including one awaiting an external registration. */
  preference;
  /**
   * Read the current immutable locale snapshot.
   * @returns the current snapshot (stable reference until the next change).
   */
  getLocale() {
    return this.snapshot;
  }
  /**
   * Resolve package text through the active language's declared fallback chain.
   * Plain strings stay verbatim; maps do not consult registered dictionaries.
   * @param text - package text whose locale keys are lowercase and include English.
   * @returns the first available translation, including an empty string.
   */
  resolveText(text) {
    if (typeof text === "string") return text;
    return this.fallbackChain(this.snapshot.active).reduceRight(
      (resolved, locale) => text[localeKey(locale)] ?? resolved,
      text.en
    );
  }
  /**
   * LocaleFace getSnapshot: the current snapshot (carries `revision`; stable
   * reference between changes, uSES-safe).
   * @returns the current snapshot.
   */
  getSnapshot() {
    return this.snapshot;
  }
  /**
   * LocaleFace subscribe: notified on every snapshot change (locale switch
   * or dictionary registration — registrations bump the revision so already
   * rendered outlets pick up late-arriving dictionaries and locale definitions).
   * @param fn - change callback.
   * @returns unsubscribe.
   */
  subscribe(fn) {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }
  /**
   * Switch the active locale — the only user preference write entry.
   *
   * The durable write happens even when the id already matches the active
   * locale, because the active value may be a provisional browser-derived or
   * fallback resolution that nothing has stored yet. Picking the language
   * already on screen is still an explicit choice, and it must survive a
   * different browser sharing the same DSH home. Only the render notification
   * is conditional: republishing an unchanged locale would churn every
   * subscriber for nothing.
   * @param id - a registered locale id; unknown ids throw.
   */
  setLocale(id) {
    const match = this.catalog.get(localeKey(id));
    if (match === void 0) throw new Error(`locale "${id}" is not registered`);
    this.preference = match.id;
    if (this.snapshot.active !== match.id) this.publish(match.id, true);
    void this.host?.set(LOCALE_PREFERENCE_FIELD, match.id);
  }
  /**
   * Add one selectable language to the shared catalog. Its fallback must
   * already be registered, and following fallback definitions must terminate
   * at English. Dictionaries may register before or after this definition.
   * Registration rechecks an unresolved Host preference and the browser's
   * ordered language list. The caller owns the returned disposer; removing an
   * active language falls back without clearing the stored id.
   * @param input - stable id, self-described label, and fallback language id.
   * @returns idempotent disposer removing this exact definition.
   * @throws when fields are malformed, the id is occupied, or the fallback
   * target is unknown or creates a cycle.
   */
  addLanguage(input) {
    const candidate = normalizeLanguage(input);
    const key = localeKey(candidate.id);
    if (this.catalog.has(key)) throw new Error(`locale "${candidate.id}" is already registered`);
    const fallback = this.catalog.get(localeKey(candidate.fallback));
    if (fallback === void 0) {
      throw new Error(`locale fallback "${candidate.fallback}" is not registered`);
    }
    const language = Object.freeze({ ...candidate, fallback: fallback.id });
    this.catalog.set(key, language);
    try {
      this.assertFallbackChain(language.id);
    } catch (error) {
      this.catalog.delete(key);
      throw error;
    }
    this.publishCatalog();
    return () => {
      if (this.catalog.get(key) !== language) return;
      this.catalog.delete(key);
      this.publishCatalog();
    };
  }
  /**
   * Adopt the scope's accepted durable selection without writing it back; an
   * absent selection returns to the browser-derived locale.
   * @param host - the constructor-narrowed scope driving this adoption.
   */
  adopt(host) {
    const section = host.getSnapshot().value;
    if (section === void 0) return;
    this.preference = section.preference;
    const target = this.resolveActive();
    if (this.snapshot.active === target) return;
    this.publish(target, true);
  }
  /** Recompute browser fallback and publish the current catalog. */
  publishCatalog() {
    this.fallbackChains.clear();
    const locales = this.localeList();
    this.provisional = resolveInitialLocale(locales, this.bootstrap?.languages);
    const active = this.resolveActive();
    this.publish(active, active !== this.snapshot.active, locales);
  }
  /** Resolve an explicit preference only while its definition is available. */
  resolveActive() {
    if (this.preference === void 0) return this.provisional;
    return this.catalog.get(localeKey(this.preference))?.id ?? this.provisional;
  }
  /** Snapshot the catalog in registration order. */
  localeList() {
    return Object.freeze([...this.catalog.values()]);
  }
  /** Fail a new definition whose complete fallback path does not reach English. */
  assertFallbackChain(start) {
    const seen2 = /* @__PURE__ */ new Set();
    let current2 = this.catalog.get(localeKey(start));
    while (current2 !== void 0) {
      const key = localeKey(current2.id);
      if (seen2.has(key)) throw new Error(`locale fallback cycle includes "${current2.id}"`);
      seen2.add(key);
      if (key === localeKey(FALLBACK_LOCALE)) return;
      if (current2.fallback === void 0) {
        throw new Error(`locale "${current2.id}" fallback chain does not reach "${FALLBACK_LOCALE}"`);
      }
      const next = this.catalog.get(localeKey(current2.fallback));
      if (next === void 0) {
        throw new Error(`locale fallback "${current2.fallback}" is not registered`);
      }
      current2 = next;
    }
  }
  /** Resolve a lookup chain, falling directly to English across an unload gap. */
  fallbackChain(start) {
    const startKey = localeKey(start);
    const cached = this.fallbackChains.get(startKey);
    if (cached !== void 0) return cached;
    const chain = [];
    const seen2 = /* @__PURE__ */ new Set();
    let current2 = this.catalog.get(startKey);
    while (current2 !== void 0 && !seen2.has(localeKey(current2.id))) {
      const key = localeKey(current2.id);
      seen2.add(key);
      chain.push(current2.id);
      current2 = current2.fallback === void 0 ? void 0 : this.catalog.get(localeKey(current2.fallback));
    }
    if (!seen2.has(localeKey(FALLBACK_LOCALE))) chain.push(FALLBACK_LOCALE);
    const resolved = Object.freeze(chain);
    this.fallbackChains.set(startKey, resolved);
    return resolved;
  }
  register(ns, localeOrDicts, dict) {
    const pairs = typeof localeOrDicts === "string" ? [[localeOrDicts, dict]] : Object.entries(localeOrDicts);
    for (const [locale] of pairs) {
      if (!LOCALE_ID_PATTERN.test(locale)) {
        throw new Error(`locale id "${locale}" is not a BCP 47-style tag`);
      }
    }
    let locales = this.dicts.get(ns);
    if (!locales) {
      locales = /* @__PURE__ */ new Map();
      this.dicts.set(ns, locales);
    }
    for (const [locale] of pairs) {
      if (locales.has(localeKey(locale))) {
        throw new Error(`locale namespace "${ns}" already has locale "${locale}"`);
      }
    }
    for (const [locale, entries] of pairs) locales.set(localeKey(locale), entries);
    this.publish(this.snapshot.active, false);
    return () => {
      const owner = this.dicts.get(ns);
      if (!owner) return;
      let removed = false;
      for (const [locale, entries] of pairs) {
        const key = localeKey(locale);
        if (owner.get(key) === entries) {
          owner.delete(key);
          removed = true;
        }
      }
      if (removed) this.publish(this.snapshot.active, false);
    };
  }
  bind(ns) {
    let t = this.bound.get(ns);
    if (!t) {
      t = (key, params) => this.translate(ns, key, params);
      this.bound.set(ns, t);
      return t;
    }
    return t;
  }
  translate(ns, key, params) {
    const chain = this.fallbackChain(this.snapshot.active);
    const template = this.lookup(ns, key, chain) ?? (ns !== COMMON_NS ? this.lookup(COMMON_NS, key, chain) : void 0) ?? key;
    if (!params) return template;
    return template.replace(/\{(\w+)\}/g, (match, name) => name in params ? String(params[name]) : match);
  }
  lookup(ns, key, chain) {
    const locales = this.dicts.get(ns);
    for (const locale of chain) {
      const value = locales?.get(localeKey(locale))?.[key];
      if (value !== void 0) return value;
    }
    return void 0;
  }
  /**
   * Advance the snapshot revision and notify LocaleFace subscribers (render
   * refresh). Only an active-locale switch additionally emits
   * `locale/change` — dictionary registrations stay off the event so
   * registration-heavy boot cannot storm event listeners (which may
   * re-register slots in response).
   */
  publish(active, localeChanged, locales = this.snapshot.locales) {
    this.snapshot = Object.freeze({
      active,
      locales,
      revision: this.snapshot.revision + 1
    });
    if (localeChanged) this.ctx.emit("locale/change", this.snapshot);
    for (const fn of [...this.listeners]) {
      try {
        fn();
      } catch (error) {
        console.error("locale subscriber crashed:", error);
      }
    }
  }
};
function resolveInitialLocale(locales, languages) {
  return detectBrowserLocale(locales, languages) ?? FALLBACK_LOCALE;
}
function detectBrowserLocale(locales, languages) {
  if (languages === void 0) {
    if (typeof window === "undefined") return void 0;
    const browserLanguages = navigator.languages;
    languages = [...browserLanguages ?? [], navigator.language];
  }
  for (const tag of languages) {
    const requested = localeKey(tag);
    const exact = locales.find((locale) => localeKey(locale.id) === requested);
    if (exact !== void 0) return exact.id;
    const primary = requested.split("-")[0];
    const match = locales.find((locale) => localeKey(locale.id).split("-")[0] === primary);
    if (match !== void 0) return match.id;
  }
  return void 0;
}

// upstream/packages/client/shortcuts/src/client/index.ts.snapshot
import { Service } from "@deepseek-ai/cordis";

// upstream/packages/client/shortcuts/src/binding.ts.snapshot
var keyNames = {
  Slash: "/",
  Comma: ",",
  Period: ".",
  Backslash: "\\",
  Backquote: "`",
  Minus: "-",
  Equal: "=",
  BracketLeft: "[",
  BracketRight: "]",
  Semicolon: ";",
  Quote: "'",
  Enter: "Enter",
  Escape: "Esc",
  Space: "Space",
  Tab: "Tab",
  Backspace: "Backspace",
  Delete: "Delete",
  ArrowUp: "\u2191",
  ArrowDown: "\u2193",
  ArrowLeft: "\u2190",
  ArrowRight: "\u2192"
};
var modifierOrder = ["control", "alt", "shift", "meta"];
function normalizeBinding(binding, platform) {
  const codes = [binding.code, ...binding.secondCode === void 0 ? [] : [binding.secondCode]];
  codes.sort();
  for (const code of codes) {
    if (!/^(Key[A-Z]|Digit[0-9]|F([1-9]|1[0-9]|2[0-4]))$/u.test(code) && !Object.hasOwn(keyNames, code)) throw new Error(`Unsupported shortcut code: ${code}`);
  }
  if (codes.length === 2 && codes[0] === codes[1]) throw new Error("Shortcut keys must be distinct");
  const modifiers = new Set(binding.modifiers.map((value) => value === "primary" ? platform === "macos" ? "meta" : "control" : value));
  return {
    code: codes[0],
    ...codes[1] === void 0 ? {} : { secondCode: codes[1] },
    modifiers: modifierOrder.filter((value) => modifiers.has(value))
  };
}
function bindingKey(binding) {
  const codes = binding.secondCode === void 0 ? [binding.code] : [binding.code, binding.secondCode].sort();
  return [...binding.modifiers, ...codes].join("+");
}
function presentBinding(binding, platform) {
  if (binding === null) return { keys: [], aria: void 0 };
  const key = keyNames[binding.code] ?? binding.code.replace(/^(Key|Digit)/u, "");
  const symbols = platform === "macos" ? { control: "\u2303", alt: "\u2325", shift: "\u21E7", meta: "\u2318" } : { control: "Ctrl", alt: "Alt", shift: "Shift", meta: "Meta" };
  const ariaNames = { control: "Control", alt: "Alt", shift: "Shift", meta: "Meta" };
  const ariaKey = binding.code === "Space" ? "Space" : binding.code === "Escape" ? "Escape" : binding.code.startsWith("Arrow") ? binding.code : key;
  const second = binding.secondCode === void 0 ? [] : [keyNames[binding.secondCode] ?? binding.secondCode.replace(/^(Key|Digit)/u, "")];
  const keys = [...binding.modifiers.map((value) => symbols[value]), key];
  return {
    keys: [...platform === "windows" ? keys.flatMap((label, index) => index === 0 ? [label] : ["+", label]) : keys, ...second],
    aria: binding.secondCode === void 0 ? [...binding.modifiers.map((value) => ariaNames[value]), ariaKey].join("+") : void 0
  };
}
function isWebBindingAllowed(binding, platform) {
  if (binding.secondCode !== void 0) return false;
  if (platform === "windows" || platform === "macos") {
    if (binding.modifiers.length >= 3) return true;
    const primary = platform === "macos" ? "meta" : "control";
    if (binding.modifiers.length === 1 && (["Comma", "Backslash"].includes(binding.code) && binding.modifiers[0] === primary || binding.code === "Backquote" && binding.modifiers[0] === "control")) return true;
    if (binding.modifiers.length === 2 && binding.modifiers.includes(primary) && (binding.modifiers.includes("alt") || binding.modifiers.includes("shift"))) return true;
  }
  return [
    { code: "Slash", modifiers: ["primary"] },
    { code: "Comma", modifiers: ["primary", "shift"] },
    { code: "Period", modifiers: ["primary", "shift"] }
  ].some((candidate) => bindingKey(binding) === bindingKey(normalizeBinding(candidate, platform)));
}

// upstream/packages/util/values/src/partial-json.ts.snapshot
var SIMPLE_ESCAPES = {
  '"': '"',
  "\\": "\\",
  "/": "/",
  b: "\b",
  f: "\f",
  n: "\n",
  r: "\r",
  t: "	"
};
var CONTENT_ESCAPE = /[\\\u0000-\u001f]/u;
function isWhitespace(c) {
  return c === " " || c === "\n" || c === "\r" || c === "	";
}
function isHex(c) {
  return c >= "0" && c <= "9" || c >= "a" && c <= "f" || c >= "A" && c <= "F";
}
var PartialArguments = class _PartialArguments {
  /** The view of a call with no arguments available. */
  static EMPTY = _PartialArguments.fromObject({});
  /**
   * View finished argument text without scanning it until a reader asks.
   * @param text - the complete argument JSON text.
   * @returns a sealed view.
   */
  static fromText(text) {
    const view = new _PartialArguments();
    view.append(text);
    view.sealed = true;
    return view;
  }
  /**
   * View an already parsed argument payload, such as a PTC dispatch object.
   * @param value - the parsed argument value.
   * @returns a sealed view; a non-object payload has no fields.
   */
  static fromObject(value) {
    const view = new _PartialArguments();
    view.object = typeof value === "object" && value !== null && !Array.isArray(value) ? value : {};
    view.sealed = true;
    return view;
  }
  /**
   * The source: text so far or a parsed object, plus whether it can still grow.
   * These are the only enumerable fields, so two views over the same source
   * compare equal structurally however far each has been read.
   */
  chunks = [];
  object;
  sealed = false;
  // Scan progress, located fields, and remembered reads are caches over the source.
  #ends = [];
  #size = 0;
  #consumed = 0;
  #mode = "root";
  #escape = false;
  #keyStart = 0;
  #keyEscaped = false;
  #key = "";
  #current = null;
  #nestedEnds = [];
  #nestedInString = false;
  #invalidAt;
  #invalidValue = false;
  #entries = /* @__PURE__ */ new Map();
  #order = [];
  #reads = /* @__PURE__ */ new Map();
  /** Whether this view rejects further appends; does not scan text or register reads. */
  get isSealed() {
    return this.sealed;
  }
  /** Whether indexing or a content read found invalid JSON; unread value contents are not validated. */
  get invalid() {
    this.scan();
    return this.#mode === "invalid" || this.#invalidValue;
  }
  /**
   * Retain streamed argument text without scanning or comparing observed answers.
   * @param fragment - the text following every fragment appended before.
   */
  append(fragment) {
    if (this.sealed) throw new Error("PartialArguments: cannot append to a sealed view");
    if (fragment.length === 0) return;
    this.chunks.push(fragment);
    this.#size += fragment.length;
    this.#ends.push(this.#size);
  }
  /**
   * Reconcile a streamed prefix with authoritative complete text without joining the fragments.
   * @param text - the final argument text, which replaces missing or conflicting deltas.
   * @returns this view sealed with its caches retained when every character matches; otherwise a new sealed view.
   */
  settle(text) {
    if (this.object !== void 0 || text.length !== this.#size) return _PartialArguments.fromText(text);
    let offset = 0;
    for (const chunk of this.chunks) {
      if (!text.startsWith(chunk, offset)) return _PartialArguments.fromText(text);
      offset += chunk.length;
    }
    this.chunks = text.length === 0 ? [] : [text];
    this.#ends = text.length === 0 ? [] : [text.length];
    this.sealed = true;
    return this;
  }
  /**
   * Compare observed answers and advance their publication baseline. Unread views remain unscanned.
   * @returns whether any observed answer changed since its first read or the preceding refresh.
   */
  refresh() {
    if (this.#reads.size === 0) return false;
    this.scan();
    let changed = false;
    let completions = false;
    for (const read of this.#reads.values()) {
      if (read.completion) {
        completions = true;
        continue;
      }
      changed = this.refreshRead(read) || changed;
    }
    if (completions) {
      for (const read of this.#reads.values()) if (read.completion) changed = this.refreshRead(read) || changed;
    }
    if (this.sealed) this.#reads.clear();
    return changed;
  }
  refreshRead(read) {
    const now = read.answer();
    if (Object.is(now, read.last)) return false;
    read.last = now;
    return true;
  }
  /**
   * Check whether no further fields can arrive.
   * @returns whether the outer object closed, indexing failed, or the view is sealed; unread values are not validated.
   */
  closed() {
    return this.remember("closed", "", () => this.closedNow());
  }
  /**
   * List discovered fields in first-appearance order.
   * @returns top-level keys seen so far, in first-appearance order.
   */
  keys() {
    return this.remember("keys", "", () => this.keysNow(), (keys) => keys.length);
  }
  /**
   * Check whether a top-level field has appeared.
   * @param key - argument name.
   * @returns whether the field has appeared (a string opened or another value began).
   */
  has(key) {
    return this.remember("has", key, () => this.hasNow(key));
  }
  /**
   * Check whether a field's closing delimiter has arrived, without validating its contents.
   * @param key - argument name.
   * @returns whether its delimiter arrived and no content reader has reported an error for this value.
   */
  complete(key) {
    return this.remember("complete", key, () => this.completeNow(key));
  }
  /**
   * Read string length without materializing its text.
   * @param key - argument name.
   * @param options - change granularity for a streaming string.
   * @returns decoded UTF-16 length of the string field so far; undefined when absent or not a string.
   */
  stringLength(key, options) {
    const step = Math.max(1, Math.floor(options?.step ?? 1));
    const offset = options?.offset ?? 0;
    return this.remember(
      `length:${step}:${offset}`,
      key,
      () => this.lengthNow(key),
      (length) => length === void 0 ? void 0 : Math.ceil((length + offset) / step)
    );
  }
  /**
   * Check a string against a decoded UTF-16 length limit without materializing it.
   * @param key - argument name.
   * @param maxLength - decoded UTF-16 limit, floored to at least zero.
   * @returns whether the string is longer than the limit; false when absent or not a string.
   */
  stringExceeds(key, maxLength) {
    const limit = Math.max(0, Math.floor(maxLength));
    return this.remember(
      `exceeds:${limit}`,
      key,
      () => (this.lengthNow(key, limit + 1) ?? 0) > limit
    );
  }
  /**
   * Read a decoded string, including a streaming prefix.
   * @param key - argument name.
   * @returns the string field's decoded text so far; undefined when absent or not a string.
   */
  text(key) {
    return this.remember("text", key, () => this.textNow(key));
  }
  /**
   * Read at most the first decoded UTF-16 units of a string.
   * @param key - argument name.
   * @param maxLength - maximum decoded UTF-16 length, floored to at least one.
   * @returns the bounded string prefix; undefined when absent or not a string.
   */
  textPrefix(key, maxLength) {
    const limit = Math.max(1, Math.floor(maxLength));
    return this.remember(
      `prefix:${limit}`,
      key,
      () => this.textPrefixNow(key, limit)
    );
  }
  /**
   * Read a completed non-string argument.
   * @param key - argument name.
   * @returns the parsed non-string value once it closed; undefined while open, absent, or a string.
   */
  value(key) {
    return this.remember("value", key, () => this.valueNow(key));
  }
  /** Answer a question and, on a streaming view, remember it for change detection. */
  remember(kind, key, read, comparison) {
    this.scan();
    const result = read();
    if (!this.sealed) {
      const id = `${kind}/${key}`;
      if (!this.#reads.has(id)) {
        this.#reads.set(id, {
          completion: kind === "complete",
          answer: comparison === void 0 ? read : () => comparison(read()),
          last: comparison === void 0 ? result : comparison(result)
        });
      }
    }
    return result;
  }
  closedNow() {
    return this.sealed || this.#mode === "closed" || this.#mode === "invalid";
  }
  keysNow() {
    return this.object === void 0 ? this.#order : Object.keys(this.object);
  }
  hasNow(key) {
    return this.object === void 0 ? this.#entries.has(key) : Object.hasOwn(this.object, key);
  }
  completeNow(key) {
    if (this.object !== void 0) return Object.hasOwn(this.object, key);
    const entry = this.#entries.get(key);
    return entry !== void 0 && entry.end >= 0 && (entry.kind === "string" ? entry.invalidAt === void 0 : !entry.invalid);
  }
  lengthNow(key, limit = Number.POSITIVE_INFINITY) {
    if (this.object !== void 0) {
      const field = Object.hasOwn(this.object, key) ? this.object[key] : void 0;
      return typeof field === "string" ? field.length : void 0;
    }
    const entry = this.#entries.get(key);
    if (entry?.kind !== "string") return void 0;
    if (entry.text !== void 0 && entry.text.at === entry.end) return entry.text.length;
    const read = entry.length ??= { at: entry.start, length: 0, text: "" };
    this.readString(entry, read, limit, false);
    return read.length;
  }
  textNow(key) {
    if (this.object !== void 0) {
      const field = Object.hasOwn(this.object, key) ? this.object[key] : void 0;
      return typeof field === "string" ? field : void 0;
    }
    const entry = this.#entries.get(key);
    if (entry?.kind !== "string") return void 0;
    if (entry.text === void 0 && entry.end >= 0 && entry.needsDecoding && entry.invalidAt === void 0) {
      let text;
      try {
        text = JSON.parse(`"${this.slice(entry.start, entry.end)}"`);
      } catch (_error) {
      }
      if (text !== void 0) entry.text = { at: entry.end, length: text.length, text };
    }
    const read = entry.text ??= { at: entry.start, length: 0, text: "" };
    this.readString(entry, read, Number.POSITIVE_INFINITY, true);
    return read.text;
  }
  textPrefixNow(key, maxLength) {
    if (this.object !== void 0) {
      const field = Object.hasOwn(this.object, key) ? this.object[key] : void 0;
      return typeof field === "string" ? field.slice(0, maxLength) : void 0;
    }
    const entry = this.#entries.get(key);
    if (entry?.kind !== "string") return void 0;
    const prefixes = entry.prefixes ??= /* @__PURE__ */ new Map();
    let read = prefixes.get(maxLength);
    if (read === void 0) {
      read = { at: entry.start, length: 0, text: "" };
      prefixes.set(maxLength, read);
    }
    this.readString(entry, read, maxLength, true);
    return read.text;
  }
  valueNow(key) {
    if (this.object !== void 0) {
      if (!Object.hasOwn(this.object, key)) return void 0;
      const field = this.object[key];
      return typeof field === "string" ? void 0 : field;
    }
    const entry = this.#entries.get(key);
    if (entry?.kind !== "value" || entry.end < 0 || entry.invalid) return void 0;
    if (entry.parsed === void 0) {
      try {
        entry.parsed = JSON.parse(this.slice(entry.start, entry.end));
      } catch (_error) {
        entry.invalid = true;
        this.#invalidValue = true;
      }
    }
    return entry.parsed;
  }
  chunkAt(at) {
    let low = 0;
    let high = this.#ends.length;
    while (low < high) {
      const mid = low + high >>> 1;
      if (this.#ends[mid] <= at) low = mid + 1;
      else high = mid;
    }
    return low;
  }
  /** Materialize only a requested range, never the cumulative source. */
  slice(start, end) {
    if (start >= end) return "";
    const first = this.chunkAt(start);
    const last = this.chunkAt(end - 1);
    const base = first === 0 ? 0 : this.#ends[first - 1];
    if (first === last) return this.chunks[first].slice(start - base, end - base);
    const parts = [this.chunks[first].slice(start - base)];
    for (let i = first + 1; i < last; i++) parts.push(this.chunks[i]);
    parts.push(this.chunks[last].slice(0, end - this.#ends[last - 1]));
    return parts.join("");
  }
  readString(entry, read, limit, materialize2) {
    const end = Math.min(
      entry.end < 0 ? this.#consumed : entry.end,
      entry.invalidAt ?? Number.POSITIVE_INFINITY,
      this.#invalidAt ?? Number.POSITIVE_INFINITY
    );
    if (!entry.needsDecoding) {
      const length = Math.min(end - read.at, limit - read.length);
      if (length <= 0) return;
      if (materialize2) read.text += this.slice(read.at, read.at + length);
      read.at += length;
      read.length += length;
      return;
    }
    let chunkIndex = this.chunkAt(read.at);
    while (read.at < end && read.length < limit) {
      const base = chunkIndex === 0 ? 0 : this.#ends[chunkIndex - 1];
      const chunk = this.chunks[chunkIndex];
      const remaining = chunk.slice(read.at - base, Math.min(chunk.length, end - base));
      const boundary = remaining.search(CONTENT_ESCAPE);
      const length = Math.min(boundary < 0 ? remaining.length : boundary, limit - read.length);
      if (length > 0) {
        if (materialize2) read.text += remaining.slice(0, length);
        read.at += length;
        read.length += length;
        if (read.at === base + chunk.length) chunkIndex++;
        continue;
      }
      const type = remaining.length > 1 ? remaining[1] : read.at + 1 < end ? this.chunks[chunkIndex + 1][0] : void 0;
      let decoded;
      let width = 2;
      if (remaining[0] === "\\" && type === void 0 && entry.end < 0) return;
      if (remaining[0] === "\\" && type === "u") {
        const hex = this.slice(read.at + 2, Math.min(end, read.at + 6));
        let valid = true;
        for (let i = 0; i < hex.length; i++) if (!isHex(hex[i])) valid = false;
        if (valid) {
          if (hex.length < 4 && entry.end < 0) return;
          if (hex.length === 4) decoded = String.fromCharCode(Number.parseInt(hex, 16));
        }
        width = 6;
      } else if (remaining[0] === "\\" && type !== void 0) {
        decoded = SIMPLE_ESCAPES[type];
      }
      if (decoded === void 0) {
        entry.invalidAt = read.at;
        this.#invalidValue = true;
        return;
      }
      if (materialize2) read.text += decoded;
      read.length++;
      read.at += width;
      while (chunkIndex < this.chunks.length && read.at >= this.#ends[chunkIndex]) chunkIndex++;
    }
  }
  /** Locate new field ranges without decoding or parsing their contents. */
  scan() {
    if (this.object !== void 0 || this.#consumed === this.#size) return;
    for (let i = this.chunkAt(this.#consumed); i < this.chunks.length && this.#invalidAt === void 0; i++) {
      const pending = this.chunks[i];
      const base = i === 0 ? 0 : this.#ends[i - 1];
      for (let index = this.#consumed - base; index < pending.length && this.#mode !== "invalid"; index++) {
        if (this.#mode === "string" || this.#mode === "nested" && this.#nestedInString) {
          const end = this.stringBoundary(pending, index);
          this.#consumed += end - index;
          index = end;
          if (index === pending.length) break;
        }
        this.step(pending[index], this.#consumed);
        this.#consumed++;
      }
    }
  }
  /** Only raw quotes and their preceding backslash runs can terminate a string. */
  stringBoundary(fragment, start) {
    let at = start;
    while (true) {
      const quote = fragment.indexOf('"', at);
      const end = quote < 0 ? fragment.length : quote;
      if (this.#mode === "string") {
        const entry = this.#current;
        if (!entry.needsDecoding && CONTENT_ESCAPE.test(fragment.slice(at, end))) entry.needsDecoding = true;
      }
      let slashStart = end;
      while (slashStart > at && fragment[slashStart - 1] === "\\") slashStart--;
      const escaped = (end - slashStart) % 2 === 1 !== (slashStart === at && this.#escape);
      this.#escape = quote < 0 && escaped;
      if (quote < 0 || !escaped) return end;
      at = quote + 1;
    }
  }
  step(c, at) {
    switch (this.#mode) {
      case "root":
        if (isWhitespace(c)) return;
        if (c === "{") {
          this.#mode = "key-or-end";
          return;
        }
        this.fail();
        return;
      case "key-or-end":
        if (isWhitespace(c)) return;
        if (c === "}") {
          this.#mode = "closed";
          return;
        }
        if (c === '"') {
          this.beginKey(at);
          return;
        }
        this.fail();
        return;
      case "key-only":
        if (isWhitespace(c)) return;
        if (c === '"') {
          this.beginKey(at);
          return;
        }
        this.fail();
        return;
      case "key":
        this.stepKey(c, at);
        return;
      case "colon":
        if (isWhitespace(c)) return;
        if (c === ":") {
          this.#mode = "value";
          return;
        }
        this.fail();
        return;
      case "value":
        this.beginValue(c, at);
        return;
      case "string": {
        const entry = this.#current;
        entry.end = at;
        this.#current = null;
        this.#mode = "comma-or-end";
        return;
      }
      case "scalar":
        this.stepScalar(c, at);
        return;
      case "nested":
        this.stepNested(c, at);
        return;
      case "comma-or-end":
        if (isWhitespace(c)) return;
        if (c === ",") {
          this.#mode = "key-only";
          return;
        }
        if (c === "}") {
          this.#mode = "closed";
          return;
        }
        this.fail();
        return;
      case "closed":
        if (isWhitespace(c)) return;
        this.fail();
        return;
      /* v8 ignore next 2 -- scan() stops stepping once the view is invalid. */
      case "invalid":
        return;
      /* v8 ignore next 2 -- Every scanner mode has a handler above. */
      default:
        assertNever(this.#mode);
    }
  }
  fail() {
    this.#invalidAt = this.#consumed;
    this.#mode = "invalid";
    this.#current = null;
  }
  beginKey(at) {
    this.#mode = "key";
    this.#keyStart = at + 1;
    this.#keyEscaped = false;
    this.#escape = false;
  }
  stepKey(c, at) {
    if (c < " ") {
      this.fail();
      return;
    }
    if (this.#escape) {
      this.#escape = false;
      return;
    }
    if (c === "\\") {
      this.#escape = true;
      this.#keyEscaped = true;
      return;
    }
    if (c !== '"') return;
    const raw = this.slice(this.#keyStart, at);
    if (this.#keyEscaped) {
      try {
        this.#key = JSON.parse(`"${raw}"`);
      } catch (_error) {
        this.fail();
        return;
      }
    } else {
      this.#key = raw;
    }
    this.#mode = "colon";
  }
  open(entry) {
    if (!this.#entries.has(this.#key)) this.#order.push(this.#key);
    this.#entries.set(this.#key, entry);
    this.#current = entry;
  }
  beginValue(c, at) {
    if (isWhitespace(c)) return;
    if (c === '"') {
      this.open({
        kind: "string",
        start: at + 1,
        end: -1,
        needsDecoding: false,
        invalidAt: void 0,
        length: void 0,
        text: void 0,
        prefixes: void 0
      });
      this.#escape = false;
      this.#mode = "string";
      return;
    }
    if (c === "}" || c === "," || c === ":" || c === "]") {
      this.fail();
      return;
    }
    this.open({ kind: "value", start: at, end: -1, parsed: void 0, invalid: false });
    if (c === "{" || c === "[") {
      this.#mode = "nested";
      this.#nestedEnds = [c === "{" ? "}" : "]"];
      this.#nestedInString = false;
      this.#escape = false;
      return;
    }
    this.#mode = "scalar";
  }
  stepScalar(c, at) {
    if (c !== "," && c !== "}" && !isWhitespace(c)) return;
    this.closeValue(at);
    this.#mode = c === "," ? "key-only" : c === "}" ? "closed" : "comma-or-end";
  }
  stepNested(c, at) {
    if (this.#nestedInString) {
      this.#nestedInString = false;
      return;
    }
    if (c === '"') {
      this.#nestedInString = true;
      return;
    }
    if (c === "{" || c === "[") {
      this.#nestedEnds.push(c === "{" ? "}" : "]");
      return;
    }
    if (c === "}" || c === "]") {
      if (this.#nestedEnds.pop() !== c) {
        this.fail();
        return;
      }
      if (this.#nestedEnds.length === 0) {
        this.closeValue(at + 1);
        this.#mode = "comma-or-end";
      }
    }
  }
  closeValue(end) {
    const entry = this.#current;
    entry.end = end;
    this.#current = null;
  }
};

// upstream/packages/util/values/src/index.ts.snapshot
function assertNever(value, context) {
  const rendered = JSON.stringify(value) ?? String(value);
  throw new Error(`unreachable variant${context ? ` in ${context}` : ""}: ${rendered}`);
}

// upstream/packages/client/shortcuts/src/configuration.ts.snapshot
var record = (value) => typeof value === "object" && value !== null && !Array.isArray(value);
var commandPattern = /^[a-z][a-zA-Z0-9-]*(?:\.[a-zA-Z][a-zA-Z0-9-]*)+$/u;
function parseBinding(value) {
  if (value === null) return null;
  if (!record(value) || Object.keys(value).some((key) => key !== "code" && key !== "secondCode" && key !== "modifiers") || typeof value.code !== "string" || !Array.isArray(value.modifiers) || Object.hasOwn(value, "secondCode") && typeof value.secondCode !== "string" || !value.modifiers.every((modifier) => typeof modifier === "string" && ["primary", "control", "alt", "shift", "meta"].includes(modifier))) {
    throw new Error("Invalid shortcut binding");
  }
  const binding = {
    code: value.code,
    modifiers: value.modifiers,
    ...typeof value.secondCode === "string" ? { secondCode: value.secondCode } : {}
  };
  normalizeBinding(binding, "windows");
  return binding;
}
function parseShortcutDocument(raw) {
  if (raw === null) return { schemaVersion: 1, profiles: {} };
  try {
    const value = JSON.parse(raw);
    if (!record(value)) return "invalid";
    if (typeof value.schemaVersion === "number" && value.schemaVersion > 2) return "future";
    if (value.schemaVersion !== 1 && value.schemaVersion !== 2 || !record(value.profiles) || Object.keys(value).some((key) => key !== "schemaVersion" && key !== "profiles")) return "invalid";
    const profiles = {};
    for (const [profile, overrides] of Object.entries(value.profiles)) {
      if (!/^(desktop|web):(macos|windows|linux)$/u.test(profile) || !record(overrides)) return "invalid";
      const bindings = {};
      for (const [id, binding] of Object.entries(overrides)) {
        if (!commandPattern.test(id)) return "invalid";
        const parsed = parseBinding(binding);
        if (value.schemaVersion === 1 && parsed?.secondCode !== void 0) return "invalid";
        bindings[id] = parsed;
      }
      profiles[profile] = bindings;
    }
    return { schemaVersion: value.schemaVersion, profiles };
  } catch (_error) {
    return "invalid";
  }
}
function bindingIssue(binding, runtime, platform) {
  const { code, modifiers } = binding;
  if (runtime === "desktop" && (platform === "windows" || platform === "macos")) return null;
  if (binding.secondCode !== void 0) return "unsupported-key";
  if (modifiers.length === 0 || modifiers.every((modifier) => modifier === "shift")) return "modifier-required";
  if ((platform === "windows" || platform === "macos") && modifiers.length >= 3) return null;
  if (runtime === "web" && (platform === "windows" || platform === "macos") && isWebBindingAllowed(binding, platform)) return null;
  const primary = modifiers.includes(platform === "macos" ? "meta" : "control");
  if (["Escape", "Tab", "Space", "Backspace", "Delete", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(code) || code === "Enter" && !modifiers.includes("alt") || primary && ["KeyC", "KeyV", "KeyX", "KeyZ", "KeyY", "KeyQ", "KeyH"].includes(code) || primary && code === "KeyA" && !modifiers.includes("shift") || platform !== "macos" && (modifiers.includes("meta") || modifiers.includes("alt") && ["F4", "F2"].includes(code)) || platform === "macos" && modifiers.includes("control") && modifiers.includes("meta") || platform === "macos" && modifiers.includes("alt") && !primary) return "reserved";
  if (runtime === "web" && !isWebBindingAllowed(binding, platform)) return "unsupported-browser";
  return null;
}
function resolveShortcutDefault(definition, runtime, platform) {
  return definition.defaults[`${runtime}:${platform}`];
}
function effectiveShortcuts(definitions, document2, runtime, platform) {
  const overrides = document2.profiles[`${runtime}:${platform}`] ?? {};
  const fixed = definitions.flatMap((row) => row.fixed?.map((binding) => ({ id: row.id, binding: normalizeBinding(binding, platform) })) ?? []);
  const rows = definitions.filter((row) => row.fixed === void 0).map(({ id, defaults }) => {
    const modified = Object.hasOwn(overrides, id);
    const candidate = modified ? overrides[id] : resolveShortcutDefault({ id, defaults }, runtime, platform);
    const binding = candidate == null ? null : normalizeBinding(candidate, platform);
    return { id, binding, modified, issue: binding === null ? null : bindingIssue(binding, runtime, platform) };
  });
  return rows.map((row) => {
    const binding = row.binding;
    return { ...row, conflicts: binding === null ? [] : [.../* @__PURE__ */ new Set([
      ...rows.filter((other) => other.id !== row.id && other.binding !== null && other.issue === null && overlappingBindings(other.binding, binding) && (!row.modified || other.modified)).map((other) => other.id),
      ...fixed.filter((other) => overlappingBindings(other.binding, binding)).map((other) => other.id)
    ])] };
  });
}
function overlappingBindings(left, right) {
  if (left.modifiers.join("+") !== right.modifiers.join("+")) return false;
  if (left.secondCode !== void 0 && right.secondCode !== void 0) return bindingKey(left) === bindingKey(right);
  return [left.code, left.secondCode].some((code) => code !== void 0 && (code === right.code || code === right.secondCode));
}
function editShortcutDocument(document2, edit, runtime, platform) {
  const schemaVersion = runtime === "desktop" && (platform === "macos" || platform === "windows") ? 2 : document2.schemaVersion;
  const profile = `${runtime}:${platform}`;
  let overrides = { ...document2.profiles[profile] };
  switch (edit.type) {
    case "set":
      overrides[edit.id] = edit.binding;
      break;
    case "reset": {
      const { [edit.id]: _removed, ...remaining } = overrides;
      overrides = remaining;
      break;
    }
    case "reset-all":
      overrides = {};
      break;
    /* v8 ignore next -- parseShortcutEdit validates this closed union before persistence. */
    default:
      return assertNever(edit, "shortcut edit");
  }
  return { schemaVersion, profiles: { ...document2.profiles, [profile]: overrides } };
}

// upstream/packages/util/crypto/src/index.ts.snapshot
function randomUUID() {
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
  const hex = Array.from(bytes, (byte, index) => {
    const pinned = index === 6 ? byte & 15 | 64 : index === 8 ? byte & 63 | 128 : byte;
    return pinned.toString(16).padStart(2, "0");
  }).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

// upstream/packages/client/shortcuts/src/persistence.ts.snapshot
function initialShortcutConfig() {
  return {
    revision: randomUUID(),
    sequence: 0,
    document: { schemaVersion: 1, profiles: {} },
    status: "loading",
    error: null,
    usingDefaults: true
  };
}
var ShortcutPersistence = class {
  constructor(storage, runtime, platform, rereadBeforeWrite, publish2) {
    this.storage = storage;
    this.runtime = runtime;
    this.platform = platform;
    this.rereadBeforeWrite = rereadBeforeWrite;
    this.publish = publish2;
  }
  snapshot = initialShortcutConfig();
  raw;
  queue = Promise.resolve();
  definitions = null;
  active = true;
  /**
   * Install or revoke a product catalog and invalidate drafts from its previous lifetime.
   * @param definitions - current trusted definitions, or null while the product is not ready.
   */
  setDefinitions(definitions) {
    this.definitions = definitions;
    this.accept({ ...this.snapshot });
  }
  /** Stop accepting edits or publishing late completions. */
  dispose() {
    this.active = false;
  }
  /**
   * Read the current file; failures retain the last accepted document and disable ordinary writes.
   * @returns the accepted snapshot or diagnostic snapshot.
   */
  readCurrent() {
    return this.serialize(() => this.read());
  }
  /**
   * Compare the draft revision, validate the complete candidate, then persist before publishing.
   * @param edit - constrained preference operation.
   * @param revision - state against which the user reviewed the edit.
   * @returns a classified outcome and the currently accepted snapshot.
   */
  edit(edit, revision) {
    return this.serialize(async () => {
      if (this.rereadBeforeWrite) await this.read();
      const result = (status) => ({ status, snapshot: this.snapshot });
      if (!this.active || this.definitions === null || this.snapshot.status === "loading") return result("not-ready");
      if (revision !== this.snapshot.revision) return result("stale");
      if (this.snapshot.status === "unreadable") return result("unreadable");
      if ((edit.type === "set" || edit.type === "reset") && !this.definitions.some((row) => row.id === edit.id && row.fixed === void 0)) return result("not-ready");
      const document2 = editShortcutDocument(this.snapshot.document, edit, this.runtime, this.platform);
      const rows = effectiveShortcuts(this.definitions, document2, this.runtime, this.platform);
      const invalid = rows.find((row) => (edit.type === "reset-all" || row.id === edit.id) && (row.issue !== null || row.conflicts.length > 0));
      const displaced = edit.type === "set" ? rows.find((row) => row.conflicts.includes(edit.id)) : void 0;
      if (invalid !== void 0 || displaced !== void 0) return {
        ...result("conflict"),
        ...invalid?.issue ? { issue: invalid.issue } : {},
        conflicts: invalid?.conflicts.length ? invalid.conflicts : displaced === void 0 ? [] : [displaced.id]
      };
      try {
        const raw = `${JSON.stringify(document2, null, 2)}
`;
        await this.storage.write(raw);
        this.raw = raw;
        this.accept({ ...this.snapshot, document: document2, status: "ready", error: null, usingDefaults: false });
        return result("saved");
      } catch (_error) {
        return result("write-failed");
      }
    });
  }
  serialize(operation) {
    const next = this.queue.then(operation);
    this.queue = next.catch(() => void 0);
    return next;
  }
  accept(snapshot2) {
    this.snapshot = { ...snapshot2, sequence: this.snapshot.sequence + 1, revision: randomUUID() };
    if (!this.active) return;
    try {
      this.publish(this.snapshot);
    } catch (error) {
      console.error("Shortcut configuration subscriber failed:", error);
    }
  }
  async read() {
    let raw;
    try {
      raw = await this.storage.read();
    } catch (_error) {
      if (this.snapshot.error !== "read") this.accept({ ...this.snapshot, status: "unreadable", error: "read" });
      return this.snapshot;
    }
    if (raw === this.raw && this.snapshot.error !== "read") return this.snapshot;
    this.raw = raw;
    const document2 = parseShortcutDocument(raw);
    if (typeof document2 === "string") this.accept({ ...this.snapshot, status: "unreadable", error: document2 });
    else this.accept({ ...this.snapshot, document: document2, status: "ready", error: null, usingDefaults: raw === null });
    return this.snapshot;
  }
};

// upstream/packages/client/shortcuts/src/client/registry.ts.snapshot
var ShortcutRegistry = class {
  constructor(runtime, platform, config = { ...initialShortcutConfig(), status: "ready" }) {
    this.runtime = runtime;
    this.platform = platform;
    this.state = createSnapshotStore({ catalog: [], config });
    this.catalog = {
      getSnapshot: () => this.state.getSnapshot().catalog,
      subscribe: (listener) => this.state.subscribe(listener)
    };
    this.config = {
      getSnapshot: () => this.state.getSnapshot().config,
      subscribe: (listener) => this.state.subscribe(listener)
    };
  }
  commands = /* @__PURE__ */ new Map();
  fixedCommands = /* @__PURE__ */ new Map();
  conflicts = /* @__PURE__ */ new Map();
  bindings = /* @__PURE__ */ new Map();
  state;
  /** Effective localized rows derived from the accepted configuration. */
  catalog;
  /** Accepted preferences and visible read diagnostics. */
  config;
  /** Fixed local operations whose owning plugins are mounted. */
  fixedCatalog = createSnapshotStore([]);
  /**
   * Return the serializable active catalog for storage validation.
   * @returns definitions without callbacks or localized labels.
   */
  definitions() {
    return [
      ...[...this.commands.values()].map(({ id, defaults }) => ({ id, defaults })),
      ...[...this.fixedCommands.values()].map(({ id, bindings }) => ({ id, defaults: {}, fixed: bindings }))
    ];
  }
  /**
   * Register a read-only input action whose keys cannot be assigned to editable commands.
   * @param command - owner-localized action and readable sequence.
   * @returns idempotent disposer removing its reference row.
   */
  registerFixed(command) {
    if (this.fixedCommands.has(command.id) || this.commands.has(command.id)) throw new Error(`Duplicate shortcut command: ${command.id}`);
    for (const binding of command.bindings) normalizeBinding(binding, this.platform);
    this.fixedCommands.set(command.id, command);
    this.refreshLabels();
    return () => {
      if (this.fixedCommands.get(command.id) !== command) return;
      this.fixedCommands.delete(command.id);
      this.refreshLabels();
    };
  }
  refreshFixedLabels() {
    this.fixedCatalog.set([...this.fixedCommands.values()].map((command) => ({
      id: command.id,
      label: command.label(),
      keys: command.keys,
      group: command.group,
      bindings: command.bindings.map((binding) => normalizeBinding(binding, this.platform))
    })));
  }
  /**
   * Publish accepted preferences and all derived labels atomically.
   * @param config - storage owner's latest accepted snapshot.
   */
  configure(config) {
    const current2 = this.config.getSnapshot();
    if (config.revision === current2.revision && config.status === current2.status && config.error === current2.error) return;
    this.refreshLabels(config);
  }
  /**
   * Register atomically after checking defaults for all supported platforms and shells.
   * @param command - feature-owned command definition.
   * @returns idempotent disposer removing both matching and catalog entries.
   */
  register(command) {
    if (this.commands.has(command.id) || this.fixedCommands.has(command.id)) throw new Error(`Duplicate shortcut command: ${command.id}`);
    for (const runtime of ["desktop", "web"]) {
      for (const platform of ["macos", "windows", "linux"]) {
        const candidate = resolveShortcutDefault(command, runtime, platform);
        if (candidate === void 0) continue;
        const binding = normalizeBinding(candidate, platform);
        if (runtime === "web" && !isWebBindingAllowed(binding, platform)) {
          throw new Error(`Unsupported Web shortcut: ${command.id}`);
        }
        if (bindingIssue(binding, runtime, platform) !== null) throw new Error(`Reserved shortcut default: ${command.id}`);
        for (const existing of this.commands.values()) {
          const other = resolveShortcutDefault(existing, runtime, platform);
          if (other !== void 0 && overlappingBindings(binding, normalizeBinding(other, platform))) {
            throw new Error(`Conflicting shortcut defaults: ${command.id} and ${existing.id} (${runtime}:${platform})`);
          }
        }
      }
    }
    this.commands.set(command.id, command);
    this.refreshLabels();
    return () => {
      if (this.commands.get(command.id) !== command) return;
      this.commands.delete(command.id);
      this.refreshLabels();
    };
  }
  /**
   * Recompute effective bindings when preferences, commands, or locale change.
   * @param config - accepted configuration, defaulting to the current snapshot.
   */
  refreshLabels(config = this.config.getSnapshot()) {
    this.bindings.clear();
    this.conflicts.clear();
    const rows = effectiveShortcuts(this.definitions(), config.document, this.runtime, this.platform);
    const catalog = rows.map((row) => {
      const command = this.commands.get(row.id);
      const enabled = config.status !== "loading" && row.issue === null && row.conflicts.length === 0;
      if (enabled && row.binding !== null) this.bindings.set(bindingKey(row.binding), command);
      if (config.status !== "loading" && row.issue === null && row.conflicts.length > 0 && row.binding !== null) {
        this.conflicts.set(bindingKey(row.binding), command);
      }
      return {
        ...row,
        label: command.label(),
        aliases: command.aliases,
        ...presentBinding(row.binding, this.platform),
        aria: enabled ? presentBinding(row.binding, this.platform).aria : void 0
      };
    });
    this.state.set({ config, catalog });
    this.refreshFixedLabels();
  }
  /**
   * Invoke a native menu selection independently of its optional key binding.
   * @param id - registered product command.
   * @param context - live input owner and modal state.
   */
  invoke(id, context) {
    const command = this.commands.get(id);
    if (command === void 0 || context.modal !== null && !command.modals.includes(context.modal)) return;
    const result = command.resolve({ ...context, source: "menu" });
    if (result.status === "handled") result.run();
  }
  /**
   * Windows/macOS Desktop bindings override local regions and modal controls independently of their configuration source.
   * @param gesture - normalized DOM/native input facts.
   * @param context - synchronous input and modal owner.
   * @param consume - adapter's preventDefault, called before business execution.
   * @returns handled, blocked with a reason, or pass for local/system input.
   */
  dispatch(gesture, context, consume) {
    if (gesture.defaultPrevented || gesture.composing) return { status: "pass" };
    const modifiers = ["control", "alt", "shift", "meta"].filter((value) => gesture[value]);
    const pairKey = bindingKey({
      code: gesture.code,
      modifiers,
      ...gesture.secondCode === void 0 ? {} : { secondCode: gesture.secondCode }
    });
    const key = this.bindings.has(pairKey) || this.conflicts.has(pairKey) ? pairKey : bindingKey({ code: gesture.code, modifiers });
    const command = this.bindings.get(key) ?? this.conflicts.get(key);
    const priority = this.runtime === "desktop" && (this.platform === "windows" || this.platform === "macos");
    if (command === void 0 || !priority && !command.regions.includes(context.region)) return { status: "pass" };
    if (!priority && context.region === "terminal" && gesture.control && !gesture.meta && !gesture.alt && !gesture.shift && (gesture.code === "KeyW" || gesture.code === "KeyR")) return { status: "pass" };
    if (!this.bindings.has(key)) {
      consume();
      return { status: "blocked", commandId: command.id, reason: "conflict" };
    }
    if (!priority && context.modal !== null && !command.modals.includes(context.modal)) {
      consume();
      return { status: "blocked", commandId: command.id, reason: "modal" };
    }
    const resolution = command.resolve(context);
    if (resolution.status === "pass") return resolution;
    consume();
    if (resolution.status === "blocked") return { ...resolution, commandId: command.id };
    if (!gesture.repeat) resolution.run();
    return { status: "handled", commandId: command.id };
  }
};

// upstream/packages/client/shortcuts/src/client/dom.ts.snapshot
function detectEnvironment(document2, navigator2) {
  const desktop = document2.documentElement.dataset.platform;
  const device = desktop ?? navigator2.platform;
  return {
    runtime: desktop === void 0 ? "web" : "desktop",
    platform: /darwin|mac|iphone|ipad/iu.test(device) ? "macos" : /win/iu.test(device) ? "windows" : "linux"
  };
}
function installKeyboard(window2, shortcuts, fixed, native = false) {
  const document2 = window2.document;
  const composition = observeComposition(document2);
  let pending = false;
  let pendingTimer;
  const reset = () => {
    fixed?.({ type: "reset" });
  };
  let deadKey = false;
  let dialogs;
  const blur = () => {
    deadKey = false;
    reset();
  };
  const containsModal = (node) => node instanceof Element && (node.matches(modalSelector) || node.querySelector(modalSelector) !== null);
  const changedModals = (records) => {
    if (records.length > 0) dialogs = void 0;
    if (records.some((record2) => record2.type === "attributes" ? record2.oldValue === "dialog" || record2.oldValue === "true" || containsModal(record2.target) : [...record2.addedNodes, ...record2.removedNodes].some(containsModal))) reset();
  };
  const observer = new MutationObserver(changedModals);
  observer.observe(document2.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["role", "aria-modal"],
    attributeOldValue: true
  });
  const capture = () => {
    if (pending) reset();
    window2.clearTimeout(pendingTimer);
    changedModals(observer.takeRecords());
    pending = true;
    pendingTimer = window2.setTimeout(() => {
      pending = false;
      pendingTimer = void 0;
      reset();
    }, 0);
  };
  const keydown = (event) => {
    window2.clearTimeout(pendingTimer);
    pendingTimer = void 0;
    pending = false;
    const target = event.composedPath().find((value) => value instanceof Element);
    const element = target instanceof Element ? target : document2.activeElement;
    const region = element?.closest(".xterm") ? "terminal" : element?.closest('input, textarea, select, [contenteditable="true"], [contenteditable=""]') ? "editable" : "page";
    changedModals(observer.takeRecords());
    dialogs ??= document2.querySelectorAll(modalSelector);
    const top = dialogs[dialogs.length - 1];
    const context = { region, modal: top === void 0 ? null : top.dataset.shortcutModal ?? "other", target: element };
    const guarded = composition.guards(event) || deadKey || event.getModifierState("AltGraph");
    const isDead = event.key === "Dead";
    const commandDeadKey = isDead && shortcuts.runtime === "web" && shortcuts.platform === "macos" && event.code === "KeyN" && event.metaKey && event.altKey && !event.ctrlKey && !event.shiftKey;
    deadKey = isDead;
    const gesture = {
      code: event.code,
      control: event.ctrlKey,
      alt: event.altKey,
      shift: event.shiftKey,
      meta: event.metaKey,
      repeat: event.repeat,
      composing: guarded || isDead,
      defaultPrevented: event.defaultPrevented
    };
    const consume = () => {
      event.preventDefault();
      if (commandDeadKey) deadKey = false;
    };
    fixed?.({ type: "keydown", gesture, context, consume });
    if (native) return;
    shortcuts.dispatch({
      ...gesture,
      composing: guarded || isDead && !commandDeadKey,
      defaultPrevented: event.defaultPrevented
    }, context, consume);
  };
  document2.addEventListener("compositionstart", reset, true);
  document2.addEventListener("compositionend", reset, true);
  document2.addEventListener("focusin", reset, true);
  document2.addEventListener("pointerdown", reset, true);
  window2.addEventListener("keydown", capture, true);
  window2.addEventListener("keydown", keydown);
  window2.addEventListener("blur", blur);
  return () => {
    pending = false;
    window2.clearTimeout(pendingTimer);
    observer.disconnect();
    dialogs = void 0;
    composition.dispose();
    document2.removeEventListener("compositionstart", reset, true);
    document2.removeEventListener("compositionend", reset, true);
    document2.removeEventListener("focusin", reset, true);
    document2.removeEventListener("pointerdown", reset, true);
    window2.removeEventListener("keydown", capture, true);
    window2.removeEventListener("keydown", keydown);
    window2.removeEventListener("blur", blur);
  };
}

// upstream/packages/client/shortcuts/src/client/storage.ts.snapshot
var SHORTCUT_STORAGE_KEY = "dsh.keybindings.v1";
function webShortcutStorage(window2, platform, publish2) {
  const persistence = new ShortcutPersistence({
    read: () => window2.localStorage.getItem(SHORTCUT_STORAGE_KEY),
    write: (raw) => {
      window2.localStorage.setItem(SHORTCUT_STORAGE_KEY, raw);
    }
  }, "web", platform, true, publish2);
  const changed = (event) => {
    if (event.key === null || event.key === SHORTCUT_STORAGE_KEY) void persistence.readCurrent();
  };
  window2.addEventListener("storage", changed);
  return {
    get: (definitions) => {
      persistence.setDefinitions(definitions);
      return persistence.readCurrent();
    },
    edit: (edit, revision) => persistence.edit(edit, revision),
    subscribe: () => () => {
    },
    recording: async () => {
    },
    dispose: () => {
      window2.removeEventListener("storage", changed);
      persistence.dispose();
    }
  };
}
function desktopShortcutStorage(window2) {
  return window2.dshDesktop?.shortcuts;
}

// upstream/packages/client/shortcuts/src/client/native.ts.snapshot
function installNativeKeyboard(window2, keyboard, registry, snapshot2, reset) {
  return keyboard.subscribe((input) => {
    if (input.revision !== snapshot2().revision) return;
    reset?.();
    let target = window2.document.activeElement;
    while (target?.shadowRoot?.activeElement != null && !target.matches("webview[data-sidebar-browser-frame]")) {
      target = target.shadowRoot.activeElement;
    }
    const top = [...window2.document.querySelectorAll(modalSelector)].at(-1);
    const region = target?.closest(".xterm") ? "terminal" : target?.matches('input, textarea, select, [contenteditable="true"], [contenteditable=""]') ? "editable" : "page";
    const context = { target, region, modal: top?.dataset.shortcutModal ?? (top === void 0 ? null : "other") };
    if (input.kind === "menu") {
      registry.invoke(input.commandId, context);
      return;
    }
    if (input.kind === "keyboard") {
      registry.dispatch({ ...input, composing: false, defaultPrevented: false }, context, () => {
      });
      return;
    }
    if (input.kind === "webview") {
      if (target?.matches("webview[data-sidebar-browser-frame]") !== true || !target.isConnected || input.frameName === "" || target.getAttribute("name") !== input.frameName) return;
      registry.dispatch({ ...input, composing: false, defaultPrevented: false }, { ...context, source: "webview" }, () => {
      });
      return;
    }
    if (!(target instanceof HTMLIFrameElement) || !target.isConnected || !target.matches("iframe[data-sidebar-browser-frame], iframe[data-html-preview]") || input.frameName === "" || target.name !== input.frameName) return;
    registry.dispatch({ ...input, composing: false, defaultPrevented: false }, { ...context, source: "iframe" }, () => {
    });
  });
}

// upstream/packages/client/shortcuts/src/config.ts.snapshot
import z3 from "@deepseek-ai/schemastery";
var Config2 = z3.object({
  stopSequenceMs: z3.natural().min(1).max(2147483646).default(500)
});

// upstream/packages/client/shortcuts/src/client/index.ts.snapshot
var ShortcutsService = class extends Service {
  static inject = ["locale"];
  runtime;
  platform;
  catalog;
  config;
  fixedCatalog;
  stopSequenceMs;
  fixedListeners = /* @__PURE__ */ new Set();
  adapter;
  keyboard;
  active = true;
  connected = false;
  registry;
  constructor(ctx) {
    const environment = detectEnvironment(document, navigator);
    const keyboard = environment.runtime === "desktop" ? window.dshDesktop?.keyboard : void 0;
    if (environment.runtime === "desktop" && keyboard === void 0) throw new Error("Desktop keyboard bridge unavailable");
    super(ctx, "shortcuts");
    this.keyboard = keyboard;
    this.runtime = environment.runtime;
    this.platform = environment.platform;
    const config = Config2(globalThis.__DSH_SHORTCUTS_CONFIG__ ?? {});
    this.stopSequenceMs = config.stopSequenceMs;
    this.registry = new ShortcutRegistry(this.runtime, this.platform, initialShortcutConfig());
    this.catalog = this.registry.catalog;
    this.config = this.registry.config;
    this.fixedCatalog = this.registry.fixedCatalog;
    const publish2 = (snapshot2) => {
      if (this.active && this.connected && snapshot2.sequence >= this.config.getSnapshot().sequence) this.registry.configure(snapshot2);
    };
    const web = this.runtime === "web" ? webShortcutStorage(window, this.platform, publish2) : void 0;
    this.adapter = web ?? desktopShortcutStorage(window);
    if (keyboard !== void 0) ctx.effect(() => installNativeKeyboard(
      window,
      keyboard,
      this.registry,
      () => this.config.getSnapshot(),
      () => {
        this.fixedInput({ type: "reset" });
      }
    ), "shortcuts: native keyboard");
    ctx.effect(() => {
      const off = this.adapter?.subscribe(publish2);
      return () => {
        this.active = false;
        off?.();
        web?.dispose();
      };
    }, "shortcuts: preferences");
    this.syncDefinitions();
    ctx.effect(() => {
      const off = installKeyboard(
        window,
        this.registry,
        (input) => {
          this.fixedInput(input);
        },
        keyboard !== void 0 && (this.platform === "macos" || this.platform === "windows")
      );
      return () => {
        off();
        this.fixedListeners.clear();
      };
    }, "shortcuts: keyboard");
    ctx.effect(() => ctx.locale.subscribe(() => {
      this.registry.refreshLabels();
    }), "shortcuts: locale");
  }
  register(command) {
    const off = this.registry.register(command);
    this.syncDefinitions();
    return () => {
      off();
      this.syncDefinitions();
    };
  }
  registerFixed(command) {
    const off = this.registry.registerFixed(command);
    this.syncDefinitions();
    return () => {
      off();
      this.syncDefinitions();
    };
  }
  observeFixedInput(listener) {
    this.fixedListeners.add(listener);
    return () => {
      this.fixedListeners.delete(listener);
    };
  }
  fixedInput(input) {
    let consumed = false;
    for (const listener of [...this.fixedListeners]) {
      if (!this.fixedListeners.has(listener)) continue;
      try {
        listener(input.type === "reset" ? input : {
          ...input,
          gesture: { ...input.gesture, defaultPrevented: input.gesture.defaultPrevented || consumed },
          consume: () => {
            consumed = true;
            input.consume();
          }
        });
      } catch (error) {
        console.error("Fixed shortcut handler failed", error);
      }
    }
  }
  describeBinding(binding) {
    const normalized = binding === null ? null : normalizeBinding(binding, this.platform);
    return {
      binding: normalized,
      keys: presentBinding(normalized, this.platform).keys,
      issue: normalized === null ? null : bindingIssue(normalized, this.runtime, this.platform),
      conflicts: normalized === null ? [] : [
        ...this.catalog.getSnapshot().filter((row) => row.binding !== null && overlappingBindings(row.binding, normalized)).map((row) => row.id),
        ...this.fixedCatalog.getSnapshot().filter((row) => row.bindings.some((binding2) => overlappingBindings(binding2, normalized))).map((row) => row.id)
      ]
    };
  }
  syncDefinitions() {
    if (!this.active) return;
    if (this.adapter === void 0) {
      this.failRead();
      return;
    }
    void this.adapter.get(this.registry.definitions()).then((snapshot2) => {
      this.connected = true;
      if (this.active && snapshot2.sequence >= this.config.getSnapshot().sequence) this.registry.configure(snapshot2);
    }, () => {
      this.failRead();
    });
  }
  failRead() {
    if (this.active) this.registry.configure({ ...this.config.getSnapshot(), status: "unreadable", error: "read" });
  }
  /**
   * Persist one reviewed operation while retaining accepted bindings on failure.
   * @param args - edit and expected revision supplied by the editor.
   * @returns classified save outcome and accepted snapshot.
   */
  async edit(...args) {
    if (this.adapter === void 0) return { status: "unreadable", snapshot: this.config.getSnapshot() };
    let result;
    try {
      result = await this.adapter.edit(...args);
    } catch (error) {
      if (this.active) console.error("Shortcut preference save failed", error);
      return { status: "write-failed", snapshot: this.config.getSnapshot() };
    }
    if (this.active && result.snapshot.sequence >= this.config.getSnapshot().sequence) this.registry.configure(result.snapshot);
    return result;
  }
  async recording(active) {
    if (this.adapter === void 0) throw new Error("Desktop shortcuts bridge unavailable");
    await this.adapter.recording(active);
  }
  async closeWindow() {
    if (this.keyboard === void 0) throw new Error("Desktop keyboard bridge unavailable");
    await this.keyboard.closeWindow(this.config.getSnapshot().revision);
  }
};
export {
  LocaleRuntime,
  ShortcutsService,
  index_ts_exports3 as contextMenu,
  createClientModuleSystem,
  index_ts_exports2 as fileActions,
  index_ts_exports as shortcutReference
};
