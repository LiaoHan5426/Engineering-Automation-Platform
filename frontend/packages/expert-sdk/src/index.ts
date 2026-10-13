export type ExpertInput = "text" | "sql" | "database-dialect";
export type ExpertManifest = {
  apiVersion: "eap/v1";
  kind: "Expert";
  id: string;
  name: string;
  description: string;
  inputs: Record<string, { type: ExpertInput; required: boolean }>;
  knowledgeBases: string[];
  capabilities: string[];
  rules: string[];
  escalation: { provider: string; when: string };
};
/** Shared id shape for authored experts and rule packs: kebab-case segments. */
export function assertExpertId(id: string): string {
  const value = id.trim();
  if (!value) throw new Error("Expert id is required");
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)) throw new Error("Expert id must be kebab-case");
  return value;
}

export function defineExpert(manifest: ExpertManifest): ExpertManifest {
  if (!manifest.name?.trim()) throw new Error("Expert name is required");
  assertExpertId(manifest.id);
  return structuredClone(manifest);
}
export function compileExpert(manifest: ExpertManifest): string {
  return `${JSON.stringify(defineExpert(manifest), null, 2)}\n`;
}
