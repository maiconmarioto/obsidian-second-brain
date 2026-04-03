---
type: ops
status: active
---

# Obsidian Brain Skill

## Purpose
- Provide one shared skill for Claude Code, Codex, and OpenCode.
- Make agents use Obsidian CLI as the primary path to engineering memory.

## Canonical source
- [[skills/obsidian-brain/SKILL.template]]

## Installation model
- Source of truth lives inside this vault as a template.
- The installer renders a machine-local skill with the correct vault name and vault path.
- Each selected agent gets a symlink to the rendered local installation.
- This avoids drift and removes hardcoded machine paths from the versioned source.

## Why this is effectively always-on
- The skill is installed globally for the three agents.
- Its description is broad enough to match engineering memory tasks.
- Any work involving historical context, patterns, prior decisions, workstreams, or vault organization should trigger its use.

## Hard rule
- Outside the vault, agents must use:
  - `obsidian vault="obsidian-second-brain" ...`
- They must not rely on the current repository directory to discover memory.
