# obsidian-brain

Cross-agent memory layer for Claude Code, Codex, OpenCode, and Kiro.

## Purpose
- Make agents consult the Obsidian engineering vault through the Obsidian CLI.
- Keep vault access independent from the current project directory.
- Preserve one shared skill source for all supported agents.

## Design
- This folder is the canonical, versioned source.
- `SKILL.template.md` is rendered by the installer with machine-local values.
- The rendered skill is stored outside the repository.
- Global agent directories receive symlinks to the rendered skill.

## Core behavior
- `vault-ai` retrieval first
- Obsidian CLI for canonical reads and writes
- location-independent launcher for use outside the vault directory
- Explicit vault targeting outside the vault
- Filesystem only as fallback
- hook-assisted memory confirmation before durable writes

## Install
Run:

```bash
/Users/maiconmarioto/Documents/obsidian-second-brain/06-ops/install-obsidian-brain-skill.sh
```

## Installer responsibilities
- Ask for vault name and vault path
- Ask which agents should receive the skill
- Render `SKILL.md` with local values
- Install local `vault-ai` dependencies
- Build the initial `vault-ai` index
- Run `vault-ai` smoke checks
- Render a machine-local `vault-ai` launcher and link it into `~/.local/bin/vault-ai`
- Render a machine-local hook launcher and link it into `~/.local/bin/obsidian-brain-hook`
- Install hook integrations for Claude Code, Codex, and OpenCode
- Render and install the `obsidian-brain` custom agent for Kiro
- Symlink the rendered skill into the selected agent directories when the platform uses skill directories

## Hook model by platform
- Claude Code uses `~/.claude/settings.json`
- Codex uses `~/.codex/config.toml` plus `~/.codex/hooks.json`
- OpenCode uses a global plugin file under `~/.config/opencode/plugins/`
- Kiro uses hook commands embedded in `~/.kiro/agents/obsidian-brain.json`
