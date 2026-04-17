---
type: context-pack
status: active
pack_id: release-prep
scope: project-or-workstream
updated: 2026-04-17
tags:
  - context-pack
  - release
  - operations
---

# Context Pack: release prep

## Purpose
- Assemble the notes an agent needs before preparing or validating a release.
- Keep the pack focused on current operating state, baseline, risks, and recent release-adjacent changes.

## Use when
- A project is approaching deploy, launch, or rollout validation.
- A workstream is coordinating a release across multiple projects.

## Manifest
```yaml
version: 1
pack_id: release-prep
target:
  allowed_scope_types:
    - project
    - workstream
  required_inputs:
    - scope_path
defaults:
  token_budget: medium
  max_notes: 9
selection:
  seed:
    - path: "{scope_path}/index.md"
    - path: "{scope_path}/tasks.md"
  include:
    - path: "{scope_path}/context.md"
      when: file_exists("{scope_path}/context.md")
    - folder: "{scope_path}/decisions"
      sort: date_desc
      limit: 3
    - folder: "{scope_path}/sessions"
      sort: date_desc
      limit: 2
      when: recent_release_activity == true
    - path: "{scope_path}/affected-projects.md"
      when: scope_type == "workstream"
output:
  sections:
    - release-baseline
    - open-risks
    - pending-decisions
    - recent-execution-deltas
  extraction_hints:
    - baseline_commit
    - production_url
    - next_action
```

## Notes
- This pack expects release-critical metadata to stay in canonical notes, not in session-only state.
- The future CLI can enrich this pack with deployment or changelog data without changing the vault contract.
