---
type: ops
status: active
---

# Obsidian Brain Skill

## Purpose
- Provide one shared skill for Claude Code, Codex, and OpenCode.
- Make agents use Obsidian CLI as the primary path to engineering memory.

## Canonical source
- [[skills/obsidian-brain/SKILL]]

## Installation model
- Source of truth lives inside this vault.
- Each agent gets a symlink to the same source directory.
- This avoids drift between three separate copies.

## Why this is effectively always-on
- The skill is installed globally for the three agents.
- Its description is broad enough to match engineering memory tasks.
- Any work involving historical context, patterns, prior decisions, workstreams, or vault organization should trigger its use.

## Hard rule
- Outside the vault, agents must use:
  - `obsidian vault="obsidian-second-brain" ...`
- They must not rely on the current repository directory to discover memory.
