# Repository hygiene review — 2026-11-17

Before submission, the complete Git index contained 23,635 paths. A path-based audit found no tracked build directories, dependency caches, logs, local databases, temporary archives or scratch directories. `git ls-files -ci --exclude-standard` returned no tracked files covered by the existing ignore rules. The fetched origin/main matched the local starting HEAD.

Seven `.dsh` paths belong to committed recorded-session workspace fixtures and remain tracked. The frontend focus-trap probe is a browser regression helper; scratch-named screenshots describe the UI being tested. These are not disposable machine output. Curated screenshots, the real-model GIF and Forge JSON summaries under docs/evidence remain reviewable acceptance evidence; raw logs stay ignored. The Forge report log filenames refer to local diagnostic files, not files shipped in Git.

The root ignore rules now exclude only these additional local paths:

- `/.tmp/`: ad hoc audit and preflight scripts.
- `/.dsh/`: repository-local runtime state, without hiding nested snapshot fixtures.
- `/dsh-personal/.tmp/`: isolated launch profiles, generated captures and private acceptance scratch files.
- `/lefthook.yml`: the root file contains only generated example comments and defines no hooks; it remains on disk. The real nested DSH hook configuration remains tracked.

No tracked file removal or history rewrite was necessary. Existing uncommitted work was retained. This is a current-index and outgoing-change review, not an exhaustive historical secret audit.

Validation: all four ignore examples matched; the curated DSH evidence text had no matches for the checked API-key, bearer-token and bootstrap-query patterns. The outgoing ChangesTab helper cleanup retains its previously run 149/149 tests, focused lint and both aggregate type checks. The maintenance guide retains its latest 21/21 documentation checks (43.20 seconds); unchanged checks were not repeated merely for submission.
