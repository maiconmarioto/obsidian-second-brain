---
type: context-pack
status: active
pack_id: incident-context
scope: project-or-workstream
updated: 2026-04-17
tags:
  - context-pack
  - incident
  - continuity
---

# Context Pack: incident context

## Purpose
- Give an agent immediate operational context for debugging or coordinating an incident.
- Prefer current queue and recent volatile history while still grounding in canonical scope notes.

## Use when
- A project issue becomes time-sensitive.
- A cross-project incident is coordinated from a workstream.

## Manifest
```yaml
version: 1
pack_id: incident-context
target:
  allowed_scope_types:
    - project
    - workstream
  required_inputs:
    - scope_path
defaults:
  token_budget: high
  max_notes: 10
selection:
  seed:
    - path: "{scope_path}/tasks.md"
    - path: "{scope_path}/index.md"
  include:
    - path: "{scope_path}/context.md"
      when: stable_background_needed == true
    - folder: "{scope_path}/sessions"
      sort: date_desc
      limit: 4
    - folder: "{scope_path}/decisions"
      sort: date_desc
      limit: 2
    - path: "{scope_path}/affected-projects.md"
      when: scope_type == "workstream"
  prioritize:
    sections:
      - blocked
      - decision-needed
      - volatile-facts
      - next-steps
output:
  sections:
    - immediate-operating-state
    - recent-incident-history
    - constraints-and-decisions
```

## Notes
- This pack is the only one that defaults to a higher token budget because incidents often need recent volatile facts.
- When the future CLI gains fragment retrieval, this pack should preferentially extract `Blocked`, `Decision needed`, `Volatile facts`, and `Next steps` sections instead of whole files.
