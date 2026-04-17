---
type: ops
status: active
updated: 2026-04-17
tags:
  - vault-ai
  - benchmarks
  - metadata
  - validation
---

# Vault AI

This subtree holds retrieval and metadata-governance artifacts that can land before the search core is implemented.

## What lives here
- `benchmarks/benchmark-set.v1.json`: initial benchmark queries with expected hits, ranking intent, alias stress, and filter coverage.
- `governance/frontmatter-rules.v1.json`: frontmatter rules by note type for future linting.
- `governance/retrieval-governance.v1.json`: lightweight rules for staleness, duplication review, and entity alias expansion.
- `validation/validation-playbook.md`: how to evaluate retrieval quality and metadata health against these files.

## Scope
- These files are vault-facing contracts.
- They do not implement indexing, search, lint, dashboards, or context-pack generation.
- They are designed to be consumed later by the retrieval core and metadata checks.
