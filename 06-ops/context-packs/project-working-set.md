---
type: context-pack
status: active
pack_id: project-working-set
scope: project
updated: 2026-04-17
tags:
  - context-pack
  - project
  - retrieval
---

# Context Pack: project working set

## Purpose
- Load the minimum working context for an agent operating inside one project.
- Keep retrieval anchored in canonical notes and only include recent execution history when needed.

## Use when
- An agent is about to implement, review, or plan work for a single project.
- The caller already knows the target project folder.

## Manifest
```yaml
version: 1
pack_id: project-working-set
target:
  allowed_scope_types:
    - project
  required_inputs:
    - scope_path
defaults:
  token_budget: medium
  max_notes: 8
selection:
  seed:
    - path: "{scope_path}/index.md"
    - path: "{scope_path}/tasks.md"
  include:
    - path: "{scope_path}/context.md"
      when: stable_background_needed == true
    - folder: "{scope_path}/decisions"
      sort: date_desc
      limit: 3
    - folder: "{scope_path}/sessions"
      sort: date_desc
      limit: 2
      when: operational_history_needed == true
  expand:
    links:
      from:
        - "{scope_path}/index.md"
        - "{scope_path}/tasks.md"
      depth: 1
      limit: 4
  exclude:
    - folder: "{scope_path}/knowledge"
      unless: reusable_reference_needed == true
output:
  sections:
    - canonical-entrypoints
    - local-decisions
    - recent-execution-history
  preferred_order:
    - "{scope_path}/index.md"
    - "{scope_path}/tasks.md"
    - "{scope_path}/context.md"
```

## Notes
- This pack mirrors the vault retrieval order in `AGENT_PROTOCOL.md`.
- It is intentionally path-first so the future CLI can use it before the hybrid index is available.
