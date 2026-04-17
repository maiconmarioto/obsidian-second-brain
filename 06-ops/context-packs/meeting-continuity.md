---
type: context-pack
status: active
pack_id: meeting-continuity
scope: project-or-workstream
updated: 2026-04-17
tags:
  - context-pack
  - continuity
  - meeting
---

# Context Pack: meeting continuity

## Purpose
- Rebuild the minimum continuity needed before a sync, review, or handoff conversation.
- Bias toward recent sessions while keeping the current canonical operating state visible.

## Use when
- An agent needs to resume a project or workstream discussion after one or more sessions.
- The caller wants the latest decisions, current queue, and recent operational history in one pass.

## Manifest
```yaml
version: 1
pack_id: meeting-continuity
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
      when: stable_background_needed == true
    - folder: "{scope_path}/decisions"
      sort: date_desc
      limit: 2
    - folder: "{scope_path}/sessions"
      sort: date_desc
      limit: 3
    - path: "{scope_path}/affected-projects.md"
      when: scope_type == "workstream"
  promote:
    from_sessions:
      sections:
        - decisions-or-changes
        - next-steps
        - outputs
output:
  sections:
    - current-state
    - recent-decisions
    - latest-session-deltas
  preferred_order:
    - "{scope_path}/tasks.md"
    - "{scope_path}/index.md"
    - "{scope_path}/sessions"
```

## Notes
- The future CLI should prefer the newest sessions first, but should not skip `tasks.md`.
- This pack is the default continuity bundle for syncs, standups, and review meetings.
