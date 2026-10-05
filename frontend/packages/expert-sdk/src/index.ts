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
export function defineExpert(manifest: ExpertManifest): ExpertManifest {
  if (!manifest.id || !manifest.name) throw new Error("Expert id and name are required");
  if (!manifest.id.match(/^[a-z0-9]+(?:-[a-z0-9]+)*$/))
    throw new Error("Expert id must be kebab-case");
  return structuredClone(manifest);
}
export function compileExpert(manifest: ExpertManifest): string {
  return `${JSON.stringify(defineExpert(manifest), null, 2)}\n`;
}
