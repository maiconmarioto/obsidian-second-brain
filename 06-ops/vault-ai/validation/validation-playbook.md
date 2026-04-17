---
type: ops
status: active
updated: 2026-04-17
tags:
  - vault-ai
  - validation
  - governance
---

# Validation Playbook

## Purpose
- Validate retrieval quality before adding more automation or wider write access for agents.
- Separate hard metadata failures from softer retrieval-quality warnings.
- Keep the first benchmark small, opinionated, and tied to notes that already exist in the vault.

## Artifacts
- Benchmark set: `../benchmarks/benchmark-set.v1.json`
- Frontmatter rules: `../governance/frontmatter-rules.v1.json`
- Retrieval governance: `../governance/retrieval-governance.v1.json`

## Benchmark evaluation
- Run all queries in the benchmark set against section-level retrieval, not whole-note retrieval only.
- A query passes when:
  - at least one `expected_primary_hit` lands within its declared `rank_at_most`
  - all `must_include_terms` are recoverable from the top `k` result set
  - every declared filter is honored before ranking
- Mark as warning, not failure, when:
  - a supporting hit lands late but the primary hit is still correct
  - the right file is found but the wrong section is ranked above it
- Mark as failure when:
  - alias queries do not resolve to the canonical entity
  - template files appear ahead of canonical notes
  - broad protocol or research notes outrank a more exact project or decision note without good reason

## Frontmatter lint interpretation
- `error`: missing or invalid fields that break filtering, ranking, or stable note identity.
- `warning`: missing fields that reduce retrieval quality or governance visibility.
- `info`: future-ready metadata that should be encouraged but not block adoption.

## Scope notes
- The lint scope intentionally excludes `06-ops/skills/**` because those files are skill assets, not canonical vault notes.
- The lint scope also excludes nested `03-shared-knowledge/*/README.md` and root daily-note style files until they are normalized into the same note contract.
- This keeps the first lint pass focused on notes that are already part of the retrieval model.

## Staleness policy
- Treat `tasks` as the fastest-aging canonical note.
- Use `updated` first, then `date`, then `created` for freshness checks.
- Accepted decisions and completed sessions are records, not freshness failures.
- Research notes are time-sensitive and should be reviewed more aggressively than generic ops notes.

## Duplication policy
- Duplication checks are review-only in the first version.
- Do not auto-merge or auto-delete notes based on similarity scores.
- Sessions overlapping with canonical notes are expected; surface them as promotion-review candidates, not duplicates by default.

## Alias policy
- Prefer explicit frontmatter aliases when they exist.
- Until then, seed aliases from `retrieval-governance.v1.json`.
- Use alias expansion for recall-sensitive queries, but do not let alias matches outrank exact title or path matches automatically.

## Suggested rollout order
1. Make the retriever pass the benchmark set without filters first.
2. Turn on metadata filters using the frontmatter ruleset.
3. Add alias expansion for the benchmark queries that depend on it.
4. Add staleness and duplication review queues only after retrieval ranking is stable.
