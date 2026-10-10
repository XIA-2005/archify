# Archify visual editor customization

This fork restores mandatory delivery of a matching **Archify · 可视化编辑器**, the standalone HTML and editable JSON. The user-authorized scope covers the existing architecture editor and a common visual acceptance workflow.

## Behavior

- Architecture: drag nodes; edit text and connections; undo/redo; export current unsaved drafts as PNG, JPEG, WebP or SVG through the canonical renderer.
- Other diagram modes retain their schema/form editor; they do not have a draggable graph canvas.
- `editor/deliver.mjs` invokes the original finalize once, captures real screenshots, starts the matching local editor and verifies HTTP availability and the frozen candidate hash.
- Preview, image export and saving forward the same optional `--repo-root` used for repository evidence.
- Every Architecture requires actual light/dark image inspection. Automated receipts never establish aesthetic acceptance.
- Upstream default geometry and routing remain stable. Explicit font/line/arrow controls use expanded geometry and collision checks.
- Identical JSON renders deterministically. Different authoring models can still choose different structures and coordinates; common design rules and image review control those differences.

## Delivery

Run from the diagram project directory, replacing `<skill-root>` with the checked-out or installed package directory:

```text
node <skill-root>/editor/deliver.mjs architecture <candidate.json> <diagram.html> --quality showcase --json
```

The editor listens only on localhost. Its private URL is available while the local Node process runs. Do not publish editor access tokens or private project diagrams.

See [editor documentation](editor/README.md) and [visual acceptance](references/visual-acceptance.md). Keep these customizations and their file manifest when updating from upstream. Publishing this fork does not authorize changes to live installations.

The upstream MIT license, attribution and third-party notices are retained. This is a customized fork of upstream v3.0.1, not an official upstream release.
