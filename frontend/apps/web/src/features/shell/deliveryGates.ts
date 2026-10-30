/**
 * Live delivery gates for prototype-to-code preparation (SC-01).
 * Blocking gaps stop empty-chat handoff; soft gaps stay visible but do not invent success.
 */

export type DeliveryGate = {
  key: string;
  open: boolean;
  /** When false, the row is advisory only. Defaults to true. */
  blocking?: boolean;
  action?: "versions" | "model" | "builder";
};

export type DeliveryGateInput = {
  processBound: boolean;
  baselineReady: boolean;
  sourceReady: boolean;
  versionSelected: boolean;
  connectionState: string;
  model: string;
};

export function modelConfigured(connectionState: string, model: string): boolean {
  const name = model.trim();
  if (!name) return false;
  return connectionState !== "disabled" && connectionState !== "not_configured" && connectionState !== "";
}

export function modelVerified(connectionState: string): boolean {
  return connectionState === "available";
}

export function resolveDeliveryGates(input: DeliveryGateInput): DeliveryGate[] {
  const configured = modelConfigured(input.connectionState, input.model);
  const verified = modelVerified(input.connectionState);
  return [
    { key: "desktop.missingRepo", open: !input.processBound },
    { key: "desktop.missingBaseline", open: input.processBound ? !input.baselineReady : true },
    { key: "desktop.sourceUnread", open: !input.sourceReady },
    // Empty version list → builder; otherwise the scenes version select is enough once a row exists.
    { key: "desktop.missingVersion", open: !input.versionSelected, action: "builder" },
    configured
      ? { key: "desktop.modelUnverified", open: !verified, blocking: false, action: "model" }
      : { key: "desktop.missingModel", open: true, action: "model" },
  ];
}

export function deliveryBlocked(gates: DeliveryGate[]): boolean {
  return gates.some((gate) => gate.open && gate.blocking !== false);
}
