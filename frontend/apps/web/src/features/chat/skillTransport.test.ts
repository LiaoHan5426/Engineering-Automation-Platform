import { expect, it } from "vite-plus/test";
import axios from "axios";
import { createChatApi } from "@eap/runtime-client";
it("uses explicit Skill endpoints and serializes the immutable exact reference only", async () => {
  const requests: Array<{ url: string; data: unknown }> = [];
  const transport = axios.create({
    adapter: async (config) => {
      requests.push({ url: config.url!, data: config.data ? JSON.parse(config.data) : undefined });
      return {
        data: { skillContext: null, contextMemoryCleared: false },
        status: 200,
        statusText: "OK",
        headers: {},
        config,
      };
    },
  });
  const api = createChatApi("/api", transport);
  const input = {
    rawSkillMd: "---\nname: guide\ndescription: Guide\n---\nReview.",
    version: "1.0.0",
    sourceLabel: "operator",
    resources: [],
    requiredCapabilities: [],
  };
  const skillRef = { id: "guide", version: "1.0.0", digest: "a".repeat(64), stateRevision: 2 };
  expect(typeof api.previewSkill).toBe("function");
  await api.previewSkill(input);
  await api.saveSkill({ input, expectedDigest: skillRef.digest, confirmed: true });
  await api.skills();
  await api.skill("guide", "1.0.0");
  await api.activateSkill("guide", "1.0.0", { enabled: true, stateRevision: 1 });
  await api.previewSkillContext(skillRef, ["references/guide.md"]);
  const context = {
    mode: "chat" as const,
    expert: "general" as const,
    instructions: "",
    reasoning: "default" as const,
    approval: "review" as const,
    files: [],
    prototypeVersionId: "",
    targetPath: "",
    skillRef,
    skillResourcePaths: ["references/guide.md"],
  };
  const answer = await api.sendAiMessage("c1", "question", "none", context);
  expect(requests).toEqual([
    { url: "/skills/preview", data: input },
    { url: "/skills", data: { input, expectedDigest: skillRef.digest, confirmed: true } },
    { url: "/skills", data: undefined },
    { url: "/skills/guide/versions/1.0.0", data: undefined },
    { url: "/skills/guide/versions/1.0.0/activation", data: { enabled: true, stateRevision: 1 } },
    { url: "/skills/context/preview", data: { skillRef, resourcePaths: ["references/guide.md"] } },
    {
      url: "/ai/conversations/c1/messages",
      data: { message: "question", toolMode: "none", context },
    },
  ]);
  expect(answer.skillContext).toBeNull();
  expect(answer.contextMemoryCleared).toBe(false);
});
