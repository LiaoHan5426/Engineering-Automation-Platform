import { expect, it } from "vite-plus/test";
import { createMockChatBackend } from "./chatBackend";
import type { SkillSnapshot } from "@eap/runtime-client";
const input = {
  rawSkillMd:
    "---\nname: mock-review\ndescription: Safe mock review fixture\n---\nReview changes and verify tests. This is simulated guidance.\n",
  version: "1.0.0",
  sourceLabel: "mock operator",
  resources: [
    {
      path: "references/guide.txt",
      mediaType: "text/plain",
      content: "Explicit simulated resource",
    },
  ],
  requiredCapabilities: ["git-status"],
};
it("imports a labelled fixture disabled, lists metadata only, activates with CAS and resolves exact selected resources", async () => {
  const api = createMockChatBackend();
  const preview = await api.handle("POST", "/skills/preview", input);
  expect(preview.status).toBe(200);
  const p = preview.data as SkillSnapshot;
  expect(p.trust).toBeNull();
  expect(p.createdAt).toBeNull();
  const request = { input, expectedDigest: p.digest, confirmed: true };
  const saved = await api.handle("POST", "/skills", request);
  expect(saved.status).toBe(200);
  expect(saved.data).toMatchObject({ enabled: false, stateRevision: 1 });
  expect((await api.handle("POST", "/skills", request)).data).toEqual(saved.data);
  const page = (await api.handle("GET", "/skills")).data as { items: Record<string, unknown>[] };
  expect(page.items).toHaveLength(1);
  expect(page.items[0]).not.toHaveProperty("rawSkillMd");
  expect(page.items[0]).not.toHaveProperty("resources");
  const route = "/skills/mock-review/versions/1.0.0";
  const active = await api.handle("POST", route + "/activation", {
    enabled: true,
    stateRevision: 1,
  });
  expect(active.data).toMatchObject({ enabled: true, stateRevision: 2 });
  expect(
    (await api.handle("POST", route + "/activation", { enabled: false, stateRevision: 1 })).status,
  ).toBe(409);
  const skillRef = { id: p.id, version: p.version, digest: p.digest, stateRevision: 2 };
  expect(
    (
      await api.handle("POST", "/skills/context/preview", {
        skillRef,
        resourcePaths: ["references/guide.txt"],
      })
    ).data,
  ).toMatchObject({ skillRef, resources: input.resources });
  const changed = { ...input, sourceLabel: "changed" };
  const next = (await api.handle("POST", "/skills/preview", changed)).data as SkillSnapshot;
  expect(
    (
      await api.handle("POST", "/skills", {
        input: changed,
        expectedDigest: next.digest,
        confirmed: true,
      })
    ).data,
  ).toMatchObject({ detail: "SKILL_VERSION_CONFLICT" });
  const v2 = { ...input, version: "2.0.0" };
  const p2 = (await api.handle("POST", "/skills/preview", v2)).data as SkillSnapshot;
  await api.handle("POST", "/skills", { input: v2, expectedDigest: p2.digest, confirmed: true });
  expect((await api.handle("GET", route)).data).toMatchObject({ enabled: true, stateRevision: 2 });
  expect(
    (
      await api.handle("POST", "/skills/preview", {
        ...input,
        rawSkillMd: "---\nname: arbitrary\ndescription: valid YAML\n---\nBody",
      })
    ).data,
  ).toMatchObject({ detail: "MOCK_SKILL_PARSER_UNSUPPORTED" });
});
