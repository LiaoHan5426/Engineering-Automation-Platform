/** Viewport coordinates avoid coupling a popup to the composer's changing height. */
export function popupPlacement(anchor: { top: number; bottom: number; left: number }, viewport: { width: number; height: number }): Record<string, string> {
  const margin = 12;
  const width = Math.max(160, Math.min(440, viewport.width - 88));
  const above = Math.max(0, anchor.top - margin);
  const below = Math.max(0, viewport.height - anchor.bottom - margin);
  const down = above < 220 && below > above;
  return {
    position: 'fixed', zIndex: '40',
    left: `${Math.max(margin, Math.min(anchor.left, viewport.width - width - margin))}px`,
    right: 'auto', bottom: 'auto',
    top: `${down ? anchor.bottom + 8 : anchor.top - 8}px`,
    width: `${width}px`, minWidth: '0',
    maxHeight: `${Math.min(420, down ? below : above)}px`,
    transform: down ? 'none' : 'translateY(-100%)',
  };
}
