import { describe, expect, it } from "vite-plus/test";
import { acceptFiles } from "./acceptFiles";

const text = { name: "note.txt", size: 5, text: "hello", media: false };
const image = { name: "shot.png", size: 3, text: "", media: true };

describe("pasted and picked files", () => {
  it("adds text and leaves an image out of the draft outside preview", () => {
    expect(acceptFiles([], [text], false)).toEqual({ ok: true, files: [{ name: "note.txt", content: "hello" }], note: "" });
    expect(acceptFiles([{ name: "note.txt", content: "hello" }], [image], false)).toEqual({ ok: false, reason: "media" });
  });

  it("records only the file name for a preview image", () => {
    expect(acceptFiles([], [image], true)).toEqual({
      ok: true,
      files: [{ name: "shot.png", content: "[Mock media reference: shot.png]" }],
      note: "media",
    });
  });

  it("rejects an oversized batch without keeping a partial add", () => {
    const existing = [{ name: "a.txt", content: "a" }];
    expect(acceptFiles(existing, [{ name: "big.txt", size: 4, text: "x".repeat(16001), media: false }], false)).toEqual({ ok: false, reason: "limit" });
    expect(existing).toEqual([{ name: "a.txt", content: "a" }]);
  });
});
