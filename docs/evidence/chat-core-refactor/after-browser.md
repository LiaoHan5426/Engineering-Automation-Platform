# Chat core AFTER browser evidence

Actual candidate EAP app at http://127.0.0.1:5203/#chat, not the DSH GUI. Canonical HTTP graph fixture and draft/active identity match the BEFORE fixture. Viewports: 1440×1000 and 390×1000, light theme. No production files changed by this browser owner.

The captured candidate HEAD is `9e7257b9fb45f138db04b6cfe57e1839c5261597` plus shared uncommitted changes; the parent verified every captured source-file digest against implementation commit `0f7defa437eb516ff853965f779208f5ab644679`. The original capture-time HEAD and diff fields remain intact; `verifiedSourceCommit` records the later commit association. `after-browser-results.json` records `finalCaptures: true` and `initialLayoutFits: true` at both viewport sizes, alongside tracked frontend diff SHA-256 `e9255ca73cb374bcb315ad9b6c0f332ff331e0ad9737cab69b1cfd87a59eba6d` and empty staged diff SHA-256 `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`. `after-source-manifest.json` hashes frontend production/configuration/lock files, excluding test directories and all evidence artifacts; source tree digest is `53e588fb58128a1a9762555b891d2a2976e65bc34e2e1697c6392e8cf8bd570f`. Final trace-free scroll run and both-viewport browser capture run passed on 2026-11-14 around 21:55–21:57 Asia/Shanghai.

Verified in actual Chromium at both viewport sizes: Markdown heading/strong/inline code/table, highlighted TypeScript, KaTeX math, manual Mermaid rendering (not automatic), sanitized SVG forbidden elements/attributes absent, exact code and whole-message clipboard handler text, action-menu keyboard opening/Escape/focus return, horizontally bounded menu, Ctrl+/ shortcut reference opening and Escape closure, exact downloaded `message.txt` bytes equal to canonical Markdown answer, retained draft and active conversation identity, Shift+Enter newline and IME Enter making no requests. Clipboard checks use an injected browser clipboard handler; they do not claim OS clipboard integration.

Normal Enter reaches the actual app's message request path. The all-request HTTP guard rejects its POST with fixture 409; no backend/model/task executes. All other non-GET or external requests are also blocked. Unknown same-origin API GETs receive fixture 503. These fixture 503s and the intentional Enter 409 produce expected console HTTP errors; browser pageerror arrays remain empty. This proves keyboard dispatch and guarded request behavior, not model generation or backend business completion.

Additional actual-app 60-node linear graph exercise passes: bottom-follow during manual Mermaid expansion, pause while opening diagram source, return-to-bottom, hostile Markdown HTML/script/javascript/image handling, and prepend reading-position retention. The same message UUID `d7020000-0000-4000-8000-000000000021` moves from offset26 to25.84375px (0.15625px drift, unchanged tolerance3px), as saved in `after-scroll-results.json`. An earlier 246px reading was a measurement error: it compared the old first visible message to a newly partially visible predecessor after prepend. The corrected same-ID measurement passes; do not interpret that earlier value as a 246px product regression fix.

The main paired images `after-{1440,390}.png` and `after-actions-{1440,390}.png` show the canonical answer after manual Mermaid rendering. Supplements `after-richtext-{1440,390}.png` show the upper rich content before manual rendering, and `after-composer-{1440,390}.png` show the scroll-to-send view. Raw composer/layout geometry before and after scrolling is included in the browser results. The UI owner corrected the shortcut-row sibling/workspace height calculation; original capture-state geometry now fits without hidden ancestor scrolling. The final screenshot gate checks the original composer bottom against the workbench bottom and original send/model bounds against the1000px viewport. Supplemental scrolling is not used to establish original layout fit. Final original-state values: desktop workbench bottom992px/composer bottom972px/send bottom928.859375px/model bottom930.609375px; narrow workbench bottom962px/composer bottom950px/send bottom906.859375px/model bottom908.609375px. Workbench scrollTop remains0 both before and after scroll-to-send at both viewport sizes, and its scrollHeight equals clientHeight.

Initial Mermaid lazy import failed with HTTP 504 Outdated Optimize Dep caused by Vite dependency optimization of transitive vscode-jsonrpc exports. UI owner changed to a public Mermaid ESM entry; subsequent actual-browser Mermaid checks pass at both sizes.

Reproduction (from repository root):

```sh
export EAP_PLAYWRIGHT_MODULE=/home/superagent/.local/share/vite-plus/packages/@playwright/test/9dd164b5-7249-4cb4-83b0-f544dd742f76/lib/node_modules/@playwright/test
export EAP_CHROMIUM=/home/superagent/.cache/ms-playwright/chromium-1254/chrome-linux64/chrome
export LD_LIBRARY_PATH=/tmp/eap-browser-libs/usr/lib/x86_64-linux-gnu
node frontend/apps/web/__tests__/browser/chat-core-scroll-after.mjs
node frontend/apps/web/__tests__/browser/chat-core-after.mjs
# Only after source freeze and all required checks pass:
EAP_FINAL_CAPTURE=1 node frontend/apps/web/__tests__/browser/chat-core-after.mjs
```

The existing baseline server5202 is untouched. Candidate server is a managed background job; its current job ID is reported to the parent separately because interruption/resume can replace runtime job IDs.
