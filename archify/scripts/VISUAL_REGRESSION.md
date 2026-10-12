# Archify visual regression suite

This suite protects **drawing quality**, not merely an editor's rendering speed.

## Fixed inputs

1. `examples/web-app.architecture.json` — unchanged upstream Archify v3.0.1 Architecture sample.
2. `examples/agent-tool-call.workflow.json` — unchanged upstream Archify v3.0.1 Workflow sample.
3. An optional **user-provided** existing project candidate (`--project path`). The runner reads and copies it; it never changes the original source or previously delivered HTML. Do **not** ship a user's private candidate as part of the global Skill.

The runner replaces only `meta.output` on an isolated fixture copy. It uses **the installed canonical CLI**, never the Visual Editor, for `finalize`, provenance `check`, and `visual-check` (including 1440x900/2048x1320 light/dark captures). The output records SHA-256 for the source fixture, frozen copy, official HTML, official renderer files and screenshot PNGs. This identifies source changes vs renderer changes, but it does not falsely claim cross-version equality without an actual archived old runtime.

## First run and replay

From your Bash project root:

```bash
CODEX_ROOT="${CODEX_HOME:-$HOME/.codex}"
SKILL="$(cygpath -u "$CODEX_ROOT/skills/archify")"
node "$SKILL/scripts/visual-regression.mjs" \
  --project '.archify/<existing-architecture-folder>/candidate.json' \
  --out-dir '.archify/visual-regression-first' \
  --baseline-out '.archify/visual-regression-baseline.json'

node "$SKILL/scripts/visual-regression.mjs" \
  --project '.archify/<existing-architecture-folder>/candidate.json' \
  --out-dir '.archify/visual-regression-replay' \
  --baseline '.archify/visual-regression-baseline.json'
```

`--baseline-out` is explicit and **write-once**; it never overwrites an existing baseline. Use a fresh `--out-dir` per run. Exit code 1 means a technical check failed or a measured regression was found. `report.json` reports deviations; `visual-evidence/*.png` and its HTML contact sheet are the material for a **human** side-by-side 1440x900 review. Never equate `reviewFlags=[]` or `visual-check ok:true` with aesthetics being accepted.

## Human comparison and pass criteria

- Compare fixed examples against their prior screenshots at the **same browser viewport/theme**. Check hierarchy, text, main path, whitespace, edge crossings and label placement using `references/visual-acceptance.md`.
- New projected minimum context text materially smaller than baseline (more than 0.4px) or more line crossovers is flagged as regression. Other actual visual regressions count even if the metrics do not notice them.
- Store an audit note for each case: `passed`, `failed`, or `skipped`, inspected viewport, concrete observation, baseline directory and comparison directory. Do not edit golden images as a "fix".
- Keep the canonical renderer and the editor test suites independent. To check editor behavior separately, run `node <skill>/editor/test-editor.mjs <architecture-candidate>` or `node <skill>/editor/test-schema-editor.mjs`.
