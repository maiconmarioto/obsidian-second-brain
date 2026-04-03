---
type: decision
decision_id: 0001
status: accepted
date: 2026-04-03
scope: vault
---

# Decision 0001: Use a project plus workstream vault model

## Context
- This vault is optimized for software engineering across multiple projects.
- Work frequently spans more than one repository or system.
- A generic PKM structure would create noise and weak retrieval for agents.

## Decision
- Use `01-projects/` for project-local context.
- Use `02-workstreams/` for cross-project execution.
- Use `03-shared-knowledge/` for reusable engineering knowledge.
- Use `04-shared-decisions/` for standards and cross-project decisions.
- Keep session notes inside the project or workstream they belong to.

## Consequences
- Multi-project features gain a single operational home.
- Shared knowledge is easier to reuse.
- Sessions stop polluting the root.
- Users and agents must promote notes deliberately instead of leaving everything in raw capture.
