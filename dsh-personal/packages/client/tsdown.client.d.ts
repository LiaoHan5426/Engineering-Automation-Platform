import { type UserConfig } from 'tsdown';
/**
 * Contract layers and pure folds a client bundle may inline: browser-safe
 * values with no runtime identity to share (no Symbol/instanceof/singleton state).
 * Everything else under @deepseek-ai/* is either a module-table entry
 * (external) or a leak the purity gate rejects.
 */
export declare const INLINE_SAFE: RegExp;
/**
 * Build the tsdown config for one UI plugin package: the node-half lib build
 * plus the browser client bundle. Client packages emit both halves during the
 * Client pass by default; packages needed for Host reflection may opt into the
 * earlier Host pass. A package-level tsdown.config.ts REPLACES the root
 * workspace layout, so the lib half must be restated here — dropping it leaves
 * the package without lib/index.js and the host Loader cannot import its node
 * half. The Client build compiles source TS/SFCs; vue-tsc independently emits
 * declarations into `lib/types`, and bundle maps retain original source content.
 * @param packageDir - the package's own directory, normally the config's
 * `import.meta.dirname`. Its `package.json` name is the plugin id stamped into
 * the __ModuleLoader__.load handoff and onto the injected style tags, and the
 * owner segment of its asset URLs; its `src/client/assets/` holds the only
 * images the browser bundle may reference.
 * @param libEntry - node-half entries.
 * @param options - phase placement, lib overrides, optional independently bundled Node Client, companion configs, and per-file Client banner.
 * @returns ENV-selected tsdown config for the current build face.
 * @throws {Error} when `<packageDir>/package.json` is unreadable or declares no name.
 */
export declare function clientBundle(packageDir: string, libEntry: readonly string[], options?: ClientBundleOptions): BuildFaceConfig;
/**
 * Build one statically delivered Client module as an ESM manifest in `lib/index.js`.
 * Shared workspace dependencies resolve through the module loader; third-party
 * imports remain ESM dependencies of the final shell build.
 * @param packageDir - Package directory containing the module's package.json.
 * @param libEntry - Single emitted index entry consumed from `lib/types`.
 * @returns ENV-selected config for the Client build face.
 * @throws {Error} when the package manifest or index entry is invalid.
 */
export declare function staticLinked(packageDir: string, libEntry: readonly string[]): BuildFaceConfig;
/**
 * Build native ESM bootstrap entries whose CSS loads before the module renderer.
 * Bare imports remain available for the final shell bundle to resolve.
 * @param packageDir - Package directory containing the shell's package.json.
 * @param libEntry - Emitted JavaScript entries, each with a distinct output basename.
 * @returns ENV-selected configs for the Client build face.
 */
export declare function clientShell(packageDir: string, libEntry: readonly string[]): BuildFaceConfig;
/**
 * Whether a package's tsdown configs put it in the static assembly channel.
 * The roster has no separate list: gates load each package's own
 * `tsdown.config.ts`, call it for the Client face, and ask this.
 * @param configs - configs a package's build-face function returned.
 * @returns true when at least one config belongs to static module or shell assembly.
 */
export declare function isStaticLinkedConfig(configs: readonly UserConfig[]): boolean;
/**
 * Build a Client-only Node library during the Client pass.
 * @param packageDir - The package's own directory, normally the config's
 * `import.meta.dirname`; its `package.json` name is used in tsdown diagnostics.
 * @param libEntry - Emitted JavaScript entries consumed from `lib/types`.
 * @returns ENV-selected tsdown config for the Client build face.
 * @throws {Error} when `<packageDir>/package.json` is unreadable or declares no name.
 */
export declare function clientLibrary(packageDir: string, libEntry: readonly string[]): BuildFaceConfig;
/**
 * Select arbitrary package-local configs only during the Client pass.
 * @param configs - Node-side configs emitted after Client tsc.
 * @returns ENV-selected tsdown config for the Client build face.
 */
export declare function clientOnly(configs: readonly UserConfig[]): BuildFaceConfig;
interface ClientBundleOptions {
    /** Emit the Node-side artifacts during the Host pass instead of the Client pass. */
    readonly hostPhase?: boolean;
    /** Emit independent ESM `client.node.js` and browser-factory `client.browser.js` from the same Client entry. */
    readonly dualClient?: boolean;
    /** Additional Node-side configs emitted alongside the package library. */
    readonly companions?: readonly UserConfig[];
    /** Overrides for the package's primary Node-side library config. */
    readonly lib?: UserConfig;
    /**
     * Optional legal or attribution text selected by emitted client filename. The preset prepends it after
     * minification, so its comment lines reach the artifact byte for byte.
     */
    readonly clientBanner?: (fileName: string) => string | undefined;
}
type BuildFaceConfig = (inlineConfig: Pick<UserConfig, 'env'>) => UserConfig[];
/**
 * Module-table specifiers one `dsh.client` declaration requests. Matching is
 * exact, never normalized: a package declares the specifier its own code
 * imports, and the loader keys static entries the same way.
 * @param subject - package name, used in diagnostics.
 * @param declaration - the package's `dsh.client` object.
 * @returns the requested specifiers, empty when the package declares none.
 * @throws {Error} when `external` is not a string array.
 */
export declare function requestedExternals(subject: string, declaration: {
    readonly external?: unknown;
}): ReadonlySet<string>;
export {};
//# sourceMappingURL=tsdown.client.d.ts.map