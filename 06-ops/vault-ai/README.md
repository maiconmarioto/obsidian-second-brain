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

This subtree holds retrieval, metadata-governance, benchmarking, and validation artifacts for the local `vault-ai` toolkit.

## What lives here
- `benchmarks/benchmark-set.v1.json`: initial benchmark queries with expected hits, ranking intent, alias stress, and filter coverage.
- `governance/frontmatter-rules.v1.json`: frontmatter rules by note type for future linting.
- `governance/retrieval-governance.v1.json`: lightweight rules for staleness, duplication review, and entity alias expansion.
- `validation/validation-playbook.md`: how to evaluate retrieval quality and metadata health against these files.

## Current behavior
- `vault-ai search` uses hybrid retrieval with fragment-level hits, lightweight reranking, and optional compact context budgets.
- `vault-ai search --compact` is the default low-token retrieval mode for agents.
- `vault-ai pack-build` emits compact note summaries with fixed per-note budgets instead of dumping whole files.
- `vault-ai benchmark`, `vault-ai health`, and `vault-ai lint-frontmatter` keep retrieval quality and note hygiene measurable.

## Scope
- These files are vault-facing contracts.
- The implementation lives under `tools/vault-ai/`.
- These files define the contracts that the runtime consumes.
