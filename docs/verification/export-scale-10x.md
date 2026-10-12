# 10脳 export and test repair verification

Comparison base: `859159aa6a971cb1f4fc309c7165f8ffe6c0844d` (`dev`). This change follows the user-requested export choices and subsequent repair of the failing complete test suite.

## Reused local evidence

The source export directory had no Git metadata. Before preparing this GitHub branch, `npm test` ran on its combined source: 2424 tests, 2249 passed, 0 failed, 175 explicitly skipped. Real Chrome export checks: 18 passed, 0 skipped; native PNG dimensions for 1/3/5/7/10脳, actual 10脳 GIF/WebM decoding, invalid scales and oversize errors. README GIF: 54 frames, 960脳540, 5.4 seconds; 9 README checks passed. Package smoke and scoped Skills CLI tests passed. These are reused source-directory results, not remote CI results.

Changes preserve authored topology, the existing opaque/default export behavior, transparent-format behavior, SVG vector output and size limits. Delta validation now checks SVG geometry rather than scripting vocabulary or labels. Update checking uses an absolute network deadline so the failed-check cache can commit before service termination. Windows tests use namespace-equivalent paths and directory junctions; unavailable file-symlink cases skip before modifying fixtures. Git-dependent package tests use a private source index only for exported source directories. Production tracked-only staging is unchanged.

## Git branch evidence

- All tracked runtime/schema/test/config source was compared to the passing source export after LF normalization. Differences are the pre-existing fork editor/boundary tests and browser-gate list; implementation files match. Their retained fork boundary regression is checked separately.
- Branch Viewer freshness and golden checks pass. Real-Chrome export, README, Skill installer/frontmatter, XML and offline-font checks: 50 passed, 0 failed/skipped.
- Official Node 22.23.2/zlib 1.3.1-e00f703 package license/notices, arbitrary-precision version and non-portable-index gates: 4 passed, 0 skipped.
- Branch archive rebuilt with the unchanged tracked-file stager. README GIF and receipt regenerated from LF-normalized branch Gallery artifacts.
- Public [10× menu capture](export-scale-10x-menu.png) uses the bundled architecture example at 1440×1000, dark/classic; inspected separately from automated export-size checks.
- Complete Git-branch `npm test --prefix archify`: 2424 tests, 2249 passed, 0 failed, 0 cancelled, 175 skipped. Skips cover opt-in browser suites and unavailable host-specific facilities; the separate complete browser/WebM CI gates remain subject to remote CI.
- Retained fork boundary-title regression: 2 passed, 0 failed/skipped.
- Two tracked-source canonical ZIP builds produced identical SHA-256 `2a6d42c6bd72e9c5bcb66875f34022cb2a53a9d89601afddb4090d1647741184` (143 files). Remote CI results are reported separately in the PR.

No user-specific diagrams, local editor tokens, installation paths or private execution logs are included. No release/tag, stable promotion or live installation is part of this publication.
