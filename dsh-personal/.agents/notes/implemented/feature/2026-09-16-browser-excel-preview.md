# Agent Note: Browser Excel preview with saved formula results

Status: implemented

English | [中文](2026-09-16-browser-excel-preview.zh.md)

## Problem

PDF conversion loses spreadsheet navigation and the relationship between a formula and its saved value. Spreadsheet preview also needlessly depends on the Host Office engine when the browser can read the workbook.

Unsupported drawing content can also prevent cell preview. ExcelJS 4.4.0 expects prefixed DrawingML element names and fails on valid default-namespace drawings emitted by Openpyxl. A chart that the viewer cannot display must not make otherwise readable worksheets unavailable.

## Decision

The [document preview](../../../../packages/client/ui-sidebar-documentpreview/README.md#excel-preview) opens XLSX, XLS, CSV, and TSV with Luckysheet and package-local adapters for ExcelJS, SheetJS CE, and PapaParse. The adapter accepts bytes, format, and limits and returns worksheet data; it has no component state setters, timers, or component references. Dependencies own file parsing, while the adapters share FortuneSheet-core display formatting and initial selection without introducing another workbook model. CSV/TSV retain literal strings and a plain-text option; implicit type inference could otherwise discard leading zeros or interpret source text as formulas. The shared document reader calls `remote.workspaceFiles.readBytes(sessionId, path, {}, signal)` and receives native bytes through the binary Remote, retaining Session authorization, file versions, reload, and transient bytes without base64 decoding. Workspace Files owns bounded file reads; format parsing stays in the Client. The registration marks only XLSX/XLS as `binaryExtensions`, so the shared document container offers Plain text for CSV/TSV. Each renderer registers its body under its own id.

Preview is read-only and retains formula text alongside saved results. It does not recalculate, so unsupported functions cannot replace a valid saved result with an error. A formula without a saved result remains blank. Workbooks containing formulas show a compact warning beside the formula icon instead of consuming worksheet height with a notice row. The spreadsheet is neither an authoring tool nor a full Excel rendering engine.

The package-local `XlsxPreviewArchive` inspects XLSX content inside the parser Worker and removes DrawingML parts and their relationship parts from a temporary ZIP. ExcelJS also ignores worksheet drawing references; ignoring those references alone still leaves its archive-level drawing parser exposed to the failure. The source bytes and retained worksheet XML remain unchanged. A separate notice lists detected charts, images, shapes, and conditional formatting that the preview does not display and recommends a system application. Formula warnings remain independent, and files without detected unsupported content have no notice. Other formats return no unsupported-content categories.

A disposable browser Worker contains parser CPU work. A source-byte limit precedes parsing, a combined rectangular-area limit precedes worksheet matrix allocation, and a timeout terminates stalled parsing. These limits do not claim a hard memory sandbox. Styles are scoped to the renderer; external hyperlinks are text only.

The native Vue component creates a separate iframe document for each workbook. Luckysheet 2.1.13 runs with editing and forced calculation disabled and copying enabled. Worksheet data is cloned before delivery to the engine, so renderer mutations cannot change the parser result. A resize observer updates the engine; replacing the workbook or language destroys the engine and replaces its document. Component disposal also disconnects the observer and clears the document.

The build embeds the pinned engine scripts, stylesheets, fonts, and images. The iframe uses a nonce for its scripts, permits the engine’s dynamic evaluation and inline styles, and disables connection and nested-frame requests through its content security policy. CDN font fallbacks become empty data URLs. The iframe remains same-origin; this policy does not provide a hostile-document sandbox.

Formula-bar text, clipboard HTML, initial selections, worksheet switching, and frozen-pane rendering require verification against the bundled Luckysheet runtime when it changes. The retained FortuneSheet-core dependency supplies adapter formatting; its DOM patches do not establish behavior for the iframe engine.

## Alternatives considered

**Adopt FortuneExcel's React-oriented conversion helper.** Its component setters and post-render sizing couple file conversion to one UI lifecycle. The local adapter can be tested without mounting a workbook and needs no second intermediate workbook model.

**Write an OOXML parser or create a new public package.** ExcelJS already owns the container and file semantics. One preview consumer does not justify another public API, Cordis service, or generic workbook abstraction; a second independent consumer can motivate extraction.

**Patch ExcelJS's drawing namespace handling.** Correct parsing would still leave drawings undisplayed. Filtering the unsupported parts prevents them from blocking the supported cell preview without maintaining drawing behavior that the viewer cannot use.

**Replace ExcelJS or require users to rewrite their files.** A parser replacement puts retained fonts, borders, merges, and frozen panes at risk. Rewriting a source file makes a viewer defect the user's responsibility. A temporary preview copy preserves both the existing adapter and the user's file.

**Keep PDF as an Excel fallback or calculate every formula on import.** PDF retains neither spreadsheet interaction nor formula inspection, while recalculation can change saved results. The [Office engine reference](../../../../packages/document/office-kit/README.md) remains applicable to Word/PowerPoint previews and independent conversion consumers; its conversion capability still supports spreadsheets.

## Consequences

The renderer trades complete Excel fidelity for browser-local navigation and reusable conversion code. The package README owns supported formats, resource defaults, and unsupported features. Real XLSX/XLS fixtures and delimited-text cases cover conversion, Worker tests cover cancellation and cleanup, and the shipped-profile browser scenario opens a workbook with Office conversion disabled and copies a saved XLOOKUP result under read-only settings. It also exercises XLS sheet switching and CSV/TSV literal copying, text-view switching, and reload. SheetJS CE is pinned to its official release tarball because the public npm registry is stale; its Apache-2.0 license follows the existing permissive-license and bundled-notice policy.

Drawing filtering adds ZIP inspection and, when parts are omitted, temporary uncompressed ZIP allocation. Existing Worker lifetime and source/matrix limits still apply; they do not bound decompressed memory. Drawing fixtures cover default and alternate prefixes, exact retained XML and input bytes, images, shapes, and comment VML. The browser scenario checks the notice, saved-value copying, and notice removal on file replacement. Adding drawing rendering requires revisiting both filtering and notice classification; a namespace fix alone does not restore that capability.
