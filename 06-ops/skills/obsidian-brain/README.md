# obsidian-brain

Cross-agent skill for Claude Code, Codex, and OpenCode.

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
- CLI first
- Explicit vault targeting outside the vault
- Filesystem only as fallback

## Install
Run:

```bash
/Users/maiconmarioto/Documents/obsidian-second-brain/06-ops/install-obsidian-brain-skill.sh
```

## Installer responsibilities
- Ask for vault name and vault path
- Ask which agents should receive the skill
- Render `SKILL.md` with local values
- Symlink the rendered skill into the selected agent directories
