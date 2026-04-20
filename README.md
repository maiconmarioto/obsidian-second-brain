# Obsidian Engineering Brain

Local-first engineering memory for multi-project software work, designed for human operators and coding agents that need reliable context, retrieval discipline, and durable decision records.

## Overview
This repository defines a structured Obsidian vault used as persistent engineering memory across projects, workstreams, and shared operational standards. It is built for teams and individuals who want agents to retrieve canonical context intentionally instead of inferring state from whichever repository happens to be open.

The vault combines a disciplined information architecture with a CLI-first operating model:
- `vault-ai` provides compact retrieval, indexing, linting, and context-pack assembly.
- The Obsidian CLI remains the canonical interface for reading and writing notes.
- A shared `obsidian-brain` skill aligns supported agents on the same memory contract.
- Hook integrations add optional confirmation before durable memory writes.

## Design Goals
- Keep engineering memory outside individual repositories and terminal sessions.
- Separate canonical knowledge from transient execution history.
- Support project-local work without losing cross-project continuity.
- Make agent retrieval deterministic, explicit, and token-efficient.
- Preserve a single operational model across multiple agent runtimes.

## Repository Model
The vault is organized around durable engineering use cases rather than generic PKM categories.

- `00-inbox/`: raw capture and unconsolidated intake.
- `01-projects/`: execution context for a single product, service, repository, or surface area.
- `02-workstreams/`: initiatives that span multiple projects.
- `03-shared-knowledge/`: reusable engineering knowledge and patterns.
- `04-shared-decisions/`: standards, policies, and cross-project decisions.
- `05-templates/`: note templates for repeatable structure.
- `06-ops/`: operational tooling, installer assets, context packs, governance, and the canonical skill source.

Core protocol documents:
- [INDEX.md](INDEX.md)
- [AGENT_PROTOCOL.md](AGENT_PROTOCOL.md)
- [04-shared-decisions/0001-vault-structure.md](04-shared-decisions/0001-vault-structure.md)

## Capabilities
This vault is more than a note repository. It is an operational memory layer with installable tooling and agent integration.

### Shared Agent Skill
The canonical skill source is `obsidian-brain`, maintained in:
- [06-ops/skills/obsidian-brain/README.md](06-ops/skills/obsidian-brain/README.md)
- [06-ops/skills/obsidian-brain/SKILL.template.md](06-ops/skills/obsidian-brain/SKILL.template.md)

The skill standardizes how agents should behave:
- treat the vault as external persistent engineering memory
- retrieve via `vault-ai` first when available
- read and write through the Obsidian CLI
- target the vault explicitly instead of depending on `cwd`
- distinguish canonical notes from volatile session state
- request confirmation before writing new durable memory when the user did not ask for it explicitly

### Retrieval and Context Assembly
The local toolkit under `tools/vault-ai/` provides:
- compact full-text retrieval against the vault
- frontmatter and structural linting
- health checks for the local runtime
- context-pack assembly for recurring workflows
- index generation for repeatable local bootstrap

Context packs are documented in:
- [06-ops/context-packs/README.md](06-ops/context-packs/README.md)

### Multi-Agent Runtime Support
The installer provisions a machine-local runtime for these agent environments:
- Claude Code
- Codex
- OpenCode
- Kiro

It renders local configuration, links the shared skill where applicable, prepares launchers, and installs the relevant hook integration model for each platform.

## Installation
The canonical installer is:
- [06-ops/install-obsidian-brain-skill.sh](06-ops/install-obsidian-brain-skill.sh)

### Requirements
- Obsidian desktop application
- Obsidian CLI installed and configured
- Node.js and npm

### Standard Install
Run from the repository root:

```bash
./06-ops/install-obsidian-brain-skill.sh
```

### Non-Interactive Install
For automated or repeatable setup:

```bash
./06-ops/install-obsidian-brain-skill.sh \
  --vault-name obsidian-second-brain \
  --vault-root "/absolute/path/to/obsidian-second-brain" \
  --agents claude,codex,opencode,kiro \
  --non-interactive
```

### Dry Run
Use a dry run to validate the setup path and generated actions before writing anything locally:

```bash
./06-ops/install-obsidian-brain-skill.sh --dry-run
```

## What the Installer Provisions
The installer prepares a reusable, machine-local runtime rather than coupling operation to the repository checkout.

It will:
- render a machine-local copy of the `obsidian-brain` skill
- prepare local `vault-ai` dependencies
- build the initial search index
- run smoke checks for health and linting
- install `vault-ai` and `obsidian-brain-hook` launchers into `~/.local/bin`
- write installer configuration into `~/.config/obsidian-brain/config.env`
- integrate hooks or equivalent event handling for supported agents

Typical local install targets include:
- `~/.local/share/obsidian-brain/current/`
- `~/.claude/skills/obsidian-brain`
- `~/.codex/skills/obsidian-brain`
- `~/.config/opencode/skills/obsidian-brain`
- `~/.kiro/agents/obsidian-brain.json`

The latest index report is written to:
- `.vault-ai/reports/last-index.json`

## Hook Model
Hook support is platform-specific and intentionally follows each tool's native integration model.

- Claude Code: prompt, stop, and Bash-oriented interception for memory confirmation.
- Codex: lifecycle and Bash-centered interception through its documented hook surfaces.
- OpenCode: plugin-driven event handling instead of a standalone `hooks.json`.
- Kiro: custom agent delivery with embedded hook commands.

## Operating Model
Recommended usage is straightforward:
- keep Obsidian as the durable memory system, not the current repository
- use `vault-ai` to locate the smallest canonical context that answers the task
- use the Obsidian CLI to open or update the exact note that should change
- capture project-local execution in `01-projects/`
- coordinate multi-project initiatives in `02-workstreams/`
- promote stable knowledge and standards into shared areas

This model is formalized in:
- [AGENT_PROTOCOL.md](AGENT_PROTOCOL.md)
- [06-ops/obsidian-brain-skill.md](06-ops/obsidian-brain-skill.md)

## Why This Structure Works
- Retrieval stays explicit and reproducible instead of being inferred from directory state.
- Cross-project memory remains durable even as repositories move or disappear.
- Agent behavior becomes consistent across runtimes because the skill, installer, and vault protocol are aligned.
- Canonical notes remain cleaner because transient execution history is isolated in `sessions/`.
- Local-first tooling keeps the system portable and auditable without requiring a hosted memory backend.

## Additional References
- [06-ops/skills/obsidian-brain/README.md](06-ops/skills/obsidian-brain/README.md)
- [06-ops/context-packs/README.md](06-ops/context-packs/README.md)
- [06-ops/vault-ai/governance/retrieval-governance.v1.json](06-ops/vault-ai/governance/retrieval-governance.v1.json)
