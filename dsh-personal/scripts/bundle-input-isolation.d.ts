/** Experimental ownership of the actual filesystem and package inputs supplied to a bundler. */
/** Package identities are cached only within one build. */
export declare class BundleInputIsolation {
    private readonly packages;
    private readonly repository;
    private readonly label;
    constructor(repository: string, label: string);
    /** Discard package metadata before a new build or watch rebuild. */
    reset(): void;
    /**
     * Require a recorded input to have non-experimental physical and package ownership.
     * @param id - bundler module id, filesystem path, or filesystem URL.
     */
    assertInput(id: string): void;
    /**
     * Check declared source-map ownership; dependency tarballs may omit their upstream sources.
     * @param id - source-map source resolved relative to its map.
     */
    assertSourceMapInput(id: string): void;
    private checkInput;
    private packageName;
}
/**
 * Recover physical ownership from queries, filesystem URLs, and virtual path wrappers.
 * @param id - bundler module id or recorded filesystem input.
 * @returns absolute file path, or undefined for a virtual id without a physical path.
 */
export declare function physicalBundleInput(id: string): string | undefined;
//# sourceMappingURL=bundle-input-isolation.d.ts.map