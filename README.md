# Obsidian Engineering Brain

Structured Obsidian vault for software engineering work across multiple projects, with a shared CLI-first skill for Claude Code, Codex, OpenCode, and Kiro.

## What this is
- A versioned Obsidian vault used as persistent engineering memory.
- Optimized for project-local execution and cross-project workstreams.
- Designed so agents consult memory through the Obsidian CLI instead of relying on the current repository directory.

## Core ideas
- `01-projects/` holds local context for a single project, service, repo, or product surface.
- `02-workstreams/` holds initiatives that affect multiple projects.
- `03-shared-knowledge/` holds reusable engineering knowledge.
- `04-shared-decisions/` holds decisions and standards that apply beyond one project.
- `05-templates/` holds note templates.
- `06-ops/` holds vault operations, docs, and the canonical skill source.

## Vault structure
```text
.
├── INDEX.md
├── AGENT_PROTOCOL.md
├── 00-inbox/
├── 01-projects/
├── 02-workstreams/
├── 03-shared-knowledge/
├── 04-shared-decisions/
├── 05-templates/
└── 06-ops/
```

## Agent skill
The shared skill is `obsidian-brain`.

Its job is to make agents:
- treat Obsidian as external persistent engineering memory
- use `obsidian` CLI as the primary interface
- target the vault explicitly outside the vault directory
- avoid using `cwd` as the mechanism for memory discovery

Canonical source:
- [06-ops/skills/obsidian-brain/README.md](/Users/maiconmarioto/Documents/obsidian-second-brain/06-ops/skills/obsidian-brain/README.md)
- [06-ops/skills/obsidian-brain/SKILL.template.md](/Users/maiconmarioto/Documents/obsidian-second-brain/06-ops/skills/obsidian-brain/SKILL.template.md)

## Installer
The installer renders a machine-local version of the skill and symlinks it into the selected agent directories.
It also prepares the local `vault-ai` runtime for a clean machine bootstrap.
It now also installs hook-driven memory confirmation where the agent supports it.

Installer:
- [06-ops/install-obsidian-brain-skill.sh](/Users/maiconmarioto/Documents/obsidian-second-brain/06-ops/install-obsidian-brain-skill.sh)

### Requirements
- Obsidian app installed
- Obsidian CLI installed and configured
- Node.js and npm installed

### Interactive install
```bash
/Users/maiconmarioto/Documents/obsidian-second-brain/06-ops/install-obsidian-brain-skill.sh
```

The wizard asks for:
- vault name
- vault path
- which agents to install for:
  - Claude Code
  - Codex
  - OpenCode
  - Kiro

Agent selection controls:
- `↑/↓` move
- `Space` toggles selection
- `Enter` confirms

### Non-interactive install
```bash
/Users/maiconmarioto/Documents/obsidian-second-brain/06-ops/install-obsidian-brain-skill.sh \
  --vault-name obsidian-second-brain \
  --vault-root /Users/maiconmarioto/Documents/obsidian-second-brain \
  --agents claude,codex,opencode,kiro \
  --non-interactive
```

### Dry run
Use this to simulate the install without writing files or changing symlinks:

```bash
/Users/maiconmarioto/Documents/obsidian-second-brain/06-ops/install-obsidian-brain-skill.sh --dry-run
```

### Rendered local install
The rendered machine-local skill is stored outside the repository:
- `~/.local/share/obsidian-brain/current/`

Installer config is stored at:
- `~/.config/obsidian-brain/config.env`

Global agent symlinks are created only for the agents you select:
- `~/.claude/skills/obsidian-brain`
- `~/.codex/skills/obsidian-brain`
- `~/.config/opencode/skills/obsidian-brain`
- `~/.kiro/agents/obsidian-brain.json`

Selection is additive:
- selected agents are installed or updated
- unselected agents are left untouched

During installation the script also:
- installs Node dependencies with `npm ci` when `package-lock.json` is present, otherwise `npm install`
- builds the initial `vault-ai` index
- runs `vault-ai:health` and `vault-ai:lint` as smoke checks
- renders and links a machine-local `vault-ai` launcher for use from any working directory
- renders and links a machine-local `obsidian-brain-hook` launcher
- installs Claude Code hooks in `~/.claude/settings.json`
- enables Codex hooks in `~/.codex/config.toml` and installs `~/.codex/hooks.json`
- installs a global OpenCode plugin in `~/.config/opencode/plugins/obsidian-brain-hooks.js`
- renders a global Kiro custom agent with hooks at `~/.kiro/agents/obsidian-brain.json`

### Hook coverage notes
- Claude Code: strongest hook model here; memory confirmation can run at prompt submit, stop, and Bash write guard points.
- Codex: hooks are now documented and installable, but current coverage is still centered on Bash interception and lifecycle events.
- OpenCode: memory confirmation runs through a global plugin that reacts to session and tool events instead of a `hooks.json` file.
- Kiro: support is delivered as a custom global agent with hook commands in the agent JSON.

The latest index report is written to:
- `.vault-ai/reports/last-index.json`

The machine-local launcher is linked at:
- `~/.local/bin/vault-ai`
- `~/.local/bin/obsidian-brain-hook`

If `~/.local/bin` is not in `PATH`, the installer prints the exact line to add to your shell rc file.

## How to use this brain
1. Open or keep Obsidian running.
2. Work inside any repository you want.
3. Let your agent use `obsidian vault="<vault-name>" ...` to consult memory.
4. Keep project-local notes in `01-projects/`.
5. Use `02-workstreams/` when work affects multiple projects.
6. Promote reusable knowledge and cross-project decisions into shared folders.

## Recommended next steps
- Create your first real project in `01-projects/`.
- Create your first real workstream in `02-workstreams/`.
- Keep `INDEX.md` and `AGENT_PROTOCOL.md` current as the vault evolves.
