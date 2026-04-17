---
type: ops
status: active
updated: 2026-04-17
tags:
  - context-pack
  - retrieval
  - vault-ai
---

# Context Packs

## Purpose
- Hold reusable retrieval manifests for recurring agent jobs.
- Preserve the existing project/workstream model instead of creating a parallel memory structure.
- Stay useful before the future CLI and search core are ready.

## Manifest contract
- Each pack is a Markdown note with a small frontmatter header and one `Manifest` YAML block.
- The YAML block is the machine-facing contract for the future CLI.
- Placeholders such as `{scope_path}` and `{today}` are resolved by the caller.
- Packs should prefer canonical notes first and only pull `sessions/` when continuity or volatile facts are required.

## Current packs
- [project-working-set.md](/Users/maiconmarioto/Documents/obsidian-second-brain/06-ops/context-packs/project-working-set.md)
- [meeting-continuity.md](/Users/maiconmarioto/Documents/obsidian-second-brain/06-ops/context-packs/meeting-continuity.md)
- [research-brief.md](/Users/maiconmarioto/Documents/obsidian-second-brain/06-ops/context-packs/research-brief.md)
- [release-prep.md](/Users/maiconmarioto/Documents/obsidian-second-brain/06-ops/context-packs/release-prep.md)
- [incident-context.md](/Users/maiconmarioto/Documents/obsidian-second-brain/06-ops/context-packs/incident-context.md)

## Design rules
- Seed from `index.md` and `tasks.md` whenever a project or workstream exists.
- Pull `context.md` only when stable background is needed.
- Pull `decisions/` before `sessions/` when both are available.
- Keep pack logic path-aware and metadata-aware so it remains compatible with both direct filesystem selection and future hybrid retrieval.
