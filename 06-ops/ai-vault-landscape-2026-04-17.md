---
type: research
status: active
date: 2026-04-17
updated: 2026-04-17
tags:
  - vault
  - obsidian
  - ai
  - retrieval
  - memory
---

# AI vault landscape for this vault model

## Bottom line
- Yes. As of 2026-04-17 there is now a real ecosystem doing parts of what this vault is trying to do.
- The closest patterns are:
  - Obsidian-native AI retrieval and context packaging
  - MCP bridges that expose vault operations to agents
  - persistent memory systems for agents with layered memory and hybrid retrieval
- What is still uncommon is the combination used here:
  - project plus workstream information architecture
  - explicit canonical vs volatile note rules
  - CLI-first retrieval discipline for agents

## What this vault already does well
- The vault model in [04-shared-decisions/0001-vault-structure.md](../04-shared-decisions/0001-vault-structure.md) is ahead of most Obsidian + AI setups on information architecture.
- The split between canonical notes and `sessions/` maps well to the memory-layer thinking now showing up in Letta, Mem0, and recent agent-memory papers.
- Frontmatter discipline is already decent for a young vault.

## Local audit snapshot
- `45` markdown files total
- `34` files with frontmatter (`75.6%`)
- most common properties: `type`, `status`, `tags`, `updated`
- `36` wikilinks total across the vault (`0.8` links per file on average)
- all current projects have `index.md`, `context.md`, and `tasks.md`
- `cookie-manager` is still missing `decisions/` and `sessions/`

## Who is doing similar work now

### 1. Obsidian-native semantic search and context packaging
- Smart Connections is the clearest example of local-first semantic retrieval for Obsidian. Its current positioning is explicit: local embeddings, semantic lookup, ranking controls, and offline operation after indexing.
- Smart Context solves a different but adjacent problem: packaging the right notes into reusable, token-aware context bundles for AI tools.
- Khoj is further along on multi-interface search and chat. It supports Obsidian, local/self-hosted usage, natural-language search, chat, and “find similar” flows.
- Omnisearch remains a strong lexical baseline. It uses BM25, boosts filenames and headings, and supports OCR/PDF indexing.

### 2. MCP bridges for letting agents work with the vault
- MCPVault has moved beyond simple CRUD and is now adding more vault-aware tools like stats, tags, and skill routing. It is focused on safe local access.
- `obsidian-semantic-mcp` is notable because it collapses many low-level vault tools into a smaller semantic interface and adds fragment retrieval, workflow hints, and state-aware suggestions for agents.
- `obsidian-mcp-tools` combines vault access, semantic search, and template execution through a local MCP bridge.

### 3. Agent memory systems outside Obsidian
- Letta MemFS is highly relevant conceptually. It stores agent memory as git-backed markdown files, pins critical memory in a `system/` area, and uses background reflection to reorganize memory over time.
- Mem0 is a strong signal for retrieval design. Their April 16, 2026 update emphasizes ADD-only history, entity linking, and multi-signal retrieval instead of relying on larger context windows.
- Graphiti is the strongest graph-oriented reference. Their open-source position is a temporal context graph with hybrid retrieval: semantic, BM25, and graph traversal.
- MemMachine and Memori both reinforce the same direction from research: retrieval-stage design matters more than stuffing more raw history into prompts.

## What the market has converged on

### Clear convergence
- Hybrid retrieval beats single-mode retrieval.
- File-level retrieval is not enough. Section or fragment retrieval is becoming standard.
- Agents do better with semantic operations than with dozens of raw tools.
- Layered memory is winning over one giant undifferentiated corpus.
- Token-aware context packaging matters as much as search quality.
- Temporal continuity is still the hardest problem.

### Hybrid retrieval pattern
- semantic similarity
- lexical/BM25 matching
- entity or alias matching
- path, title, heading, and frontmatter boosts
- optional reranker for ambiguous queries
- fusion instead of one retriever dominating

## What we should copy

### 1. Add a real hybrid retrieval layer
- This is the biggest gap between this vault and the best current systems.
- Start with:
  - BM25 over title, aliases, headings, content
  - embeddings over note fragments, not whole files
  - reciprocal rank fusion or another simple score fusion method
  - filters on `type`, `status`, tags, folder, and path
  - result expansion by backlinks and outgoing links at shallow depth
- Strong inspiration:
  - Smart Connections
  - Omnisearch
  - Khoj
  - Graphiti
  - Mem0

### 2. Retrieve fragments, not full notes
- `obsidian-semantic-mcp`, Khoj, and current memory papers all point the same way.
- The retrieval unit should usually be:
  - heading section
  - paragraph window
  - decision block
  - task block
- This will improve precision and reduce token waste.

### 3. Make “core memory” explicit
- Copy the Letta idea, but adapt it to the vault.
- Keep a very small always-loadable set of notes that define:
  - vault operating rules
  - retrieval order
  - note type semantics
  - current active projects/workstreams
  - agent-specific rules that should always be visible
