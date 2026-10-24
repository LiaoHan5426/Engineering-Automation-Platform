import { describe, expect, it } from "vite-plus/test";
import { openVersionPreview, pressVersionPreview } from "./prototypeVersion";

describe("version preview", () => {
  it("keeps button presses on the temporary preview", () => {
    const version = { title: "结算页", body: "正文", buttonPresses: 2 };
    const draft = { title: "活草稿", body: "未保存", buttonPresses: 7 };
    const opened = openVersionPreview(version);
    const pressed = pressVersionPreview(opened);
    expect(pressed.presses).toBe(3);
    expect(pressed.title).toBe("结算页");
    expect(version.buttonPresses).toBe(2);
    expect(draft.buttonPresses).toBe(7);
    expect(openVersionPreview(version).presses).toBe(2);
  });
});