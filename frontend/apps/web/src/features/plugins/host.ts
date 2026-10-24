import { computed, ref, type ComputedRef, type Ref } from "vue";
import { i18n } from "../../lib/i18n";
import {
  browserStore,
  readBuilder,
  readInstallation,
  writeBuilder,
  writeInstallation,
  type BuilderConfig,
  type Installation,
  type KeyValueStore,
  type PluginId,
} from "./model";

export interface NavItem {
  id: string;
  name: string;
  icon: string;
  group: "工作" | "设置";
  hint: string;
}

export interface PluginHost {
  installation: Ref<Installation>;
  entries: ComputedRef<NavItem[]>;
  setEnabled(pluginId: PluginId, enabled: boolean): void;
  readBuilder(instanceId: BuilderConfig["instanceId"]): BuilderConfig;
  saveBuilder(config: BuilderConfig): void;
  describe(id: string): NavItem;
}

export function createPluginHost(store: KeyValueStore = browserStore()): PluginHost {
  const installation = ref(readInstallation(store));
  const t = i18n.global.t;

  const entries = computed(() => {
    const items: NavItem[] = [];
    if (installation.value.enabled.chat) {
      items.push({
        id: "chat",
        name: t("plugin.chat"),
        icon: "✉",
        group: "工作",
        hint: t("plugin.chatHint"),
      });
    }
    if (installation.value.enabled.builder) {
      items.push(
        {
          id: "builder-alpha",
          name: t("plugin.builderAlpha"),
          icon: "◻",
          group: "工作",
          hint: t("plugin.builderHint"),
        },
        {
          id: "builder-beta",
          name: t("plugin.builderBeta"),
          icon: "◻",
          group: "工作",
          hint: t("plugin.builderHint"),
        },
      );
    }
    return items;
  });

  function describe(id: string): NavItem {
    const visible = entries.value.find((item) => item.id === id);
    if (visible) return visible;
    if (id === "builder-beta") {
      return { id, name: t("plugin.builderBeta"), icon: "◻", group: "工作", hint: t("plugin.hiddenBody") };
    }
    if (id === "builder-alpha") {
      return { id, name: t("plugin.builderAlpha"), icon: "◻", group: "工作", hint: t("plugin.hiddenBody") };
    }
    return { id, name: t("plugin.chat"), icon: "✉", group: "工作", hint: t("plugin.hiddenBody") };
  }

  return {
    installation,
    entries,
    setEnabled(pluginId, enabled) {
      installation.value = { enabled: { ...installation.value.enabled, [pluginId]: enabled } };
      writeInstallation(store, installation.value);
    },
    readBuilder: (instanceId) => readBuilder(store, instanceId),
    saveBuilder(config) {
      writeBuilder(store, config);
    },
    describe,
  };
}
