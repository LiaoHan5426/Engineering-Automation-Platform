import { expect, it } from "vite-plus/test";
import { outgoingInstructions, PLAN_LIMIT } from "./outgoing";

it("joins the scene and expert guidance that the next send will attach", () => {
  expect(outgoingInstructions({ instructions: "保持现有组件", scene: "对照现有页面", guidance: "复用现有 Vue 组件，不新建空壳。", plan: false }))
    .toBe("保持现有组件\n对照现有页面\n复用现有 Vue 组件，不新建空壳。");
  expect(outgoingInstructions({ instructions: "同一句", scene: "同一句", guidance: "", plan: false })).toBe("同一句");
  expect(outgoingInstructions({ instructions: "", scene: "", guidance: "", plan: true })).toBe(`\n${PLAN_LIMIT}`);
});
