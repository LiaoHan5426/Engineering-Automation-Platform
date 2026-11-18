import { describe, expect, it } from "vite-plus/test";
import { reasoningText } from "../src/client/reasoning-text.ts";

describe("reasoning display text", () => {
  it.each([
    "",
    "Ordinary reasoning",
    "普通思考正文",
    "\n  Original text  \n",
    "<note>Original text</note>",
  ])("preserves ordinary reasoning %j", (text) => {
    expect(reasoningText(text)).toBe(text);
  });
});