- This is already partially present in `INDEX.md` and `AGENT_PROTOCOL.md`, but it can be made more deliberate and smaller.

### 4. Add reusable context packs
- Copy the Smart Context idea.
- For recurring agent jobs, create saved context bundles or manifests instead of rebuilding context ad hoc every time.
- Good pack candidates:
  - project working set
  - meeting continuity
  - research brief
  - release prep
  - incident context

### 5. Increase graph usefulness without overbuilding a knowledge graph
- Current link density is low for an AI-facing vault.
- Before building a heavy graph system:
  - increase wikilinks between canonical notes
  - add consistent aliases
  - add stronger backlinks usage in project entrypoints
  - generate related-note expansion from links plus frontmatter
- This is the safer step before adopting a full graph engine.

### 6. Use Bases and Properties as operational dashboards
- Obsidian now has native `Bases` and `Properties view`.
- That makes it practical to standardize note metadata and then expose:
  - stale notes
  - notes missing required frontmatter
  - active decisions by scope
  - projects by `next_action`
  - sessions pending consolidation
- This is one of the cleanest ways to improve organization without adding another service.

### 7. Standardize ingestion
- Web Clipper now supports templates, variables, filters, logic, and an interpreter.
- That is useful for getting external research into the vault in a predictable shape instead of freeform markdown.
- Good targets:
  - competitor research
  - library/framework research
  - architecture references
  - meeting capture

## What I would not copy yet
- I would not jump straight to a full knowledge graph.
- I would not optimize for autonomous writing before retrieval quality is measured.
- I would not expose broad write access to agents before read/search flows and context packaging are stable.

## Recommended direction for this vault

### Phase 1
- add hybrid search index
- chunk by heading/section
- expose result fragments with file path, heading, score, and matched signals
- support filters by frontmatter and folder
- add a small retrieval benchmark set for common vault questions

### Phase 2
- define context packs for recurring agent tasks
- tighten required frontmatter by note type
- add Bases dashboards for note health and active work
- raise canonical note link density

### Phase 3
- add entity extraction and alias expansion
- add shallow graph traversal at query time
- add staleness and duplication detection
- consider temporal ranking or event memory only if benchmark queries still miss

## Most useful synthesis
- The core architecture here is good.
- The next leap is not a prettier note structure.
- The next leap is a better retrieval stack around the existing structure:
  - hybrid search
  - fragment retrieval
  - reusable context packs
  - stronger metadata dashboards
  - more deliberate core memory

## Sources
- MCPVault: [mcp-obsidian.org](https://mcp-obsidian.org/)
- Obsidian semantic MCP: [github.com/aaronsb/obsidian-semantic-mcp](https://github.com/aaronsb/obsidian-semantic-mcp)
- Obsidian MCP Tools: [github.com/jacksteamdev/obsidian-mcp-tools](https://github.com/jacksteamdev/obsidian-mcp-tools)
- Smart Connections: [smartconnections.app/smart-connections](https://smartconnections.app/smart-connections)
- Smart Context: [smartconnections.app/smart-context](https://smartconnections.app/smart-context/)
- Khoj overview: [docs.khoj.dev/features/all-features](https://docs.khoj.dev/features/all-features/)
- Khoj Obsidian client: [docs.khoj.dev/clients/obsidian](https://docs.khoj.dev/clients/obsidian/)
- Omnisearch: [github.com/scambier/obsidian-omnisearch](https://github.com/scambier/obsidian-omnisearch)
- Obsidian Bases: [obsidian.md/help/bases](https://obsidian.md/help/bases)
- Obsidian Properties view: [obsidian.md/help/plugins/properties](https://obsidian.md/help/plugins/properties)
- Obsidian Web Clipper: [obsidian.md/help/web-clipper](https://obsidian.md/help/web-clipper)
- Letta memory: [docs.letta.com/letta-code/memory](https://docs.letta.com/letta-code/memory/)
- Letta memory blocks: [docs.letta.com/guides/core-concepts/memory/memory-blocks](https://docs.letta.com/guides/core-concepts/memory/memory-blocks)
- Mem0 memory evaluation: [docs.mem0.ai/core-concepts/memory-evaluation](https://docs.mem0.ai/core-concepts/memory-evaluation)
- Mem0 memory types: [docs.mem0.ai/core-concepts/memory-types](https://docs.mem0.ai/core-concepts/memory-types)
- Mem0 algorithm update, April 16 2026: [mem0.ai/blog/mem0-the-token-efficient-memory-algorithm](https://mem0.ai/blog/mem0-the-token-efficient-memory-algorithm)
- Graphiti: [github.com/getzep/graphiti](https://github.com/getzep/graphiti)
- MemMachine paper, submitted April 6 2026: [arXiv:2604.04853](https://arxiv.org/abs/2604.04853)
- Memori paper, submitted March 20 2026: [arXiv:2603.19935](https://arxiv.org/abs/2603.19935)
