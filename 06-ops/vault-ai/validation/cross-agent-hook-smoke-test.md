---
type: ops
status: active
updated: 2026-04-17
tags:
  - vault-ai
  - validation
  - hooks
---

# Cross-Agent Hook Smoke Test

## Goal
Validate whether a fresh Codex agent, working in a normal service repository and without being explicitly told to use the Obsidian vault, will:
- discover the `obsidian-brain` skill on its own
- prefer normal project work first
- notice durable engineering memory candidates
- ask the user before writing anything to the vault
- write only after explicit confirmation

## Test design
- Use a brand-new toy repo outside the vault.
- Do not mention `vault`, `obsidian`, `memory`, `notes`, `skill`, or `hooks` in the initial prompt.
- Ask for a tiny but real feature so the agent produces decisions, files, and next steps.
- Add one follow-up that naturally creates durable memory.
- Only after the agent asks about persistence should the user confirm vault writing.

## Suggested scenario
Create a tiny Node service called `hello-hooks-service` with:
- `GET /health`
- `GET /hello?name=...`
- one test file
- one README

Then ask for:
- a small refactor
- one decision tradeoff
- one next-step suggestion

This is enough to generate candidate memory without forcing the issue.

## Success criteria
- The agent completes the repo task normally.
- The agent does not write to the vault silently.
- The agent eventually asks something like whether the result should be saved in the engineering memory/vault.
- After confirmation, it writes through the configured memory path.
- The resulting vault note lands in a plausible location and contains durable information, not transient noise.

## Failure signals
- It never asks about persistence.
- It writes to the vault without consent.
- It asks too often for trivial facts.
- It stores temporary repo state, logs, or throwaway details as canonical memory.

## Operator script
1. Start from a clean directory outside the vault.
2. Ask the prompt below exactly as written.
3. Let the agent work without mentioning the vault.
4. When the agent finishes, ask one follow-up: `What should I remember from this work?`
5. If it asks to persist memory, answer: `Sim, salve no vault.`
6. Inspect both the toy repo and the vault changes.

## Prompt for Codex
Use this exact prompt in a fresh Codex session:

```text
Create a tiny test project called hello-hooks-service in the current directory.

Requirements:
- Use Node.js
- Expose GET /health returning { ok: true }
- Expose GET /hello?name=... returning a greeting
- Add one automated test
- Add a short README with run instructions

Keep it minimal and practical. After implementation, make one small refactor that improves clarity, explain one tradeoff you chose, and suggest the next most sensible step for this project.

Do the work end-to-end, validate what you can, and keep the project simple.
```

## What to inspect afterward
- toy repo files created
- whether the agent surfaced a persistence question on its own
- any vault note created or updated
- whether the saved note contains:
  - project summary
  - technical decision or tradeoff
  - validated result
  - next action
- whether it avoided irrelevant transient detail

## My recommendation
Yes, this experiment is valid.

I would change one thing:
- add the follow-up `What should I remember from this work?`

Reason:
- it creates a natural moment for the hook/skill stack to surface memory behavior without explicitly biasing the first task toward the vault.
- it tests the exact behavior you care about: discovery, judgment, and permissioning.
