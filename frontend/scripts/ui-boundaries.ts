import { parse } from "vue/compiler-sfc";

const primitives = new Set(["button", "input", "select", "textarea", "dialog", "table", "details", "summary", "progress"]);
const controlRoles = new Set(["button", "menu", "menuitem", "menuitemcheckbox", "menuitemradio", "listbox", "option", "tab", "tablist", "switch", "checkbox", "radio", "slider", "tree", "treeitem"]);

export function inspectUiStyles(source: string, filename: string): string[] {
  const css = source.replace(/\/\*[\s\S]*?\*\//g, "");
  const problems: string[] = [];
  for (const match of css.matchAll(/(?:^|[;{])\s*([\w-]+)\s*:\s*([^;{}]*)/g)) {
    if (match[1] === "content") continue;
    if (/#(?:[\da-f]{8}|[\da-f]{6}|[\da-f]{4}|[\da-f]{3})\b|\brgba?\(|(?:^|[\s,(])(?:white|black)(?=$|[\s,)])/i.test(match[2]!))
      problems.push(`${filename}: use @eap/style semantic tokens for ${match[1]}: ${match[2]?.trim()}`);
  }
  return problems;
}

/** Inspect actual SFC templates, excluding comments, CSS and editor HTML strings. */
export function inspectUiTemplate(source: string, filename: string): string[] {
  const { descriptor, errors } = parse(source, { filename });
  const problems = errors.map((error) => `${filename}: ${String(error)}`);
  function visit(value: unknown) {
    if (!value || typeof value !== "object") return;
    const node = value as { type?: number; tag?: string; children?: unknown[]; loc?: { start: { line: number } }; props?: Array<{ name?: string; value?: { content?: string }; arg?: { content?: string }; exp?: { content?: string } }> };
    if (node.type === 1 && node.tag && primitives.has(node.tag)) {
      problems.push(`${filename}:${node.loc?.start.line}: use @eap/ui instead of <${node.tag}>`);
    }
    if (node.type === 1 && node.props?.some((prop) => prop.name === "role" && prop.value?.content === "dialog")) {
      problems.push(`${filename}:${node.loc?.start.line}: use @eap/ui Dialog instead of a parallel dialog shell`);
    }
    if (node.type === 1) {
      for (const prop of node.props ?? []) {
        const key = prop.name === "bind" ? prop.arg?.content : prop.name;
        const literal = prop.value?.content ?? prop.exp?.content?.replace(/^['"]|['"]$/g, "");
        if (key === "role" && literal && controlRoles.has(literal))
          problems.push(`${filename}:${node.loc?.start.line}: use a shared UI control instead of role="${literal}"`);
        if (node.tag === "Button" && key === "variant" && (literal === "custom" || /['"]custom['"]/.test(prop.exp?.content ?? "")))
          problems.push(`${filename}:${node.loc?.start.line}: app Button must use a shared variant instead of custom`);
        if (node.tag === "component" && key === "is" && literal && primitives.has(literal))
          problems.push(`${filename}:${node.loc?.start.line}: dynamic native control ${literal} bypasses @eap/ui`);
        if (/^[a-z]/.test(node.tag ?? "") && prop.name === "on" && prop.arg?.content === "click" && prop.exp?.content && node.tag !== "a")
          problems.push(`${filename}:${node.loc?.start.line}: native click action must use a shared UI control`);
      }
    }
    node.children?.forEach(visit);
  }
  visit(descriptor.template?.ast);
  for (const style of descriptor.styles) problems.push(...inspectUiStyles(style.content, filename));
  return problems;
}
