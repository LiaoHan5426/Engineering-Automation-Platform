# @eap/icons — internal SVG resources

Applications use `Icon` from **`@eap/ui`**, for example `<Icon name="plus" />`. They do not declare or import this resource package. UI also re-exports optional named components for consumers that prefer static imports.

This visual leaf packages a bounded selection of local `@lucide/vue@1.66.0` SVG components. It has no API, router, storage, remote icon loader or interaction policy. The unified UI `IconName` union is defined in `packages/ui/src/icon/icons.ts`; unknown runtime names render nothing and never trigger a network request.

## Presentation

- Default size: `1em`, overridden by `--eap-icon-size` or the `size` prop.
- Default stroke: `1.75`, overridden by `--eap-icon-stroke-width` or `strokeWidth`.
- Stroke inherits `currentColor`; light/dark/disabled/selected styling comes from the containing UI control, not duplicated icon palettes.
- Decorative by default: `aria-hidden=true`, `focusable=false`. Pass a nonblank `label` only for a standalone semantic image. Icon-only buttons must still have their own accessible name.
- Class and style attributes are forwarded for trusted host code; this is not an untrusted-attribute sanitizer. Do not bind user/server-provided attribute objects wholesale. Icons are not buttons and do not implement keyboard actions.

## Source and licensing

The module layout is inspired by [Vben icons](https://github.com/vbenjs/vue-vben-admin/tree/main/packages/icons) and its core Lucide exports. No Vben source is copied. Lucide is installed as a dependency under the ISC license; preserve its distributed LICENSE when redistributing a bundle/source dependency. This package does not copy SVG source or introduce an Iconify CDN client.

Named resource exports are static and annotated as pure for tree shaking. The UI `Icon` intentionally references its small allowlisted catalog; importing that component includes this bounded set, not the entire Lucide library. Do not claim per-name tree shaking when using dynamic `Icon name`.
