# First-send notice layout evidence

Actual Vue App reproduction with baseline `53954f99d6746d06f5a5115dbbae040c1f1d53a1` and after implementation `a7bd75b4850bd50a110be2d5754d83a5bf738b94` (both captured while HEAD was detached at the baseline; committed after capture, independently verified production source SHA-256), using a public synthetic model and a controlled local HTTP/SSE fixture. Before and after use a clean browser page for each viewport, a newly opened conversation, identical draft text, and the real composer Send interaction. No DOM insertion, CSS injection, component-state injection, production feature switch, real backend, or provider invocation is used.

| Viewport | Before notice / body | After notice / body | After terminal body |
| --- | --- | --- | --- |
| 1918 × 914 | 338.953 / 527.047 px | 34 / 832 px | 866 px |
| 390 × 1000 | 914 / 30 px | 52 / 892 px | 944 px |

[Before manifest](./before-manifest.json) and [after manifest](./after-manifest.json) contain the source hashes, request observations, page errors, exact computed grid tracks and element rectangles. [Artifact manifest](./artifact-manifest.json) records file hashes. Baseline source snapshots are public repository source only; the private feedback image is excluded.

Paired pending screenshots:

- [Desktop before](./before-first-pending-1918.png) / [desktop after](./after-first-pending-1918.png).
- [Mobile before](./before-first-pending-390.png) / [mobile after](./after-first-pending-390.png).

Before records the first message request after dispatch, holding its response open before the accepted frame. This genuinely renders App's conditional sending notice and reproduces the implicit grid row. Desktop feed shrinks to 228px; mobile body shrinks to 30px and the composer lies below the viewport.

After verifies nine states at each viewport: first pending, first streaming, navigation to Appearance while sending, return to Chat while sending, terminal success, another pending send, terminal failure, another pending send, and cancellation through the actual composer Cancel button. Accepted/delta/final frames and corresponding authoritative graph reads come from the local fixture. The cancellation endpoint is fulfilled locally. All sending states preserve the notice; all terminal states remove it. The feed, composer, model picker and appropriate send/cancel control remain within the body and viewport. Root width/height equal the viewport; body does not overflow its own height. Appearance intentionally hides the chat workspace; returning restores the accessible cancel control.

The runtime connection badge remains disconnected because unrelated runtime endpoints deliberately return fixture-unavailable. AI status is `available`, and the registered public synthetic model enables the real Send control. No real provider credential or endpoint is used. Unmatched API reads receive HTTP 503 locally; unmatched writes or external requests are blocked. Both successful captures record zero blocked requests and zero page errors. Static assets come only from the isolated Vite server on port 5207; the explicitly routed message POST goes to a temporary loopback HTTP server that writes controlled SSE and closes on completion.

Reproduce from repository root (server must already run):

```sh
# Start separately from frontend/:
./node_modules/.bin/vp -C apps/web dev --host 127.0.0.1 --port 5207 --strictPort

# Root, using the public vp-managed Playwright installation available in this environment:
CAPTURE_PHASE=after \
EAP_PLAYWRIGHT_MODULE=/home/superagent/.local/share/vite-plus/packages/@playwright/test/9dd164b5-7249-4cb4-83b0-f544dd742f76/lib/node_modules/@playwright/test \
LD_LIBRARY_PATH=/tmp/eap-browser-libs/runtime/usr/lib/x86_64-linux-gnu:/tmp/eap-browser-libs/usr/lib/x86_64-linux-gnu \
node frontend/apps/web/__tests__/browser/first-send-layout-capture.mjs
```

Use `CAPTURE_PHASE=before` only on the captured baseline source; that mode deliberately asserts a giant notice. The existing Playwright loader supports another explicit public installation through `EAP_PLAYWRIGHT_MODULE`.

Validation results: baseline capture PASS; after capture PASS; strengthened after bounds/overflow assertions PASS at both sizes, 18 captured states total. Formatting changed only the owned harness. Original backend and real provider execution are **false**. This establishes the shell layout and controlled interaction regression, not backend business completion or human acceptance. Simultaneous workspace message / SQL footer is outside this browser scenario; the parent owns that additional shell regression coverage.
