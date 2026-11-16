# DSH Personal — Vue migration workspace

English | [中文](README.zh.md)

This directory is a sibling of `frontend/` on the `dsh-personal` branch. It imports a fixed version of DSH and is migrating the complete P0–P4 application to native Vue 3 using Vite+ CLI. **The migration is an unfinished draft.** The native renderer and many product modules have passed focused checks; the final aggregate checks, browser regression and matching Before/After evidence remain incomplete.

This phase does not adapt the application to the EAP Java backend. Existing EAP `frontend/` and `backend/` are unchanged. The existing DSH Host/Boot/plugin contracts remain the runtime authority; this UI migration does not introduce a second store or a React facade. Experimental UI and the desktop welcome entry are included in the authorized migration.

- [Contract audit and implementation decisions](contract-audit.md)
- [Stage plan, completion tracker and outstanding gates](migration-plan.md)
- [Fixed-source inventory](source-inventory.json)
- Original upstream instructions: [English](README.upstream.md), [Chinese](README.upstream.zh.md)

## Fixed source

[deepseek-ai/deepseek-harness @ 39163dd30f703a79079e2d2446545cff3c453738](https://github.com/deepseek-ai/deepseek-harness/tree/39163dd30f703a79079e2d2446545cff3c453738). The installed DSH instance is neither the migration input nor a deployment target.

The initial complete GitHub tree audit on 2026-11-15 found 74 client packages and 1,236 client TS/TSX source files, including 373 TSX files; all repository source directories contained 469 TSX files. These are historical inventory counts, not a migration completion percentage.

## Run

### Run from source

The target uses Vite+ 1.3.0, Vue/compiler 3.5.45 and vue-tsc 3.3.14 with a committed lockfile. From this directory, use the Vite+ CLI to install and run the repository commands:

```sh
vp install --frozen-lockfile
vp run build
vp run start:web
```

The original baseline completed its full build and ran through the real Host in Chromium. The target has passed all eight artifact build gates, both Host and Client aggregate checks, the real Host/SFC lifecycle loop and numerous module regressions. **Delivery remains incomplete:** final runtime fixes, refreshed artifacts and browser regressions still need verification. Focused passes do not establish complete functionality or user acceptance; see the stage tracker for current evidence and limitations.

Application React imports and direct dependencies have been removed together with their consumers. The existing Vue/VitePress documentation toolchain still brings indirect DocSearch React dependencies into the workspace installation graph. The verified Web and desktop welcome bundle inputs and compiled client registrations contain no React runtime; browser behavior still requires its separate acceptance checks. No claim is made that the entire workspace dependency graph contains zero React.

## License

The imported source retains its [MIT license](LICENSE). Dependency notices are in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
