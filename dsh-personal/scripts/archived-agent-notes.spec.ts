import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { describe, expect, it } from "vite-plus/test";
import { AGENT_NOTE_CLASSES } from "./agent-note-tree.ts";
import {
  extendArchiveManifest,
  gitBlobHash,
  parseArchiveManifest,
  renderArchiveManifest,
  validateArchiveArtifacts,
  validateArchiveManifestExtension,
  type ArchiveManifest,
} from "./archived-agent-notes.ts";
import { isArchivedAgentNotePath } from "./repo-files.ts";

function fixture(): Map<string, Buffer> {
  const base = "2026-07-26-example";
  const source = Buffer.from(
    `# Agent Note: Example\n\nStatus: implemented\nArchived: 2026-07-26\n\nEnglish | [中文](${base}.zh.md)\n\n## Problem\n\nExample.\n`,
  );
  const zh = Buffer.from(
    `# Agent Note: 示例\n\nStatus: implemented\nArchived: 2026-07-26\n\n[English](${base}.md) | 中文\n\n## 问题\n\n示例。\n`,
  );
  const meta = Buffer.from(
    `${base}.md: ${gitBlobHash(source)}\n${base}.zh.md: ${gitBlobHash(zh)}\n`,
  );
  return new Map([
    [`process/${base}.md`, source],
    [`process/${base}.zh.md`, zh],
    [`process/${base}.i18n.yaml`, meta],
  ]);
}

