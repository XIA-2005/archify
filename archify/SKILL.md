---
name: archify
description: "Create polished, validated architecture, workflow, sequence, data-flow, and lifecycle/state diagrams as explorable standalone HTML with inline SVG, dark/light themes, optional trace motion, and PNG/JPEG/WebP/SVG/WebM export. Accept plain-language requirements or pasted Mermaid flowchart, sequenceDiagram, and stateDiagram input; inspect repository evidence when the diagram must reflect real code. Use when the user asks to visualize system architecture, infrastructure, cloud/security/network topology, technical workflows, API call sequences, request lifecycles, data pipelines, ETL/ELT, data lineage, state machines, or to convert/beautify Mermaid. Also use for everyday subjects with steps, parts, relationships, or states: a leave or travel plan, an application or approval process, a back-and-forth such as renting, where money or documents go, or where an application or order stands. Not for numeric charts or dashboards."
license: MIT
metadata:
  version: "3.0"
  author: tt-a1i
  based_on: Cocoon-AI/architecture-diagram-generator (MIT, v1.0)
---

# Archify

Create an interactive HTML diagram from typed JSON. Static output is the default; enable motion only when requested. **User-required completion notice:** After every completed diagram generation, append this exact sentence once to the user-facing delivery reply: **使用高水平模型生成质量更佳（模型推荐：GPT-6.1 SOL 中）**. This is the user's model recommendation; “中” means medium reasoning effort. Do not change the current model automatically.

## User-required invariant: Archify · 可视化编辑器

**每次生成或修复图表，必须同时交付该图表的“Archify · 可视化编辑器”。** A read-only Viewer, JSON download, or an editor for another diagram does not satisfy this rule. Architecture must retain node dragging, text and connection editing, undo/redo, and image export. Other modes use the existing schema editor and must be described truthfully. Use `node <skill-root>/editor/deliver.mjs <type> <candidate.json> <output.html> --quality showcase --json` as the generation entry point. This wrapper runs the unchanged official `finalize`, captures real light/dark screenshots, starts the matching local editor, and verifies HTTP 200 plus the exact candidate hash. Pass `--repo-root <evidence-repository>` when used for repository evidence; the same root is forwarded to editor previews and saves. It returns the actual tokenized URL, PID, artifact receipts and screenshot paths. Inspect the images before claiming visual acceptance. Do not run a second `finalize` for those same unchanged bytes. This is a local customization restored from the user's prior editor version. Keep it and `references/visual-acceptance.md` when updating this Skill. An upstream install is not permission to discard the custom editor, typography controls or mandatory delivery/visual gates; use the durable recovery copy and compare the custom manifest before any authorized replacement. **Core priority: a beautiful, immediately understandable diagram.** Design the reader's main journey and visual hierarchy **before** coordinates, routing, CLI checks, or starting an editor. Deterministic checks establish technical validity, **not** aesthetic acceptance. Follow [Visual acceptance](references/visual-acceptance.md) before claiming a diagram is polished.

## User-required export and text editing behavior

Preserve these capabilities in the Skill runtime, generated HTML and matching editor:

