# Chat layout refinement: actual browser evidence

BEFORE is actual detached `36b9e7a8b5e367a66b7b63bd7c8263c4af4c0581`, captured before implementation started. AFTER is the frozen candidate source on the same detached HEAD; exact tracked source hashes are in [after-source-provenance.json](after-source-provenance.json). No branch switch or commit occurred during capture. Existing evidence was preserved.

All paired screenshots use the same public `chat-service-config-fixture.mjs` conversation, answer, draft and unavailable-service conditions, light theme, reduced motion, feed scrolled to the start. These are viewport screenshots of the actual Vue app, without CSS injection or image manipulation. No private feedback is included. Images were inspected at desktop and narrow sizes.

| Viewport | Entire top area before → after | Message feed before → after | Feed gain | Composer before → after |
|---|---:|---:|---:|---:|
| 1918×900 | 239.5 → 69.0 px | 192.0 → 472.6 px | +146.1% | 332.5 → 222.4 px |
| 1440×1000 | 239.5 → 69.0 px | 281.1 → 572.6 px | +103.7% | 343.4 → 222.4 px |
| 390×1000 | 282.3 → 143.8 px | 208.7 → 362.3 px | +73.6% | 343.0 → 327.9 px |

Entire top area means workbench top to message-feed top, including the old always-visible shortcut card and utility/history/memory rows. The app's global 48 px desktop / 56 px narrow title bar remains outside that measurement. Raw geometry and all feed ancestors are in [before-geometry.json](before-geometry.json) and [after-geometry.json](after-geometry.json).

The candidate three-row draft is 71 px high in every viewport. Both model and send controls fit inside the composer and viewport. Root scroll height/width equal the viewport; no feed ancestor has hidden excess vertical content. The default composer has no internal vertical overflow. Real wheel events move the feed while window and ancestor scroll positions remain zero. The narrow baseline send clipping is resolved.

Paired images: [1918 before](before-chat-1918.png) / [after](after-chat-1918.png), [1440 before](before-chat-1440.png) / [after](after-chat-1440.png), [390 before](before-chat-390.png) / [after](after-chat-390.png).

[after-interactions.json](after-interactions.json) records passed browser interactions at all three viewports:

- Local draft edits, Shift+Enter newline and IME Enter preserve the draft; no-model send stays disabled.
- Actual shortcut editor opens from the compact entry and Ctrl+/, then closes with Escape.
- Model history opens and closes after its read completes; unavailable history is not treated as loaded provider data.
- Task-memory dialog opens with unavailable memory and editing disabled. A supplementary public GET memory fixture then verifies nested editor dirty-close confirmation, cancelling discard preserves the exact draft, and confirmed local discard closes only the editor before the outer dialog is closed. No PUT occurs.
- Summary panel and top action menu open/close; export remains accessible.
- Web and speech options open, empty-service selectors remain disabled, each opens the shared configuration dialog, and closing that dialog preserves the open option state and chat draft.
- Outgoing preview shows the exact draft; project, model and attachment entry controls remain reachable.

Interaction screenshots include `after-message-scroll-*`, `after-shortcuts-*`, `after-memory-dirty-*` and `after-options-*`. Expanded options are intentionally supplementary, outside the default paired geometry.

Network boundary: the reused whole-HTTP guard allows only same-origin GET app assets, fulfills bounded public fixture GET APIs, returns fixture-unavailable for other API GETs, and rejects all writes and external HTTP requests. Final runs recorded zero rejected requests and zero page errors. No provider/model, MCP, microphone or speech execution was performed. Browser evidence establishes layout and local interaction behavior, not real service completion or human acceptance. Model-history unsaved generated-summary behavior was not exercised because this fixture contains no generated summary.

Reproduction on this host (existing runtime installations only):

```sh
# from frontend/; managed as a dedicated background job during capture
./node_modules/.bin/vp dev apps/web --host 127.0.0.1 --port 5206 --strictPort

# from repository root
export LD_LIBRARY_PATH=/tmp/eap-browser-libs/runtime/usr/lib/x86_64-linux-gnu:/tmp/eap-browser-libs/usr/lib/x86_64-linux-gnu
export EAP_PLAYWRIGHT_MODULE=/home/superagent/.local/share/vite-plus/packages/@playwright/test/9dd164b5-7249-4cb4-83b0-f544dd742f76/lib/node_modules/@playwright/test
CAPTURE_PHASE=after node frontend/apps/web/__tests__/browser/chat-layout-refinement-capture.mjs
node frontend/apps/web/__tests__/browser/chat-layout-refinement-interactions.mjs
```

Both final commands exited 0. BEFORE ran with the same runtime and default `CAPTURE_PHASE=before` while source was still unchanged. Do not rerun BEFORE against candidate source; preserve the captured baseline. No install/build/commit or production writes were performed by the evidence owner. The dedicated capture server is stopped after final collection.
