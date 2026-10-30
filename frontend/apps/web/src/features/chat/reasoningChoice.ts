export type ReasoningLevel = "low" | "medium" | "high";
export type ReasoningChoice = "default" | ReasoningLevel;

/** Keeps the current level only when this model lists it. Does not invent a level. */
export function reasoningForModel(current: ReasoningChoice, efforts: readonly ReasoningLevel[]): { reasoning: ReasoningChoice; reset: "" | ReasoningLevel } {
  if (current !== "default" && !efforts.includes(current)) return { reasoning: "default", reset: current };
  return { reasoning: current, reset: "" };
}
