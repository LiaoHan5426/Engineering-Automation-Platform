// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from "vite-plus/test";
import { createApp, h, nextTick, type App } from "vue";
import { runtimeApi, type SkillSnapshot, type TaskContext } from "@eap/runtime-client";
import { i18n } from "../../lib/i18n";
import TaskComposer from "./TaskComposer.vue";
import { createChatSession, type ChatApi } from "./chatSession";
let app: App, host: HTMLDivElement;
afterEach(() => {
  app?.unmount();
  host?.remove();
  vi.restoreAllMocks();
  sessionStorage.clear();
});
const skillRef = { id: "guide", version: "1.0.0", digest: "a".repeat(64), stateRevision: 2 };
const snapshot: SkillSnapshot = {
  ...skillRef,
  enabled: true,
  description: "Guide",
  sourceLabel: "operator",
  createdAt: "",
  dependencies: [],
  schemaVersion: 1,
  entry: "SKILL.md",
  rawSkillMd: "raw",
  instructions: "<script>untrusted guide</script>",
  resources: [{ path: "guide.txt", mediaType: "text/plain", content: "resource" }],
  requiredCapabilities: [],
  scope: "mock",
  trust: { operator: "local", confirmedAt: "now" },
};
function button(id: string) {
  const el = document.querySelector<HTMLButtonElement>(`[data-testid="${id}"]`);
  expect(el, id).not.toBeNull();
  return el!;
}
async function click(id: string) {
  button(id).click();
  await nextTick();
}
async function setup() {
  const send = vi.fn(async () => ({
    answer: "answer",
    error: "",
    status: "SUCCEEDED",
    executionId: null,
    approval: "",
    verification: "",
    toolEvents: [],
    artifacts: [],
    artifactError: "",
  }));
  const session = createChatSession({
    openAiConversation: async () => ({ conversationId: "c1", workspaceLabel: "", memory: "" }),
    sendAiMessage: send,
  } as unknown as ChatApi);
  await session.openConversation();
  session.draft.value = "keep question";
  vi.spyOn(runtimeApi, "skills").mockResolvedValue({ items: [{ ...snapshot, createdAt: "" }] });
  const get = vi.spyOn(runtimeApi, "skill").mockResolvedValue(snapshot);
  const preview = vi.spyOn(runtimeApi, "previewSkillContext").mockResolvedValue({
    skillRef,
    instructions: snapshot.instructions,
    resources: snapshot.resources,
    dependencies: [],
  });
  host = document.createElement("div");
  document.body.append(host);
  app = createApp({
    render: () =>
      h(TaskComposer, {
        context: session.context.value,
        draft: session.draft.value,
        toolMode: session.toolMode.value,
        disabled: false,
        reasoningEfforts: [],
        onUpdate: (value: TaskContext) => {
          session.context.value = value;
        },
      }),
  });
  app.use(i18n).mount(host);
  await nextTick();
  return { session, send, get, preview };
}
it("selects through + skills, loads full text on demand, previews checked resources and applies only an exact reference", async () => {
  const { session, send, get, preview } = await setup();
  preview.mockResolvedValue({
    skillRef: { stateRevision: 2, digest: skillRef.digest, version: "1.0.0", id: "guide" },
    instructions: snapshot.instructions,
    resources: snapshot.resources,
    dependencies: [],
  });
  expect(get).not.toHaveBeenCalled();
  await click("composer-add");
  await click("composer-cat-skills");
  await click("skill-open");
  await vi.waitFor(() =>
    expect(document.querySelector('[data-testid="skill-candidate-guide-1.0.0"]')).not.toBeNull(),
  );
  await click("skill-candidate-guide-1.0.0");
  await vi.waitFor(() =>
    expect(document.querySelector("[data-testid=skill-resource-0]")).not.toBeNull(),
  );
  expect(get).toHaveBeenCalledWith("guide", "1.0.0");
  expect(button("skill-use").disabled).toBe(true);
  await click("skill-resource-0");
  await click("skill-context-preview");
  await vi.waitFor(() => expect(button("skill-use").disabled).toBe(false));
  expect(preview).toHaveBeenCalledWith(skillRef, ["guide.txt"]);
  await click("skill-use");
  expect(send).not.toHaveBeenCalled();
  expect(session.draft.value).toBe("keep question");
  expect(session.context.value.skillRef).toEqual(skillRef);
  expect(session.context.value.skillResourcePaths).toEqual(["guide.txt"]);
  expect(session.context.value.instructions).toBe("");
  await session.send();
  expect(send.mock.calls[0]).toEqual([
    "c1",
    "keep question",
    "none",
    expect.objectContaining({ skillRef, skillResourcePaths: ["guide.txt"], instructions: "" }),
  ]);
  await click("skill-remove");
  expect(session.context.value).not.toHaveProperty("skillRef");
  expect(session.context.value).not.toHaveProperty("skillResourcePaths");
});
it.each(["catalog", "detail"])(
  "ignores late %s responses after cancellation and preserves the prior exact reference",
  async (stage) => {
    const { session, get, send } = await setup();
    session.context.value = {
      ...session.context.value,
      skillRef,
      skillResourcePaths: ["guide.txt"],
    };
    await nextTick();
    let resolve!: (value: any) => void;
    if (stage === "catalog")
      vi.mocked(runtimeApi.skills).mockImplementationOnce(
        () =>
          new Promise((done) => {
            resolve = done;
          }),
      );
    else
      get.mockImplementationOnce(
        () =>
          new Promise((done) => {
            resolve = done;
          }),
      );
    await click("composer-add");
    await click("composer-cat-skills");
    await click("skill-open");
    if (stage === "detail") {
      await vi.waitFor(() =>
        expect(
          document.querySelector('[data-testid="skill-candidate-guide-1.0.0"]'),
        ).not.toBeNull(),
      );
      await click("skill-candidate-guide-1.0.0");
    }
    await click("skill-selector-cancel");
    resolve(stage === "catalog" ? { items: [snapshot] } : snapshot);
    await nextTick();
    await nextTick();
    expect(document.querySelector("[data-testid=skill-dialog]")).toBeNull();
    expect(session.context.value.skillRef).toEqual(skillRef);
    expect(session.context.value.skillResourcePaths).toEqual(["guide.txt"]);
    expect(session.draft.value).toBe("keep question");
    expect(send).not.toHaveBeenCalled();
  },
);
it("discards an in-flight preview when the active session context changes", async () => {
  const { session, preview } = await setup();
  let resolve!: (value: Awaited<ReturnType<typeof runtimeApi.previewSkillContext>>) => void;
  preview.mockImplementation(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  await click("composer-add");
  await click("composer-cat-skills");
  await click("skill-open");
  await vi.waitFor(() =>
    expect(document.querySelector('[data-testid="skill-candidate-guide-1.0.0"]')).not.toBeNull(),
  );
  await click("skill-candidate-guide-1.0.0");
  await vi.waitFor(() =>
    expect(document.querySelector("[data-testid=skill-resource-0]")).not.toBeNull(),
  );
  await click("skill-context-preview");
  session.context.value = { ...session.context.value };
  session.draft.value = "other session";
  await nextTick();
  resolve({ skillRef, instructions: "late", resources: [], dependencies: [] });
  await nextTick();
  await nextTick();
  expect(document.querySelector("[data-testid=skill-dialog]")).toBeNull();
  expect(session.context.value).not.toHaveProperty("skillRef");
  expect(session.draft.value).toBe("other session");
});
