# obsidian-brain

Cross-agent skill for Claude Code, Codex, and OpenCode.

## Purpose
- Make agents consult the Obsidian engineering vault through the Obsidian CLI.
- Keep vault access independent from the current project directory.
- Preserve one shared skill source for all supported agents.

## Core behavior
- CLI first
- Explicit vault targeting outside the vault
- Filesystem only as fallback

## Canonical source
- `/Users/maiconmarioto/Documents/obsidian-second-brain/06-ops/skills/obsidian-brain`

## Install
Run:

```bash
/Users/maiconmarioto/Documents/obsidian-second-brain/06-ops/install-obsidian-brain-skill.sh
```

## Linked targets
- `~/.claude/skills/obsidian-brain`
- `~/.codex/skills/obsidian-brain`
- `~/.config/opencode/skills/obsidian-brain`
