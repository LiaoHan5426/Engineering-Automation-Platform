import { describe, expect, it } from "vite-plus/test";
import { deliveryBlocked, modelConfigured, resolveDeliveryGates } from "./deliveryGates";

describe("deliveryGates", () => {
  it("blocks when the model connection is missing", () => {
    const gates = resolveDeliveryGates({
      processBound: true,
      baselineReady: true,
      sourceReady: true,
      versionSelected: true,
      connectionState: "disabled",
      model: "",
    });
    expect(gates.find((item) => item.key === "desktop.missingModel")?.open).toBe(true);
    expect(deliveryBlocked(gates)).toBe(true);
    expect(modelConfigured("disabled", "")).toBe(false);
  });

  it("keeps an unverified model as advisory after configuration", () => {
    const gates = resolveDeliveryGates({
      processBound: true,
      baselineReady: true,
      sourceReady: true,
      versionSelected: true,
      connectionState: "configured_unverified",
      model: "gpt-test",
    });
    expect(gates.find((item) => item.key === "desktop.missingModel")).toBeUndefined();
    expect(gates.find((item) => item.key === "desktop.modelUnverified")).toMatchObject({
      open: true,
      blocking: false,
    });
    expect(deliveryBlocked(gates)).toBe(false);
  });

  it("clears model gates once a call has been observed", () => {
    const gates = resolveDeliveryGates({
      processBound: true,
      baselineReady: true,
      sourceReady: true,
      versionSelected: true,
      connectionState: "available",
      model: "gpt-test",
    });
    expect(gates.every((item) => !item.open)).toBe(true);
    expect(deliveryBlocked(gates)).toBe(false);
  });
});
