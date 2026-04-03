---
type: guide
status: active
---

# Workstreams

## Purpose
- Hold execution context for initiatives that touch multiple projects.

## Examples
- one feature requiring frontend, backend, and mobile changes
- a migration across several services
- a release train
- a cross-repo refactor
- an incident spanning multiple systems

## Standard structure
```text
02-workstreams/<workstream-name>/
├── index.md
├── scope.md
├── affected-projects.md
├── tasks.md
├── decisions/
└── sessions/
```

## Why this exists
- Without a workstream home, multi-project work gets fragmented across project folders.
- The workstream is the control plane.
- The projects remain the system-specific execution planes.

## Rule of thumb
- If the same effort would otherwise create synchronized notes in 2 or more projects, create a workstream.
