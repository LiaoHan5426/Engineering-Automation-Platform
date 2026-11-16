/** Animate a notification promotion across the old and new card dimensions. */
import { nextTick } from "vue";

/** One mounted notification stack owns its pending promotion and stale callbacks. */
export class NoticeTransition {
  private pending: (() => void) | undefined;
  private active = true;

  /** Release pending geometry and retire handlers when the owning stack leaves. */
  dispose(): void {
    this.active = false;
    this.pending?.();
  }

  /**
   * Close a card immediately, then measure the committed Vue layout for surviving siblings.
   * @param card - mounted foreground card whose direct parent owns the stack.
   * @param dismiss - synchronous notification-store update for the close gesture.
   */
  dismiss(card: HTMLElement, dismiss: () => void): void {
    if (!this.active) return;
    this.pending?.();
    const stack = card.parentElement;
    if (
      stack === null ||
      typeof card.animate !== "function" ||
      getComputedStyle(card).transitionDuration === "0s"
    ) {
      dismiss();
      return;
    }
    const before = [...stack.querySelectorAll<HTMLElement>("aside")].map((element) => ({
      element,
      rect: element.getBoundingClientRect(),
      transition: element.style.transition,
    }));
    const release = () => {
      if (this.pending !== release) return;
      this.pending = undefined;
      for (const { element, transition } of before) element.style.transition = transition;
    };
    this.pending = release;
    for (const { element } of before) {
      for (const animation of element.getAnimations()) animation.cancel();
      element.style.transition = "none";
    }
    try {
      dismiss();
    } catch (error) {
      release();
      throw error;
    }
    void nextTick(() => {
      if (this.pending !== release) return;
      try {
        if (!stack.isConnected) return;
        for (const { element, rect } of before) {
          if (!element.isConnected || element.parentElement !== stack) continue;
          const transform = getComputedStyle(element).transform;
          const previousTransform = element.style.transform;
          element.style.transform = "none";
          const next = element.getBoundingClientRect();
          element.style.transform = previousTransform;
          if (next.width === 0 || next.height === 0) continue;
          element.animate(
            [
              {
                transform: `translate(${rect.x + rect.width / 2 - next.x - next.width / 2}px, ${rect.y - next.y}px) scale(${rect.width / next.width}, ${rect.height / next.height})`,
              },
              { transform },
            ],
            { duration: 250, easing: "ease-out" },
          );
        }
      } finally {
        release();
      }
    });
  }
}
