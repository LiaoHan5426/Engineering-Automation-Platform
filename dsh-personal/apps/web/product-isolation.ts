/** Vite adapters for recording product chunk, asset, CSS, and worker inputs. */

import type { Plugin } from "vite";
import { WebProductBundleIsolation } from "../../scripts/web-product-bundle-isolation.ts";

const DEPENDENCY_ANALYSIS_PLUGIN = "dsh-browser-dependency-analysis";

/** Capture plugin-owned inputs that are absent from Rolldown's module graph. */
function workerInputPlugin(inputs: WebProductBundleIsolation): Plugin {
  const watched = new Set<string>();
  return {
    name: "dsh-worker-build-inputs",
    configResolved(config) {
      for (const plugin of config.plugins) {
        for (const [name, hook] of Object.entries(plugin)) {
          if (
            [
              "apply",
              "config",
              "configResolved",
              "configureServer",
              "configurePreviewServer",
            ].includes(name)
          )
            continue;
          const handler: unknown = typeof hook === "function" ? hook : hook?.handler;
          if (typeof handler !== "function") continue;
          // Plugin hooks have heterogeneous argument and return types; Reflect preserves them.
          const wrapped = function (this: object, ...args: unknown[]): unknown {
            const context = new Proxy(this, {
              get(target, property) {
                if (property === "addWatchFile")
                  return (file: string): unknown => {
                    watched.add(file);
                    const addWatchFile: unknown = Reflect.get(target, property, target);
                    if (typeof addWatchFile !== "function")
                      throw new Error(
                        "Web product isolation: worker watch registration is unavailable",
                      );
                    return Reflect.apply(addWatchFile, target, [file]);
                  };
                const value: unknown = Reflect.get(target, property, target);
                return typeof value === "function" ? value.bind(target) : value;
              },
            });
            return Reflect.apply(handler, context, args);
          };
          Object.defineProperty(plugin, name, {
            configurable: true,
            enumerable: true,
            writable: true,
            value: typeof hook === "function" ? wrapped : { ...hook, handler: wrapped },
          });
        }
      }
    },
    generateBundle: {
      order: "post",
      handler(_options, bundle) {
        inputs.workerBundle(bundle, [...watched, ...this.getModuleIds()]);
      },
    },
  };
}

/**
 * Identify a dependency-disclosure walk that deliberately leaves third-party imports external.
 * @returns Analysis intent that refuses builds which can write output.
 */
export function browserDependencyAnalysis(): Plugin {
  return {
    name: DEPENDENCY_ANALYSIS_PLUGIN,
    apply: "build",
    configResolved(config) {
      requireNonWritingAnalysis(config.build.write);
    },
  };
}

function requireNonWritingAnalysis(write: boolean): void {
  if (write !== false) throw new Error("browser dependency analysis requires build.write: false");
}

/**
 * Reject experimental inputs reachable from the built default Web page.
 * @param repository - repository root supplying package ownership.
 * @param webRoot - Vite root containing index.html and public assets.
 * @returns Build plugins that preserve Vite's output and fail before publication on a violation.
 */
export function productWebBundleIsolation(repository: string, webRoot: string): Plugin[] {
  const inputs = new WebProductBundleIsolation(repository, webRoot);
  let dependencyAnalysis = false;
  return [
    {
      name: "dsh-product-web-chunk-inputs",
      apply: "build",
      generateBundle: {
        order: "pre",
        handler(_options, bundle) {
          if (!dependencyAnalysis) inputs.captureChunks(bundle);
        },
      },
    },
    {
      name: "dsh-product-web-bundle-isolation",
      apply: "build",
      enforce: "post",
      config(config) {
        const renderBuiltUrl = config.experimental?.renderBuiltUrl;
        const workerPlugins = config.worker?.plugins;
        return {
          experimental: {
            renderBuiltUrl(filename, context) {
              inputs.assetReference(filename, context.hostId, context.type);
              return renderBuiltUrl?.(filename, context);
            },
          },
          worker: {
            plugins: () => [...(workerPlugins?.() ?? []), workerInputPlugin(inputs)],
          },
        };
      },
      configResolved(config) {
        dependencyAnalysis = config.plugins.some(
          (plugin) => plugin.name === DEPENDENCY_ANALYSIS_PLUGIN,
        );
        if (dependencyAnalysis) {
          requireNonWritingAnalysis(config.build.write);
          return;
        }
        const cssPlugins = config.plugins.filter((plugin) => plugin.name === "vite:css");
        const css = cssPlugins[0];
        if (cssPlugins.length !== 1 || css?.transform === undefined) {
          throw new Error("Web product isolation: Vite CSS input instrumentation is unavailable");
        }
        const transform =
          typeof css.transform === "function" ? css.transform : css.transform.handler;
        css.transform = {
          ...(typeof css.transform === "function" ? {} : css.transform),
          handler(code, id, options) {
            inputs.cssTransform(id);
            const context = new Proxy(this, {
              get(target, property) {
                if (property === "addWatchFile")
                  return (file: string): void => {
                    inputs.cssDependency(id, file);
                    target.addWatchFile(file);
                  };
                const value: unknown = Reflect.get(target, property, target);
                return typeof value === "function" ? value.bind(target) : value;
              },
            });
            return transform.call(context, code, id, options);
          },
        };
      },
      buildStart() {
        inputs.reset();
      },
      generateBundle: {
        order: "post",
        handler(_options, bundle) {
          const includedModules = new Set(
            Object.values(bundle).flatMap((output) =>
              output.type === "chunk" ? Object.keys(output.modules) : [],
            ),
          );
          if (!dependencyAnalysis)
            inputs.verify(bundle, (id) => {
              const info = this.getModuleInfo(id);
              // Rolldown emits its own runtime in chunks without exposing a module record.
              if (info === null && id === "\0rolldown/runtime.js") {
                return {
                  importedIds: [],
                  dynamicallyImportedIds: [],
                  isExternal: false,
                  isIncluded: true,
                };
              }
              if (info === null) return null;
              return {
                importedIds: info.importedIds,
                dynamicallyImportedIds: info.dynamicallyImportedIds,
                // At generateBundle, parsed inputs have source code; externals do not.
                isExternal: info.code === null,
                isIncluded: includedModules.has(id),
              };
            });
        },
      },
    },
  ];
}
