export const SHELL_PAGE_IDS = [
  "sql",
  "plugins",
  "experts",
  "rules",
  "knowledge",
  "databases",
  "capabilities",
  "model-settings",
] as const;

export const INSTALLATION_KEY = "eap.plugin.installation";

export type PluginId = "chat" | "builder";

export interface Installation {
  enabled: Record<PluginId, boolean>;
}

export interface PermissionRequest {
  id: string;
  optional: boolean;
}

export interface PluginManifest {
  id: PluginId;
  version: string;
  requests: readonly PermissionRequest[];
}

export interface BuilderConfig {
  pluginId: "builder";
  instanceId: "alpha" | "beta";
  mockRepositoryLabel: string;
  draftTitle: string;
  draftBody: string;
  buttonPresses: number;
  mockApproval: "none" | "simulated";
}

export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** Manifest requests are not grants. This list stays empty for the prototype. */
export const GRANTS: readonly string[] = [];

export const MANIFESTS: readonly PluginManifest[] = [
  {
    id: "chat",
    version: "0.1.0",
    requests: [{ id: "workspace.read", optional: false }],
  },
  {
    id: "builder",
    version: "0.1.0",
    requests: [
      { id: "workspace.read", optional: false },
      { id: "prototype.write", optional: false },
      { id: "repository.read", optional: false },
      { id: "repository.write", optional: true },
      { id: "mission.create", optional: true },
    ],
  },
];

const BUILDER_SEEDS: readonly BuilderConfig[] = [
  {
    pluginId: "builder",
    instanceId: "alpha",
    mockRepositoryLabel: "模拟 · ledger",
    draftTitle: "结算页",
    draftBody: "手工编辑这段说明，预览使用真实 Vue 组件。",
    buttonPresses: 0,
    mockApproval: "none",
  },
  {
    pluginId: "builder",
    instanceId: "beta",
    mockRepositoryLabel: "模拟 · catalog",
    draftTitle: "目录页",
    draftBody: "这是另一个实例的草稿。",
    buttonPresses: 0,
    mockApproval: "none",
  },
];

const DEFAULT_INSTALLATION: Installation = { enabled: { chat: true, builder: true } };

export function instanceKey(pluginId: PluginId, instanceId: string): string {
  return `eap.plugin.instance.${pluginId}.${instanceId}`;
}

export function isShellPage(id: string): boolean {
  return (SHELL_PAGE_IDS as readonly string[]).includes(id);
}

export function contributionHash(instanceId: BuilderConfig["instanceId"]): string {
  return `builder-${instanceId}`;
}

export function isKnownHash(id: string): boolean {
  return isShellPage(id) || id === "chat" || id === "builder-alpha" || id === "builder-beta";
}

export function enabledHashes(installation: Installation): string[] {
  const hashes: string[] = [];
  if (installation.enabled.chat) hashes.push("chat");
  if (installation.enabled.builder) hashes.push("builder-alpha", "builder-beta");
  return hashes;
}

export function browserStore(): KeyValueStore {
  return {
    getItem(key) {
      try {
        const storage = globalThis.localStorage;
        if (!storage) return null;
        return storage.getItem(key);
      } catch {
        return null;
      }
    },
    setItem(key, value) {
      try {
        globalThis.localStorage?.setItem(key, value);
      } catch {
        /* Privacy mode keeps the current page usable. */
      }
    },
  };
}

export function memoryStore(initial: Record<string, string> = {}): KeyValueStore {
  const data = { ...initial };
  return {
    getItem(key) {
      const value = data[key];
      return value === undefined ? null : value;
    },
    setItem: (key, value) => {
      data[key] = value;
    },
  };
}

export function readInstallation(store: KeyValueStore): Installation {
  const raw = store.getItem(INSTALLATION_KEY);
  if (!raw) return { enabled: { ...DEFAULT_INSTALLATION.enabled } };
  try {
    const parsed = JSON.parse(raw) as { enabled?: Partial<Installation["enabled"]> };
    return {
      enabled: {
        chat: parsed.enabled?.chat !== false,
        builder: parsed.enabled?.builder !== false,
      },
    };
  } catch {
    return { enabled: { ...DEFAULT_INSTALLATION.enabled } };
  }
}

export function writeInstallation(store: KeyValueStore, installation: Installation): void {
  store.setItem(
    INSTALLATION_KEY,
    JSON.stringify({ enabled: { chat: installation.enabled.chat, builder: installation.enabled.builder } }),
  );
}

export function readBuilder(store: KeyValueStore, instanceId: BuilderConfig["instanceId"]): BuilderConfig {
  const seed = BUILDER_SEEDS.find((item) => item.instanceId === instanceId)!;
  const raw = store.getItem(instanceKey("builder", instanceId));
  if (!raw) return { ...seed };
  try {
    const parsed = JSON.parse(raw) as Partial<BuilderConfig>;
    if (parsed.pluginId !== "builder" || parsed.instanceId !== instanceId) return { ...seed };
    return {
      pluginId: "builder",
      instanceId,
      mockRepositoryLabel: text(parsed.mockRepositoryLabel, seed.mockRepositoryLabel),
      draftTitle: text(parsed.draftTitle, seed.draftTitle),
      draftBody: text(parsed.draftBody, seed.draftBody),
      buttonPresses: Number.isInteger(parsed.buttonPresses) && parsed.buttonPresses! >= 0 ? parsed.buttonPresses! : 0,
      mockApproval: parsed.mockApproval === "simulated" ? "simulated" : "none",
    };
  } catch {
    return { ...seed };
  }
}

export function writeBuilder(store: KeyValueStore, config: BuilderConfig): void {
  store.setItem(instanceKey("builder", config.instanceId), JSON.stringify({ ...config }));
}

function text(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}
