---
type: protocol
status: active
---

# Agent Protocol

## Objective
- Make this vault predictable for Codex, Claude Code, OpenCode, Gemini CLI, and any other agent.
- Keep memory structured enough for retrieval, but simple enough for humans to maintain.

## Retrieval Order
1. Read the relevant project `index.md` or workstream `index.md`.
2. Read `context.md`, `tasks.md`, and recent `sessions/` notes in that scope.
3. Follow linked shared knowledge or shared decisions only when they are relevant.
4. Summarize working context before making edits or writing new notes.

## Write Rules
- Raw capture goes to `00-inbox/`.
- Single-project execution goes under `01-projects/<project>/`.
- Multi-project execution goes under `02-workstreams/<workstream>/`.
- Reusable knowledge goes to `03-shared-knowledge/`.
- Standards and cross-project decisions go to `04-shared-decisions/`.
- Use templates from `05-templates/` whenever creating structured notes.

## Project Rule
- Every project should have at least:
  - `index.md`
  - `context.md`
  - `tasks.md`
  - `decisions/`
  - `sessions/`

## Workstream Rule
- Every cross-project workstream should have at least:
  - `index.md`
  - `scope.md`
  - `affected-projects.md`
  - `tasks.md`
  - `decisions/`
  - `sessions/`

## Promotion Rule
- If a note started in a project or workstream but becomes reusable, move or rewrite it into `03-shared-knowledge/`.
- If a local decision becomes standard, promote it into `04-shared-decisions/`.

## Session Rule
- Sessions are execution memory, not canonical truth.
- After a session, consolidate durable outcomes into:
  - `tasks.md`
  - `decisions/`
  - shared knowledge

## Naming Rule
- Prefer kebab-case for folders and file names.
- Prefix shared decisions with a stable numeric ID, for example `0001-...`.
- Use dates only when chronology matters, such as inbox notes or session notes.

## Safety Rule
- Do not overwrite `.obsidian/workspace.json` intentionally.
- Do not store secrets in this vault.
- Do not treat `00-inbox/` as trusted or consolidated context.
