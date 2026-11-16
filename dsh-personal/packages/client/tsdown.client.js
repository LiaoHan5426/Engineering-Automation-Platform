/**
 * Shared tsdown preset for UI plugin client bundles. Emits a closure-factory
 * artifact: the bundle calls window.__ModuleLoader__.load({id, factory, meta})
 * and resolves externals through the injected require (loader module table —
 * cordis DI entities, no globals, no import map). CSS is compiled by
 * lightningcss inside the bundle: `x.module.css` yields its hashed class map
 * while each output chunk exposes deferred stylesheet text through its metadata
 * factory. `x.css?inline` exports compiled text without registering a resource. The virtual
 * loaders register each real stylesheet as a watch dependency. Images under
 * `src/client/assets/`, imported from Client code or referenced by relative
 * `url()` in the package's own stylesheets, are emitted under `lib/assets/`
 * with their content revision in the file name and become document-relative
 * URLs served by the
 * client-modules asset route; such a package exports `./assets/*` as
 * `./lib/assets/*`, and its Node Client face rejects asset imports.
 * Non-experimental client outputs reject experimental module and stylesheet
 * inputs, including origins recorded by chained source maps.
 */
import { createHash, randomBytes } from 'node:crypto';
import { parse as parseSfc, compileScript, compileStyle } from '@vue/compiler-sfc';
import { readFile, readdir, rm, rmdir, stat, utimes } from 'node:fs/promises';
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { createRequire, isBuiltin } from 'node:module';
import { basename, dirname, isAbsolute, join, posix, relative, resolve as resolvePath, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Rolldown } from 'tsdown';
import { transform } from 'lightningcss';
import { PACKAGE_ASSET_EXPORT, PACKAGE_ASSET_EXPORT_TARGET, PACKAGE_ASSET_FILES_ENTRY, PACKAGE_ASSET_MEDIA_TYPES, packageAssetMediaType, packageAssetReference, packageAssetRevision, packageAssetRevisionedPath, } from "./modules/src/assets.js";
import { optionalStringArray } from "./modules/src/client/manifest.js";
import { PLATFORM_MODULES, PRELOADED_CLIENT_EXTERNALS, STATIC_MODULE_MANIFEST_EXPORT } from "./web/src/platform.js";
import { clientBuildEnvironmentDefines, clientBuildValueDefines } from "../../scripts/client-build-environment.js";
import { isExperimentalPackageName } from "../../scripts/experimental-package-policy.js";
import { BundleInputIsolation, physicalBundleInput } from "../../scripts/bundle-input-isolation.js";
/**
 * Virtual-id wrapper keeping module CSS away from tsdown's own css pipeline
 * (which requires @tsdown/css). The suffix matters: tsdown's guard matches ids
 * ending in `.css`, so the virtual id must not.
 */
const CSS_VIRTUAL_PREFIX = '\0dsh-css:';
const GLOBAL_CSS_VIRTUAL_PREFIX = '\0dsh-global-css:';
const INLINE_CSS_VIRTUAL_PREFIX = '\0dsh-inline-css:';
const CSS_VIRTUAL_SUFFIX = '.mjs';
const INLINE_CSS_QUERY = '?inline';
/**
 * Name a compiled stylesheet by its path within the importing package: the package's own files by their
 * `src`-relative path, and a dependency's file as `node_modules/<package>/<path>`.
 * @param id - Importing package, used in diagnostics.
 * @param packageDir - Importing package directory.
 * @param fileId - Physical stylesheet path.
 * @param expression - Compiled stylesheet text expression.
 * @returns The stylesheet's metadata key and expression.
 */
