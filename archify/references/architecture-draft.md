# Deterministic Architecture draft

For a new Architecture without fixed geometry, describe the facts in ordinary
schema-v1 JSON: `schema_version`, `diagram_type`, `meta.title`, `meta.output`,
`components` with `id`, `type`, `label`, and `connections` with `from`, `to` and
meaningful labels. Preserve requested sources, conditions, boundaries, cards,
and metadata. Omit node `pos`, `size`, `row`, `col`, `layout`, `meta.viewBox`,
and manual route/label controls. Read the schema for enums and optional fields.

```sh
node bin/archify.mjs draft architecture semantic.json candidate.json --json
node editor/deliver.mjs architecture candidate.json diagram.html --quality showcase --json
```

Set `meta.output` to the actual portable HTML path before drafting. Pass
`--repo-root <repository>` to both commands when using repository evidence.
The candidate destination must be fresh; draft refuses to overwrite it.

Draft sizes nodes from actual text, uses layered placement and bounded spacing
proposals in both reading directions, and validates each through the original
renderer. Cyclic scenes also try a placement graph without DFS back edges;
all original relationships remain in the checked candidate. Selection penalizes
excess desktop width and then total extent. Boundary scenes try both boundary
strips and topology-first placement, retaining all boundaries in the output.
Long journeys also try alternating rows with two, three or four columns.
At most thirty proposals are tried.
The receipt includes each proposal's diagnostics. If none passes, no candidate
is written: repair the concrete diagnostics or use manual authoring. Never
remove required facts or relationships to make draft pass.

The same semantic input produces the same draft regardless of the authoring
model. Different interpretations of the user's request can still produce
different topology and quality. This tool reduces coordinate planning work;
it does not prove correct source interpretation, eliminate all crossings, or
guarantee polished results. Continue through the full delivery and screenshot
review gates. Existing frozen candidates and explicit geometry go directly to
delivery; draft rejects them rather than silently replacing their layout.

For a failed delivery or visual review, repair the generated candidate under
the existing bounded repair contract. Keep `semantic.json` and draft receipts
alongside it. A passing draft is validation evidence only; `visualReview` stays
`not-requested` until actual screenshot review.
