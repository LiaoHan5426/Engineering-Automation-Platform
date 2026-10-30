import { describe, expect, it } from "vite-plus/test";
import { reasoningForModel } from "./reasoningChoice";

describe("reasoning for the current model", () => {
  it("drops a level the model does not list", () => {
    expect(reasoningForModel("high", [])).toEqual({ reasoning: "default", reset: "high" });
  });

  it("keeps a listed level and the model default", () => {
    expect(reasoningForModel("low", ["low", "high"])).toEqual({ reasoning: "low", reset: "" });
    expect(reasoningForModel("default", [])).toEqual({ reasoning: "default", reset: "" });
  });
});