describe("archived Agent Notes", () => {
  it("recognizes archived paths with POSIX and Windows separators", () => {
    expect(isArchivedAgentNotePath(".agents/notes/archived/process/example.md")).toBe(true);
    expect(isArchivedAgentNotePath(".agents\\notes\\archived\\process\\example.md")).toBe(true);
    expect(isArchivedAgentNotePath(".agents/notes/implemented/process/example.md")).toBe(false);
  });

  it("accepts one complete implemented triplet with matching archive metadata", () => {
    expect(validateArchiveArtifacts(fixture())).toEqual([]);
  });

  it.each(["# Agent Note：示例", "# Historical decision"])(
    "preserves historical formatting: %s",
    (title) => {
      const artifacts = fixture();
      const base = "2026-07-26-example";
      const source = Buffer.from(
        `${title}\nStatus: implemented\nArchived: 2026-07-26\n[中文版本](${base}.zh.md)\n`,
      );
      artifacts.set(`process/${base}.md`, source);
      const zh = artifacts.get(`process/${base}.zh.md`)!;
      artifacts.set(
        `process/${base}.i18n.yaml`,
        Buffer.from(`${base}.md: ${gitBlobHash(source)}\n${base}.zh.md: ${gitBlobHash(zh)}\n`),
      );
      expect(validateArchiveArtifacts(artifacts)).toEqual([]);
    },
  );

  it.each([
    ["Status: proposed\nArchived: 2026-07-26", /requires `Status: implemented`/],
    ["Status: implemented\n\nArchived: 2026-07-26", /immediately after the status/],
    ["Status: implemented\nArchived: 2026-02-30", /valid date/],
    ["Status: implemented\nArchived: 2026-07-25", /predates the note filename/],
    ["Status: implemented\nArchived: 2026-07-27", /English and Chinese archive dates differ/],
    [
      "Archived: 2026-07-26\nStatus: implemented\nArchived: 2026-07-27",
      /English and Chinese archive dates differ/,
    ],
  ])("rejects invalid archive metadata: %s", (metadata, error) => {
    const artifacts = fixture();
    const base = "2026-07-26-example";
    const source = Buffer.from(`# Historical decision\n${metadata}\n`);
    artifacts.set(`process/${base}.md`, source);
    const zh = artifacts.get(`process/${base}.zh.md`)!;
    artifacts.set(
      `process/${base}.i18n.yaml`,
      Buffer.from(`${base}.md: ${gitBlobHash(source)}\n${base}.zh.md: ${gitBlobHash(zh)}\n`),
    );
    expect(validateArchiveArtifacts(artifacts).join("\n")).toMatch(error);
  });

  it("rejects incomplete triplets and invalid archive headers", () => {
    const artifacts = fixture();
    artifacts.delete("process/2026-07-26-example.i18n.yaml");
    artifacts.set(
      "process/2026-07-26-example.md",
      Buffer.from("# Agent Note: Example\n\nStatus: proposed\nArchived: yesterday\n"),
    );
    expect(validateArchiveArtifacts(artifacts).join("\n")).toMatch(/incomplete archived triplet/);
  });

  it("extends the manifest without permitting a sealed change or removal", () => {
    const artifacts = fixture();
    const empty: ArchiveManifest = { version: 1, files: {} };
    const first = extendArchiveManifest(empty, artifacts);
    expect(first.errors).toEqual([]);
    expect(first.added).toHaveLength(3);

    const sealed: ArchiveManifest = { version: 1, files: first.files };
    const changed = new Map(artifacts);
    changed.set("process/2026-07-26-example.md", Buffer.from("changed"));
    expect(extendArchiveManifest(sealed, changed).errors).toEqual([
      "process/2026-07-26-example.md: sealed content hash changed",
    ]);
    changed.delete("process/2026-07-26-example.zh.md");
    expect(extendArchiveManifest(sealed, changed).errors).toContain(
      "process/2026-07-26-example.zh.md: sealed artifact is missing",
    );
  });

  it("rejects replacing manifest seals alongside changed archive content", () => {
    const artifacts = fixture();
    const initial = extendArchiveManifest({ version: 1, files: {} }, artifacts);
    const baseline: ArchiveManifest = { version: 1, files: initial.files };
    const path = "process/2026-07-26-example.md";
    const changedArtifacts = new Map(artifacts);
    changedArtifacts.set(path, Buffer.from("changed"));
    const replacement = extendArchiveManifest({ version: 1, files: {} }, changedArtifacts);
    const current: ArchiveManifest = { version: 1, files: replacement.files };

    expect(extendArchiveManifest(current, changedArtifacts).errors).toEqual([]);
    expect(validateArchiveManifestExtension(baseline, current)).toEqual([
      `${path}: sealed manifest hash changed`,
    ]);
    const removed: ArchiveManifest = {
      version: 1,
      files: Object.fromEntries(
        Object.entries(current.files).filter(([candidate]) => candidate !== path),
      ),
    };
    expect(validateArchiveManifestExtension(baseline, removed)).toContain(
      `${path}: sealed manifest entry is missing`,
    );
  });

  it.each([
    {
      path: "feature/2026-08-10-durable-workflow-runs-in-chat.md",
      before: "sha256:f9f5290cd880908d17b1080ae5776f22e182f5253471f90cf8bead418b33b502",
      after: "sha256:6018de4a89ca99d6cbfd618aff1c8136b23d8e4854a30f7b12a602f0417cbdc2",
    },
    {
      path: "feature/2026-08-10-durable-workflow-runs-in-chat.zh.md",
      before: "sha256:f4ffd2700bc9c2a0cc4b9d90f84e1d0a576939e2e6f0b130c5b142fd8cd518b0",
      after: "sha256:0080859221773122022d5880efa3d52f29c0872b52d63e170250d94f214ff37a",
    },
    {
      path: "feature/2026-08-10-durable-workflow-runs-in-chat.i18n.yaml",
      before: "sha256:0db3c21a3c8785e56d5d7b90df990b158069cd1cea664e62fc4786c6d7588450",
      after: "sha256:03eadb60c8ba4fde262cd61e3f911d8cd68ea4a58f57adeb8dd7bb9a97d08ca2",
    },
  ])("accepts only the authorized seal transition for $path", ({ path, before, after }) => {
    const manifest = (hash: string): ArchiveManifest => ({ version: 1, files: { [path]: hash } });
    expect(validateArchiveManifestExtension(manifest(before), manifest(after))).toEqual([]);
    expect(validateArchiveManifestExtension(manifest(after), manifest(before))).toEqual([
      `${path}: sealed manifest hash changed`,
    ]);
    expect(
      validateArchiveManifestExtension(manifest(before), manifest("sha256:" + "0".repeat(64))),
    ).toHaveLength(1);
    expect(
      validateArchiveManifestExtension(manifest("sha256:" + "0".repeat(64)), manifest(after)),
    ).toHaveLength(1);
    expect(
      validateArchiveManifestExtension(manifest(before), { version: 1, files: {} }),
    ).toHaveLength(1);
    expect(
      validateArchiveManifestExtension(
        { version: 1, files: { "process/other.md": before } },
        { version: 1, files: { "process/other.md": after } },
      ),
    ).toHaveLength(1);
  });

  it.each([".", "workspace/dsh-personal"])(
    "checks committed seals from the project at %s",
    (projectPath) => {
      const gitRoot = mkdtempSync(join(tmpdir(), "dsh-archive-git-"));
      try {
        const projectRoot = resolve(gitRoot, projectPath);
        const scripts = join(projectRoot, "scripts");
        const archive = join(projectRoot, ".agents/notes/archived");
        mkdirSync(scripts, { recursive: true });
        for (const file of [
          "verify-archived-agent-notes.ts",
          "archived-agent-notes.ts",
          "agent-note-tree.ts",
        ]) {
          copyFileSync(join(import.meta.dirname, file), join(scripts, file));
        }
        writeFileSync(join(projectRoot, "package.json"), '{"type":"module"}\n');
        for (const kind of AGENT_NOTE_CLASSES) mkdirSync(join(archive, kind), { recursive: true });
        writeFileSync(join(archive, "AGENTS.md"), "# Frozen archive\n");
        const artifacts = fixture();
        for (const [path, content] of artifacts) writeFileSync(join(archive, path), content);
        const manifest = join(archive, "manifest.json");
        writeFileSync(
          manifest,
          renderArchiveManifest(extendArchiveManifest({ version: 1, files: {} }, artifacts).files),
        );
        if (projectPath !== ".") {
          // A root manifest must not substitute for the nested project's committed seals.
          const decoy = join(gitRoot, ".agents/notes/archived");
          mkdirSync(decoy, { recursive: true });
          writeFileSync(join(decoy, "manifest.json"), renderArchiveManifest({}));
        }
        const git = (args: string[]): void => {
          const result = spawnSync("git", args, { cwd: gitRoot, encoding: "utf8" });
          expect(result.error).toBeUndefined();
          expect(result.status, result.stderr).toBe(0);
        };
        git(["init", "--quiet"]);
        git(["add", "."]);
        git([
          "-c",
          "user.name=Archive test",
          "-c",
          "user.email=archive@example.invalid",
          "-c",
          "commit.gpgsign=false",
          "commit",
          "--quiet",
          "-m",
          "Seal archive fixture",
        ]);
        const check = (args: string[] = []) =>
          spawnSync(process.execPath, [join(scripts, "verify-archived-agent-notes.ts"), ...args], {
            cwd: projectRoot,
            encoding: "utf8",
            env: { ...process.env, DSH_ARCHIVE_BASE_REF: "HEAD" },
          });
        const unchanged = check();
        expect(unchanged.error).toBeUndefined();
        expect(unchanged.status, unchanged.stderr).toBe(0);
        expect(unchanged.stdout).toContain("3 frozen artifact(s) checked");

        const path = "process/2026-07-26-example.md";
        const changed = Buffer.concat([
          artifacts.get(path)!,
          Buffer.from("Changed frozen content.\n"),
        ]);
        artifacts.set(path, changed);
        const zh = artifacts.get("process/2026-07-26-example.zh.md")!;
        const meta = Buffer.from(
          `2026-07-26-example.md: ${gitBlobHash(changed)}\n2026-07-26-example.zh.md: ${gitBlobHash(zh)}\n`,
        );
        artifacts.set("process/2026-07-26-example.i18n.yaml", meta);
        writeFileSync(join(archive, path), changed);
        writeFileSync(join(archive, "process/2026-07-26-example.i18n.yaml"), meta);
        writeFileSync(
          manifest,
          renderArchiveManifest(extendArchiveManifest({ version: 1, files: {} }, artifacts).files),
        );
        for (const args of [[], ["--write"]]) {
          const resealed = check(args);
          expect(resealed.status).toBe(1);
          expect(resealed.stderr).toContain(`${path}: sealed manifest hash changed`);
        }
        writeFileSync(manifest, renderArchiveManifest({}));
        const removed = check();
        expect(removed.status).toBe(1);
        expect(removed.stderr).toContain(`${path}: sealed manifest entry is missing`);
      } finally {
        expect(dirname(gitRoot)).toBe(resolve(tmpdir()));
        expect(basename(gitRoot)).toMatch(/^dsh-archive-git-/);
        rmSync(gitRoot, { recursive: true, force: true });
      }
    },
  );

  it("round-trips the deterministic manifest schema", () => {
    const content = renderArchiveManifest({ "process/z.md": `sha256:${"a".repeat(64)}` });
    expect(parseArchiveManifest(content)).toEqual({
      version: 1,
      files: { "process/z.md": `sha256:${"a".repeat(64)}` },
    });
  });
});
