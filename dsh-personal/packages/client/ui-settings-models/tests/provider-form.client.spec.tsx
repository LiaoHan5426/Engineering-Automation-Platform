import { h as vh } from "vue";
// @vitest-environment jsdom
/** Model-list editing, endpoint interrogation, and hand-declared provider creation. */
import { within, fireEvent, screen, waitFor } from "@testing-library/dom";
import { act, cleanup, render } from "../../../test-support/client-runtime/src/vue-test.ts";
import { afterEach, describe, expect, it, vi } from "vitest";
import Schema from "@deepseek-ai/schemastery";
import { Context } from "@deepseek-ai/cordis";
import { bindSnapshotSelector, RemoteError } from "@deepseek-ai/dsh-client-test-runtime";
import type { SettingsNamespaceView } from "@deepseek-ai/dsh-api-remotes/client";
import type { JsonValue } from "@deepseek-ai/dsh-util-values";
import { ModelsSection, providerCopy } from "../src/client/ModelsSection.tsx";
import type { ModelsSectionInjected, ModelsSectionProps } from "../src/client/ModelsSection.tsx";
import { CustomProviderCard } from "../src/client/CustomProviderCard.tsx";
import { formatCapacity, parseCapacity } from "../src/client/DeepSeekModelsEditor.tsx";
import { SettingsDescribeMirror } from "@deepseek-ai/dsh-client-ui-settings/src/client/settings-mirror.ts";
import {
  ModelsSettingsStore,
  deriveKeyRef,
  protocolChoices,
  reasoningLevelChoices,
} from "../src/client/store.ts";
import { createModelsOperations } from "../src/client/operations.ts";
import type { ModelsOperations } from "../src/client/operations.ts";
import { en } from "../src/client/locales.ts";
import { settingsSchema } from "./settings-schema.client.ts";
afterEach(cleanup);
const t: ModelsSectionInjected["t"] = (key) => en[key];
const PROTOCOLS = [
  "openai-completions",
  "openai-responses",
  "anthropic-messages",
  "google-generative-ai",
];
const LEVELS = ["off", "minimal", "low", "medium", "high", "xhigh", "max"];
/** The pi-ai profile shape as the host serializes it, including the layer-1 fields. */
const PiAiConfig = Schema.object({
  providers: Schema.dict(
    Schema.object({
      apiKey: Schema.string().role("secret"),
      apiKeyEnv: Schema.string().role("credential-ref"),
      displayName: Schema.string(),
      api: Schema.union(PROTOCOLS),
      baseURL: Schema.string(),
      models: Schema.array(
        Schema.object({
          id: Schema.string().required(),
          name: Schema.string(),
          contextWindow: Schema.number(),
          maxTokens: Schema.number(),
          reasoningEfforts: Schema.union([
            Schema.const(false),
            Schema.dict(Schema.union([Schema.string(), Schema.const(null)]), Schema.union(LEVELS)),
          ]),
        }),
      ),
      reasoning: Schema.union(["off", "high"]),
    }),
  ),
});
function ok<T>(value: T) {
  return { ok: true as const, value };
}
/** One draft-interrogation failure per code, each carrying its own details. */
const DISCOVERY_FAILURES: {
  [Code in "gateway/internal" | "llm/model-discovery-rejected"]: (
    message: string,
  ) => RemoteError<Code>;
} = {
  "gateway/internal": (message) => new RemoteError("gateway/internal", message, {}),
  "llm/model-discovery-rejected": (message) =>
    new RemoteError("llm/model-discovery-rejected", message, { settingsNs: "llm-pi-ai" }),
};
function fail(message: string, code: keyof typeof DISCOVERY_FAILURES) {
  return { ok: false as const, error: DISCOVERY_FAILURES[code](message) };
}
/** Credentials answers over the Remote carrier, which has no envelope. */
function remoteOk<T>(value: T) {
  return { ok: true as const, value };
}
/** The codes this page's scripted Host answers refuse with. */
type RefusalCode = "credential/rejected" | "settings/conflict" | "settings/rejected";
/** One refusal per code, each carrying the details its own code declares. */
const REFUSALS: {
  [Code in RefusalCode]: (message: string) => RemoteError<Code>;
} = {
  "credential/rejected": (message) =>
    new RemoteError("credential/rejected", message, { ref: "OPENAI_API_KEY" }),
  "settings/conflict": (message) =>
    new RemoteError("settings/conflict", message, { ns: "llm-pi-ai", expected: 7, actual: 8 }),
  "settings/rejected": (message) =>
    new RemoteError("settings/rejected", message, { ns: "llm-pi-ai" }),
};
function remoteFail(message: string, code: RefusalCode = "credential/rejected") {
  return { ok: false as const, error: REFUSALS[code](message) };
}
function piAiNamespace(
  providers: Record<string, JsonValue>,
  userProviders: Record<string, JsonValue> = providers,
  baseProviders: Record<string, JsonValue> = {},
): SettingsNamespaceView {
  return {
    ns: "llm-pi-ai",
    schema: JSON.parse(JSON.stringify(PiAiConfig.toJSON())) as JsonValue,
    // `value` is the effective section; `user` is only the layer this page
    // writes. They differ whenever a composition `base` supplies something.
    value: { providers },
    base: { providers: baseProviders },
    user: { providers: userProviders },
    autoGenerate: true,
    applies: "live",
    secrets: [],
    revision: 3,
  };
}
function scriptedFace(
  options: {
    providers?: Record<string, JsonValue>;
    /** User layer, when it differs from the effective section. */
    userProviders?: Record<string, JsonValue>;
    /** Composition layer, for a route a `cordis.yml` pins rather than the page. */
    baseProviders?: Record<string, JsonValue>;
    /** Routes the adapter reports as hand-declared; the rest come back as shipped. */
    declaredRoutes?: readonly string[];
    discover?: ReturnType<typeof vi.fn>;
    mutate?: ReturnType<typeof vi.fn>;
    set?: ReturnType<typeof vi.fn>;
  } = {},
) {
  const providers = options.providers ?? {
    openai: { apiKeyEnv: "OPENAI_API_KEY", baseURL: "https://proxy.example/v1" },
  };
  const namespace = piAiNamespace(
    providers,
    options.userProviders ?? providers,
    options.baseProviders ?? {},
  );
  const discover = options.discover ?? vi.fn(() => Promise.resolve(ok([])));
  const mutate = options.mutate ?? vi.fn(() => Promise.resolve(remoteOk(namespace)));
  const set = options.set ?? vi.fn(() => Promise.resolve(remoteOk(undefined)));
  const face = {
    llm: {
      listProviders: vi.fn(() =>
        Promise.resolve(
          ok(Object.keys(providers).map((provider) => ({ id: provider, name: provider }))),
        ),
      ),
      listConfigurableProviders: vi.fn(() =>
        Promise.resolve(
          ok(
            Object.keys(providers).map((provider) => ({
              provider,
              displayName: provider,
              settingsNs: "llm-pi-ai",
              settingsPath: ["providers", provider],
              declared: options.declaredRoutes?.includes(provider) ?? false,
            })),
          ),
        ),
      ),
      discoverModels: discover,
    },
    settings: {
      describe: vi.fn(() => Promise.resolve(remoteOk({ writable: true, namespaces: [namespace] }))),
      mutate,
    },
    credentials: {
      describe: vi.fn((refs: string[]) =>
        Promise.resolve(
          remoteOk(
            Object.fromEntries(refs.map((ref) => [ref, { configured: false, writable: true }])),
          ),
        ),
      ),
      set,
      unset: vi.fn(),
    },
  };
  return { face, discover, mutate, set, namespace };
}
type PageContext = ConstructorParameters<typeof ModelsSettingsStore>[0];
/**
 * The page plugin's context, scripted down to the namespaces the page reaches.
 * One context per face, as in production: an editor effect keyed by the context
 * would otherwise re-probe on every render.
 */
const contexts = new WeakMap<object, PageContext>();
function ctxWith(face: object): PageContext {
  const existing = contexts.get(face);
  if (existing !== undefined) return existing;
  const ctx = Object.assign(new Context(), {
    remote: {
      ...face,
      session: { initializeDefaultModel: async () => ({ ok: true, value: undefined }) },
    },
  });
  contexts.set(face, ctx);
  return ctx;
}
/**
 * The cards' injected Host operations over the same script, bound once per face
 * as the plugin body binds them: an editor effect keyed by this face would
 * otherwise re-probe on every render.
 */
const operations = new WeakMap<object, ModelsOperations>();
function operationsWith(face: object): ModelsOperations {
  const existing = operations.get(face);
  if (existing !== undefined) return existing;
  const bound = createModelsOperations(ctxWith(face));
  operations.set(face, bound);
  return bound;
}
/** The settings write one card produced, as the scripted face recorded it. */
interface MutateCall {
  ns: string;
  expectedRevision?: number;
  ops: {
    op: string;
    path: string[];
    value?: unknown;
  }[];
}
/** The latest interrogation payload; fails the case when nothing was asked. */
function lastProbe(discover: ReturnType<typeof vi.fn>): unknown {
  const call = (discover.mock.calls as [string, Record<string, unknown>][]).at(-1);
  if (call === undefined) throw new Error("no interrogation was recorded");
  return { settingsNs: call[0], ...call[1] };
}
/**
 * The first recorded settings write, as one record. The Remote method takes
 * three positional arguments; the cases read the write as a whole, so the
 * regrouping lives here rather than in every assertion.
 */
