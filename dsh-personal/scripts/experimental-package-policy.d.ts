/** Experimental package identities, publication policy, and npm names. */
/**
 * Experimental packages whose npm names omit the experimental prefix, by directory. Every new experimental package
 * belongs here so that promotion keeps its name; isolation checks and plugin-record ownership recognize an unprefixed
 * experimental name only through this map.
 */
export declare const EXPERIMENTAL_PACKAGE_NAME_EXCEPTIONS: Readonly<Record<string, string>>;
/** Legacy npm namespace, allowed only in `LEGACY_PREFIXED_EXPERIMENTAL_PACKAGE_DIRECTORIES`. */
export declare const EXPERIMENTAL_PACKAGE_NAME_PREFIX = "@deepseek-ai/dsh-experimental-";
/** Existing experimental packages that keep the legacy prefix until a rename; this list must not grow. */
export declare const LEGACY_PREFIXED_EXPERIMENTAL_PACKAGE_DIRECTORIES: readonly string[];
/**
 * Identify an experimental npm package independently of its installed directory.
 * @param name - complete npm package name, without a version or subpath.
 * @returns Whether the name uses the legacy prefix or appears in `EXPERIMENTAL_PACKAGE_NAME_EXCEPTIONS`.
 */
export declare function isExperimentalPackageName(name: string): boolean;
/**
 * Find experimental identities in module ids, paths, subpaths, or npm alias specifications.
 * @param reference - package reference or bundler/runtime module identifier.
 * @returns Whether a delimited package name identifies an experimental capability.
 */
export declare function hasExperimentalPackageReference(reference: string): boolean;
/**
 * Derive the package-owned plugin record namespace without changing persisted names.
 * @param name - complete experimental npm package name.
 * @returns Capability suffix, or undefined for a non-experimental name.
 */
export declare function experimentalPackageRecordNamespace(name: string): string | undefined;
/** Experimental packages excluded from public releases and npm baselines. */
export declare const PRIVATE_EXPERIMENTAL_PACKAGE_DIRECTORIES: readonly string[];
/**
 * Whether an experimental package publishes under the default-public policy.
 * @param directory - repository-relative package directory.
 * @param privateDirectories - experimental directories excluded from publication.
 * @returns Whether the package publishes with the dsh family.
 */
export declare function isPublicExperimentalPackageDirectory(directory: string, privateDirectories?: readonly string[]): boolean;
//# sourceMappingURL=experimental-package-policy.d.ts.map