function compiledClientStyle(id, packageDir, fileId, expression) {
    // Rolldown canonicalizes module ids through symbolic links; the package directory arrives as the caller wrote it.
    const file = realpathSync(fileId);
    const local = pathBelow(realpathSync(packageDir), file);
    if (local !== undefined)
        return { path: local.split(sep).join('/').replace(/^lib\/types\//, 'src/'), expression };
    let directory = dirname(file);
    while (dirname(directory) !== directory) {
        const manifestPath = join(directory, 'package.json');
        if (existsSync(manifestPath)) {
            const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
            if (typeof manifest.name === 'string') {
                return { path: `node_modules/${manifest.name}/${relative(directory, file).split(sep).join('/')}`, expression };
            }
        }
        directory = dirname(directory);
    }
    throw new Error(`tsdown: ${id}: stylesheet ${fileId} has no package owner`);
}
/**
 * Contract layers and pure folds a client bundle may inline: browser-safe
 * values with no runtime identity to share (no Symbol/instanceof/singleton state).
 * Everything else under @deepseek-ai/* is either a module-table entry
 * (external) or a leak the purity gate rejects.
 */
export const INLINE_SAFE = /^(?:@deepseek-ai\/dsh-(?:file-reference|fs-patch|session|llm|tools|brand|error|official-bundles|deque|output-retention|typert-protocol|util-crypto|util-text-search|util-time|util-values|util-workspace-path)(?:\/|$)|@deepseek-ai\/dsh-util-file-drag$|@deepseek-ai\/dsh-token-meter\/client$|@deepseek-ai\/dsh-commands\/builtin$|@deepseek-ai\/dsh-native-command\/types$|@deepseek-ai\/dsh-host-open-in-app\/shared$|@deepseek-ai\/dsh-plugin-manager\/registry$|@deepseek-ai\/dsh-agent-preset-registry\/display$|@deepseek-ai\/dsh-api-workspace-controller\/default-workspace$|@deepseek-ai\/dsh-spill-policy\/notice$)/;
/**
 * Vendored framework libraries: rescoped into @deepseek-ai, so the gate below
 * would read them as plugin packages. They carry no cross-plugin runtime
 * identity to share — the framework itself is a requested module-table row
 * (external), while these are ordinary libraries a browser bundle inlines.
 */
const VENDORED_LIBRARY = /^@deepseek-ai\/(?:(?:cosmokit|schemastery)(?:\/|$)|cordis-plugin-timer$)/;
/** Generated descriptor/codec contribution with no shared runtime identity. */
const GENERATED_REMOTE = /^@deepseek-ai\/dsh-[a-z0-9]+(?:-[a-z0-9]+)*\/remote$/;
/**
 * Workspace mode replaces an empty config array with the root defaults. A
 * falsey entry instead removes this package before entry resolution.
 */
const SKIP_WORKSPACE_BUILD = { entry: '' };
const REPOSITORY_ROOT = fileURLToPath(new URL('../..', import.meta.url));
/** Rebase a physical lib-relative source onto a browser URL that mirrors the repository directories. */
function browserSourcePath(source, sourcemapPath) {
    if (!source.startsWith('.'))
        return source;
    const physicalSource = resolvePath(dirname(sourcemapPath), source);
    const repositoryPath = relative(REPOSITORY_ROOT, physicalSource).split(sep).join('/');
    return repositoryPath.startsWith('packages/') ? `../../../${repositoryPath}` : source;
}
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
export function clientBundle(packageDir, libEntry, options = {}) {
    const manifest = readPackageManifest(packageDir);
    const lib = clientLibraryConfig(manifest, libEntry, options.lib);
    return ({ env }) => {
        const face = buildFace(env?.DSH_BUILD_FACE);
        const clientEntry = 'src/client/index.ts';
        const client = clientConfig(manifest, packageDir, clientEntry, options.clientBanner, options.dualClient === true);
        const node = [lib, ...(options.companions ?? [])];
        const clientFaces = options.dualClient === true
            ? [nodeClientConfig(manifest, clientEntry), client]
            : [client];
        if (face === 'host')
            return options.hostPhase === true ? node : [SKIP_WORKSPACE_BUILD];
        if (face === 'client') {
            return options.hostPhase === true ? clientFaces : [...node.map(config => clientSourceConfig(packageDir, config)), ...clientFaces];
        }
        return [...node.map(config => clientSourceConfig(packageDir, config)), ...clientFaces];
    };
}
/**
 * Build one statically delivered Client module as an ESM manifest in `lib/index.js`.
 * Shared workspace dependencies resolve through the module loader; third-party
 * imports remain ESM dependencies of the final shell build.
 * @param packageDir - Package directory containing the module's package.json.
 * @param libEntry - Single emitted index entry consumed from `lib/types`.
 * @returns ENV-selected config for the Client build face.
 * @throws {Error} when the package manifest or index entry is invalid.
 */
export function staticLinked(packageDir, libEntry) {
    const manifest = readPackageManifest(packageDir);
    const entry = libEntry[0];
    if (libEntry.length !== 1 || entry === undefined || basename(entry, '.js') !== 'index') {
        throw new Error(`tsdown: ${manifest.name} staticLinked requires one index entry`);
    }
    return clientOnly([clientSourceConfig(packageDir, staticManifestConfig(manifest.name, packageDir, entry))]);
}
/**
 * Build native ESM bootstrap entries whose CSS loads before the module renderer.
 * Bare imports remain available for the final shell bundle to resolve.
 * @param packageDir - Package directory containing the shell's package.json.
 * @param libEntry - Emitted JavaScript entries, each with a distinct output basename.
 * @returns ENV-selected configs for the Client build face.
 */
export function clientShell(packageDir, libEntry) {
    const { name } = readPackageManifest(packageDir);
    const names = new Set(libEntry.map(entry => basename(entry, '.js')));
    if (names.size !== libEntry.length) {
        throw new Error(`tsdown: ${name} entries collide on an output name: ${libEntry.join(', ')}`);
    }
    return clientOnly(libEntry.map(entry => clientSourceConfig(packageDir, staticLinkedConfig(name, entry))));
}
/**
 * Whether a package's tsdown configs put it in the static assembly channel.
 * The roster has no separate list: gates load each package's own
 * `tsdown.config.ts`, call it for the Client face, and ask this.
 * @param configs - configs a package's build-face function returned.
 * @returns true when at least one config belongs to static module or shell assembly.
 */
export function isStaticLinkedConfig(configs) {
    return configs.some(config => (config.plugins ?? [])
        .some(plugin => plugin.name === STATIC_LINKED_PLUGIN));
}
/**
 * Build a Client-only Node library during the Client pass.
 * @param packageDir - The package's own directory, normally the config's
 * `import.meta.dirname`; its `package.json` name is used in tsdown diagnostics.
 * @param libEntry - Emitted JavaScript entries consumed from `lib/types`.
 * @returns ENV-selected tsdown config for the Client build face.
 * @throws {Error} when `<packageDir>/package.json` is unreadable or declares no name.
 */
export function clientLibrary(packageDir, libEntry) {
    const lib = clientLibraryConfig(readPackageManifest(packageDir), libEntry);
    return clientOnly([clientSourceConfig(packageDir, lib)]);
}
/**
 * Select arbitrary package-local configs only during the Client pass.
 * @param configs - Node-side configs emitted after Client tsc.
 * @returns ENV-selected tsdown config for the Client build face.
 */
export function clientOnly(configs) {
    return ({ env }) => buildFace(env?.DSH_BUILD_FACE) === 'host'
        ? [SKIP_WORKSPACE_BUILD]
        : [...configs];
}
function buildFace(value) {
    if (value === undefined || value === 'host' || value === 'client')
        return value;
    throw new Error(`tsdown: --env.DSH_BUILD_FACE must be host or client, received ${String(value)}`);
}
/** Client declarations have no JavaScript intermediate; runtime entries compile their owning source. */
function clientSourceConfig(packageDir, config) {
    const sourceEntry = (entry) => {
        const normalized = relative(packageDir, resolvePath(packageDir, entry)).split(sep).join('/');
        if (!normalized.startsWith('lib/types/'))
            return entry;
        const stem = normalized.slice('lib/types/'.length).replace(/\.[cm]?jsx?$/, '');
        for (const extension of ['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx']) {
            const source = resolvePath(packageDir, 'src', stem + extension);
            if (existsSync(source))
                return `src/${stem}${extension}`;
        }
        throw new Error(`tsdown: no Client source for ${entry} in ${packageDir}`);
    };
    const sourceEntryGroup = (entry) => typeof entry === 'string' ? sourceEntry(entry)
        : Object.fromEntries(Object.entries(entry).map(([name, files]) => [
            name, Array.isArray(files) ? files.map(sourceEntry) : sourceEntry(files),
        ]));
    const entry = config.entry;
    if (entry === undefined)
        return config;
    return {
        ...config,
        entry: Array.isArray(entry) ? entry.map(sourceEntryGroup) : sourceEntryGroup(entry),
    };
}
function clientLibraryConfig(manifest, libEntry, overrides = {}) {
    let externals;
    const isProductionDependency = (specifier) => matchesSpecifier(externals ??= productionExternals(manifest), specifier);
    return {
        name: manifest.name,
        entry: [...libEntry],
        outDir: 'lib',
        format: ['esm'],
        platform: 'node',
        target: 'es2024',
        fixedExtension: false,
        dts: false,
        clean: false,
        // Public client build values are fixed into the Node half as they are into the browser half.
        define: clientBuildValueDefines(process.env),
        deps: {
            // The Node half runs from a real install: a production dependency is on
            // disk there and stays an import, everything else inlines. Stating both
            // halves takes the artifact off tsdown's getProductionDeps fallback, where
            // moving a dependency between npm sections silently re-bundles it.
            // Builtins keep tsdown's own handling (neither side claims them).
            neverBundle: isProductionDependency,
            alwaysBundle: (specifier) => !isBuiltin(specifier) && !isProductionDependency(specifier),
        },
        ...overrides,
    };
}
function staticLinkedConfig(id, entry, outputName = basename(entry, '.js')) {
    const emitted = new Set();
    const isolation = clientInputIsolation(id);
    return {
        name: id,
        entry: { [outputName]: entry },
        outDir: 'lib',
        format: ['esm'],
        platform: 'browser',
        target: 'es2024',
        // Resolve the mode before this intermediate bundle removes conditional branches.
        define: { 'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV ?? 'production') },
        fixedExtension: false,
        dts: false,
        clean: false,
        // The shell compiles this artifact, so its map is the only path from a
        // browser stack frame back to the TSX (tsc emits the lib/types half).
        sourcemap: true,
        outputOptions: {
            sourcemapExcludeSources: false,
            sourcemapPathTransform: isolation.sourcePath,
        },
        plugins: [{
                // Resolve before tsdown's dependency plugin so the shell retains bare
                // imports independently of npm dependency sections. The name also marks
                // this config for the static assembly roster.
                name: STATIC_LINKED_PLUGIN,
                resolveId: {
                    order: 'pre',
                    handler(source, importer) {
                        // An entry arrives without an importer and must stay internal.
                        if (importer === undefined)
                            return null;
                        return isBareSpecifier(source) ? { id: source, external: true } : null;
                    },
                },
            }, tscSourceMapPlugin(), isolation.plugin, {
                // Preserve stylesheet imports for the shell's final CSS build.
                name: 'dsh-css-asset',
                async resolveId(source, importer) {
                    if (!source.endsWith('.css') || importer === undefined)
                        return null;
                    const { file, fileName } = stylesheetAsset(source, importer);
                    if (!emitted.has(fileName)) {
                        emitted.add(fileName);
                        // originalFileName also puts the physical sheet in the watch graph.
                        this.emitFile({ type: 'asset', fileName, source: await readFile(file), originalFileName: file });
                    }
                    // Every emitted chunk sits at the lib/ root, so the src-relative name
                    // is what resolves from there. Rolldown keeps relative externals as
                    // written instead of re-normalizing them.
                    return { id: `./${fileName}`, external: true };
                },
            }],
    };
}
/**
 * An ordinary ESM library with one more export, the {@link STATIC_MODULE_MANIFEST_EXPORT} manifest. Every import stays
 * for the shell build, including third-party stylesheets; one that names a module-table entry also leaves a `require`
 * call in the manifest factory, as in a dynamic bundle, so Modules records the dependency. The package's own CSS
 * imports become the manifest's deferred stylesheet metadata instead of installing styles.
 */
function staticManifestConfig(id, packageDir, entry) {
    const config = staticLinkedConfig(id, entry, 'index');
    const styles = new Map();
    const imports = new Map();
    const emitted = new Set();
    const sourceRoot = realDirectory(resolvePath(packageDir, 'src'));
    const resource = (context, file) => {
        const real = realpathSync(file);
        context.addWatchFile(real);
        const local = pathBelow(sourceRoot, real);
        if (local !== undefined) {
            const name = local.split(sep).join('/');
            if (!emitted.has(name)) {
                emitted.add(name);
                context.emitFile({ type: 'asset', fileName: name, source: readFileSync(real), originalFileName: real });
            }
            return `new URL(${JSON.stringify(`./${name}`)}, import.meta.url).href`;
        }
        let directory = dirname(real);
        while (dirname(directory) !== directory) {
            const manifestPath = join(directory, 'package.json');
            if (existsSync(manifestPath)) {
                const owner = JSON.parse(readFileSync(manifestPath, 'utf8'));
                if (typeof owner.name === 'string') {
                    const specifier = `${owner.name}/${relative(directory, real).split(sep).join('/')}?url`;
                    let binding = imports.get(specifier);
                    if (binding === undefined) {
                        binding = `__dshStaticAsset${imports.size}`;
                        imports.set(specifier, binding);
                    }
                    return binding;
                }
            }
            directory = dirname(directory);
        }
        throw new Error(`tsdown: ${id}: asset ${file} has no package owner`);
    };
    const css = {
        name: 'dsh-static-css-metadata',
        buildStart() { styles.clear(); imports.clear(); emitted.clear(); },
        resolveId: {
            order: 'pre',
            handler(source, importer) {
                if (importer === undefined)
                    return null;
                const file = source.endsWith(INLINE_CSS_QUERY) ? source.slice(0, -INLINE_CSS_QUERY.length) : source;
                // A third-party stylesheet stays a bare import, so the shell's Vite build applies its own processing.
                if (!file.endsWith('.css') || isBareSpecifier(file))
                    return null;
                const resolved = sourceAssetPath(file, importer);
                return (source.endsWith(INLINE_CSS_QUERY) ? INLINE_CSS_VIRTUAL_PREFIX : CSS_VIRTUAL_PREFIX) + resolved + CSS_VIRTUAL_SUFFIX;
            },
        },
        async load(virtualId) {
            const inline = virtualId.startsWith(INLINE_CSS_VIRTUAL_PREFIX);
            if (!inline && !virtualId.startsWith(CSS_VIRTUAL_PREFIX))
                return null;
            const file = virtualId.slice((inline ? INLINE_CSS_VIRTUAL_PREFIX : CSS_VIRTUAL_PREFIX).length, -CSS_VIRTUAL_SUFFIX.length);
            this.addWatchFile(file);
            const references = new Map();
            const nonce = randomBytes(8).toString('hex');
            const rewrite = (url) => {
                if (url.url === '' || url.url.startsWith('#') || url.url.startsWith('/') || URL_SCHEME.test(url.url))
                    return undefined;
                const parts = /^([^?#]+)(.*)$/.exec(url.url);
                const expression = resource(this, resolvePath(dirname(file), decodeURIComponent(parts[1])));
                const marker = `__dshStaticCss_${nonce}_${references.size}__`;
                references.set(marker, parts[2] === '' ? expression : `(${expression} + ${JSON.stringify(parts[2])})`);
                return { ...url, url: marker };
            };
            const result = transform({ filename: file, code: await readFile(file), minify: true,
                ...(file.endsWith('.module.css') ? { cssModules: { pattern: '[hash]_[local]' } } : {}),
                visitor: {
                    Url: rewrite,
                    Image(image) {
                        if (image.type !== 'image-set')
                            return undefined;
                        return { ...image, value: { ...image.value, options: image.value.options.map(option => {
                                    const url = option.image.type === 'url' ? rewrite(option.image.value) : undefined;
                                    return url === undefined ? option : { ...option, image: { type: 'url', value: url } };
                                }) } };
                    },
                },
            });
            const text = result.code.toString();
            const pieces = [];
            let last = 0;
            if (references.size > 0)
                for (const match of text.matchAll(new RegExp([...references.keys()].join('|'), 'gu'))) {
                    pieces.push(JSON.stringify(text.slice(last, match.index)), references.get(match[0]));
                    last = match.index + match[0].length;
                }
            pieces.push(JSON.stringify(text.slice(last)));
            const expression = pieces.join(' + ');
            if (inline)
                return `export default ${expression};`;
            const classMap = Object.fromEntries(Object.entries(result.exports ?? {}).sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => [key, value.name]));
            styles.set(virtualId, compiledClientStyle(id, packageDir, file, expression));
            return { code: `export default ${JSON.stringify(classMap)};`, moduleSideEffects: 'no-treeshake' };
        },
    };
    const envelope = {
        name: 'dsh-static-module-manifest',
        renderChunk(code, chunk) {
            if (!chunk.isEntry)
                throw new Error(`tsdown: ${id}: static module unexpectedly emitted ${chunk.fileName}`);
            const output = new Rolldown.RolldownMagicString(code);
            const imported = [];
            const getters = [];
            const stars = [];
            // Each module-table import also leaves a require in the factory, so Modules records the dependency.
            const required = new Set();
            const table = (specifier) => {
                if (PLATFORM_MODULES.includes(specifier))
                    required.add(specifier);
            };
            let exportObject = '__dshModuleExports';
            while (code.includes(exportObject))
                exportObject += '_';
            const key = (name) => name.type === 'Identifier' ? name.name : String(name.value);
            const getter = (exported, value) => {
                if (exported === STATIC_MODULE_MANIFEST_EXPORT)
                    throw new Error(`tsdown: ${id}: ${exported} is reserved for the module manifest`);
                getters.push(`${JSON.stringify(exported)}: { enumerable: true, get: () => ${value} }`);
            };
            // The ordinary exports stay as written; the manifest factory returns live views of the same bindings.
            for (const statement of this.parse(code).body) {
                if (statement.type === 'ImportDeclaration') {
                    table(String(statement.source.value));
                }
                else if (statement.type === 'ExportNamedDeclaration') {
                    if (statement.declaration !== null)
                        throw new Error(`tsdown: ${id}: unsupported generated declaration export`);
                    let source;
                    if (statement.source !== null) {
                        table(String(statement.source.value));
                        source = `__dshReexport${imported.length}`;
                        imported.push(`import * as ${source} from ${JSON.stringify(String(statement.source.value))};`);
                    }
                    for (const specifier of statement.specifiers) {
                        getter(key(specifier.exported), source === undefined ? key(specifier.local) : `${source}[${JSON.stringify(key(specifier.local))}]`);
                    }
                }
                else if (statement.type === 'ExportAllDeclaration') {
                    table(String(statement.source.value));
                    const binding = `__dshReexport${imported.length}`;
                    imported.push(`import * as ${binding} from ${JSON.stringify(String(statement.source.value))};`);
                    if (statement.exported !== null)
                        getter(key(statement.exported), binding);
                    else
                        stars.push(binding);
                }
                else if (statement.type === 'ExportDefaultDeclaration') {
                    throw new Error(`tsdown: ${id}: unsupported generated default declaration`);
                }
            }
            for (const [source, binding] of imports)
                imported.push(`import ${binding} from ${JSON.stringify(source)};`);
            const resources = Object.keys(chunk.modules).flatMap(module => {
                const style = styles.get(module);
                return style === undefined ? [] : [`${JSON.stringify(style.path)}: { text: (context) => ${style.expression} }`];
            });
            if (imported.length > 0)
                output.prepend(`${imported.join('\n')}\n`);
            const starExports = stars.map(binding => `for (const key of Object.keys(${binding})) if (key !== 'default' && !Object.hasOwn(${exportObject}, key)) Object.defineProperty(${exportObject}, key, { enumerable: true, get: () => ${binding}[key] });`).join('\n');
            const metadata = resources.length === 0 ? '' : `, meta: () => ({ stylesheets: {${resources.join(',')}} })`;
            const requires = [...required].map(specifier => `require(${JSON.stringify(specifier)});\n`).join('');
            output.append(`\nexport const ${STATIC_MODULE_MANIFEST_EXPORT} = { id: ${JSON.stringify(id)}, factory: (require) => {\n${requires}`
                + `const ${exportObject} = Object.defineProperties({}, {${getters.join(',')}});\n${starExports}\nreturn ${exportObject};\n}${metadata} };\n`);
            return output;
        },
    };
    config.plugins = [css, ...config.plugins.filter(plugin => plugin.name !== 'dsh-css-asset'), envelope];
    return config;
}
/** Whether a specifier names a package rather than a file next to its importer. */
function isBareSpecifier(specifier) {
    return !specifier.startsWith('.') && !specifier.startsWith('\0') && !isAbsolute(specifier);
}
/**
 * Locate a stylesheet import against the package sources and name its emitted position.
 * @param source - relative import specifier as written in the source.
 * @param importer - absolute path of the importing module, emitted or source.
 * @returns the stylesheet on disk plus its `src`-relative name under `lib/`.
 */
function stylesheetAsset(source, importer) {
    const file = sourceAssetPath(source, importer);
    const boundary = file.lastIndexOf(SOURCE_MARKER);
    if (boundary < 0)
        throw new Error(`tsdown: stylesheet ${file} is outside the package sources`);
    return { file, fileName: file.slice(boundary + SOURCE_MARKER.length).split(sep).join('/') };
}
/**
 * Read the manifest of the package whose config calls a preset. The caller
 * passes its directory because tsdown evaluates every package config with the
 * repository root as `process.cwd()` during a workspace build.
 * @param packageDir - the package's own directory.
 * @returns the parsed manifest.
 * @throws {Error} when `package.json` is unreadable, is not JSON, or declares no string name.
 */
function readPackageManifest(packageDir) {
    const manifestPath = resolvePath(packageDir, 'package.json');
    let parsed;
    try {
        parsed = JSON.parse(readFileSync(manifestPath, 'utf8'));
    }
    catch (error) {
        throw new Error(`tsdown: cannot read ${manifestPath}; pass the package directory (the import.meta.dirname of its tsdown.config.ts)`, { cause: error });
    }
    if (typeof parsed !== 'object' || parsed === null || !('name' in parsed) || typeof parsed.name !== 'string') {
        throw new Error(`tsdown: ${manifestPath} declares no string package name`);
    }
    return parsed;
}
/**
 * External patterns for one package's Node half: its own production sections,
 * subpaths included.
 * @param manifest - the package's own manifest.
 * @returns one `^name(/|$)` pattern per production dependency, name-sorted.
 */
function productionExternals(manifest) {
    const names = new Set([
        ...Object.keys(manifest.dependencies ?? {}),
        ...Object.keys(manifest.peerDependencies ?? {}),
        ...Object.keys(manifest.optionalDependencies ?? {}),
    ]);
    return [...names].sort().map(name => new RegExp(`^${escapeSpecifier(name)}(/|$)`));
}
/**
 * Module-table specifiers one `dsh.client` declaration requests. Matching is
 * exact, never normalized: a package declares the specifier its own code
 * imports, and the loader keys static entries the same way.
 * @param subject - package name, used in diagnostics.
 * @param declaration - the package's `dsh.client` object.
 * @returns the requested specifiers, empty when the package declares none.
 * @throws {Error} when `external` is not a string array.
 */
export function requestedExternals(subject, declaration) {
    return new Set(optionalStringArray(subject, 'dsh.client.external', declaration.external) ?? []);
}
/**
 * Module-table specifiers one package requests. The shell baseline is implicit
 * for every dynamic bundle; `dsh.client.external` only adds package-specific
 * dynamic rows or subpaths.
 * @param manifest - the package's own manifest, whose `dsh.client` declaration adds requests.
 * @returns the baseline plus the package's explicit requests.
 */
function clientExternals(manifest) {
    return new Set([
        ...PLATFORM_MODULES,
        ...PRELOADED_CLIENT_EXTERNALS,
        ...requestedExternals(manifest.name, manifest.dsh?.client ?? {}),
    ]);
}
/** Escape a package name for literal use inside a RegExp source. */
function escapeSpecifier(name) {
    return name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
/** Whether an import specifier is the package a pattern names, or one of its subpaths. */
function matchesSpecifier(patterns, specifier) {
    return patterns.some(pattern => pattern.test(specifier));
}
/** Render package-local dynamic imports through the Client module loader's asynchronous operation. */
function asyncChunkRequirePlugin() {
    return {
        name: 'dsh-client-async-chunk-require',
        renderChunk(code, chunk, outputOptions) {
            if (outputOptions.format !== 'cjs')
                return null;
            const transformed = new Rolldown.RolldownMagicString(code);
            for (const dynamicImport of chunk.dynamicImports) {
                const fileName = dynamicImport.startsWith('./') ? dynamicImport.slice(2) : dynamicImport;
                if (!/^client\.[A-Za-z0-9][A-Za-z0-9._-]*\.js$/.test(fileName))
                    continue;
                const specifier = `./${fileName}`;
                const call = new RegExp(`Promise\\.resolve\\(\\)\\.then\\(\\(\\)\\s*=>\\s*require\\((['"])${escapeSpecifier(specifier)}\\1\\)\\)`, 'gu');
                const matches = [...code.matchAll(call)];
                if (matches.length === 0) {
                    throw new Error(`client bundle compiler: dynamic chunk ${JSON.stringify(specifier)} has no generated import expression`);
                }
                for (const match of matches) {
                    transformed.overwrite(match.index, match.index + match[0].length, `require.async(${JSON.stringify(specifier)})`);
                }
            }
            return transformed.hasChanged() ? transformed : null;
        },
        async writeBundle(outputOptions, bundle) {
            const entry = Object.values(bundle).find(output => output.type === 'chunk' && output.isEntry);
            if (entry === undefined || outputOptions.dir === undefined)
                return;
            const entryPath = resolvePath(outputOptions.dir, entry.fileName);
            const current = await stat(entryPath);
            const completedAt = new Date(Math.max(Date.now(), current.mtimeMs + 1));
            await utimes(entryPath, current.atime, completedAt);
        },
    };
}
/** Emitted asset directory below the browser config's `lib` outDir, published as {@link PACKAGE_ASSET_FILES_ENTRY}. */
const ASSET_OUTPUT_DIR = posix.relative('lib', PACKAGE_ASSET_FILES_ENTRY);
/** Characters the asset route rejects in a decoded path segment, because Node resolves export subpaths as URL text. */
const UNSERVABLE_ASSET_SEGMENT = /[%#?\\\0]/;
/** A `url()` value with a scheme, such as `data:` or `https:`, which names no package file. */
const URL_SCHEME = /^[a-z][a-z\d+.-]*:/i;
/**
 * Free identifier an asset reference compiles to before rendering; the CommonJS
 * render turns each call into `require.asset(...)`, the module loader's
 * synchronous asset resolver, which returns the reference unchanged unless its
 * carrier maps it. The fixed hexadecimal suffix keeps plugin strings that happen
 * to contain the shorter prefix out of that rewrite, and keeps the source maps
 * that carry the loaded module text byte-stable across builds.
 */
const PACKAGE_ASSET_CALL = '__dshPackageAsset_5f8e2c1a9b7d';
/** Compile one asset reference into the resolver call. */
function packageAssetCall(reference) {
    return `${PACKAGE_ASSET_CALL}(${JSON.stringify(reference)})`;
}
/**
 * Compile stylesheet text into a JavaScript expression that passes each package-asset
 * reference the `url()` rewrite inserted through the resolver call. The rewrite writes
 * a placeholder of letters, digits, and underscores, which lightningcss never escapes,
 * with a per-stylesheet random part that stylesheet text cannot contain by chance.
 * A placeholder may appear several times or not at all, as when minification copies
 * or drops a declaration.
 * @param css - stylesheet text after the rewrite.
 * @param references - reference of each placeholder the rewrite inserted into this stylesheet.
 * @param resolver - Resolver expression in the generated factory's execution context.
 * @returns a string literal, or a concatenation of literals and resolver calls.
 */
function stylesheetSource(css, references, resolver = PACKAGE_ASSET_CALL) {
    if (references.size === 0)
        return JSON.stringify(css);
    const parts = [];
    let last = 0;
    for (const match of css.matchAll(new RegExp([...references.keys()].join('|'), 'gu'))) {
        const reference = JSON.stringify(references.get(match[0]));
        parts.push(JSON.stringify(css.slice(last, match.index)), `${resolver}(${reference})`);
        last = match.index + match[0].length;
    }
    parts.push(JSON.stringify(css.slice(last)));
    return parts.join(' + ');
}
/**
 * Build the package-asset rules of one dynamic browser bundle. A referenced
 * file must lie under the package's own `src/client/assets/`, have a supported
 * extension, and be published by the `./assets/*` export; it is emitted once
 * per build under `lib/assets/` at its relative path with the content revision
 * inserted before the extension, and the reference compiles to the module loader's
 * synchronous resolver call on its document-relative URL.
 * A one-shot build deletes files under `lib/assets/` that it did not emit; a
 * watch build keeps them for pages still running an earlier generation.
 * @param manifest - the package's own manifest, naming the URL owner and declaring the asset export.
 * @param packageDir - the package's own directory.
 * @returns the plugin and stylesheet visitor sharing the per-build emission record.
 */
function packageAssets(manifest, packageDir) {
    const name = manifest.name;
    const sourceDir = resolvePath(packageDir, 'src');
    const assetsDir = resolvePath(sourceDir, 'client', 'assets');
    /** Reference of every asset emitted in the current build, keyed by its real path. */
    const references = new Map();
    const reference = (context, file) => {
        let realPath;
        try {
            realPath = realpathSync(file);
        }
        catch (error) {
            throw new Error(`tsdown: ${name}: cannot resolve asset ${file}`, { cause: error });
        }
        const emitted = references.get(realPath);
        if (emitted !== undefined)
            return emitted;
        const below = pathBelow(realDirectory(assetsDir), realPath);
        if (below === undefined)
            throw new Error(`tsdown: ${name}: ${file} is outside src/client/assets; move the asset there`);
        const assetPath = below.split(sep).join('/');
        if (assetPath.split('/').some(segment => UNSERVABLE_ASSET_SEGMENT.test(segment) || segment.toLowerCase() === 'node_modules')) {
            throw new Error(`tsdown: ${name}: ${file} has a node_modules path segment or one containing %, #, ?, \\ or NUL, which the asset route cannot serve; rename it`);
        }
        const extension = posix.extname(assetPath);
        if (extension !== extension.toLowerCase()) {
            throw new Error(`tsdown: ${name}: ${file} has an uppercase extension; asset imports are typed by lowercase extensions, so rename it`);
        }
        if (manifest.exports?.[PACKAGE_ASSET_EXPORT] !== PACKAGE_ASSET_EXPORT_TARGET) {
            throw new Error(`tsdown: ${name}: ${file} needs package.json exports ${JSON.stringify({ [PACKAGE_ASSET_EXPORT]: PACKAGE_ASSET_EXPORT_TARGET })} `
                + `and ${JSON.stringify(PACKAGE_ASSET_FILES_ENTRY)} in files`);
        }
        if (packageAssetMediaType(assetPath) === undefined) {
            throw new Error(`tsdown: ${name}: ${file} is not a supported asset; supported extensions: ${[...PACKAGE_ASSET_MEDIA_TYPES.keys()].join(', ')}`);
        }
        const bytes = readFileSync(realPath);
        const emittedPath = packageAssetRevisionedPath(assetPath, packageAssetRevision(bytes));
        context.emitFile({ type: 'asset', fileName: `${ASSET_OUTPUT_DIR}/${emittedPath}`, source: bytes, originalFileName: realPath });
        context.addWatchFile(realPath);
        const url = packageAssetReference(name, emittedPath);
        references.set(realPath, url);
        return url;
    };
    return {
        plugin: {
            name: 'dsh-package-asset',
            buildStart() { references.clear(); },
            resolveId(source, importer) {
                if (importer === undefined || packageAssetMediaType(source) === undefined)
                    return null;
                return sourceAssetPath(source, importer);
            },
            load(id) {
                if (!isAbsolute(id) || packageAssetMediaType(id) === undefined)
                    return null;
                return `export default ${packageAssetCall(reference(this, id))};`;
            },
            renderChunk(code, _chunk, outputOptions) {
                if (outputOptions.format !== 'cjs' || !code.includes(PACKAGE_ASSET_CALL))
                    return null;
                const transformed = new Rolldown.RolldownMagicString(code);
                for (const match of code.matchAll(new RegExp(`\\b${PACKAGE_ASSET_CALL}\\(`, 'gu'))) {
                    transformed.overwrite(match.index, match.index + match[0].length, 'require.asset(');
                }
                return transformed;
            },
            async writeBundle(outputOptions, bundle) {
                // A watch rebuild keeps earlier files: the Host still serves the previous
                // bundle generation, and pages running it request those asset names.
                if (this.meta.watchMode || outputOptions.dir === undefined)
                    return;
                const outDir = outputOptions.dir;
                const assets = resolvePath(outDir, ASSET_OUTPUT_DIR);
                if (!existsSync(assets))
                    return;
                await pruneDirectory(assets, file => relative(outDir, file).split(sep).join('/') in bundle);
            },
        },
        urlRewrite(context, stylesheet) {
            const inserted = new Map();
            const nonce = randomBytes(6).toString('hex');
            if (pathBelow(realDirectory(sourceDir), realpathSync(stylesheet)) === undefined)
                return { options: {}, references: inserted };
            const base = dirname(stylesheet);
            const rewrite = (url) => {
                // Empty values, fragments, root-relative paths, schemes such as `data:`, and placeholders name no package file.
                if (url.url === '' || url.url.startsWith('#') || url.url.startsWith('/') || URL_SCHEME.test(url.url))
                    return undefined;
                if (inserted.has(url.url))
                    return undefined;
                if (/[#?]/u.test(url.url)) {
                    throw new Error(`tsdown: ${name}: ${stylesheet} references ${JSON.stringify(url.url)}; a package asset url() takes no fragment or query`);
                }
                const placeholder = `__dshPackageAsset_${nonce}_${String(inserted.size)}__`;
                inserted.set(placeholder, reference(context, resolvePath(base, url.url)));
                return { ...url, url: placeholder };
            };
            return {
                options: {
                    visitor: {
                        Url: url => rewrite(url),
                        // lightningcss does not visit the urls inside image-set(), so its options are rewritten here.
                        Image(image) {
                            if (image.type !== 'image-set')
                                return undefined;
                            const options = image.value.options.map((option) => {
                                const url = option.image.type === 'url' ? rewrite(option.image.value) : undefined;
                                return url === undefined ? option : { ...option, image: { type: 'url', value: url } };
                            });
                            return { ...image, value: { ...image.value, options } };
                        },
                    },
                },
                references: inserted,
            };
        },
    };
}
/**
 * Compile script-setup SFCs into the existing factory and deferred stylesheet protocol.
 * Supports inline JS/TS script setup, HTML templates, and plain/scoped CSS. Rejects
 * CSS Modules, external blocks, preprocessors, ordinary scripts, and template-only SFCs.
 */
function clientVuePlugin(id, packageDir, styles, assets) {
    return {
        name: 'dsh-client-vue',
        resolveId(source, importer) {
            if (!source.endsWith('.vue') || importer === undefined)
                return null;
            return sourceAssetPath(source, importer);
        },
        async load(file) {
            if (!file.endsWith('.vue'))
                return null;
            this.addWatchFile(file);
            const source = await readFile(file, 'utf8');
            const fail = (message) => {
                throw new Error(`tsdown: ${id}: ${file}: ${message}`);
            };
            const { descriptor, errors } = parseSfc(source, { filename: file, sourceMap: true });
            if (errors.length > 0)
                fail(errors.map(error => String(error)).join('\n'));
            if (descriptor.script !== null || descriptor.scriptSetup === null) {
                fail('Vue client components require <script setup>; ordinary <script> and template-only SFCs are not supported');
            }
            if (descriptor.scriptSetup?.src !== undefined || descriptor.template?.src !== undefined) {
                fail('external Vue script and template blocks are not supported');
            }
            const language = descriptor.scriptSetup?.lang;
            if (language !== undefined && language !== 'ts' && language !== 'js')
                fail(`unsupported Vue script language ${language}`);
            if (descriptor.template?.lang !== undefined && descriptor.template.lang !== 'html')
                fail('Vue template preprocessors are not supported');
            for (const style of descriptor.styles) {
                if (style.module !== undefined)
                    fail('Vue <style module> is not supported; import a .module.css stylesheet instead');
                if (style.src !== undefined)
                    fail('external Vue style blocks are not supported; import a stylesheet from <script setup> instead');
                if (style.lang !== undefined && style.lang !== 'css')
                    fail('Vue style preprocessors are not supported');
            }
            // Source-relative identity remains stable across machines, emitted/source entry modes, and edits.
            const scopeId = `data-v-${createHash('sha256').update(`${id}/${relative(packageDir, file).split(sep).join('/')}`).digest('hex').slice(0, 12)}`;
            const isProduction = (process.env.NODE_ENV ?? 'production') !== 'development';
            const script = compileScript(descriptor, {
                id: scopeId,
                genDefaultAs: '__dshSfc',
                inlineTemplate: true,
                sourceMap: true,
                isProd: isProduction,
                templateOptions: { transformAssetUrls: true },
            });
            for (const dependency of script.deps ?? [])
                this.addWatchFile(dependency);
            const sheets = [];
            for (const style of descriptor.styles) {
                const compiled = compileStyle({ source: style.content, filename: file, id: scopeId, scoped: style.scoped === true, isProd: isProduction });
                if (compiled.errors.length > 0)
                    fail(compiled.errors.map(error => String(error)).join('\n'));
                const stylesheetAssets = assets.urlRewrite(this, file);
                const result = transform({ filename: file, code: Buffer.from(compiled.code), minify: true, ...stylesheetAssets.options });
                sheets.push(stylesheetSource(result.code.toString(), stylesheetAssets.references, 'context.asset'));
            }
            styles.delete(file);
            if (sheets.length > 0)
                styles.set(file, compiledClientStyle(id, packageDir, file, sheets.join(' + "\\n" + ')));
            const scoped = descriptor.styles.some(style => style.scoped);
            return {
                code: `${script.content}\n${scoped ? `__dshSfc.__scopeId = ${JSON.stringify(scopeId)};\n` : ''}export default __dshSfc;`,
                map: script.map === undefined ? null : JSON.stringify(script.map),
                moduleType: language === 'ts' ? 'ts' : 'js',
            };
        },
    };
}
/** Real path of an existing directory, or undefined when it does not exist. */
function realDirectory(directory) {
    return existsSync(directory) ? realpathSync(directory) : undefined;
}
/**
 * Locate a real path strictly inside a real directory.
 * @param root - real directory path, or undefined when the directory does not exist.
 * @param file - real file path.
 * @returns the platform-separated path of `file` below `root`, or undefined when it is not inside.
 */
function pathBelow(root, file) {
    if (root === undefined)
        return undefined;
    const path = relative(root, file);
    return path === '' || path === '..' || path.startsWith(`..${sep}`) || isAbsolute(path) ? undefined : path;
}
/**
 * Delete every file a predicate rejects below a directory, then every directory left empty.
 * @param directory - directory to prune; removed itself when nothing remains.
 * @param keep - whether a file path survives.
 * @returns whether the directory was removed.
 */
async function pruneDirectory(directory, keep) {
    let remaining = 0;
    for (const entry of await readdir(directory, { withFileTypes: true })) {
        const path = join(directory, entry.name);
        if (entry.isDirectory()) {
            if (!(await pruneDirectory(path, keep)))
                remaining++;
        }
        else if (keep(path)) {
            remaining++;
        }
        else {
            await rm(path);
        }
    }
    if (remaining > 0)
        return false;
    await rmdir(directory);
    return true;
}
/**
 * Reject asset imports in a Node Client face, which has no asset route.
 * @param id - package name, used in diagnostics.
 * @returns a plugin whose resolveId throws for every supported asset extension.
 */
function browserOnlyAssets(id) {
    return {
        name: 'dsh-package-asset-browser-only',
        resolveId(source) {
            if (packageAssetMediaType(source) === undefined)
                return null;
            throw new Error(`tsdown: ${id}: asset imports are browser-only (${source})`);
        },
    };
}
/** Bundle the Client entry for plain Node independently of the Host entry and browser factory. */
function nodeClientConfig(manifest, entry) {
    const isolation = clientInputIsolation(manifest.name);
    return clientLibraryConfig(manifest, [entry], {
        name: `${manifest.name}/client-node`,
        entry: { 'client.node': entry },
        sourcemap: true,
        inputOptions: { resolve: { conditionNames: ['node', 'import', 'module', 'default'] } },
        plugins: [browserOnlyAssets(manifest.name), tscSourceMapPlugin(), isolation.plugin],
        outputOptions: {
            entryFileNames: 'client.node.js',
            chunkFileNames: 'client.node.[name].js',
            sourcemapExcludeSources: false,
            sourcemapPathTransform: isolation.sourcePath,
        },
    });
}
function clientConfig(manifest, packageDir, entry, clientBanner, dualClient = false) {
    const id = manifest.name;
    let requested;
    const isRequested = (specifier) => (requested ??= clientExternals(manifest)).has(specifier);
    const isolation = clientInputIsolation(id);
    const assets = packageAssets(manifest, packageDir);
    const styles = new Map();
    const packageRequire = createRequire(resolvePath(packageDir, 'package.json'));
    const resolveStylesheet = (source, importer) => isBareSpecifier(source)
        ? packageRequire.resolve(source)
        : importer === undefined ? source : sourceAssetPath(source, importer);
    const styleMarker = `/*__dshChunkStyles_${randomBytes(16).toString('hex')}__*/`;
    return {
        name: `${id}/client`,
        entry: { client: entry },
        // Browser bundle lands beside the Node artifacts. clean must stay off:
        // cleaning this invocation would wipe the independently emitted Node entry.
        outDir: 'lib',
        format: 'cjs',
        platform: 'browser',
        // Types ship from lib/types (tsc); dts here would wrap the banner/footer into .d.cts and break parsing.
        dts: false,
        // Plugin code is fetched outside Vite's module graph, so its own bundle
        // must carry the TS/TSX mapping consumed by browser profiling tools.
        sourcemap: true,
        // Compress the browser bundle's text while identifier names stay readable
        // and the source map still resolves through the published `src`. The
        // compressor stays off: the browser worker image lowers `yield*` only as a
        // whole statement, and a compressor that folds statements into expressions
        // hides it.
        minify: { compress: false, mangle: false },
        clean: false,
        deps: {
            neverBundle: isRequested,
            // Anything NOT requested from the loader module table must inline
            // (wire/type layers, clsx — every non-shared dep). A require() the
            // table cannot answer is a guaranteed runtime throw, so the rule is the
            // package's own request list: requested specifiers stay imports,
            // everything else is bundled.
            alwaysBundle: (specifier) => !isRequested(specifier),
        },
        // Dual-mode libraries (lexical's exports carry development/production/
        // node conditions; the node file picks its flavor with a top-level await
        // a CJS bundle cannot carry) resolve their static flavor matching the
        // NODE_ENV the defines below bake in.
        inputOptions: {
            resolve: {
                conditionNames: [
                    (process.env.NODE_ENV ?? 'production') === 'development' ? 'development' : 'production',
                    'browser', 'import', 'module', 'default',
                ],
            },
        },
        // Browser bundles inline node-idiom deps (zustand/immer read
        // process.env.NODE_ENV; zustand's esm build also probes
        // import.meta.env.MODE, which a CJS output cannot carry — rolldown flags
        // EMPTY_IMPORT_META). vite defined both on the seed path; tsdown inlining
        // needs the substitutions here or the factory throws ReferenceError at
        // boot / the build gate reds. Both keys honor the build's NODE_ENV so a
        // dev build keeps the dev-branch semantics; artifacts default to production.
        // The bare `import.meta.env` key is required alongside the precise MODE
        // key: zustand probes `import.meta.env ? import.meta.env.MODE : ...`, and
        // the truthiness probe would otherwise survive as an empty import.meta.
        define: {
            ...clientBuildEnvironmentDefines(process.env),
            'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV ?? 'production'),
            'import.meta.env.MODE': JSON.stringify(process.env.NODE_ENV ?? 'production'),
            'import.meta.env': JSON.stringify({ MODE: process.env.NODE_ENV ?? 'production' }),
        },
        plugins: [clientVuePlugin(id, packageDir, styles, assets), {
                // Bundle purity gate (build-time mirror of the module-edge rules): the
                // baseline and package-specific requests stay external, inline-safe wire layers
                // inline, and every other @deepseek-ai value import is a build error — a
                // cross-plugin value import either inlines a duplicate runtime instance
                // or requires a specifier the module table cannot answer for this package.
                // Cross-plugin collaboration goes through cordis services instead.
                name: 'dsh-client-bundle-purity',
                resolveId(source) {
                    if (!source.startsWith('@deepseek-ai/'))
                        return null;
                    if (isRequested(source))
                        return null; // requested module-table row: external wins
                    if (VENDORED_LIBRARY.test(source))
                        return null; // vendored library: inline, no shared identity
                    if (INLINE_SAFE.test(source) || GENERATED_REMOTE.test(source))
                        return null; // wire contribution: inline is the point
                    throw new Error(`client bundle purity: "${source}" is not in the default client externals or ${id}'s dsh.client.external, an inline-safe wire layer, or a generated /remote contribution — `
                        + 'cross-plugin value imports are forbidden; declare a non-default module request or collaborate through cordis services '
                        + '(type-only imports are erased and never reach this gate)');
                },
            }, tscSourceMapPlugin(), asyncChunkRequirePlugin(), isolation.plugin, {
                name: 'dsh-client-style-factory',
                renderChunk(code, chunk) {
                    const marker = code.indexOf(styleMarker);
                    if (marker < 0 || code.indexOf(styleMarker, marker + styleMarker.length) !== -1) {
                        throw new Error(`tsdown: ${id}: missing or repeated style factory marker in ${chunk.fileName}`);
                    }
                    const resources = new Map();
                    for (const moduleId of Object.keys(chunk.modules)) {
                        const style = styles.get(moduleId);
                        if (style !== undefined)
                            resources.set(style.path, style);
                    }
                    const expression = [...resources.values()].map(style => `${JSON.stringify(style.path)}: { text: (context) => ${style.expression} }`).join(',');
                    const output = new Rolldown.RolldownMagicString(code);
                    output.overwrite(marker, marker + styleMarker.length, resources.size === 0 ? '' : `, meta: () => ({ stylesheets: {${expression}} })`);
                    return output;
                },
            }, {
                name: 'dsh-css-modules-inline',
                resolveId(source, importer) {
                    if (!source.endsWith('.module.css'))
                        return null;
                    const abs = resolveStylesheet(source, importer);
                    return CSS_VIRTUAL_PREFIX + abs + CSS_VIRTUAL_SUFFIX;
                },
                async load(virtualId) {
                    if (!virtualId.startsWith(CSS_VIRTUAL_PREFIX))
                        return null;
                    const fileId = virtualId.slice(CSS_VIRTUAL_PREFIX.length, -CSS_VIRTUAL_SUFFIX.length);
                    // The virtual id otherwise hides the physical stylesheet from Rolldown's watch graph.
                    this.addWatchFile(fileId);
                    const source = await readFile(fileId);
                    const stylesheetAssets = assets.urlRewrite(this, fileId);
                    const { code, exports: cssExports } = transform({
                        filename: fileId,
                        code: source,
                        cssModules: { pattern: '[hash]_[local]' },
                        minify: true,
                        ...stylesheetAssets.options,
                    });
                    const classMap = {};
                    const exportEntries = Object.entries(cssExports ?? {})
                        .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));
                    for (const [local, exp] of exportEntries)
                        classMap[local] = exp.name;
                    styles.set(virtualId, compiledClientStyle(id, packageDir, fileId, stylesheetSource(code.toString(), stylesheetAssets.references, 'context.asset')));
                    return { code: `export default ${JSON.stringify(classMap)};`, moduleSideEffects: 'no-treeshake' };
                },
            }, {
                name: 'dsh-css-text-inline',
                resolveId(source, importer) {
                    if (!source.endsWith(`.css${INLINE_CSS_QUERY}`))
                        return null;
                    const stylesheet = source.slice(0, -INLINE_CSS_QUERY.length);
                    const abs = resolveStylesheet(stylesheet, importer);
                    return INLINE_CSS_VIRTUAL_PREFIX + abs + CSS_VIRTUAL_SUFFIX;
                },
                async load(virtualId) {
                    if (!virtualId.startsWith(INLINE_CSS_VIRTUAL_PREFIX))
                        return null;
                    const fileId = virtualId.slice(INLINE_CSS_VIRTUAL_PREFIX.length, -CSS_VIRTUAL_SUFFIX.length);
                    this.addWatchFile(fileId);
                    const source = await readFile(fileId);
                    const stylesheetAssets = assets.urlRewrite(this, fileId);
                    const { code } = transform({
                        filename: fileId,
                        code: source,
                        minify: true,
                        ...stylesheetAssets.options,
                    });
                    return `export default ${stylesheetSource(code.toString(), stylesheetAssets.references)};`;
                },
            }, {
                name: 'dsh-css-global-inline',
                resolveId(source, importer) {
                    if (!source.endsWith('.css') || source.endsWith('.module.css'))
                        return null;
                    const abs = resolveStylesheet(source, importer);
                    return GLOBAL_CSS_VIRTUAL_PREFIX + abs + CSS_VIRTUAL_SUFFIX;
                },
                async load(virtualId) {
                    if (!virtualId.startsWith(GLOBAL_CSS_VIRTUAL_PREFIX))
                        return null;
                    const fileId = virtualId.slice(GLOBAL_CSS_VIRTUAL_PREFIX.length, -CSS_VIRTUAL_SUFFIX.length);
                    this.addWatchFile(fileId);
                    const source = await readFile(fileId);
                    const stylesheetAssets = assets.urlRewrite(this, fileId);
                    const { code } = transform({ filename: fileId, code: source, minify: true, ...stylesheetAssets.options });
                    styles.set(virtualId, compiledClientStyle(id, packageDir, fileId, stylesheetSource(code.toString(), stylesheetAssets.references, 'context.asset')));
                    return { code: 'export {};', moduleSideEffects: 'no-treeshake' };
                },
            }, assets.plugin],
        outputOptions: {
            entryFileNames: dualClient ? 'client.browser.js' : 'client.js',
            // The imported source basename becomes the published chunk name; package
            // files lists and artifact tests pin every intentional chunk.
            chunkFileNames: dualClient ? 'client.browser.[name].js' : 'client.[name].js',
            sourcemapExcludeSources: false,
            // The map is served from /plugins/<scoped-package>/client.js.map. The
            // browser resolves its local sources back into URLs that mirror the
            // /packages/<group>/<package>/src directories; sourcesContent keeps them usable
            // without exposing that tree as an HTTP route.
            sourcemapPathTransform(source, mapPath) {
                isolation.sourcePath(source, mapPath);
                return browserSourcePath(source, mapPath);
            },
            banner: chunk => `window.__ModuleLoader__.load({ id: ${JSON.stringify(id)}, ${chunk.isEntry ? '' : `chunk: ${JSON.stringify(chunk.fileName)}, `}factory: (require) => {`,
            postBanner: (chunk) => {
                const prefix = clientBanner?.(chunk.fileName);
                return prefix === undefined ? '' : `${prefix}\n`;
            },
            footer: `return module.exports; }${styleMarker} });`,
            intro: 'var module = { exports: {} }; var exports = module.exports;',
        },
    };
}
/** Check browser bundle inputs before their original package identity is folded into an artifact. */
function clientInputIsolation(id) {
    const experimental = isExperimentalPackageName(id);
    const inputs = new BundleInputIsolation(REPOSITORY_ROOT, `client bundle isolation (${id})`);
    return {
        plugin: {
            name: 'dsh-client-input-isolation',
            buildStart() { inputs.reset(); },
            generateBundle(_options, bundle) {
                if (experimental)
                    return;
                for (const output of Object.values(bundle)) {
                    if (output.type === 'chunk') {
                        for (const module of Object.keys(output.modules)) {
                            inputs.assertInput(clientInputFile(module));
                            const info = this.getModuleInfo(module);
                            if (info === null) {
                                // Rolldown's runtime helper is compiler-generated and has no source module record.
                                if (module === '\0rolldown/runtime.js')
                                    continue;
                                throw new Error(`client bundle isolation (${id}): module ${module} has no bundler module record`);
                            }
                            for (const dependency of [...info.importedIds, ...info.dynamicallyImportedIds]) {
                                inputs.assertInput(clientInputFile(dependency));
                            }
                        }
                        for (const external of [...output.imports, ...output.dynamicImports]) {
                            if (!(external in bundle))
                                inputs.assertInput(external);
                        }
                    }
                    else {
                        for (const original of output.originalFileNames)
                            inputs.assertInput(original);
                    }
                }
            },
        },
        sourcePath(source, mapPath) {
            if (!experimental) {
                const decoded = clientInputFile(source);
                const file = physicalBundleInput(decoded) ?? resolvePath(dirname(mapPath), decoded);
                inputs.assertSourceMapInput(file);
            }
            return source;
        },
    };
}
/** CSS loader ids append a JavaScript suffix to the physical stylesheet path. */
function clientInputFile(id) {
    const prefix = [CSS_VIRTUAL_PREFIX, GLOBAL_CSS_VIRTUAL_PREFIX, INLINE_CSS_VIRTUAL_PREFIX]
        .find(prefix => id.startsWith(prefix));
    return prefix === undefined ? id : id.slice(prefix.length, -CSS_VIRTUAL_SUFFIX.length);
}
/** Chain tsc's emitted maps into any Client bundle that consumes `lib/types`. */
function tscSourceMapPlugin() {
    return {
        name: 'dsh-tsc-sourcemap',
        async load(id) {
            if (!id.includes(TYPES_MARKER) || !id.endsWith('.js') || !existsSync(`${id}.map`))
                return null;
            const code = await readFile(id, 'utf8');
            const mapPath = `${id}.map`;
            const map = JSON.parse(await readFile(mapPath, 'utf8'));
            if (!Array.isArray(map.sources) || map.sources.some(source => typeof source !== 'string')) {
                throw new Error(`client sourcemap: ${mapPath} has invalid sources`);
            }
            const sources = map.sources;
            if (!Array.isArray(map.sourcesContent)
                || map.sourcesContent.length !== sources.length
                || map.sourcesContent.some(source => typeof source !== 'string')) {
                const sourceRoot = typeof map.sourceRoot === 'string' ? map.sourceRoot : '';
                map.sourcesContent = await Promise.all(sources.map(async (source) => await readFile(resolvePath(dirname(mapPath), sourceRoot, source), 'utf8')));
            }
            return { code: code.replace(SOURCEMAP_COMMENT, ''), map };
        },
    };
}
/** Path segment separating a package's tsc output from the sources it was emitted from. */
const TYPES_MARKER = `${sep}lib${sep}types${sep}`;
/** Plugin name carrying contract 1, and the marker that identifies a statically linked config. */
const STATIC_LINKED_PLUGIN = 'dsh-static-linked-external';
/** Path segment a package's sources hang under, and the root emitted assets mirror. */
const SOURCE_MARKER = `${sep}src${sep}`;
/** Trailing sourcemap reference tsc appends to every emitted module. */
const SOURCEMAP_COMMENT = /\n\/\/# sourceMappingURL=.*\s*$/;
/** Resolve an emitted JS asset import against its source-tree counterpart. */
function sourceAssetPath(source, importer) {
    if (!source.startsWith('.') && !isAbsolute(source))
        return createRequire(importer).resolve(source);
    const emitted = resolvePath(dirname(importer), source);
    if (existsSync(emitted))
        return emitted;
    const boundary = emitted.indexOf(TYPES_MARKER);
    if (boundary < 0)
        return emitted;
    return resolvePath(emitted.slice(0, boundary), 'src', emitted.slice(boundary + TYPES_MARKER.length));
}
//# sourceMappingURL=tsdown.client.js.map