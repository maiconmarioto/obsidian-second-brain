# obsidian-brain-hooks

Small cross-agent hook engine for vault persistence hygiene.

## What it does
- injects a short vault-memory policy at session start
- detects explicit user intent to save or update vault memory
- blocks Obsidian CLI write commands until the user confirms
- asks the agent to confirm vault persistence when a turn looks like durable engineering memory

## What it does not do
- write to the vault directly
- decide the final target note by itself
- replace `vault-ai` retrieval or the `obsidian` CLI

## Current heuristic
- durable-memory prompting is intentionally conservative
- explicit user save intent overrides the extra confirmation prompt
- recent successful vault writes suppress repeated prompts for a short cooldown window