function firstMutate(mutate: ReturnType<typeof vi.fn>): MutateCall {
  const call = mutate.mock.calls[0] as [string, MutateCall["ops"], number | undefined] | undefined;
  if (call === undefined) throw new Error("no settings write was recorded");
  const [ns, ops, expectedRevision] = call;
  return { ns, ops, ...(expectedRevision === undefined ? {} : { expectedRevision }) };
}
async function mountSection(options: Parameters<typeof scriptedFace>[0] = {}) {
  const scripted = scriptedFace(options);
  const controller = new ModelsSettingsStore(
    ctxWith(scripted.face),
    settingsSchema,
    new SettingsDescribeMirror(ctxWith(scripted.face)),
  );
  await controller.load();
  const injected: ModelsSectionProps = {
    controller,
    useSnapshot: bindSnapshotSelector(controller.store),
    operations: operationsWith(scripted.face),
    schema: settingsSchema,
    t,
    renderSlot: () => null,
  };
  render(vh(ModelsSection, { ...injected }));
  return { ...scripted, controller };
}
/** Open the editor of one configured row and expand its customized fold. */
async function openEditor(provider: string) {
  const row = screen.getByText(provider).closest("li");
  if (row === null) throw new Error(`no row for ${provider}`);
  await fireEvent.click(within_(row, en.edit));
  const summary = document.querySelector("summary");
  if (summary === null) throw new Error("no customized fold");
  await fireEvent.click(summary);
}
/** Open the add card from the section and switch it to the custom-API mode. */
async function openCustomMode() {
  await fireEvent.click(screen.getByRole("button", { name: en.add }));
  await fireEvent.click(screen.getByRole("tab", { name: en.addCustom }));
}
/** Open one model row's advanced fold, where the capacities live. */
async function expandModel(index: number) {
  await fireEvent.click(screen.getByLabelText(`${en.modelAdvanced} ${index}`));
}
/** The button carrying `label`, typed so its disabled/title state is readable. */
function buttonNamed(label: string): HTMLButtonElement {
  const found = screen.getByText(label);
  if (!(found instanceof HTMLButtonElement)) throw new Error(`"${label}" is not a button`);
  return found;
}
/** Click the button with `label` inside `scope`. */
function within_(scope: HTMLElement, label: string): HTMLElement {
  const found = [...scope.querySelectorAll("button")].find(
    (button) => button.textContent === label,
  );
  if (found === undefined) throw new Error(`no "${label}" button`);
  return found;
}
describe("protocolChoices", () => {
  it("reads the protocols out of the namespace schema and nothing else", async () => {
    const { namespace } = scriptedFace();
    expect(protocolChoices(namespace, settingsSchema)).toEqual(PROTOCOLS);
    expect(protocolChoices(undefined, settingsSchema)).toEqual([]);
    const plain = {
      ...namespace,
      schema: JSON.parse(JSON.stringify(Schema.object({}).toJSON())) as JsonValue,
    };
    expect(protocolChoices(plain, settingsSchema)).toEqual([]);
    await Promise.resolve();
  });
});
describe("reasoningLevelChoices", () => {
  it("reads the levels out of the reasoningEfforts key schema and nothing else", () => {
    const { namespace } = scriptedFace();
    expect(reasoningLevelChoices(namespace, settingsSchema)).toEqual(LEVELS);
    expect(reasoningLevelChoices(undefined, settingsSchema)).toEqual([]);
    const plain = {
      ...namespace,
      schema: JSON.parse(JSON.stringify(Schema.object({}).toJSON())) as JsonValue,
    };
    expect(reasoningLevelChoices(plain, settingsSchema)).toEqual([]);
    const withoutDict = Schema.object({
      providers: Schema.dict(
        Schema.object({
          models: Schema.array(
            Schema.object({ reasoningEfforts: Schema.union([Schema.const(false)]) }),
          ),
        }),
      ),
    });
    const falseOnly = {
      ...namespace,
      schema: JSON.parse(JSON.stringify(withoutDict.toJSON())) as JsonValue,
    };
    expect(reasoningLevelChoices(falseOnly, settingsSchema)).toEqual([]);
  });
});
describe("model list editing", () => {
  it("changes image input without rewriting a neighboring model declaration", async () => {
    const neighbor = { id: "vision", input: ["image"], name: "Kept vision model" };
    const { mutate } = await mountSection({
      providers: { openai: { models: [{ id: "preview" }, neighbor] } },
    });
    await openEditor("openai");
    await expandModel(1);
    await fireEvent.click(
      within(screen.getByRole("group", { name: `${en.modelInputTypes} 1` })).getByRole("checkbox", {
        name: en.modelInputImage,
      }),
    );
    await fireEvent.click(screen.getByText(en.apply));
    await waitFor(() => {
      expect(mutate).toHaveBeenCalled();
    });
    expect(firstMutate(mutate).ops).toEqual([
      {
        op: "set",
        path: ["providers", "openai", "models"],
        value: [{ id: "preview", input: ["text", "image"] }, neighbor],
      },
    ]);
  });
  it("adds, edits, and removes rows without storing emptied optional fields", async () => {
    const { mutate } = await mountSection();
    await openEditor("openai");
    await fireEvent.click(screen.getByRole("button", { name: en.addModel }));
    await fireEvent.input(screen.getByLabelText(`${en.modelId} 1`), {
      target: { value: "acme-large" },
    });
    await expandModel(1);
    expect(screen.getByLabelText<HTMLInputElement>(`${en.contextWindow} 1`).placeholder).toBe("1M");
    expect(screen.getByLabelText<HTMLInputElement>(`${en.maxTokens} 1`).placeholder).toBe("128K");
    await fireEvent.input(screen.getByLabelText(`${en.contextWindow} 1`), {
      target: { value: "65536" },
    });
    await fireEvent.click(
      within(screen.getByRole("group", { name: `${en.modelInputTypes} 1` })).getByRole("checkbox", {
        name: en.modelInputImage,
      }),
    );
    await fireEvent.input(screen.getByLabelText(`${en.modelName} 1`), {
      target: { value: "Acme" },
    });
    // Clearing an optional field must drop it rather than store an empty value.
    await fireEvent.input(screen.getByLabelText(`${en.modelName} 1`), { target: { value: "" } });
    await fireEvent.click(screen.getByText(en.apply));
    await waitFor(() => {
      expect(mutate).toHaveBeenCalled();
    });
    expect(firstMutate(mutate)).toMatchObject({
      ns: "llm-pi-ai",
      expectedRevision: 3,
      ops: [
        {
          op: "set",
          path: ["providers", "openai", "models"],
          value: [{ id: "acme-large", contextWindow: 65536, input: ["text", "image"] }],
        },
      ],
    });
  });
  it("names a duplicate model id in the edit flow too", async () => {
    const { mutate } = await mountSection({
      providers: { openai: { baseURL: "https://proxy.example/v1", models: [{ id: "dup" }] } },
    });
    await openEditor("openai");
    await fireEvent.click(screen.getByRole("button", { name: en.addModel }));
    await fireEvent.input(screen.getByLabelText(`${en.modelId} 2`), { target: { value: "dup" } });
    // The create card refuses this in place; an edited route must not have to
    // learn it from the host's refusal instead.
    expect(screen.getByText(`${en.model} 2: ${en.modelIdDuplicate}`)).toBeTruthy();
    expect(buttonNamed(en.apply).disabled).toBe(true);
    expect(mutate).not.toHaveBeenCalled();
  });
  it("reads K and M suffixes and keeps the text the user typed", async () => {
    const { mutate } = await mountSection();
    await openEditor("openai");
    await fireEvent.click(screen.getByRole("button", { name: en.addModel }));
    await fireEvent.input(screen.getByLabelText(`${en.modelId} 1`), { target: { value: "m" } });
    await expandModel(1);
    await fireEvent.input(screen.getByLabelText(`${en.contextWindow} 1`), {
      target: { value: "1M" },
    });
    await fireEvent.input(screen.getByLabelText(`${en.maxTokens} 1`), { target: { value: "32K" } });
    // The field keeps the spelling rather than snapping to the expansion, and
    // a plain count is not rewritten into a suffix mid-word either.
    expect(screen.getByLabelText<HTMLInputElement>(`${en.contextWindow} 1`).value).toBe("1M");
    await fireEvent.input(screen.getByLabelText(`${en.maxTokens} 1`), {
      target: { value: "1000" },
    });
    expect(screen.getByLabelText<HTMLInputElement>(`${en.maxTokens} 1`).value).toBe("1000");
    await fireEvent.click(screen.getByText(en.apply));
    await waitFor(() => {
      expect(mutate).toHaveBeenCalled();
    });
    // What lands in settings is always a plain token count.
    expect(firstMutate(mutate).ops[0]?.value).toEqual([
      { id: "m", contextWindow: 1000000, maxTokens: 1000 },
    ]);
  });
  it("refuses to apply while a capacity is unreadable", async () => {
    const { mutate } = await mountSection();
    await openEditor("openai");
    await fireEvent.click(screen.getByRole("button", { name: en.addModel }));
    await fireEvent.input(screen.getByLabelText(`${en.modelId} 1`), { target: { value: "m" } });
    await expandModel(1);
    await fireEvent.input(screen.getByLabelText(`${en.maxTokens} 1`), { target: { value: "abc" } });
    // Silently dropping it would store a route sized differently from what the
    // field shows, so the text stays put and the write is refused instead.
    expect(screen.getByLabelText<HTMLInputElement>(`${en.maxTokens} 1`).value).toBe("abc");
    expect(screen.getByText(`${en.model} 1: ${en.modelMaxTokensInvalid}`)).toBeTruthy();
    expect(buttonNamed(en.apply).disabled).toBe(true);
    expect(mutate).not.toHaveBeenCalled();
  });
  it("spells a stored capacity back the way it is typed", async () => {
    await mountSection({
      providers: {
        openai: {
          baseURL: "https://proxy.example/v1",
          models: [{ id: "kept", contextWindow: 1000000, maxTokens: 256000 }],
        },
      },
    });
    await openEditor("openai");
    await expandModel(1);
    // Opening a row reads the stored counts, which are plain integers; showing
    // them as such would make an already-configured route look unlike one the
    // user just typed, and re-applying would rewrite the field it read.
    expect(screen.getByLabelText<HTMLInputElement>(`${en.contextWindow} 1`).value).toBe("1M");
    expect(screen.getByLabelText<HTMLInputElement>(`${en.maxTokens} 1`).value).toBe("256K");
  });
  it("edits one row of several and lets a cleared capacity leave the profile", async () => {
    const { mutate } = await mountSection({
      providers: {
        openai: {
          baseURL: "https://proxy.example/v1",
          models: [{ id: "first" }, { id: "second" }],
        },
      },
    });
    await openEditor("openai");
    await expandModel(2);
    await fireEvent.input(screen.getByLabelText(`${en.maxTokens} 2`), {
      target: { value: "2048" },
    });
    await fireEvent.input(screen.getByLabelText(`${en.modelName} 2`), {
      target: { value: "Second" },
    });
    await fireEvent.input(screen.getByLabelText(`${en.contextWindow} 2`), {
      target: { value: "4096" },
    });
    // Clearing it back to empty must drop the field, not store a zero.
    await fireEvent.input(screen.getByLabelText(`${en.contextWindow} 2`), {
      target: { value: "" },
    });
    await fireEvent.click(screen.getByText(en.apply));
    await waitFor(() => {
      expect(mutate).toHaveBeenCalled();
    });
    expect(firstMutate(mutate).ops[0]?.value).toEqual([
      { id: "first" },
      { id: "second", name: "Second", maxTokens: 2048 },
    ]);
  });
  it("shows the adapter defaults as inherited until an edit takes them over", async () => {
    await mountSection({ providers: { openai: { baseURL: "https://proxy.example/v1" } } });
    await openEditor("openai");
    // The user layer names no models, so the list belongs to the adapter and
    // says so; taking it over is an explicit act, not a side effect of opening.
    expect(screen.getByText(en.modelsInherited)).toBeTruthy();
    expect(screen.queryByText(en.resetModels)).toBeNull();
  });
  it("keeps expansion on the row it belongs to after an earlier one is removed", async () => {
    await mountSection({
      providers: {
        openai: {
          baseURL: "https://proxy.example/v1",
          models: [{ id: "first" }, { id: "second" }, { id: "third" }],
        },
      },
    });
    await openEditor("openai");
    // Expansion is keyed by position, so removing an earlier row shifts the
    // rest down; without reindexing, row 3 would inherit row 2's open state.
    await expandModel(2);
    await fireEvent.click(screen.getByLabelText(`${en.removeModel} 1`));
    // 'second' now sits at position 1 and keeps its capacities open; 'third'
    // moved to position 2 and stays folded.
    expect(screen.getByLabelText<HTMLInputElement>(`${en.modelId} 1`).value).toBe("second");
    expect(screen.queryByLabelText(`${en.contextWindow} 1`)).not.toBeNull();
    expect(screen.queryByLabelText(`${en.contextWindow} 2`)).toBeNull();
  });
  it("leaves an earlier row expanded and forgets the removed row\u2019s own state", async () => {
    await mountSection({
      providers: {
        openai: {
          baseURL: "https://proxy.example/v1",
          models: [{ id: "first" }, { id: "second" }, { id: "third" }],
        },
      },
    });
    await openEditor("openai");
    // A row before the removal keeps its own position and stays open.
    await expandModel(1);
    await fireEvent.click(screen.getByLabelText(`${en.removeModel} 2`));
    expect(screen.getByLabelText<HTMLInputElement>(`${en.modelId} 1`).value).toBe("first");
    expect(screen.queryByLabelText(`${en.contextWindow} 1`)).not.toBeNull();
    // Removing the expanded row itself drops that state rather than handing it
    // to whichever row slides into the position.
    await fireEvent.click(screen.getByLabelText(`${en.removeModel} 1`));
    expect(screen.getByLabelText<HTMLInputElement>(`${en.modelId} 1`).value).toBe("third");
    expect(screen.queryByLabelText(`${en.contextWindow} 1`)).toBeNull();
  });
  it("separates emptying the list from restoring the adapter defaults", async () => {
    const { mutate } = await mountSection({
      providers: { openai: { baseURL: "https://proxy.example/v1", models: [{ id: "kept" }] } },
    });
    await openEditor("openai");
    // An empty override is a route that serves no models — a different intent
    // from handing the catalog back, which is what the reset affordance does.
    expect(screen.getByText(en.modelsCustomized)).toBeTruthy();
    await fireEvent.click(screen.getByText(en.resetModels));
    await fireEvent.click(screen.getByText(en.apply));
    await waitFor(() => {
      expect(mutate).toHaveBeenCalled();
    });
    expect(firstMutate(mutate).ops).toContainEqual({
      op: "unset",
      path: ["providers", "openai", "models"],
    });
  });
});
describe("capacity spellings", () => {
  it.each([
    ["", undefined],
    ["65536", 65536],
    ["256K", 256000],
    ["1m", 1000000],
    // A decimal multiple is exact in intent but not in binary floating point,
    // so an integral result snaps back instead of landing a few ULPs high.
    ["2.3M", 2300000],
    // Not an integral count: kept as written rather than silently rounded.
    ["1.0005K", 1000.5],
  ])("reads %j as %j", (text, expected) => {
    expect(parseCapacity(text)).toBe(expected);
  });
  it.each(["abc", "12x", "1 000", "-5", ""])("refuses %j rather than guessing", (text) => {
    const parsed = parseCapacity(text);
    expect(parsed === undefined || Number.isNaN(parsed)).toBe(true);
  });
  it.each([
    [1000000, "1M"],
    [256000, "256K"],
    [65536, "65536"],
    // Never a spelling that would not survive being read back.
    [0, "0"],
    [1.5, "1.5"],
  ])("spells %j as %j", (value, expected) => {
    expect(formatCapacity(value)).toBe(expected);
  });
  it("round-trips every spelling it produces", () => {
    for (const value of [1000000, 256000, 65536, 4096, 1000]) {
      expect(parseCapacity(formatCapacity(value))).toBe(value);
    }
  });
});
describe("endpoint interrogation", () => {
  it.each([[undefined], [[]], [["text"]]])(
    "renders catalog input inheritance for a stored declaration of %j",
    async (input) => {
      const discover = vi.fn(() =>
        Promise.resolve(ok([{ id: "vision", inputModalities: ["text", "image"] }])),
      );
      const model = { id: "vision", ...(input === undefined ? {} : { input }) };
      const { mutate } = await mountSection({
        discover,
        providers: { openai: { models: [model] } },
      });
      await openEditor("openai");
      await expandModel(1);
      const types = within(screen.getByRole("group", { name: `${en.modelInputTypes} 1` }));
      await waitFor(() => {
        expect(
          types.getByRole<HTMLInputElement>("checkbox", { name: en.modelInputImage }).disabled,
        ).toBe(false);
      });
      expect(
        types.getByRole<HTMLInputElement>("checkbox", { name: en.modelInputImage }).checked,
      ).toBe(input?.length !== 1);
      expect(discover).toHaveBeenCalledExactlyOnceWith("llm-pi-ai", { provider: "openai" });
      await fireEvent.click(screen.getByText(en.apply));
      await waitFor(() => {
        expect(screen.queryByRole("button", { name: en.apply })).toBeNull();
      });
      expect(mutate).not.toHaveBeenCalled();
    },
  );
  it("inherits a custom provider default input and persists an explicit model override", async () => {
    const { discover, mutate } = await mountSection({
      providers: {
        "acme-gateway": {
          api: "openai-completions",
          baseURL: "https://gateway.acme.example/v1",
          defaultInput: ["text", "image"],
          models: [{ id: "custom" }],
        },
      },
      declaredRoutes: ["acme-gateway"],
    });
    await openEditor("acme-gateway");
    await expandModel(1);
    const types = within(screen.getByRole("group", { name: `${en.modelInputTypes} 1` }));
    expect(types.getByRole<HTMLInputElement>("checkbox", { name: en.modelInputText }).checked).toBe(
      true,
    );
    const image = types.getByRole<HTMLInputElement>("checkbox", { name: en.modelInputImage });
    expect(image.checked).toBe(true);
    expect(image.disabled).toBe(false);
    expect(discover).not.toHaveBeenCalled();
    expect(mutate).not.toHaveBeenCalled();
    await fireEvent.click(image);
    await fireEvent.click(screen.getByText(en.apply));
    await waitFor(() => {
      expect(mutate).toHaveBeenCalledTimes(1);
    });
    expect(firstMutate(mutate).ops).toEqual([
      {
        op: "set",
        path: ["providers", "acme-gateway", "models"],
        value: [{ id: "custom", input: ["text"] }],
      },
    ]);
  });
  it("asks the endpoint the form shows, with a key that is not yet stored", async () => {
    const discover = vi.fn(() => Promise.resolve(ok([{ id: "acme-large", contextWindow: 65536 }])));
    await mountSection({ discover });
    await openEditor("openai");
    await fireEvent.input(screen.getByLabelText(en.keyInput), {
      target: { value: "typed-not-saved" },
    });
    await fireEvent.input(screen.getByLabelText(en.baseUrl), {
      target: { value: "https://edited.example/v1" },
    });
    await fireEvent.click(screen.getByText(en.fetchModels));
    await waitFor(() => {
      expect(discover).toHaveBeenCalled();
    });
    expect(lastProbe(discover)).toEqual({
      settingsNs: "llm-pi-ai",
      // The route is named, so an adapter that already describes it answers
      // from its own registry rather than the endpoint.
      provider: "openai",
      baseURL: "https://edited.example/v1",
      apiKey: "typed-not-saved",
    });
  });
  it("carries the protocol the profile already names", async () => {
    const discover = vi.fn(() => Promise.resolve(ok([])));
    await mountSection({
      discover,
      providers: { openai: { baseURL: "https://proxy.example/v1", api: "openai-responses" } },
    });
    await openEditor("openai");
    await fireEvent.click(screen.getByText(en.fetchModels));
    await waitFor(() => {
      expect(discover).toHaveBeenCalled();
    });
    expect(lastProbe(discover)).toEqual({
      settingsNs: "llm-pi-ai",
      provider: "openai",
      baseURL: "https://proxy.example/v1",
      api: "openai-responses",
    });
  });
  it("opens on the configured models and appends a newly checked one, keeping a row the user already tuned", async () => {
    const discover = vi.fn(() =>
      Promise.resolve(
        ok([
          { id: "kept", contextWindow: 999, inputModalities: ["text", "image"] },
          {
            id: "fresh",
            contextWindow: 4096,
            maxTokens: 2048,
            name: "Fresh",
            inputModalities: ["text", "image"],
          },
        ]),
      ),
    );
    const { mutate } = await mountSection({
      discover,
      providers: {
        openai: {
          baseURL: "https://proxy.example/v1",
          models: [{ id: "kept", contextWindow: 111 }],
        },
      },
    });
    await openEditor("openai");
    await fireEvent.click(screen.getByText(en.fetchModels));
    await screen.findByText(en.fetchTitle);
    expect(screen.queryByRole("checkbox", { name: "Fresh" })).toBeNull();
    const boxes = [...document.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')];
    expect(boxes.map((box) => box.checked)).toEqual([true, false]);
    await fireEvent.click(screen.getByRole<HTMLInputElement>("checkbox", { name: "fresh" }));
    await fireEvent.click(screen.getByText(en.fetchAdopt));
    expect(screen.getByLabelText<HTMLInputElement>(`${en.modelId} 2`).value).toBe("fresh");
    expect(screen.getByLabelText<HTMLInputElement>(`${en.modelName} 2`).value).toBe("Fresh");
    await expandModel(2);
    expect(screen.getByLabelText<HTMLInputElement>(`${en.contextWindow} 2`).value).toBe("4096");
    expect(screen.getByLabelText<HTMLInputElement>(`${en.maxTokens} 2`).value).toBe("2048");
    expect(
      within(
        screen.getByRole("group", { name: `${en.modelInputTypes} 2` }),
      ).getByRole<HTMLInputElement>("checkbox", { name: en.modelInputImage }).checked,
    ).toBe(true);
    await fireEvent.click(screen.getByText(en.apply));
    await waitFor(() => {
      expect(mutate).toHaveBeenCalled();
    });
    expect(firstMutate(mutate).ops[0]?.value).toEqual([
      { id: "kept", contextWindow: 111 },
      {
        id: "fresh",
        contextWindow: 4096,
        maxTokens: 2048,
        name: "Fresh",
        input: ["text", "image"],
      },
    ]);
  });
  it("removes an unchecked configured model and keeps one the provider does not list", async () => {
    const discover = vi.fn(() =>
      Promise.resolve(ok([{ id: "gone" }, { id: "stays" }, { id: "new" }])),
    );
    const { mutate } = await mountSection({
      discover,
      providers: {
        openai: {
          baseURL: "https://proxy.example/v1",
          models: [
            { id: "gone" },
            { id: "unlisted", maxTokens: 512 },
            { id: "stays", contextWindow: 111 },
          ],
        },
      },
    });
    await openEditor("openai");
    await expandModel(3);
    await fireEvent.click(screen.getByText(en.fetchModels));
    await screen.findByText(en.fetchTitle);
    await fireEvent.click(screen.getByRole("checkbox", { name: "gone" }));
    await fireEvent.click(screen.getByText(en.fetchAdopt));
    // The disclosure follows its row up the list.
    expect(screen.getByLabelText<HTMLInputElement>(`${en.contextWindow} 2`).value).toBe("111");
    await fireEvent.click(screen.getByText(en.apply));
    await waitFor(() => {
      expect(mutate).toHaveBeenCalled();
    });
    expect(firstMutate(mutate).ops[0]?.value).toEqual([
      { id: "unlisted", maxTokens: 512 },
      { id: "stays", contextWindow: 111 },
    ]);
  });
  it("checks a row drafted while the fetch is in flight", async () => {
    const reply = Promise.withResolvers<ReturnType<typeof ok>>();
    const discover = vi.fn(() => reply.promise);
    const { mutate } = await mountSection({
      discover,
      providers: { openai: { baseURL: "https://proxy.example/v1", models: [{ id: "a" }] } },
    });
    await openEditor("openai");
    await fireEvent.click(screen.getByText(en.fetchModels));
    await fireEvent.click(screen.getByRole("button", { name: en.addModel }));
    await fireEvent.input(screen.getByLabelText(`${en.modelId} 2`), { target: { value: "b" } });
    await act(async () => {
      reply.resolve(ok([{ id: "a" }, { id: "b" }, { id: "c" }]));
    });
    const boxes = [...document.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')];
    expect(boxes.map((box) => box.checked)).toEqual([true, true, false]);
    await fireEvent.click(screen.getByText(en.fetchAdopt));
    await fireEvent.click(screen.getByText(en.apply));
    await waitFor(() => {
      expect(mutate).toHaveBeenCalled();
    });
    expect(firstMutate(mutate).ops[0]?.value).toEqual([{ id: "a" }, { id: "b" }]);
  });
  it("refuses to empty the list, since an empty list serves the whole catalog", async () => {
    const discover = vi.fn(() => Promise.resolve(ok([{ id: "a" }, { id: "b" }, { id: "c" }])));
    await mountSection({
      discover,
      providers: {
        openai: { baseURL: "https://proxy.example/v1", models: [{ id: "a" }, { id: "b" }] },
      },
    });
    await openEditor("openai");
    await fireEvent.click(screen.getByText(en.fetchModels));
    const dialog = await screen.findByRole("dialog");
    await fireEvent.click(within_(dialog, en.fetchSelectAll));
    await fireEvent.click(within_(dialog, en.fetchDeselectAll));
    const adopt = within_(dialog, en.fetchAdopt) as HTMLButtonElement;
    expect(adopt.disabled).toBe(true);
    expect(adopt.title).toBe(en.fetchKeepOne);
    // Removing several configured models at once still leaves one.
    await fireEvent.click(screen.getByRole("checkbox", { name: "c" }));
    expect(adopt.disabled).toBe(false);
    await fireEvent.click(adopt);
    expect(screen.getByLabelText<HTMLInputElement>(`${en.modelId} 1`).value).toBe("c");
    expect(screen.queryByLabelText(`${en.modelId} 2`)).toBeNull();
  });
  it("lists a repeated candidate id once and starts it checked beside a blank row", async () => {
    const discover = vi.fn(() => Promise.resolve(ok([{ id: "x" }, { id: "x", maxTokens: 64 }])));
    await mountSection({
      discover,
      providers: { openai: { baseURL: "https://proxy.example/v1" } },
    });
    await openEditor("openai");
    await fireEvent.click(screen.getByRole("button", { name: en.addModel }));
    await fireEvent.click(screen.getByText(en.fetchModels));
    await screen.findByText(en.fetchTitle);
    expect(
      screen.getAllByRole<HTMLInputElement>("checkbox", { name: "x" }).map((box) => box.checked),
    ).toEqual([true]);
    await fireEvent.click(screen.getByText(en.fetchAdopt));
    expect(screen.getByLabelText<HTMLInputElement>(`${en.modelId} 1`).value).toBe("");
    expect(screen.getByLabelText<HTMLInputElement>(`${en.modelId} 2`).value).toBe("x");
    expect(screen.queryByLabelText(`${en.modelId} 3`)).toBeNull();
  });
  it("keeps the rows editable when the provider cannot be interrogated", async () => {
    const discover = vi.fn(() =>
      Promise.resolve(
        fail(
          "https://proxy.example/v1/models answered 401; check the API key",
          "llm/model-discovery-rejected",
        ),
      ),
    );
    await mountSection({ discover });
    await openEditor("openai");
    await fireEvent.click(screen.getByText(en.fetchModels));
    await screen.findByText(/answered 401; check the API key/);
    // The failure is a detour, not a dead end: hand-entry is still offered.
    expect(screen.getByRole("button", { name: en.addModel })).toBeTruthy();
  });
  it("reports an empty listing", async () => {
    const empty = vi.fn(() => Promise.resolve(ok([])));
    await mountSection({ discover: empty });
    await openEditor("openai");
    await fireEvent.click(screen.getByText(en.fetchModels));
    await screen.findByText(en.fetchEmpty);
  });
  it("can be asked for a configured route even with no endpoint", async () => {
    const discover = vi.fn(() => Promise.resolve(ok([{ id: "from-registry" }])));
    await mountSection({ discover, providers: { openai: {} } });
    await openEditor("openai");
    // A route the adapter already describes needs no endpoint at all.
    expect(buttonNamed(en.fetchModels).disabled).toBe(false);
    await fireEvent.click(screen.getByText(en.fetchModels));
    await waitFor(() => {
      expect(discover).toHaveBeenCalled();
    });
    expect(lastProbe(discover)).toEqual({ settingsNs: "llm-pi-ai", provider: "openai" });
  });
  it("keeps the create card asking only once it has an endpoint", async () => {
    // A provider being declared has no route yet, so the endpoint is the only
    // thing an interrogation could go on.
    const scripted = scriptedFace();
    render(
      vh(CustomProviderCard, {
        taken: [],
        protocols: PROTOCOLS,
        reasoningLevels: LEVELS,
        revision: 7,
        operations: operationsWith(scripted.face),
        t: t,
        readOnly: false,
        onClose: vi.fn(),
      }),
    );
    expect(buttonNamed(en.fetchModels).disabled).toBe(true);
    expect(buttonNamed(en.fetchModels).title).toBe(en.fetchNeedsBaseUrl);
    await fireEvent.input(screen.getByLabelText(en.baseUrl), {
      target: { value: "https://acme.test/v1" },
    });
    expect(buttonNamed(en.fetchModels).disabled).toBe(false);
    await fireEvent.click(screen.getByText(en.fetchModels));
    // A provider being declared names no route, so only the endpoint travels.
    expect(lastProbe(scripted.discover)).toEqual({
      settingsNs: "llm-pi-ai",
      baseURL: "https://acme.test/v1",
      api: "openai-completions",
    });
  });
  it("folds a row\u2019s capacities away until they are asked for", async () => {
    await mountSection({
      providers: { openai: { baseURL: "https://proxy.example/v1", models: [{ id: "only" }] } },
    });
    await openEditor("openai");
    // The row shows what identifies a model; capacities are the exception.
    expect(screen.queryByLabelText(`${en.contextWindow} 1`)).toBeNull();
    await expandModel(1);
    expect(screen.getByLabelText(`${en.contextWindow} 1`)).toBeTruthy();
    await expandModel(1);
    expect(screen.queryByLabelText(`${en.contextWindow} 1`)).toBeNull();
  });
  it("closes the picker without adopting anything on cancel", async () => {
    const discover = vi.fn(() => Promise.resolve(ok([{ id: "fresh" }])));
    const { mutate } = await mountSection({ discover });
    await openEditor("openai");
    await fireEvent.click(screen.getByText(en.fetchModels));
    const dialog = await screen.findByRole("dialog");
    // The editor card carries a Cancel of its own; this one is the dialog's.
    await fireEvent.click(within_(dialog, en.cancel));
    await waitFor(() => {
      expect(screen.queryByText(en.fetchTitle)).toBeNull();
    });
    expect(mutate).not.toHaveBeenCalled();
  });
  it("toggles a candidate off and back on before adopting", async () => {
    const discover = vi.fn(() => Promise.resolve(ok([{ id: "a" }, { id: "b", maxTokens: 2048 }])));
    const { mutate } = await mountSection({ discover });
    await openEditor("openai");
    await fireEvent.click(screen.getByText(en.fetchModels));
    await screen.findByText(en.fetchTitle);
    const boxes = [...document.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')];
    const first = boxes[0] as HTMLInputElement;
    await fireEvent.click(first);
    await fireEvent.click(first);
    await fireEvent.click(screen.getByText(en.fetchAdopt));
    await fireEvent.click(screen.getByText(en.apply));
    await waitFor(() => {
      expect(mutate).toHaveBeenCalled();
    });
    // A disclosed output cap rides along with the candidate that has one.
    expect(firstMutate(mutate).ops[0]?.value).toEqual([{ id: "a" }, { id: "b", maxTokens: 2048 }]);
  });
  it("filters by model id or name and selects or deselects only visible candidates", async () => {
    const discover = vi.fn(() =>
      Promise.resolve(
        ok([{ id: "alpha" }, { id: "opaque-id", name: "Beta Display" }, { id: "gamma" }]),
      ),
    );
    await mountSection({ discover });
    await openEditor("openai");
    await fireEvent.click(screen.getByText(en.fetchModels));
    const dialog = await screen.findByRole("dialog");
    const search = screen.getByLabelText<HTMLInputElement>(en.fetchSearch);
    expect(dialog.textContent).toContain("opaque-id");
    expect(dialog.textContent).not.toContain("Beta Display");
    expect(
      [...dialog.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')].map(
        (box) => box.checked,
      ),
    ).toEqual([true, true, true]);
    await fireEvent.input(search, { target: { value: "ALP" } });
    expect(dialog.textContent).toContain("alpha");
    expect(dialog.textContent).not.toContain("opaque-id");
    await fireEvent.input(search, { target: { value: "beta" } });
    expect(dialog.textContent).toContain("opaque-id");
    expect(dialog.textContent).not.toContain("alpha");
    await fireEvent.input(search, { target: { value: "opaque" } });
    expect(dialog.textContent).toContain("opaque-id");
    expect(dialog.textContent).not.toContain("alpha");
    await fireEvent.click(within_(dialog, en.fetchDeselectAll));
    expect(
      [...dialog.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')].map(
        (box) => box.checked,
      ),
    ).toEqual([false]);
    // Hidden candidates keep their state, so a configured model is never
    // removed unseen.
    await fireEvent.input(search, { target: { value: "" } });
    const boxes = [...dialog.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')];
    expect(boxes.map((box) => box.checked)).toEqual([true, false, true]);
    await fireEvent.click(within_(dialog, en.fetchSelectAll));
    expect(boxes.map((box) => box.checked)).toEqual([true, true, true]);
    await fireEvent.click(within_(dialog, en.fetchDeselectAll));
    expect(boxes.map((box) => box.checked)).toEqual([false, false, false]);
    // Selecting while filtered adds only visible candidates.
    await fireEvent.input(search, { target: { value: "alpha" } });
    await fireEvent.click(within_(dialog, en.fetchSelectAll));
    await fireEvent.input(search, { target: { value: "" } });
    expect(boxes.map((box) => box.checked)).toEqual([true, false, false]);
    await fireEvent.input(search, { target: { value: "missing" } });
    expect(screen.getByText(en.fetchNoMatches)).toBeTruthy();
    expect((within_(dialog, en.fetchSelectAll) as HTMLButtonElement).disabled).toBe(true);
  });
});
describe("provider rows", () => {
  it("tags the routes the adapter declared, and only those", async () => {
    await mountSection({
      providers: {
        openai: { apiKeyEnv: "OPENAI_API_KEY" },
        "acme-gateway": { apiKeyEnv: "ACME_GATEWAY_API_KEY", baseURL: "https://acme.test/v1" },
      },
      declaredRoutes: ["acme-gateway"],
    });
    const rowOf = (provider: string): HTMLElement => {
      const row = screen.getByText(provider).closest("li");
      if (row === null) throw new Error(`no row for ${provider}`);
      return row;
    };
    expect(rowOf("acme-gateway").textContent).toContain(en.customTag);
    // `openai` carries a stored profile too — the tag follows the adapter's
    // catalog, not the presence of settings, so it stays off here.
    expect(rowOf("openai").textContent).not.toContain(en.customTag);
  });
  it("shows no tag when the adapter draws no catalog distinction", async () => {
    const scripted = scriptedFace({ providers: { openai: { apiKeyEnv: "OPENAI_API_KEY" } } });
    scripted.face.llm.listConfigurableProviders = vi.fn(() =>
      Promise.resolve(
        ok([
          {
            provider: "openai",
            displayName: "openai",
            settingsNs: "llm-pi-ai",
            settingsPath: ["providers", "openai"],
          },
        ]),
      ),
    ) as never;
    const controller = new ModelsSettingsStore(
      ctxWith(scripted.face),
      settingsSchema,
      new SettingsDescribeMirror(ctxWith(scripted.face)),
    );
    await controller.load();
    render(
      vh(ModelsSection, {
        controller: controller,
        useSnapshot: bindSnapshotSelector(controller.store),
        operations: operationsWith(scripted.face),
        schema: settingsSchema,
        t: t,
        renderSlot: () => null,
      }),
    );
    // Absent is "unknown", never "shipped": an adapter that answers nothing
    // must not have its routes labelled either way.
    expect(screen.queryByText(en.customTag)).toBeNull();
  });
});
describe("hand-declared providers", () => {
  function mountCard(
    overrides: Partial<InstanceType<typeof CustomProviderCard>["$props"]> = {},
    wire: Parameters<typeof scriptedFace>[0] = {},
  ) {
    const scripted = scriptedFace(wire);
    const onClose = vi.fn();
    render(
      vh(CustomProviderCard, {
        taken: ["openai"],
        protocols: PROTOCOLS,
        reasoningLevels: LEVELS,
        revision: 7,
        operations: operationsWith(scripted.face),
        t: t,
        readOnly: false,
        onClose: onClose,
        ...overrides,
      }),
    );
    return { ...scripted, onClose };
  }
  it("creates a custom provider without changing the default model", async () => {
    const { face, mutate, set, onClose } = mountCard();
    const initialize = vi.spyOn(ctxWith(face).remote.session, "initializeDefaultModel");
    await fireEvent.input(screen.getByLabelText(en.customRoute), {
      target: { value: "acme-gateway" },
    });
    await fireEvent.input(screen.getByLabelText(en.baseUrl), {
      target: { value: "https://gateway.example/v1" },
    });
    await fireEvent.input(screen.getByLabelText(en.keyInput), { target: { value: "test-key" } });
    await fireEvent.click(screen.getByRole("button", { name: en.addModel }));
    await fireEvent.input(screen.getByLabelText(`${en.modelId} 1`), { target: { value: "model" } });
    await fireEvent.click(screen.getByText(en.create));
    await waitFor(() => {
      expect(onClose).toHaveBeenCalledWith(true);
    });
    expect(mutate).toHaveBeenCalledOnce();
    expect(set).toHaveBeenCalledOnce();
    expect(initialize).not.toHaveBeenCalled();
  });
  it("writes the whole profile and the key under the derived reference", async () => {
    const { mutate, set, onClose } = mountCard();
    await fireEvent.input(screen.getByLabelText(en.customRoute), {
      target: { value: "acme-gateway" },
    });
    await fireEvent.input(screen.getByLabelText(en.customDisplayName), {
      target: { value: "Acme Gateway" },
    });
    await fireEvent.input(screen.getByLabelText(en.baseUrl), {
      target: { value: "https://gateway.acme.example/v1" },
    });
    await fireEvent.input(screen.getByLabelText(en.keyInput), { target: { value: "gw-key" } });
    await fireEvent.click(screen.getByRole("button", { name: en.addModel }));
    await fireEvent.input(screen.getByLabelText(`${en.modelId} 1`), {
      target: { value: "acme-large" },
    });
    await expandModel(1);
    await fireEvent.input(screen.getByLabelText(`${en.contextWindow} 1`), {
      target: { value: "65536" },
    });
    await fireEvent.click(screen.getByText(en.create));
    await waitFor(() => {
      expect(onClose).toHaveBeenCalledWith(true);
    });
    expect(firstMutate(mutate)).toEqual({
      ns: "llm-pi-ai",
      ops: [
        {
          op: "set",
          path: ["providers", "acme-gateway"],
          value: {
            displayName: "Acme Gateway",
            apiKeyEnv: "ACME_GATEWAY_API_KEY",
            api: "openai-completions",
            baseURL: "https://gateway.acme.example/v1",
            models: [{ id: "acme-large", contextWindow: 65536 }],
          },
        },
      ],
      // The section this card was drafted over: a route another tab declared
      // meanwhile makes this a conflict rather than an overwrite.
      expectedRevision: 7,
    });
    expect(set).toHaveBeenCalledWith("ACME_GATEWAY_API_KEY", "gw-key");
  });
  it("scopes each card to fields a provider can actually own", async () => {
    // Reasoning effort is a per-MODEL capability and the
    // models under one provider disagree about it, so a provider-scoped
    // control could only be set to a value some of them reject — which would
    // take the whole provider out of the picker. The composer's model picker
    // owns the choice, and a switch there records provider+model+effort together.
    const fields = () =>
      [...document.querySelectorAll("input,select")]
        .map((el) => el.getAttribute("aria-label"))
        .filter(Boolean);
    mountCard();
    await fireEvent.input(screen.getByLabelText(en.customRoute), { target: { value: "acme" } });
    expect(fields()).toEqual([
      en.customRoute,
      en.customDisplayName,
      en.baseUrl,
      en.customApi,
      en.keyInput,
    ]);
    cleanup();
    // A shipped route's models each carry their own protocol, so its editor
    // offers no route-level protocol to override them with.
    await mountSection({ providers: { openai: { apiKeyEnv: "OPENAI_API_KEY" } } });
    await openEditor("openai");
    await fireEvent.click(screen.getByText(en.customized));
    expect(fields()).toEqual([en.keyInput, en.baseUrl]);
    cleanup();
    // A hand-declared route named its own protocol at creation, so editing it
    // reaches the same field the create card asked for.
    await mountSection({
      providers: {
        "acme-gateway": { api: "openai-completions", baseURL: "https://gateway.acme.example/v1" },
      },
      declaredRoutes: ["acme-gateway"],
    });
    await openEditor("acme-gateway");
    expect(fields()).toEqual([en.keyInput, en.customDisplayName, en.baseUrl, en.customApi]);
  });
  it("requires a key before a keyless declared route switches to the Gemini protocol", async () => {
    const { mutate, set } = await mountSection({
      providers: {
        "acme-gateway": { api: "openai-completions", baseURL: "https://acme.test/v1beta" },
      },
      declaredRoutes: ["acme-gateway"],
    });
    await openEditor("acme-gateway");
    await fireEvent.input(screen.getByLabelText(en.customApi), {
      target: { value: "google-generative-ai" },
    });
    expect(screen.getByText(en.keyRequired)).toBeTruthy();
    expect(screen.getByLabelText<HTMLInputElement>(en.keyInput).required).toBe(true);
    expect(buttonNamed(en.apply).disabled).toBe(true);
    await fireEvent.input(screen.getByLabelText(en.keyInput), { target: { value: "gemini-key" } });
    expect(screen.queryByText(en.keyRequired)).toBeNull();
    await fireEvent.click(screen.getByText(en.apply));
    await waitFor(() => {
      expect(set).toHaveBeenCalledOnce();
    });
    expect(firstMutate(mutate).ops).toContainEqual({
      op: "set",
      path: ["providers", "acme-gateway", "apiKeyEnv"],
      value: "ACME_GATEWAY_API_KEY",
    });
  });
  it("needs no typed key on a Gemini route that names its key reference", async () => {
    await mountSection({
      providers: {
        "acme-gateway": {
          apiKeyEnv: "ACME_KEY",
          api: "google-generative-ai",
          baseURL: "https://acme.test/v1beta",
        },
      },
      declaredRoutes: ["acme-gateway"],
    });
    await openEditor("acme-gateway");
    expect(screen.queryByText(en.keyRequired)).toBeNull();
    expect(screen.getByLabelText<HTMLInputElement>(en.keyInput).required).toBe(false);
  });
  it("blocks a protocol switch that the route's inherited reasoning levels would break", async () => {
    await mountSection({
      providers: {
        "acme-gateway": {
          apiKeyEnv: "ACME_KEY",
          api: "openai-completions",
          baseURL: "https://acme.test/v1",
          models: [{ id: "m", reasoningEfforts: { off: null, high: "high" } }],
        },
      },
      userProviders: {
        "acme-gateway": {
          apiKeyEnv: "ACME_KEY",
          api: "openai-completions",
          baseURL: "https://acme.test/v1",
        },
      },
      baseProviders: {
        "acme-gateway": { models: [{ id: "m", reasoningEfforts: { off: null, high: "high" } }] },
      },
      declaredRoutes: ["acme-gateway"],
    });
    await openEditor("acme-gateway");
    await fireEvent.input(screen.getByLabelText(en.customApi), {
      target: { value: "google-generative-ai" },
    });
    expect(buttonNamed(en.apply).disabled).toBe(true);
  });
  it("renames a declared route and falls back to its id when the name is cleared", async () => {
    const { mutate } = await mountSection({
      providers: {
        "acme-gateway": {
          displayName: "Acme Gateway",
          api: "openai-completions",
          baseURL: "https://acme.test/v1",
        },
      },
      declaredRoutes: ["acme-gateway"],
    });
    await openEditor("acme-gateway");
    const name = screen.getByLabelText<HTMLInputElement>(en.customDisplayName);
    expect(name.value).toBe("Acme Gateway");
    // The route id, not the stored name: it is what the route will be called
    // the moment the field is cleared.
    expect(name.placeholder).toBe("acme-gateway");
    await fireEvent.input(name, { target: { value: "Acme 网关" } });
    await fireEvent.click(screen.getByText(en.apply));
    await waitFor(() => {
      expect(mutate).toHaveBeenCalledTimes(1);
    });
    expect(firstMutate(mutate).ops).toEqual([
      { op: "set", path: ["providers", "acme-gateway", "displayName"], value: "Acme 网关" },
    ]);
  });
  it("offers the composition name as what a cleared field falls back to", async () => {
    // A `cordis.yml` can pin a route the catalog does not ship, so a declared
    // route's profile is not always the page's own. The field edits the user
    // layer alone, and clearing it restores the layer beneath — the
    // composition name here, not the route id — so that is what it offers.
    await mountSection({
      providers: { "acme-gateway": { displayName: "Acme (pinned)", api: "openai-completions" } },
      baseProviders: {
        "acme-gateway": { displayName: "Acme (pinned)", api: "openai-completions" },
      },
      userProviders: {},
      declaredRoutes: ["acme-gateway"],
    });
    await openEditor("acme-gateway");
    const name = screen.getByLabelText<HTMLInputElement>(en.customDisplayName);
    expect(name.value).toBe("");
    expect(name.placeholder).toBe("Acme (pinned)");
  });
  it("names the provider as the refreshed directory reports it after a rename", async () => {
    // A name can change after the card opens, so the saved status reads the
    // refreshed directory name rather than the target captured at open.
    const { face } = await mountSection({
      providers: { "acme-gateway": { displayName: "Acme Gateway", api: "openai-completions" } },
      declaredRoutes: ["acme-gateway"],
    });
    // The reload after the write answers with the renamed route, exactly as
    // the adapter re-registers it.
    face.llm.listConfigurableProviders = vi.fn(() =>
      Promise.resolve(
        ok([
          {
            provider: "acme-gateway",
            displayName: "Acme 网关",
            settingsNs: "llm-pi-ai",
            settingsPath: ["providers", "acme-gateway"],
            declared: true,
          },
        ]),
      ),
    );
    await openEditor("acme-gateway");
    await fireEvent.input(screen.getByLabelText(en.customDisplayName), {
      target: { value: "Acme 网关" },
    });
    await fireEvent.click(screen.getByText(en.apply));
    const notice = await screen.findByRole("status");
    expect(notice.textContent).toBe(
      providerCopy(en.savedProvider, {
        provider: "acme-gateway",
        displayName: "Acme 网关",
      }),
    );
  });
  it("drops the stored name rather than storing an empty one the adapter refuses", async () => {
    // `llm-pi-ai` rejects an empty displayName outright, so clearing the field
    // must unset it — which is also what the user means: use the route id.
    const { mutate } = await mountSection({
      providers: { "acme-gateway": { displayName: "Acme Gateway", api: "openai-completions" } },
      declaredRoutes: ["acme-gateway"],
    });
    await openEditor("acme-gateway");
    await fireEvent.input(screen.getByLabelText(en.customDisplayName), {
      target: { value: "   " },
    });
    await fireEvent.click(screen.getByText(en.apply));
    await waitFor(() => {
      expect(mutate).toHaveBeenCalledTimes(1);
    });
    expect(firstMutate(mutate).ops).toEqual([
      { op: "unset", path: ["providers", "acme-gateway", "displayName"] },
    ]);
  });
  it("edits the protocol a declared route was created with", async () => {
    const { mutate } = await mountSection({
      providers: {
        "acme-gateway": {
          apiKeyEnv: "ACME_GATEWAY_API_KEY",
          api: "openai-completions",
          baseURL: "https://gateway.acme.example/v1",
          models: [{ id: "acme-large" }],
        },
      },
      declaredRoutes: ["acme-gateway"],
    });
    await openEditor("acme-gateway");
    const protocol = screen.getByLabelText<HTMLSelectElement>(en.customApi);
    expect(protocol.value).toBe("openai-completions");
    await fireEvent.input(protocol, { target: { value: "anthropic-messages" } });
    await fireEvent.click(screen.getByText(en.apply));
    await waitFor(() => {
      expect(mutate).toHaveBeenCalledTimes(1);
    });
    // Only the protocol travels: every other stored field is unchanged, so no
    // op restates it.
    expect(firstMutate(mutate)).toEqual({
      ns: "llm-pi-ai",
      ops: [{ op: "set", path: ["providers", "acme-gateway", "api"], value: "anthropic-messages" }],
      expectedRevision: 3,
    });
  });
  it("selects nothing for a declared route whose profile names no protocol", async () => {
    // A route hand-written into settings.yaml with no model needs no protocol
    // to resolve, so the card can be opened over one. The select must not read
    // as if that route had picked its first choice.
    await mountSection({
      providers: { "acme-gateway": { baseURL: "https://gateway.acme.example/v1" } },
      declaredRoutes: ["acme-gateway"],
    });
    await openEditor("acme-gateway");
    expect(screen.getByLabelText<HTMLSelectElement>(en.customApi).value).toBe("");
  });
  it.each([
    ["blocks a hand-declared route", true],
    ["leaves a catalog route to the adapter", false],
  ])("%s whose stored reasoning levels the adapter refuses", async (_label, declared) => {
    // Only a hand-declared route's rows edit reasoning levels, so only there
    // can the card name the row and offer the switch that repairs it.
    await mountSection({
      providers: {
        "acme-gateway": {
          api: "openai-completions",
          models: [{ id: "acme-large", reasoningEfforts: { off: null } }],
        },
      },
      declaredRoutes: declared ? ["acme-gateway"] : [],
    });
    await openEditor("acme-gateway");
    const refusal = `${en.model} 1: ${en.modelReasoningNeedsLevel}`;
    expect(screen.queryByText(refusal) !== null).toBe(declared);
    expect(buttonNamed(en.apply).disabled).toBe(declared);
  });
  it("retries only the key after the profile landed, and reports the provider on cancel", async () => {
    const set = vi
      .fn()
      .mockResolvedValueOnce(remoteFail("credential store is read-only"))
      .mockResolvedValueOnce(remoteOk(undefined));
    const { mutate, onClose } = mountCard({}, { set });
    await fireEvent.input(screen.getByLabelText(en.customRoute), { target: { value: "acme" } });
    await fireEvent.input(screen.getByLabelText(en.baseUrl), {
      target: { value: "https://acme.test/v1" },
    });
    await fireEvent.input(screen.getByLabelText(en.keyInput), { target: { value: "  gw-key  " } });
    await fireEvent.click(screen.getByRole("button", { name: en.addModel }));
    await fireEvent.input(screen.getByLabelText(`${en.modelId} 1`), { target: { value: "m" } });
    await fireEvent.click(screen.getByText(en.create));
    // The profile landed; only the key failed. The card says so and stays open.
    await waitFor(() => {
      expect(screen.getByText("credential store is read-only")).toBeTruthy();
    });
    expect(onClose).not.toHaveBeenCalled();
    expect(mutate).toHaveBeenCalledTimes(1);
    // The key is stored trimmed, matching the editor.
    expect(set).toHaveBeenNthCalledWith(1, "ACME_API_KEY", "gw-key");
    // The provider exists now, so the fields describing it are settled and
    // only the key can still be corrected.
    expect(screen.getByLabelText<HTMLInputElement>(en.customRoute).disabled).toBe(true);
    expect(screen.getByLabelText<HTMLInputElement>(en.baseUrl).disabled).toBe(true);
    expect(screen.getByLabelText<HTMLInputElement>(en.keyInput).disabled).toBe(false);
    await fireEvent.input(screen.getByLabelText(en.keyInput), { target: { value: "gw-key-2" } });
    await fireEvent.click(screen.getByText(en.create));
    await waitFor(() => {
      expect(onClose).toHaveBeenCalledWith(true);
    });
    // Re-running the profile write would carry the revision this card's own
    // first write superseded, so the Host would answer settings-conflict and
    // the key could never be stored from here at all.
    expect(mutate).toHaveBeenCalledTimes(1);
    expect(set).toHaveBeenNthCalledWith(2, "ACME_API_KEY", "gw-key-2");
  });
  it("reports the created provider when cancelled after its profile landed", async () => {
    const set = vi.fn().mockResolvedValue(remoteFail("nope"));
    const { onClose } = mountCard({}, { set });
    await fireEvent.input(screen.getByLabelText(en.customRoute), { target: { value: "acme" } });
    await fireEvent.input(screen.getByLabelText(en.baseUrl), {
      target: { value: "https://acme.test/v1" },
    });
    await fireEvent.input(screen.getByLabelText(en.keyInput), { target: { value: "gw-key" } });
    await fireEvent.click(screen.getByRole("button", { name: en.addModel }));
    await fireEvent.input(screen.getByLabelText(`${en.modelId} 1`), { target: { value: "m" } });
    await fireEvent.click(screen.getByText(en.create));
    await waitFor(() => {
      expect(screen.getByText("nope")).toBeTruthy();
    });
    // Walking away leaves a real provider behind; reporting no change would
    // leave the page without the row it now has.
    await fireEvent.click(screen.getByText(en.cancel));
    expect(onClose).toHaveBeenCalledWith(true);
  });
  it("never contradicts a filled-in field with the next gate\u2019s copy", async () => {
    mountCard();
    const routeField = screen.getByLabelText(en.customRoute);
    await fireEvent.input(routeField, { target: { value: "2" } });
    await fireEvent.input(screen.getByLabelText(en.baseUrl), {
      target: { value: "https://acme.test/v1" },
    });
    await fireEvent.click(screen.getByRole("button", { name: en.addModel }));
    await fireEvent.input(screen.getByLabelText(`${en.modelId} 1`), { target: { value: "m" } });
    // The route field explains itself right under the input; the shared line
    // must stay silent rather than falling through to "no models yet" while
    // the list above plainly has one.
    expect(screen.getByText(en.customRouteInvalid)).toBeTruthy();
    expect(screen.queryByText(en.customNeedsModels)).toBeNull();
    // Fixing the route hands the line back to the gate that is actually unmet.
    await fireEvent.input(routeField, { target: { value: "acme" } });
    expect(screen.queryByText(en.customNeedsModels)).toBeNull();
    expect(buttonNamed(en.create).disabled).toBe(false);
  });
  it("refuses a route id whose derived credential reference would be illegal", async () => {
    mountCard();
    const routeField = screen.getByLabelText(en.customRoute);
    await fireEvent.input(routeField, { target: { value: "https://acme.test/v1" } });
    // Without this check a digit-leading id passes the card and fails at the
    // credential seam with a raw regular expression: the
    // reference derives as `123_API_KEY`, and a credential reference is a
    // POSIX shell identifier, which cannot start with a digit.
    await fireEvent.input(routeField, { target: { value: "123" } });
    expect(screen.getByText(en.customRouteInvalid)).toBeTruthy();
    expect(buttonNamed(en.create).disabled).toBe(true);
    await fireEvent.input(routeField, { target: { value: "a1" } });
    expect(screen.queryByText(en.customRouteInvalid)).toBeNull();
  });
  it("styles a rejected route id as a fault and its guidance as a hint", async () => {
    mountCard();
    const routeField = screen.getByLabelText(en.customRoute);
    // Same split the key field makes: what the user got wrong reads as a
    // fault, what they have yet to do reads as guidance.
    expect(screen.getByText(en.customRouteHint).className).toMatch(/advancedHint/);
    await fireEvent.input(routeField, { target: { value: "2" } });
    expect(screen.getByText(en.customRouteInvalid).className).toMatch(/error/);
    await fireEvent.input(routeField, { target: { value: "openai" } });
    expect(screen.getByText(en.customRouteTaken).className).toMatch(/error/);
  });
  it.each(["not-a-url", "localhost:11434", "ftp://gateway.acme.example/v1"])(
    "rejects the non-HTTP base URL %j before discovery or creation",
    async (baseURL) => {
      const { discover, mutate } = mountCard();
      await fireEvent.input(screen.getByLabelText(en.customRoute), { target: { value: "acme" } });
      await fireEvent.click(screen.getByRole("button", { name: en.addModel }));
      await fireEvent.input(screen.getByLabelText(`${en.modelId} 1`), { target: { value: "m" } });
      await fireEvent.input(screen.getByLabelText(en.baseUrl), { target: { value: baseURL } });
      expect(screen.getByText(en.customBaseUrlInvalid)).toBeTruthy();
      expect(screen.getByLabelText(en.baseUrl).getAttribute("aria-invalid")).toBe("true");
      expect(buttonNamed(en.fetchModels).disabled).toBe(true);
      expect(buttonNamed(en.fetchModels).title).toBe(en.customBaseUrlInvalid);
      expect(buttonNamed(en.create).disabled).toBe(true);
      expect(discover).not.toHaveBeenCalled();
      expect(mutate).not.toHaveBeenCalled();
    },
  );
  it.each([
    "http://localhost:11434/v1",
    "http://127.0.0.1:8080/v1",
    "http://[::1]:8080/v1",
    "https://gateway.acme.example:8443/v1",
  ])("allows the HTTP base URL %j to be interrogated", async (baseURL) => {
    const { discover } = mountCard();
    await fireEvent.input(screen.getByLabelText(en.customRoute), { target: { value: "acme" } });
    await fireEvent.click(screen.getByRole("button", { name: en.addModel }));
    await fireEvent.input(screen.getByLabelText(`${en.modelId} 1`), { target: { value: "m" } });
    await fireEvent.input(screen.getByLabelText(en.baseUrl), { target: { value: baseURL } });
    expect(screen.queryByText(en.customBaseUrlInvalid)).toBeNull();
    expect(buttonNamed(en.fetchModels).disabled).toBe(false);
    expect(buttonNamed(en.create).disabled).toBe(false);
    await fireEvent.click(screen.getByText(en.fetchModels));
    expect(lastProbe(discover)).toMatchObject({ baseURL });
  });
  it("normalizes surrounding whitespace before interrogating and storing a base URL", async () => {
    const discover = vi.fn(() => Promise.resolve(ok([{ id: "m" }])));
    const { mutate, onClose } = mountCard({}, { discover });
    await fireEvent.input(screen.getByLabelText(en.customRoute), { target: { value: "acme" } });
    await fireEvent.input(screen.getByLabelText(en.baseUrl), {
      target: { value: "  https://gateway.acme.example/v1  " },
    });
    expect(screen.queryByText(en.customBaseUrlInvalid)).toBeNull();
    await fireEvent.click(screen.getByText(en.fetchModels));
    await waitFor(() => {
      expect(discover).toHaveBeenCalledTimes(1);
    });
    expect(lastProbe(discover)).toMatchObject({ baseURL: "https://gateway.acme.example/v1" });
    await fireEvent.click(await screen.findByText(en.fetchAdopt));
    await waitFor(() => {
      expect(buttonNamed(en.create).disabled).toBe(false);
    });
    await fireEvent.click(screen.getByText(en.create));
    await waitFor(() => {
      expect(onClose).toHaveBeenCalledWith(true);
    });
    expect(firstMutate(mutate).ops[0]?.value).toMatchObject({
      baseURL: "https://gateway.acme.example/v1",
    });
  });
  it("keeps a network failure distinct from base URL syntax", async () => {
    const discover = vi.fn(() => Promise.resolve(fail("connection refused", "gateway/internal")));
    mountCard({}, { discover });
    await fireEvent.input(screen.getByLabelText(en.baseUrl), {
      target: { value: "http://localhost:11434/v1" },
    });
    await fireEvent.click(screen.getByText(en.fetchModels));
    await screen.findByText("connection refused");
    expect(screen.queryByText(en.customBaseUrlInvalid)).toBeNull();
  });
  it("derives a reference the credential seam accepts for every id it admits", () => {
    // The two rules have to stay in step; this is the relation, checked
    // directly rather than through the DOM.
    const CREDENTIAL_REF = /^[A-Za-z_][A-Za-z0-9_]*$/;
    for (const id of ["a", "ds", "a1", "acme-gateway", "x-1-y", "zz9"]) {
      expect(CREDENTIAL_REF.test(deriveKeyRef(id))).toBe(true);
    }
  });
  it("names the blocked gate under the form, and nothing once it is satisfied", async () => {
    mountCard();
    await fireEvent.input(screen.getByLabelText(en.customRoute), { target: { value: "acme" } });
    // Endpoint first: the gate names the one thing standing in the way.
    expect(screen.getByText(en.customNeedsBaseUrl)).toBeTruthy();
    await fireEvent.input(screen.getByLabelText(en.baseUrl), {
      target: { value: "https://acme.test/v1" },
    });
    expect(screen.getByText(en.customNeedsModels)).toBeTruthy();
    // Satisfied: the shared line disappears rather than rendering empty.
    await fireEvent.click(screen.getByRole("button", { name: en.addModel }));
    await fireEvent.input(screen.getByLabelText(`${en.modelId} 1`), {
      target: { value: "acme-large" },
    });
    expect(screen.queryByText(en.customNeedsBaseUrl)).toBeNull();
    expect(screen.queryByText(en.customNeedsModels)).toBeNull();
    expect(buttonNamed(en.create).disabled).toBe(false);
  });
  it("refuses to create while a capacity is unreadable", async () => {
    mountCard();
    await fireEvent.input(screen.getByLabelText(en.customRoute), { target: { value: "acme" } });
    await fireEvent.input(screen.getByLabelText(en.baseUrl), {
      target: { value: "https://acme.test/v1" },
    });
    await fireEvent.click(screen.getByRole("button", { name: en.addModel }));
    await fireEvent.input(screen.getByLabelText(`${en.modelId} 1`), {
      target: { value: "acme-large" },
    });
    await expandModel(1);
    await fireEvent.input(screen.getByLabelText(`${en.contextWindow} 1`), {
      target: { value: "64 KiB" },
    });
    expect(screen.getByText(`${en.model} 1: ${en.modelContextInvalid}`)).toBeTruthy();
    expect(buttonNamed(en.create).disabled).toBe(true);
  });
  it("keeps each half-typed capacity with its own row across a removal", async () => {
    mountCard();
    await fireEvent.input(screen.getByLabelText(en.customRoute), { target: { value: "acme" } });
    await fireEvent.input(screen.getByLabelText(en.baseUrl), {
      target: { value: "https://acme.test/v1" },
    });
    for (const [at, id] of [
      [1, "first"],
      [2, "second"],
      [3, "third"],
    ] as const) {
      await fireEvent.click(screen.getByRole("button", { name: en.addModel }));
      await fireEvent.input(screen.getByLabelText(`${en.modelId} ${String(at)}`), {
        target: { value: id },
      });
      await expandModel(at);
      // Deliberately mid-word: the buffer exists so text like this survives.
      await fireEvent.input(screen.getByLabelText(`${en.contextWindow} ${String(at)}`), {
        target: { value: `${String(at)}.` },
      });
    }
    // Removing the middle row: the one before keeps its position and text, the
    // one after moves down carrying its own, and the removed row's text goes.
    await fireEvent.click(screen.getByLabelText(`${en.removeModel} 2`));
    expect(screen.getByLabelText<HTMLInputElement>(`${en.modelId} 1`).value).toBe("first");
    expect(screen.getByLabelText<HTMLInputElement>(`${en.contextWindow} 1`).value).toBe("1.");
    expect(screen.getByLabelText<HTMLInputElement>(`${en.modelId} 2`).value).toBe("third");
    expect(screen.getByLabelText<HTMLInputElement>(`${en.contextWindow} 2`).value).toBe("3.");
  });
  it("refuses two models sharing one id", async () => {
    mountCard();
    await fireEvent.input(screen.getByLabelText(en.customRoute), { target: { value: "acme" } });
    await fireEvent.input(screen.getByLabelText(en.baseUrl), {
      target: { value: "https://acme.test/v1" },
    });
    await fireEvent.click(screen.getByRole("button", { name: en.addModel }));
    await fireEvent.click(screen.getByRole("button", { name: en.addModel }));
    await fireEvent.input(screen.getByLabelText(`${en.modelId} 1`), { target: { value: "same" } });
    await fireEvent.input(screen.getByLabelText(`${en.modelId} 2`), { target: { value: "same" } });
    // The adapter refuses a duplicate outright, so the form must not offer to
    // write one.
    expect(screen.getByText(`${en.model} 2: ${en.modelIdDuplicate}`)).toBeTruthy();
    expect(buttonNamed(en.create).disabled).toBe(true);
    await fireEvent.input(screen.getByLabelText(`${en.modelId} 2`), { target: { value: "other" } });
    expect(buttonNamed(en.create).disabled).toBe(false);
  });
  it("creates a model with no capacities, which the route\u2019s fallbacks size", async () => {
    const { mutate, onClose } = mountCard();
    await fireEvent.input(screen.getByLabelText(en.customRoute), { target: { value: "acme" } });
    await fireEvent.input(screen.getByLabelText(en.baseUrl), {
      target: { value: "https://acme.test/v1" },
    });
    await fireEvent.click(screen.getByRole("button", { name: en.addModel }));
    await fireEvent.input(screen.getByLabelText(`${en.modelId} 1`), { target: { value: "bare" } });
    // A listing that discloses nothing but ids is enough to create a working
    // provider; the adapter sizes what configuration leaves out.
    expect(buttonNamed(en.create).disabled).toBe(false);
    await fireEvent.click(screen.getByText(en.create));
    await waitFor(() => {
      expect(onClose).toHaveBeenCalledWith(true);
    });
    expect(firstMutate(mutate).ops[0]?.value).toMatchObject({ models: [{ id: "bare" }] });
  });
  it("refuses to create until the route, endpoint, and a model are usable", async () => {
    mountCard();
    expect(buttonNamed(en.create).disabled).toBe(true);
    await fireEvent.input(screen.getByLabelText(en.customRoute), {
      target: { value: "Acme Gateway" },
    });
    expect(screen.getByText(en.customRouteInvalid)).toBeTruthy();
    await fireEvent.input(screen.getByLabelText(en.customRoute), { target: { value: "openai" } });
    expect(screen.getByText(en.customRouteTaken)).toBeTruthy();
    await fireEvent.input(screen.getByLabelText(en.customRoute), { target: { value: "acme" } });
    expect(screen.getByText(en.customNeedsBaseUrl)).toBeTruthy();
    await fireEvent.input(screen.getByLabelText(en.baseUrl), {
      target: { value: "https://acme.test/v1" },
    });
    expect(screen.getByText(en.customNeedsModels)).toBeTruthy();
    expect(buttonNamed(en.create).disabled).toBe(true);
    // A model row with no id is not a model.
    await fireEvent.click(screen.getByRole("button", { name: en.addModel }));
    expect(buttonNamed(en.create).disabled).toBe(true);
    await fireEvent.input(screen.getByLabelText(`${en.modelId} 1`), { target: { value: "m" } });
    expect(buttonNamed(en.create).disabled).toBe(false);
  });
  it("surfaces a refused write without closing", async () => {
    const refused = vi.fn(() =>
      Promise.resolve(remoteFail("read-only settings", "settings/rejected")),
    );
    const { onClose } = mountCard({
      operations: operationsWith(scriptedFace({ mutate: refused }).face),
    });
    await fireEvent.input(screen.getByLabelText(en.customRoute), { target: { value: "acme" } });
    await fireEvent.input(screen.getByLabelText(en.baseUrl), {
      target: { value: "https://acme.test/v1" },
    });
    await fireEvent.click(screen.getByRole("button", { name: en.addModel }));
    await fireEvent.input(screen.getByLabelText(`${en.modelId} 1`), { target: { value: "m" } });
    await fireEvent.click(screen.getByText(en.create));
    await screen.findByText("read-only settings");
    expect(onClose).not.toHaveBeenCalled();
  });
  it("translates a create refused by a newer namespace revision", async () => {
    const conflicting = vi.fn(() =>
      Promise.resolve(remoteFail("changed since it was read", "settings/conflict")),
    );
    const { onClose } = mountCard({
      operations: operationsWith(scriptedFace({ mutate: conflicting }).face),
    });
    await fireEvent.input(screen.getByLabelText(en.customRoute), { target: { value: "acme" } });
    await fireEvent.input(screen.getByLabelText(en.baseUrl), {
      target: { value: "https://acme.test/v1" },
    });
    await fireEvent.click(screen.getByRole("button", { name: en.addModel }));
    await fireEvent.input(screen.getByLabelText(`${en.modelId} 1`), { target: { value: "m" } });
    await fireEvent.click(screen.getByText(en.create));
    await screen.findByText(en.conflict);
    expect(onClose).not.toHaveBeenCalled();
  });
  it("reports a stored profile whose key write was refused", async () => {
    const set = vi.fn(() => Promise.resolve(remoteFail("credential is read-only")));
    const { onClose } = mountCard({ operations: operationsWith(scriptedFace({ set }).face) });
    await fireEvent.input(screen.getByLabelText(en.customRoute), { target: { value: "acme" } });
    await fireEvent.input(screen.getByLabelText(en.baseUrl), {
      target: { value: "https://acme.test/v1" },
    });
    await fireEvent.input(screen.getByLabelText(en.keyInput), { target: { value: "k" } });
    await fireEvent.click(screen.getByRole("button", { name: en.addModel }));
    await fireEvent.input(screen.getByLabelText(`${en.modelId} 1`), { target: { value: "m" } });
    await fireEvent.click(screen.getByText(en.create));
    await screen.findByText("credential is read-only");
    expect(onClose).not.toHaveBeenCalled();
  });
  it("creates with the chosen protocol and no display name", async () => {
    const { mutate, onClose } = mountCard();
    const baseUrl = screen.getByLabelText<HTMLInputElement>(en.baseUrl);
    const protocol = screen.getByLabelText(en.customApi);
    expect(baseUrl.placeholder).toBe("https://gateway.example/v1");
    await fireEvent.input(protocol, { target: { value: "openai-responses" } });
    expect(baseUrl.placeholder).toBe("https://gateway.example/v1");
    await fireEvent.input(protocol, { target: { value: "google-generative-ai" } });
    expect(baseUrl.placeholder).toBe("https://gateway.example/v1beta");
    await fireEvent.input(screen.getByLabelText(en.customRoute), { target: { value: "acme" } });
    await fireEvent.input(baseUrl, { target: { value: "https://acme.test/anthropic" } });
    await fireEvent.input(protocol, { target: { value: "anthropic-messages" } });
    expect(baseUrl.placeholder).toBe("https://gateway.example");
    expect(baseUrl.value).toBe("https://acme.test/anthropic");
    await fireEvent.click(screen.getByRole("button", { name: en.addModel }));
    await fireEvent.input(screen.getByLabelText(`${en.modelId} 1`), { target: { value: "m" } });
    await fireEvent.click(screen.getByText(en.create));
    await waitFor(() => {
      expect(onClose).toHaveBeenCalledWith(true);
    });
    // No display name configured means none stored; the route id is the name.
    // No key typed means no reference either, matching the editor: the route
    // keeps its provider-native auth path instead of resolving a reference
    // nothing ever sets. The with-key case is covered above.
    expect(firstMutate(mutate).ops[0]?.value).toEqual({
      api: "anthropic-messages",
      baseURL: "https://acme.test/anthropic",
      models: [{ id: "m" }],
    });
  });
  it("offers no protocol when the namespace declares none", () => {
    mountCard({ protocols: [] });
    expect(screen.getByLabelText<HTMLSelectElement>(en.customApi).value).toBe("");
  });
  it("closes without writing on cancel, and honors a read-only deployment", async () => {
    const { onClose, mutate } = mountCard();
    await fireEvent.click(screen.getByText(en.cancel));
    expect(onClose).toHaveBeenCalledWith(false);
    expect(mutate).not.toHaveBeenCalled();
    cleanup();
    mountCard({ readOnly: true });
    expect(screen.getByLabelText<HTMLInputElement>(en.customRoute).disabled).toBe(true);
    expect(buttonNamed(en.create).disabled).toBe(true);
  });
  it("closes the add card when an existing row is opened for editing", async () => {
    await mountSection({ providers: { openai: { baseURL: "https://proxy.example/v1" } } });
    await openCustomMode();
    expect(screen.getByRole("textbox", { name: en.customRoute })).toBeTruthy();
    // Two cards at once would each be closable by the other: whichever one is
    // dismissed clears the shared state and discards the other's draft.
    await openEditor("openai");
    expect(screen.queryByRole("tablist")).toBeNull();
    expect(screen.queryByRole("textbox", { name: en.customRoute })).toBeNull();
  });
  it("reaches the custom form from the section and returns to the button on cancel", async () => {
    await mountSection();
    await openCustomMode();
    expect(screen.getByRole("textbox", { name: en.customRoute })).toBeTruthy();
    await fireEvent.click(screen.getByText(en.cancel));
    await waitFor(() => {
      expect(screen.queryByRole("textbox", { name: en.customRoute })).toBeNull();
    });
    expect(screen.getByRole("button", { name: en.add })).toBeTruthy();
  });
  it("names each protocol by its product name and falls back to the identifier of an unknown one", () => {
    mountCard({ protocols: [...PROTOCOLS, "future-protocol"] });
    const protocol = screen.getByLabelText<HTMLSelectElement>(en.customApi);
    const labels = [...protocol.options].map((option) => [option.value, option.textContent]);
    expect(labels).toEqual([
      ["openai-completions", en.protocolOpenAiCompletions],
      ["openai-responses", en.protocolOpenAiResponses],
      ["anthropic-messages", en.protocolAnthropicMessages],
      ["google-generative-ai", en.protocolGemini],
      ["future-protocol", "future-protocol"],
    ]);
  });
  it("requires a key for the Gemini protocol, which cannot authenticate without one", async () => {
    const { mutate, set, onClose } = mountCard();
    await fireEvent.input(screen.getByLabelText(en.customRoute), {
      target: { value: "gemini-gateway" },
    });
    await fireEvent.input(screen.getByLabelText(en.baseUrl), {
      target: { value: "https://gateway.example/v1beta" },
    });
    await fireEvent.input(screen.getByLabelText(en.customApi), {
      target: { value: "google-generative-ai" },
    });
    await fireEvent.click(screen.getByRole("button", { name: en.addModel }));
    await fireEvent.input(screen.getByLabelText(`${en.modelId} 1`), {
      target: { value: "gemini-pro" },
    });
    expect(screen.getByText(en.keyRequired)).toBeTruthy();
    expect(buttonNamed(en.create).disabled).toBe(true);
    await fireEvent.input(screen.getByLabelText(en.keyInput), { target: { value: "gemini-key" } });
    await fireEvent.click(screen.getByText(en.create));
    await waitFor(() => {
      expect(onClose).toHaveBeenCalledWith(true);
    });
    expect(firstMutate(mutate).ops[0]?.value).toMatchObject({
      api: "google-generative-ai",
      apiKeyEnv: "GEMINI_GATEWAY_API_KEY",
    });
    expect(set).toHaveBeenCalledOnce();
  });
  it("treats a whitespace key as missing on the Gemini protocol", async () => {
    mountCard();
    await fireEvent.input(screen.getByLabelText(en.customApi), {
      target: { value: "google-generative-ai" },
    });
    await fireEvent.input(screen.getByLabelText(en.keyInput), { target: { value: "   " } });
    expect(screen.getByText(en.keyRequired)).toBeTruthy();
    expect(screen.queryByText(en.keyBlankNew)).toBeNull();
  });
  it("offers a Gemini model only the levels the protocol accepts", async () => {
    mountCard();
    await fireEvent.input(screen.getByLabelText(en.customApi), {
      target: { value: "google-generative-ai" },
    });
    await fireEvent.click(screen.getByRole("button", { name: en.addModel }));
    await fireEvent.click(screen.getByRole("button", { name: `${en.modelAdvanced} 1` }));
    await fireEvent.click(screen.getByRole("switch", { name: `${en.modelReasoning} 1` }));
    const level = screen.getByRole<HTMLSelectElement>("combobox", {
      name: `${en.modelReasoningLevel} 1`,
    });
    expect(level.value).toBe("low");
    expect([...level.options].map((option) => option.value)).toEqual(["minimal", "low"]);
    expect(
      screen.getByRole<HTMLInputElement>("textbox", { name: `low ${en.modelReasoningValue}` })
        .disabled,
    ).toBe(true);
  });
  it("refuses an unusable key on the field and blocks creation", async () => {
    const { mutate, set } = mountCard();
    await fireEvent.input(screen.getByLabelText(en.customRoute), {
      target: { value: "acme-gateway" },
    });
    await fireEvent.input(screen.getByLabelText(en.baseUrl), {
      target: { value: "https://gateway.acme.example/v1" },
    });
    await fireEvent.click(screen.getByRole("button", { name: en.addModel }));
    await fireEvent.input(screen.getByLabelText(`${en.modelId} 1`), {
      target: { value: "acme-large" },
    });
    await fireEvent.input(screen.getByLabelText(en.keyInput), {
      target: { value: "sk-\u{1F600}" },
    });
    // A hand-declared route reaches the same judgement as an edited one, so a
    // key that no header can carry never becomes a profile plus a bad secret.
    expect(screen.getByText(en.keyIllegalCharacters)).toBeTruthy();
    expect(buttonNamed(en.create).disabled).toBe(true);
    expect(mutate).not.toHaveBeenCalled();
    expect(set).not.toHaveBeenCalled();
  });
  it("stays silent about the other gates when only the key is refused", async () => {
    mountCard();
    await fireEvent.input(screen.getByLabelText(en.customRoute), {
      target: { value: "acme-gateway" },
    });
    await fireEvent.input(screen.getByLabelText(en.baseUrl), {
      target: { value: "https://gateway.acme.example/v1" },
    });
    await fireEvent.click(screen.getByRole("button", { name: en.addModel }));
    await fireEvent.input(screen.getByLabelText(`${en.modelId} 1`), {
      target: { value: "acme-large" },
    });
    await fireEvent.input(screen.getByLabelText(en.keyInput), {
      target: { value: "sk-\u{1F600}" },
    });
    // Route, endpoint, and models are all satisfied, so answering with the
    // next unmet gate would print a second, false fault beside the real one.
    expect(screen.getByText(en.keyIllegalCharacters)).toBeTruthy();
    expect(screen.queryByText(en.customNeedsModels)).toBeNull();
    expect(screen.queryByText(en.customNeedsBaseUrl)).toBeNull();
  });
  it("tells a whitespace-only key what a blank field means on a create card", async () => {
    const { mutate } = mountCard();
    await fireEvent.input(screen.getByLabelText(en.customRoute), {
      target: { value: "acme-gateway" },
    });
    await fireEvent.input(screen.getByLabelText(en.baseUrl), {
      target: { value: "https://gateway.acme.example/v1" },
    });
    await fireEvent.click(screen.getByRole("button", { name: en.addModel }));
    await fireEvent.input(screen.getByLabelText(`${en.modelId} 1`), {
      target: { value: "acme-large" },
    });
    await fireEvent.input(screen.getByLabelText(en.keyInput), { target: { value: "   " } });
    // There is no stored key to keep here, so the blank case says the thing
    // that is true of a route being declared: it may authenticate elsewhere.
    expect(screen.getByText(en.keyBlankNew)).toBeTruthy();
    expect(screen.queryByText(en.keyBlank)).toBeNull();
    expect(buttonNamed(en.fetchModels).title).toBe(en.keyBlankNew);
    expect(buttonNamed(en.create).disabled).toBe(true);
    expect(mutate).not.toHaveBeenCalled();
  });
  it("creates without a key when the route authenticates some other way", async () => {
    const { set, onClose } = mountCard();
    await fireEvent.input(screen.getByLabelText(en.customRoute), {
      target: { value: "ambient-gateway" },
    });
    await fireEvent.input(screen.getByLabelText(en.baseUrl), {
      target: { value: "https://gateway.acme.example/v1" },
    });
    await fireEvent.click(screen.getByRole("button", { name: en.addModel }));
    await fireEvent.input(screen.getByLabelText(`${en.modelId} 1`), {
      target: { value: "acme-large" },
    });
    await fireEvent.click(screen.getByText(en.create));
    await waitFor(() => {
      expect(onClose).toHaveBeenCalledWith(true);
    });
    expect(set).not.toHaveBeenCalled();
  });
});
describe("API key field", () => {
  it("submits with a blank key field without writing a credential", async () => {
    const { mutate, set } = await mountSection();
    await openEditor("openai");
    // The field opens empty even for a provider whose key is stored, where it
    // means "keep that one" — so editing anything else must not require it.
    await fireEvent.input(screen.getByLabelText(en.baseUrl), {
      target: { value: "https://moved.example/v1" },
    });
    expect(buttonNamed(en.apply).disabled).toBe(false);
    await fireEvent.click(screen.getByText(en.apply));
    await waitFor(() => {
      expect(mutate).toHaveBeenCalled();
    });
    expect(set).not.toHaveBeenCalled();
  });
  it("clears a whitespace-only base URL instead of writing the spaces", async () => {
    const { mutate } = await mountSection();
    await openEditor("openai");
    // The field renders this as empty, so the draft must agree: storing the
    // spaces would hand both adapters a non-empty string they accept as a URL.
    await fireEvent.input(screen.getByLabelText(en.baseUrl), { target: { value: "   " } });
    await fireEvent.click(screen.getByText(en.apply));
    await waitFor(() => {
      expect(mutate).toHaveBeenCalled();
    });
    const ops = firstMutate(mutate).ops;
    expect(ops.some((op) => op.op === "set" && op.path.includes("baseURL"))).toBe(false);
    expect(ops.some((op) => op.op === "unset" && op.path.includes("baseURL"))).toBe(true);
  });
  it("blocks submit and names the field when the key holds only whitespace", async () => {
    const { mutate, set } = await mountSection();
    await openEditor("openai");
    await fireEvent.input(screen.getByLabelText(en.keyInput), { target: { value: "   " } });
    expect(screen.getByText(en.keyBlank)).toBeTruthy();
    expect(buttonNamed(en.apply).disabled).toBe(true);
    expect(mutate).not.toHaveBeenCalled();
    expect(set).not.toHaveBeenCalled();
  });
  it("blocks submit when the key contains characters no header can carry", async () => {
    const { set } = await mountSection();
    await openEditor("openai");
    await fireEvent.input(screen.getByLabelText(en.keyInput), {
      target: { value: "sk-\u{1F600}" },
    });
    expect(screen.getByText(en.keyIllegalCharacters)).toBeTruthy();
    expect(buttonNamed(en.apply).disabled).toBe(true);
    expect(set).not.toHaveBeenCalled();
  });
  it("blocks submit when a whole NAME=value line was pasted", async () => {
    await mountSection();
    await openEditor("openai");
    await fireEvent.input(screen.getByLabelText(en.keyInput), {
      target: { value: "OPENAI_API_KEY=sk-abc" },
    });
    expect(screen.getByText(en.keyIllegalCharacters)).toBeTruthy();
    expect(buttonNamed(en.apply).disabled).toBe(true);
  });
  it("trims a padded key before storing it", async () => {
    const { set } = await mountSection();
    await openEditor("openai");
    await fireEvent.input(screen.getByLabelText(en.keyInput), { target: { value: "  sk-abc  " } });
    expect(buttonNamed(en.apply).disabled).toBe(false);
    await fireEvent.click(screen.getByText(en.apply));
    await waitFor(() => {
      expect(set).toHaveBeenCalled();
    });
    expect(set.mock.calls[0]?.[1]).toBe("sk-abc");
  });
  it("blocks the interrogation too, rather than spending a round trip on a refused key", async () => {
    const { discover } = await mountSection();
    await openEditor("openai");
    await fireEvent.input(screen.getByLabelText(en.keyInput), {
      target: { value: "sk-\u{1F600}" },
    });
    // The host would refuse this before building the header anyway; asking is
    // a round trip to be told what the field already says.
    expect(buttonNamed(en.fetchModels).disabled).toBe(true);
    expect(buttonNamed(en.fetchModels).title).toBe(en.keyIllegalCharacters);
    expect(discover).toHaveBeenCalledExactlyOnceWith("llm-pi-ai", { provider: "openai" });
  });
  it("carries the trimmed key into an interrogation, not the padded draft", async () => {
    const { discover } = await mountSection();
    await openEditor("openai");
    await fireEvent.input(screen.getByLabelText(en.keyInput), { target: { value: "  sk-abc  " } });
    await fireEvent.click(screen.getByRole("button", { name: en.fetchModels }));
    await waitFor(() => {
      expect(discover).toHaveBeenCalled();
    });
    expect(lastProbe(discover)).toMatchObject({ apiKey: "sk-abc" });
  });
  it("reloads the section after creating a hand-declared provider", async () => {
    const { controller, mutate } = await mountSection();
    const load = vi.spyOn(controller, "load");
    await openCustomMode();
    await fireEvent.input(screen.getByRole("textbox", { name: en.customRoute }), {
      target: { value: "acme" },
    });
    await fireEvent.input(screen.getByRole("textbox", { name: en.baseUrl }), {
      target: { value: "https://acme.test/v1" },
    });
    await fireEvent.click(screen.getByRole("button", { name: en.addModel }));
    await fireEvent.input(screen.getByLabelText(`${en.modelId} 1`), { target: { value: "m" } });
    await fireEvent.click(screen.getByText(en.create));
    await waitFor(() => {
      expect(mutate).toHaveBeenCalledOnce();
    });
    await waitFor(() => {
      expect(load).toHaveBeenCalledOnce();
    });
    expect(screen.queryByRole("textbox", { name: en.customRoute })).toBeNull();
  });
});
