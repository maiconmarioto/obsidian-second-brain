---
name: obsidian-brain
description: Use vault-ai as the primary retrieval layer and Obsidian CLI as the canonical read/write interface for the engineering memory vault `__VAULT_NAME__`, regardless of the current project directory.
---

# Obsidian Brain

Use this skill when the task involves engineering memory, historical context, prior decisions, shared patterns, project notes, workstreams, template-based note creation, or the Obsidian second brain.

## Iron laws
- Treat Obsidian as external persistent engineering memory.
- Use `vault-ai` as the primary retrieval layer when the local vault toolkit is available.
- Use `obsidian` CLI as the canonical read/write interface.
- Do not depend on the current project `cwd` to find memory.
- Outside the vault, always target the vault explicitly with `vault="__VAULT_NAME__"` in Obsidian CLI commands.
- Before writing new durable memory that the user did not explicitly request, ask for confirmation.
- Canonical notes must not contain temporary working-tree state.
- If a fact will likely age after the next commit, deploy, or local experiment, it belongs in `sessions/`, not in canonical notes.
- When you finish delivering a feature, fix, or the user's requested plan, consider whether the durable outcome should be offered for vault persistence.

## Required vault
- Vault name: `__VAULT_NAME__`
- Vault root: `__VAULT_ROOT__`
- Vault AI launcher: `__VAULT_AI_LAUNCHER__`

## Tool preference
1. Use `__VAULT_AI_LAUNCHER__ search --compact` for retrieval.
2. Use `__VAULT_AI_LAUNCHER__ pack-build` for recurring context assembly.
3. Use `obsidian read` to open the exact canonical notes returned by retrieval.
4. Use `obsidian files` and `obsidian folders` only for structural inspection.
5. Use `obsidian create`, `append`, and `prepend` for writes.
6. Use direct filesystem reads only if both `vault-ai` and the verified Obsidian CLI path are unavailable.

## Minimal handshake
If you are uncertain about the local environment, verify only this minimal surface before trusting the skill:
1. `node --version`
2. `npm --version`
3. `obsidian version`
4. `obsidian help`

Use the minimal handshake only when needed. Do not turn every use of this skill into a full environment audit.

## First reads
Before making structural decisions or writing notes, read:
1. `obsidian read vault="__VAULT_NAME__" path="INDEX.md"`
2. `obsidian read vault="__VAULT_NAME__" path="AGENT_PROTOCOL.md"`
3. `obsidian read vault="__VAULT_NAME__" path="04-shared-decisions/0001-vault-structure.md"`

## Retrieval strategy
1. Start with `__VAULT_AI_LAUNCHER__ search --compact "<query>"`.
2. Read the top canonical hits with `obsidian read`.
3. If the task is recurring, try `__VAULT_AI_LAUNCHER__ pack-build <pack-id> ...` before manually reading many notes.
4. Use `obsidian files` and `obsidian folders` only when you need structural confirmation.
5. Read `sessions/` only if canonical notes are insufficient.
6. Only after that, answer, plan, or write.

## AI-first retrieval policy
- Optimize for token efficiency, not human browsing.
- Start from the smallest canonical note or section that can answer the question.
- Default order inside a project or workstream:
  1. `index.md`
  2. `tasks.md`
  3. relevant `decisions/`
  4. `context.md`
  5. recent `sessions/`
- Prefer metadata and short bullets over long prose.
- Avoid reading full files or whole folders unless the narrower notes are insufficient.
- Avoid duplicating the same fact across canonical notes.

## Retrieval commands
Run from any working directory:

```bash
__VAULT_AI_LAUNCHER__ search --compact "payments"
__VAULT_AI_LAUNCHER__ pack-build project-working-set --project coziva --budget medium
__VAULT_AI_LAUNCHER__ health
__VAULT_AI_LAUNCHER__ lint-frontmatter
```

Use Obsidian CLI to open returned notes:

```bash
obsidian read vault="__VAULT_NAME__" path="AGENT_PROTOCOL.md"
obsidian read vault="__VAULT_NAME__" path="01-projects/coziva/index.md"
obsidian files vault="__VAULT_NAME__" folder="01-projects"
obsidian folders vault="__VAULT_NAME__" folder="02-workstreams"
```

When writing:

```bash
obsidian create vault="__VAULT_NAME__" path="00-inbox/example.md" content="# Example"
obsidian append vault="__VAULT_NAME__" path="01-projects/my-project/tasks.md" content="- [ ] Next task"
```

## Operating rules
- If work is local to one project, operate inside that project.
- If work spans multiple projects, create or use a workstream.
- Keep sessions inside the project or workstream they belong to.
- Promote reusable knowledge to `03-shared-knowledge`.
- Promote cross-project standards or choices to `04-shared-decisions`.
- Do not leave consolidated information in `00-inbox`.
- Keep canonical notes stable; keep transient repo state and temporary observations in `sessions/`.
- When writing canonical notes, prefer structured fields such as `repo_path`, `production_url`, `baseline_commit`, `primary_stack`, and `next_action`.
- When the user asks what should be remembered, what the takeaway is, or what should be kept from the work, treat that as a strong signal to offer a vault update.
- At the end of a completed feature, fix, or implementation plan, ask once whether the durable result should be saved to the vault if the user did not already request it.
- Prefer this offer as normal conversational behavior from the skill rather than relying on a final stop-hook interruption.

## Classification rules
- `00-inbox`: raw capture, not consolidated
- `01-projects`: local context for one project, repo, service, or product surface
- `02-workstreams`: initiatives affecting multiple projects
- `03-shared-knowledge`: reusable engineering knowledge
- `04-shared-decisions`: decisions valid beyond one project
- `05-templates`: note templates
- `06-ops`: vault operations

## Safety rules
- Do not store secrets in the vault.
- Do not intentionally overwrite `.obsidian/workspace.json`.
- Do not treat `00-inbox` as canonical truth.
- Keep names in kebab-case.
- Do not reintroduce a generic personal PKM structure.
- Do not assume `vault-ai` writes notes; it is for retrieval, packs, and operational checks.
- Do not rely on being inside the vault directory; the launcher already targets the configured vault root.
- If hooks ask whether a result should be persisted, ask the user once, then either write it or drop it.
- If the user already confirmed a vault update in the current turn, proceed with the write without asking again.

## If vault-ai is unavailable
- Confirm `__VAULT_AI_LAUNCHER__` exists and is executable.
- Confirm `npm install` has already been run in the vault.
- Confirm the initial index exists or rebuild it with `__VAULT_AI_LAUNCHER__ index`.
- If `vault-ai` is blocked, fall back to verified Obsidian CLI reads.
- Only if Obsidian CLI is also blocked, use direct filesystem reads as temporary fallback.
