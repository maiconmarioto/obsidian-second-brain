---
type: ops
status: active
---

# Versioning

## What to version
- Markdown notes
- templates
- shared knowledge
- shared decisions
- useful `.obsidian` configuration

## What not to version
- `.obsidian/workspace.json`
- OS artifacts such as `.DS_Store`
- any local cache or transient UI state

## Replication model
- Clone this vault onto another machine.
- Open it with Obsidian.
- Keep the same folder structure and templates.
- Reuse the same agent protocol so every machine behaves the same way.

## Recommended next step
- Initialize a git repository at the vault root.
- Commit the initial skeleton as the portable default.