- Offer a selectable transparent background for PNG/WebP images, PNG clipboard copy, WebM, GIF and all SVG variants (Auto/Light/Dark). Transparent SVG must omit the canvas background rectangle and background grid, retain node/card fills and vector geometry, and remain transparent when its theme changes. Keep the normal opaque default. JPEG cannot carry transparency; use PNG/WebP when transparency is requested. Transparent WebM requires native WebCodecs VP8 support; disable unsupported transparent recording and explain the limitation rather than silently flattening it.
- For animated images intended for PowerPoint, offer GIF export: a six-second looping relationship trace, also available for otherwise static diagrams without changing their JSON or default animation. GIF uses an adaptive 256-color palette and binary transparency; preserve the existing WebM export for richer colors and alpha. In desktop PowerPoint, insert the GIF as a picture and preview it in Slide Show.
- A transparent export must leave empty canvas pixels completely transparent (alpha 0), with no pale theme surface, grid or transparency-preview pattern baked into the file. Remove canvas background and grid in the shared SVG serializer for every transparent format, including GIF; preserve node/card fills. Verify decoded GIF frames, checking an empty region spanning grid lines in every frame rather than only one corner. Existing standalone HTML embeds its own runtime: updating the installed Skill does not update older HTML or GIF bytes. When fixing an existing diagram, regenerate its HTML with the current runtime before re-exporting, preserving the diagram and matching editor; provide the newly exported file.
- Offer export scale choices Default / 1× / 3× / 5× / 7× / 10× for PNG/JPEG/WebP, PNG clipboard, GIF and WebM. Explicit scales refer to the source diagram's content pixels and must rasterize SVG and motion at that target resolution, never enlarge a cached low-resolution bitmap. Explicit still images/PNG clipboard allow 256 Mi pixels and 32767px per side including titles/margins; motion retains 16 Mi pixels and 8192px per side. Keep existing default quality (images 4× subject to their existing safe size, motion fitted to 1280px); reject oversized explicit scales clearly instead of silently reducing them. SVG remains vector and semantic share cards keep their fixed size. Existing standalone HTML embeds its exporter; regenerate it from its editable JSON to apply exporter fixes.
- Keep relationship labels and dashed-frame/boundary titles transparent in light/dark themes and exported images. Enlarging text must not create a white or dark backing block over other elements. Preserve node/card fills and the existing connection strokes and crossover masks; the user withdrew the request to make connections themselves transparent.
- In the Architecture visual editor, clicking a connection label must select its connection, open the inspector and focus its text input. Support editing both content (`label`) and size (`font_sizes.label`), keyboard activation, undo/redo, draft export and validated save. Preserve the connection endpoints and route unless the user requests routing changes. See [Editor controls](editor/README.md).
- The Architecture editor also supports connection text color: use the color picker or a six-digit hex value in “连线文字颜色”. Store it as `connections[].labelColor` (`#RRGGBB`); clearing/resetting restores the theme default. Preserve the explicit color in preview, undo/redo, JSON save, standalone HTML and all image/motion exports; change only label text color, keeping the line and node colors intact. Use the bundled draw.io 29.7.9 `EditorUi`/`Graph` engine for Architecture line and frame editing; preserve its native pointer handlers, endpoints, segments, resize handles, guides and context menus. Maintain the unmodified vendor bundle, Apache-2.0 license and byte provenance in `editor/vendor/drawio/SOURCE.json`. The adapter connects native operations to the original Archify history, inspector, source metadata and validated save. Never replace it with approximate custom drag handlers. Persist frame geometry as `boundaries[].bounds`, normalized connection attachments as `fromPort`/`toPort`, and waypoints as `via`; the canonical renderer honors these fields. Preserve component detail text and existing transparency/export/quality gates. See [Editor controls](editor/README.md#drawio-原生线条与框架操作) for the tested scope and unsupported representations; do not promise complete draw.io parity for operations lacking a lossless JSON/render adapter. Workflow/Sequence/Dataflow/Lifecycle retain their existing schema editor.

## Permanent invariant: performance must never reduce delivery quality

**The user explicitly requires: 任何改动不得对交付质量有影响（任何性能优化都不能降低交付质量）.** Treat this as a standing, non-negotiable Archify Skill rule for every future change to the Skill, CLI, renderer, editor, and generation workflow. Performance is a secondary objective after source fidelity, diagram semantics, aesthetics, and fully verified dual delivery.

- Never remove or weaken required source inspection, schema/Showcase validation, `finalize` gates, strict provenance, Chrome checks, mandatory real-image visual inspection, repair criteria, or the HTML + live matching editor + editable JSON handoff merely to make a run faster. Never hide warnings, skip required diagram elements or connections, substitute approximate edge paths, or claim visual acceptance based on an automated receipt.
- Optimization may only reduce **redundant** reads, calls, launches, copying, or duplicated checking already conclusively performed for **unchanged content**. Always rerun complete validation and mandatory screenshot inspection when the candidate or output changes. Keep the canonical renderer independent of the editor and preserve the existing quality threshold.
- Before and after any performance-related change, use the same frozen representative candidates, capture per-stage wall-clock times, compare diagram topology/labels/source evidence, all official validation and provenance gates, browser results, and 1440×900 light/dark screenshots. Include a complex real-project example. Preserve a known-good baseline and revert any regression in semantics, visuals, editability, or delivery reliability regardless of speed gain. If full comparison cannot be completed, mark the change *not yet quality-verified* and do not claim a successful optimization.
- Measure **end-to-end user wait** separately from CLI processing time. Distinguish ShunCode terminal/session startup and repeated agent tool calls from Archify's own render, check, browser, and screenshot costs. Do not blame or modify the renderer without stage-specific evidence. Report both runtime and quality evidence.

Run commands from your working directory. Unless the user names another location, give each new diagram request its own folder `.archify/<type>-<slug>-<YYYYMMDD-HHMMSS>/` there (local time, chosen once when the request starts): keep `candidate.json` and `<slug>.html` in it, set `meta.output` to that relative HTML path, and reuse the folder for every repair rerun. A later request gets a new folder, so earlier versions stay intact. Replace `bin/archify.mjs` in the commands below with the installed package's absolute path, or its path relative to your working directory; input and output paths resolve from that working directory.

## Low-latency operation without quality shortcuts

- **Minimize tool round trips, not engineering work.** In ShunCode, prefer one bounded Bash command for related repository identity checks and targeted source slices rather than creating a fresh terminal per file; reuse an idle terminal when practical. Prefer native batched file reads inside accessible workspace roots. Keep outputs concise, but read every source range needed to prove the diagram. Do not repeatedly read unchanged Skill references or generate exploratory diagrams.
- **Avoid predictable failed finalizations.** Before writing a repository-backed candidate, verify that its Git remote is a supported credential-free HTTP(S) GitHub/Gitee URL or SSH address. If no valid remote exists, never invent one: maintain truthful local source notes and disclose that the renderer cannot validate linked repository citations. This is an evidence-format limitation, not permission to skip checking actual code.
- **Exactly one complete automated delivery pipeline per unchanged candidate.** A passing `finalize` already performs `validate`, `deliver`, strict `check`, and `browser-check`; do not redundantly launch these four commands. For a failed or changed candidate, rerun the complete `finalize`. For every required complex-figure visual review, still run `visual-check` and actually inspect the 1440px screenshot. If the figure changes, regenerate and inspect its evidence; never reuse stale results.
- **Keep the editor out of the rendering critical path.** Design and finalize the canonical HTML first, resolve any visual repairs, then start the matching edit service once; capture its actual tokenized URL and verify HTTP 200. Do not start/restart editor instances for intermediate candidates. Editor availability remains mandatory at delivery.
- Track time for **source inspection → candidate authoring → CLI `finalize` → visual capture/review → editor startup/verification**, plus command transport overhead. Use a fixed input and identical gate levels when comparing speed with another version; do not interpret a short renderer-only benchmark as end-to-end speed.

For a real codebase, read [Repository authoring](references/repository-authoring.md) while tracing the requested behavior. A system description uses the steps below; an existing JSON uses the handoff path.

## Mandatory dual delivery: HTML + editable page

**Every new diagram delivery MUST provide both (1) the finalized, checked standalone HTML and (2) a real, usable editing page for that same diagram.** This also applies to supplied or repaired candidates. The editor is an optional *drawing aid*, but a required *delivery companion*: its auto-layout and viewport never determine the independently validated canonical HTML. A diagram failing visual acceptance is unfinished even if the HTML and editor both work. For `architecture` schema v1, after the final passing `finalize` (including any review repairs): 1. Preserve and report the finalized HTML **absolute path**, and preserve the corresponding `candidate.json` as the editable source. Do not alter the checked standalone HTML to insert edit controls or skip any of its validation/provenance gates.
2. Normally use `editor/deliver.mjs` above. For an already finalized artifact when only editor startup is needed, start `node <installed-archify-directory>/editor/serve.mjs <candidate.json> [--repo-root <evidence-repository>]` **from the diagram's project working directory** in a persistent background process. On Windows hide the helper process window. Resolve the installed directory from the Skill listing; never assume a hard-coded user's path. Use the exact candidate that generated the reported HTML.
3. Capture the **actual localhost URL printed by the editor** (including its access token), verify the server/page is reachable, and supply that URL to the user alongside the finalized HTML path. The editor must be running when reported as available; do not invent a URL or imply a stopped service is accessible. Keep the tokenized link private to the user, never publish or commit it. Explain that this local editing page remains available only while its server process runs; stop it on the user's request.
4. In the final response, visibly distinguish **正式 HTML（查看/导出）** from **可编辑页面（拖动/连线/保存）**; include the editable source path and the actual validation/browser/visual-review statuses. Each delivered diagram gets its own matching HTML and editor access, not an editor for a different candidate. For workflow/sequence/dataflow/lifecycle, use the **separate schema editor**: run `node <installed-archify-directory>/editor/serve-schema.mjs <candidate.json>` from the project root after `finalize`, capture its real localhost token URL, and verify HTTP accessibility. See `editor/README.md`. Describe its actual capabilities; form/JSON editing and renderer-backed preview are **not** a draggable canvas. If any editor cannot start, explicitly mark the editable page **not delivered** and provide the fallback command. Never mislabel a read-only HTML, change diagram type, or bypass verification to satisfy dual delivery.

## Existing candidate handoff

When the user supplies a frozen candidate, run `editor/deliver.mjs` first as one CLI invocation. Its embedded passing `finalize` receipt completes the automated gates; inspect its screenshots under Visual acceptance before claiming visual quality. For repair, follow step 5. `finalize` includes a bounded update check in its delivery receipt; see Update awareness.

## Fast authoring path

Use this path for ordinary generation. Read branch references only when their stated trigger applies. Do not narrate coordinate planning. 1. Choose `architecture`, `workflow`, `sequence`, `dataflow`, or `lifecycle` from the question.
2. Use the exact schema and example paths in the Type router without listing their directories. Read [Authoring defaults](references/authoring-defaults.md) and the mode's example in a bounded batch separate from project documents and complete schemas so neither is truncated; recover any missing section before writing. For Architecture, use the matching showcase example. For Sequence, Dataflow, and Lifecycle, also read the mode and common schemas. Read the relevant schema definition before choosing any new field, enum, or constrained text, especially boundary kinds. Examples teach shape, not facts. Use fresh IDs, wording, and layout. Go directly to the candidate without preliminary help, doctor, starter validation, temporary diagrams, or output-path listing. Query brands only for an explicitly requested mark; read [Brand marks](references/brand-marks.md) for an unknown mark with a user-provided URL.
3. Once scope and source evidence are covered, first identify the **reader's task, the ordered main path and genuine branches**, then group cooperating roles next to their owners. For a **new Architecture without user-fixed geometry**, use [Deterministic Architecture draft](references/architecture-draft.md): write `semantic.json` without coordinates, sizes, viewBox or manual route controls, then run `node bin/archify.mjs draft architecture <semantic.json> <candidate.json> --json` (include `--repo-root` for repository evidence). Use the resulting candidate for step 4; retain the draft receipt. This is the default for every model, not a weaker-model quality exemption. If no proposal passes, read the diagnostics and repair or author geometry manually under the existing contract. Existing supplied geometry remains authoritative and skips drafting. For other modes or manual Architecture authoring, establish hierarchy, legible labels, node sizes, and clear edge corridors **before** assigning positions. Preserve all required facts and conditions; there are no arbitrary node/edge quotas. Use automatic routes initially and hand-set routing only for diagnosed defects. Set `meta.quality_profile` to `"showcase"` unless the user requests dense `standard`.
4. Once the complete first candidate is written, run `editor/deliver.mjs`. It invokes the original `finalize` once, starting with showcase validation; successful first drafts need no separate pre-validation. Keep the candidate unchanged while the command runs:

   ```bash
   node editor/deliver.mjs <type> <candidate.json> <output.html> --quality showcase --json
   ```

   For a repository-backed candidate, include evidence on the first draft and use the complete first command: `node editor/deliver.mjs <type> <candidate.json> <output.html> --repo-root <repo-root> --quality showcase --json`.

   A passing receipt proves the included `validate`, `deliver`, strict `check`, and real-browser `browser-check` gates passed. Use its compact summary; run standalone commands only for a separate request or focused failure diagnosis.

5. A non-zero exit is never success. Read compact stdout or `evidence.summaryReceipt`, then [repair the failed gate](references/delivery-contract.md#failed-finalize-and-candidate-repair), including its repair limit. Preserve requested meaning and source evidence. For several tangled Architecture routes, read [Architecture layout repair](references/architecture-layout-repair.md); for measured field or geometry failures, read [Authoring contract](references/authoring-contract.md). Edit the connected neighborhood and rerun the complete `editor/deliver.mjs` command from step 4.

## Update awareness

`finalize` and standalone `deliver` include `update` in their receipts. Do not run a separate check for the same delivery. If `update.noticeRequired` is true, read `references/update-awareness.md` and keep one update line in your final response to the user, even after a quality gate fails. For a task with several diagrams, mention the update once in the final response. Snooze or ignore a reminder only when the user explicitly asks; never install or update on your own initiative. Before the first candidate, use the authoring references and relevant repository source, not Archify implementation or tests. Inspect Archify implementation if diagnostics remain unactionable after focused repairs.

## Type router

| Type | Use for | Schema | Example |
|---|---|---|---|
| `architecture` | Components, services, cloud/security boundaries, infrastructure; what something everyday is made of | `schemas/architecture.schema.json` | System descriptions, services, libraries, and CLI repos: `examples/web-app.architecture.json`; deployment repos: `examples/production-deployment.architecture.json` |
| `workflow` | Processes, approval gates, tool calls, runbooks, CI/CD; plans and step-by-step life processes | `schemas/workflow.schema.json` | `examples/agent-tool-call.workflow.json` |
| `sequence` | API call chains, request lifecycles, async traces, returns; back-and-forth between people | `schemas/sequence.schema.json` | `examples/cache-miss-request.sequence.json` |
| `dataflow` | Pipelines, ETL/ELT, lineage, governance, consumers; where money or documents go | `schemas/dataflow.schema.json` | `examples/product-analytics.dataflow.json` |
| `lifecycle` | State/status transitions, retries, waiting and terminal states; where an application or order stands | `schemas/lifecycle.schema.json` | `examples/deployment-release.lifecycle.json` |

When ambiguous, run `node bin/archify.mjs guide "<scenario>" --json`. Scenario proof examples are structural references, not facts to copy.

For an everyday subject, keep the same five modes and semantic types, then name them for the reader: use everyday `icon` values and `meta.legend` labels as in [Node icons](references/authoring-contract.md#node-icons). Ask for missing personal facts instead of inventing dates, amounts, or rules.

## Mermaid input

Read Mermaid for topology and meaning, then author fresh Archify JSON; do not mechanically render Mermaid styling.

- `flowchart` / `graph` → `workflow`, or `architecture` for a component map.
- `sequenceDiagram` → `sequence`; participants become semantic participants and arrows become messages.
- `stateDiagram` → `lifecycle`; states and transitions retain meaning, not Mermaid style.

## Delivery

**Visual-first completion gate:** `finalize: pass` is a technical prerequisite only. Follow [Visual acceptance](references/visual-acceptance.md), including actual 1440x900 screenshot inspection for every Architecture and Workflow >=8 nodes, before claiming finished professional visual quality. The primary flow, legible text, grouping, appropriate whitespace, and clear arrows must all be judged separately. Never report `visual_review: passed` based only on a CLI receipt. Compare same-viewport before/after evidence for a visual repair.

Use `editor/deliver.mjs` for the first candidate and after every repair; inspect its new screenshots.

`finalize` stops at the first non-passing gate. Its compact stdout and `<output-stem>.finalize-summary.json` are ordinary evidence. A passing run creates no screenshots and reports `visualReview: "not-requested"`.

When a passing Architecture receipt reports `visualReviewRecommendation.signals.resolvedCrossovers`, copy the candidate aside and apply the hints in one edit that changes only node positions and sizes: every node, relationship (including its `from` and `to`), label, and source stays as it was. Rerun `editor/deliver.mjs` once with `--out-dir <folder>/review-2`, because the previous HTML already owns its browser evidence. If that run fails or reports more crossings, restore the copy and run `editor/deliver.mjs` with `--out-dir <folder>/review-3`. Do not start a second placement round. Hints about extra bends alone are optional.

When `layoutReviewRecommendation.action` is `inspect-sequence-width`, follow [Sequence width review](references/delivery-contract.md#sequence-width-review) before handing off a newly authored Sequence.

Perceptual review is **required for every Architecture**, and whenever the user requests aesthetically pleasing results or reports a regression from a previous diagram. Inspect the real desktop screenshots returned by `editor/deliver.mjs` (no duplicate capture for unchanged output), and compare against a previously accepted diagram for the same system when available. Check visual hierarchy, main-path readability, node/card balance, whitespace, text scale, relationship color consistency, unnecessarily long detours, crossings, and label legibility. A passing `validate`/`browser-check` does not prove aesthetic quality. Treat `visualReviewRecommendation` and `layoutReviewRecommendation` as reasons to inspect and repair, **not** as guaranteed fixes or as permission to blindly shift all nodes. For a tangled drawing use [Architecture layout repair](references/architecture-layout-repair.md), preserve all required facts and connections, and make at most two evidence-based placement repairs, with `finalize` and new screenshots after each. Do not overwrite a previously accepted diagram for a visual experiment; preserve it and offer a separate reviewed candidate. If the reviewed result remains poor, report its concrete defects rather than marking it visually complete.

Read [Delivery contract](references/delivery-contract.md) for failed gates, standalone commands, provenance/recovery, repeated delivery, exports, or opening. Recovery follows `deliver` → strict provenance `check` → `browser-check`; captures require strict provenance.

For workflow viewport overflow, read [Workflow viewport repair](references/authoring-contract.md#workflow-viewport-repair) before the next layout edit.

Report artifact checks, browser evidence, captures, and actual perceptual review as distinct results. For an explicitly requested immediate preview or active desktop loop, see [Optional opening](references/delivery-contract.md#optional-opening).

## Optional viewer capabilities

The matching local editor is mandatory; follow [Editor documentation](editor/README.md).
It edits typed JSON, validates before saving, makes backups, and uses original finalize.
Start it only after delivery gates pass. Its official route cache never substitutes
unverified dashed guides for checked geometry. Auto-layout proposals and large-graph
navigation remain optional; they cannot bypass validation or visual acceptance.
The architecture visual editor provides a persistent light/dark toggle for the UI and editable canvas; changing editor theme does not alter typed JSON or export theme.
For relationship text edits, let users click the label in the local editor;
its inspector edits `label` and `font_sizes.label` with undo/redo. Keep label
backings transparent and preserve the connection endpoints and route unless
the user also requests routing changes.
See editor/README.md for complete controls, limits and performance audits.
`meta.animation: "trace"` is opt-in.

Read `references/viewer-runtime.md` only when the user explicitly asks for Share Cards, Route/Reach cards, motion, deep links, presentation, search/focus, or another Viewer Runtime feature.

## Setup and fallback

No install is required inside the skill package. For setup diagnosis, verify with:

```bash
node bin/archify.mjs doctor
node bin/archify.mjs demo <output-directory>
```

When shell access is unavailable, hand-place architecture SVG into `assets/template.html`, use CSS semantic classes rather than inline colors, and follow the visual review contract in `references/delivery-contract.md`.

## Output

State the actual `visual_review` status alongside automated evidence and the double-delivery outputs. Only an inspected image meeting [Visual acceptance](references/visual-acceptance.md) may be called visually polished; `finalize`, an editor preview, or a screenshot receipt alone cannot confer that claim. A visually unfinished chart must be called out explicitly.

For each new diagram delivery, return **both** the checked HTML absolute path and the live visual editor page URL (plus the `candidate.json` source path), following Mandatory dual delivery. Include the diagram type, validation summary, specification/artifact receipt, browser-evidence status, and truthful visual-review status. If either output is unavailable, disclose the missing deliverable explicitly rather than presenting the dual delivery as complete. Do not claim success for a non-zero command or claim visual inspection you did not perform.

In the architecture editor batch-font picker, hovering or focusing a text category highlights its corresponding diagram elements; leaving or closing the picker clears the preview without changing the model, selection or undo history.
