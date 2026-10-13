/** Shared id shape for authored experts and rule packs: kebab-case segments. */
export function assertExpertId(id) {
    const value = id.trim();
    if (!value)
        throw new Error("Expert id is required");
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value))
        throw new Error("Expert id must be kebab-case");
    return value;
}
export function defineExpert(manifest) {
    if (!manifest.name?.trim())
        throw new Error("Expert name is required");
    assertExpertId(manifest.id);
    return structuredClone(manifest);
}
export function compileExpert(manifest) {
    return `${JSON.stringify(defineExpert(manifest), null, 2)}\n`;
}
