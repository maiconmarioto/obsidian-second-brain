---
name: obsidian-brain
description: Use Obsidian CLI as the primary interface to consult and update the engineering memory vault `__VAULT_NAME__`, regardless of the current project directory.
---

# Obsidian Brain

Use this skill when the task involves engineering memory, historical context, prior decisions, shared patterns, project notes, workstreams, template-based note creation, or the Obsidian second brain.

## Core rule
- Treat Obsidian as external persistent engineering memory.
- Use `obsidian` CLI as the primary interface.
- Do not depend on the current project `cwd` to find memory.
- Outside the vault, always target the vault explicitly with `vault="__VAULT_NAME__"` as the first parameter.
- Use direct filesystem reads of the vault only as fallback.

## Required vault
- Vault name: `__VAULT_NAME__`
- Vault root: `__VAULT_ROOT__`

## First reads
Before making structural decisions or writing notes, read:
1. `obsidian vault="__VAULT_NAME__" read path="INDEX.md"`
2. `obsidian vault="__VAULT_NAME__" read path="AGENT_PROTOCOL.md"`
3. `obsidian vault="__VAULT_NAME__" read path="04-shared-decisions/0001-vault-structure.md"`

## Retrieval strategy
1. Search for relevant context with `obsidian search`.
2. Read canonical notes with `obsidian read`.
3. Inspect structure with `obsidian files` and `obsidian folders`.
4. Follow project, workstream, shared knowledge, and shared decision notes as needed.
5. Only after that, answer, plan, or write.

## CLI patterns
When outside the vault, use:

```bash
obsidian vault="__VAULT_NAME__" search query="payments"
obsidian vault="__VAULT_NAME__" read path="AGENT_PROTOCOL.md"
obsidian vault="__VAULT_NAME__" files folder="01-projects"
obsidian vault="__VAULT_NAME__" folders folder="02-workstreams"
```

When writing:

```bash
obsidian vault="__VAULT_NAME__" create path="00-inbox/example.md" content="# Example"
obsidian vault="__VAULT_NAME__" append path="01-projects/my-project/tasks.md" content="- [ ] Next task"
```

## Classification rules
- `00-inbox`: raw capture, not consolidated
- `01-projects`: local context for one project, repo, service, or product surface
- `02-workstreams`: initiatives affecting multiple projects
- `03-shared-knowledge`: reusable engineering knowledge
- `04-shared-decisions`: decisions valid beyond one project
- `05-templates`: note templates
- `06-ops`: vault operations

## Operating rules
- If work is local to one project, operate inside that project.
- If work spans multiple projects, create or use a workstream.
- Keep sessions inside the project or workstream they belong to.
- Promote reusable knowledge to `03-shared-knowledge`.
- Promote cross-project standards or choices to `04-shared-decisions`.
- Do not leave consolidated information in `00-inbox`.

## Safety rules
- Do not store secrets in the vault.
- Do not intentionally overwrite `.obsidian/workspace.json`.
- Do not treat `00-inbox` as canonical truth.
- Keep names in kebab-case.
- Do not reintroduce a generic personal PKM structure.

## If the CLI is unavailable
- Confirm Obsidian is running.
- Confirm `obsidian` CLI is installed and registered.
- Only if CLI access is blocked, use direct filesystem reads of the vault as temporary fallback.
