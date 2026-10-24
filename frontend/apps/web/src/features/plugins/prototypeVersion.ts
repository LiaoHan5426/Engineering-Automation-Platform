export interface VersionPreview {
  title: string;
  body: string;
  presses: number;
}

/** The opened version supplies the initial preview. Presses after that stay on this copy. */
export function openVersionPreview(version: { title: string; body: string; buttonPresses: number }): VersionPreview {
  return { title: version.title, body: version.body, presses: version.buttonPresses };
}

export function pressVersionPreview(preview: VersionPreview): VersionPreview {
  return { title: preview.title, body: preview.body, presses: preview.presses + 1 };
}
