---
type: context-pack
status: active
pack_id: research-brief
scope: project-workstream-or-shared
updated: 2026-04-17
tags:
  - context-pack
  - research
  - retrieval
---

# Context Pack: research brief

## Purpose
- Build a compact research starter set around a project, workstream, or cross-project topic.
- Blend local scope notes with shared knowledge and shared decisions without overloading the prompt.

## Use when
- An agent needs to investigate a topic, compare options, or write a research note.
- The caller has a scope path and optionally a topic or tag hint.

## Manifest
```yaml
version: 1
pack_id: research-brief
target:
  allowed_scope_types:
    - project
    - workstream
    - shared
  required_inputs:
    - scope_path
  optional_inputs:
    - topic
    - tag_hint
defaults:
  token_budget: medium
  max_notes: 10
selection:
  seed:
    - path: "{scope_path}/index.md"
      when: scope_type != "shared"
    - path: "{scope_path}/context.md"
      when: file_exists("{scope_path}/context.md")
  include:
    - folder: "{scope_path}/decisions"
      sort: date_desc
      limit: 2
      when: folder_exists("{scope_path}/decisions")
    - folder: "03-shared-knowledge"
      limit: 3
      match:
        any_tags:
          - "{tag_hint}"
      when: tag_hint != null
    - folder: "04-shared-decisions"
      limit: 2
      match:
        any_tags:
          - "{tag_hint}"
      when: tag_hint != null
  query_hints:
    lexical:
      - "{topic}"
      - "{tag_hint}"
    semantic:
      - "architecture"
      - "integration"
      - "practice"
output:
  sections:
    - local-scope
    - relevant-shared-knowledge
    - prior-decisions
```

## Notes
- The `query_hints` block is dormant until the future search core is ready.
- Even without semantic retrieval, the pack remains useful through path and tag filters alone.
