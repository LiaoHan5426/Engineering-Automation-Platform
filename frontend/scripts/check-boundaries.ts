import fs from "node:fs";
import path from "node:path";
const root = process.cwd();
const problems: string[] = [];
function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (["node_modules", "dist", ".git"].includes(entry.name)) return [];
    const file = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(file) : [file];
  });
}
for (const group of ["apps", "packages", "internal"]) {
  for (const folder of fs.readdirSync(path.join(root, group), { withFileTypes: true })) {
    if (!folder.isDirectory()) continue;
    const packageRoot = path.join(root, group, folder.name);
    const manifest = path.join(packageRoot, "package.json");
    if (!fs.existsSync(manifest)) {
      problems.push(`${group}/${folder.name}: missing package.json`);
      continue;
    }
    const pkg = JSON.parse(fs.readFileSync(manifest, "utf8"));
    const dependencies = { ...pkg.dependencies, ...pkg.devDependencies, ...pkg.peerDependencies };
    for (const file of walk(packageRoot).filter((file) => /\.(?:ts|vue|mjs)$/.test(file))) {
      const source = fs.readFileSync(file, "utf8");
      for (const match of source.matchAll(/(?:from\s+|import\s*\(|import\s+)["']([^"']+)["']/g)) {
        const target = match[1]!;
        if (target.startsWith(".")) {
          const resolved = path.resolve(path.dirname(file), target);
          const relative = path.relative(packageRoot, resolved);
          if (relative.startsWith("..") || path.isAbsolute(relative))
            problems.push(`${file}: cross-package relative import ${target}`);
        }
        if (!target.startsWith(".") && !target.startsWith("node:")) {
          const name = target.startsWith("@")
            ? target.split("/").slice(0, 2).join("/")
            : target.split("/")[0]!;
          if (!dependencies[name]) problems.push(`${file}: undeclared dependency ${name}`);
          if (target.startsWith("@eap/") && /\/src(?:\/|$)/.test(target))
            problems.push(`${file}: private source import ${target}`);
        }
      }
    }
  }
}
if (problems.length) {
  console.error(problems.join("\n"));
  process.exitCode = 1;
} else console.warn("Workspace manifests, declared dependencies and package import boundaries OK.");
