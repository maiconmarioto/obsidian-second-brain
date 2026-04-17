import { DatabaseSync } from 'node:sqlite';

import {
  normalizeText,
  reciprocalRankFusion,
  trigramSimilarity,
  unique,
} from './common.js';
import { embedQuery, similarityScores } from './embeddings.js';
import { extractEntities } from './markdown.js';

function openDatabase(dbFile) {
  return new DatabaseSync(dbFile);
}

function parseJson(raw, fallback = []) {
  try {
    return JSON.parse(raw || '[]');
  } catch {
    return fallback;
  }
}

const SEARCH_STOPWORDS = new Set([
  'a',
  'an',
  'as',
  'at',
  'before',
  'como',
  'da',
  'das',
  'de',
  'do',
  'dos',
  'e',
  'eh',
  'em',
  'for',
  'how',
  'is',
  'na',
  'nas',
  'no',
  'nos',
  'o',
  'of',
  'onde',
  'or',
  'os',
  'para',
  'por',
  'qual',
  'quais',
  'que',
  'the',
  'to',
  'um',
  'uma',
  'what',
  'which',
]);

function hasAnyKeyword(tokens, keywords) {
  return keywords.some((keyword) => tokens.has(keyword));
}

function buildSearchTokens(query) {
  return unique(
    normalizeText(query)
      .split(/\s+/)
      .filter((token) => {
        if (!token) return false;
        if (SEARCH_STOPWORDS.has(token)) return false;
        if (token.length <= 1 && !/\d/.test(token)) return false;
        return true;
      }),
  );
}

function buildFilterSql(filters, params) {
  const clauses = [];
  if (filters.type) {
    clauses.push('c.note_type = ?');
    params.push(filters.type);
  }
  if (filters.status) {
    clauses.push('c.note_status = ?');
    params.push(filters.status);
  }
  if (filters.path) {
    clauses.push('c.path LIKE ?');
    params.push(`%${filters.path}%`);
  }
  if (filters.path_prefix) {
    clauses.push('c.path LIKE ?');
    params.push(`${filters.path_prefix}%`);
  }
  if (filters.tag) {
    clauses.push('c.tags_text LIKE ?');
    params.push(`%${filters.tag}%`);
  }
  return clauses.length ? ` AND ${clauses.join(' AND ')}` : '';
}

function prepareMatchQuery(query) {
  const tokens = buildSearchTokens(query);
  if (!tokens.length) return '';
  if (tokens.length === 1) return `"${tokens[0]}"`;
  return tokens.map((token) => `"${token}"`).join(' OR ');
}

function loadLexicalCandidates(db, query, filters, config) {
  const params = [prepareMatchQuery(query)];
  const filterSql = buildFilterSql(filters, params);
  let rows = [];
  try {
    rows = db
      .prepare(
        `
        SELECT
          c.id,
          c.path,
          c.title,
          c.heading_path,
          c.section_heading,
          c.preview,
          c.note_type,
          c.note_status,
          c.tags_text,
          c.entities_json,
          c.mtime_ms,
          f.aliases_json,
          f.links_json,
          f.backlinks_json,
          bm25(chunk_fts, 10.0, 5.0, 4.0, 1.0) AS bm25_score
        FROM chunk_fts
        JOIN chunks c ON c.rowid = chunk_fts.rowid
        JOIN files f ON f.path = c.path
        WHERE chunk_fts MATCH ? ${filterSql}
        ORDER BY bm25_score ASC
        LIMIT ${config.candidateLimit}
      `,
      )
      .all(...params);
  } catch {
    rows = [];
  }

  return rows.map((row, index) => ({
    ...row,
    aliases: parseJson(row.aliases_json),
    links: parseJson(row.links_json),
    backlinks: parseJson(row.backlinks_json),
    entities: parseJson(row.entities_json),
    lexicalRank: index + 1,
    lexicalScore: -row.bm25_score,
  }));
}

function loadFallbackCandidates(db, filters, config) {
  const params = [];
  const filterSql = buildFilterSql(filters, params);
  const rows = db
    .prepare(
      `
      SELECT
        c.id,
        c.path,
        c.title,
        c.heading_path,
        c.section_heading,
        c.preview,
        c.note_type,
        c.note_status,
        c.tags_text,
        c.entities_json,
        c.mtime_ms,
        f.aliases_json,
        f.links_json,
        f.backlinks_json
      FROM chunks c
      JOIN files f ON f.path = c.path
      WHERE 1 = 1 ${filterSql}
      ORDER BY c.mtime_ms DESC
      LIMIT ${config.candidateLimit}
    `,
    )
    .all(...params);
  return rows.map((row) => ({
    ...row,
    aliases: parseJson(row.aliases_json),
    links: parseJson(row.links_json),
    backlinks: parseJson(row.backlinks_json),
    entities: parseJson(row.entities_json),
  }));
}

function loadPinnedCandidates(db, filters, pinnedPaths) {
  if (!pinnedPaths.length) return [];
  const params = [...pinnedPaths];
  const pathPlaceholders = pinnedPaths.map(() => '?').join(', ');
  const filterSql = buildFilterSql(filters, params);
  const rows = db
    .prepare(
      `
      SELECT
        c.id,
        c.path,
        c.title,
        c.heading_path,
        c.section_heading,
        c.preview,
        c.note_type,
        c.note_status,
        c.tags_text,
        c.entities_json,
        c.mtime_ms,
        f.aliases_json,
        f.links_json,
        f.backlinks_json
      FROM chunks c
      JOIN files f ON f.path = c.path
      WHERE c.path IN (${pathPlaceholders}) ${filterSql}
      ORDER BY c.path ASC, c.id ASC
    `,
    )
    .all(...params);

  return rows.map((row) => ({
    ...row,
    aliases: parseJson(row.aliases_json),
    links: parseJson(row.links_json),
    backlinks: parseJson(row.backlinks_json),
    entities: parseJson(row.entities_json),
  }));
}

function buildSeedEntityIndex(graphSpec) {
  const aliasLookup = new Map();
  const entityById = new Map();
  const pathLookup = new Map();
  for (const entity of graphSpec.entity_aliases?.seed_entities || []) {
    entityById.set(entity.entity_id, entity);
    const aliases = unique([entity.entity_id, entity.canonical_name, ...(entity.aliases || [])]);
    for (const alias of aliases) {
      aliasLookup.set(alias.toLowerCase(), entity);
    }
    for (const entityPath of entity.paths || []) {
      pathLookup.set(entityPath, entity);
    }
  }
  return { aliasLookup, entityById, pathLookup };
}

function entityScoreForRow(queryEntities, row, graphSpec, seedIndex) {
  if (!queryEntities.length) return 0;
  const entity = seedIndex.pathLookup.get(row.path);
  const rowEntities = new Set(
    unique([
      ...row.entities,
      row.title,
      ...(row.aliases || []),
      ...(entity?.aliases || []),
      entity?.canonical_name,
      entity?.entity_id,
    ]).map((entry) => entry.toLowerCase()),
  );
  let score = 0;
  for (const queryEntity of queryEntities) {
    if (rowEntities.has(queryEntity.toLowerCase())) score += 1;
  }
  if (entity && queryEntities.some((queryEntity) => (entity.related_entities || []).includes(queryEntity))) {
    score += 0.6;
  }
  return score;
}

function fuzzyScoreForRow(query, row) {
  const candidates = [row.title, row.heading_path, ...(row.aliases || [])];
  return candidates.reduce(
    (best, candidate) => Math.max(best, trigramSimilarity(query, candidate)),
    0,
  );
}

function groupRanks(items, key) {
  return new Map(items.map((item, index) => [item[key], index + 1]));
}

function contextualScoreAdjustment(row) {
  let score = 0;
  if (row.noteType === 'project') score += 0.015;
  if (row.noteType === 'context') score += 0.012;
  if (row.noteType === 'decision') score += 0.012;
  if (row.noteType === 'tasks') score += 0.009;
  if (row.noteType === 'protocol') score += 0.012;
  if (row.noteType === 'research') score += 0.006;
  if (row.noteType === 'ops') score -= 0.004;
  if (row.noteType === 'context-pack') score -= 0.01;
  if (row.noteType === 'base') score -= 0.015;
  if (row.sectionHeading === 'Metadata') score -= 0.006;
  if (row.path.startsWith('05-templates/')) score -= 0.02;
  if (row.path.startsWith('06-ops/vault-ai/')) score -= 0.012;
  if (row.path.startsWith('06-ops/context-packs/')) score -= 0.015;
  return score;
}

function analyzeQueryIntent(query) {
  const tokens = new Set(buildSearchTokens(query));
  return {
    asksLimitations: hasAnyKeyword(tokens, ['console', 'csp', 'deploy', 'limitation', 'limitations', 'mailto', 'validar', 'validation']),
    asksMarketingSite: hasAnyKeyword(tokens, ['astro', 'marketing', 'official', 'site', 'static', 'whatsapp']),
    asksNextAction: hasAnyKeyword(tokens, ['next', 'passo', 'proximo']),
    asksReleaseInfo: hasAnyKeyword(tokens, ['baseline', 'domain', 'dominio', 'producao', 'production', 'release', 'version']),
    asksVaultStructure: hasAnyKeyword(tokens, ['conhecimento', 'decisoes', 'estruturado', 'organizado', 'projetos', 'vault', 'workstreams']),
    needsMetadata: hasAnyKeyword(tokens, [
      'active',
      'ativos',
      'ativo',
      'baseline',
      'domain',
      'dominio',
      'next',
      'producao',
      'production',
      'project',
      'projeto',
      'release',
      'repo',
      'stack',
      'status',
      'version',
    ]),
    prefersCurrentState: hasAnyKeyword(tokens, ['breakage', 'broken', 'quebrado', 'state', 'status', 'typecheck']),
    prefersDecision: hasAnyKeyword(tokens, ['aceitas', 'accepted', 'continuacao', 'decisao', 'decisoes', 'legado', 'rebuild', 'separado']),
    prefersProtocol: hasAnyKeyword(tokens, ['agent', 'agente', 'editar', 'guardar', 'ler', 'ordem', 'retrieval', 'volatile', 'volateis']),
    prefersResearch: hasAnyKeyword(tokens, ['copiar', 'landscape', 'market', 'mercado', 'memoria', 'pesquisa', 'recommend', 'research']),
    prefersTasks: hasAnyKeyword(tokens, ['backlog', 'blocked', 'deploy', 'falta', 'next', 'passo', 'proximo', 'queue', 'task', 'tasks', 'validar']),
    prefersTechnical: hasAnyKeyword(tokens, ['api', 'arquitetura', 'astro', 'auth', 'backend', 'banco', 'database', 'fastify', 'infra', 'monorepo', 'nextjs', 'next', 'postgresql', 'prisma', 'stack', 'tanstack', 'technical', 'tecnica', 'trigger', 'typescript']),
  };
}

function queryIntentBoost(row, intent) {
  const heading = normalizeText(`${row.headingPath} ${row.sectionHeading}`);
  const preview = normalizeText(row.preview);
  let score = 0;

  if (row.sectionHeading === 'Metadata') {
    if (intent.asksReleaseInfo || intent.asksNextAction) score += 0.022;
    else if (intent.prefersResearch) score -= 0.05;
    else if (intent.prefersTechnical) score -= 0.02;
    else if (intent.needsMetadata) score += 0.012;
    else score -= 0.012;
  }
  if (intent.asksNextAction && row.noteType === 'project') score += 0.018;
  if (intent.asksNextAction && row.noteType === 'project' && row.sectionHeading === 'Metadata') score += 0.03;
  if (intent.asksNextAction && row.noteType === 'context' && heading.includes('stable facts only')) score += 0.016;
  if (intent.asksNextAction && preview.includes('legado')) score += 0.01;
  if (intent.asksNextAction && row.noteType === 'tasks' && row.sectionHeading === 'Metadata') score -= 0.02;
  if (intent.prefersTasks && row.noteType === 'tasks') score += 0.03;
  if (intent.prefersTasks && /( now| next| blocked| decision needed)/.test(` ${heading}`)) score += 0.012;
  if (intent.prefersDecision && row.noteType === 'decision') score += 0.026;
  if (!intent.prefersDecision && row.noteType === 'decision') score -= 0.01;
  if (intent.prefersDecision && heading.includes('decision')) score += 0.01;
  if (intent.prefersCurrentState && heading.includes('current operating state')) score += 0.02;
  if (intent.prefersProtocol && (row.noteType === 'protocol' || row.path === 'AGENT_PROTOCOL.md')) score += 0.03;
  if (intent.prefersProtocol && (heading.includes('canonical vs volatile') || heading.includes('retrieval order'))) score += 0.03;
  if (intent.prefersResearch && row.noteType === 'research') score += 0.024;
  if (intent.prefersResearch && row.noteType === 'index') score -= 0.14;
  if (intent.prefersResearch && row.noteType === 'ops') score -= 0.06;
  if (intent.prefersResearch && heading.includes('what we should copy')) score += 0.045;
  if (intent.prefersResearch && heading.includes('recommended direction for this vault')) score += 0.03;
  if (intent.prefersResearch && heading.includes('context packs')) score += 0.02;
  if (intent.prefersResearch && heading.includes('core memory')) score += 0.02;
  if (intent.prefersResearch && row.path === '06-ops/vault-map.md') score -= 0.015;
  if (intent.asksVaultStructure && row.path === 'INDEX.md') score += 0.045;
  if (
    intent.asksVaultStructure &&
    row.path === 'INDEX.md' &&
    (heading.includes('navigation') || heading.includes('working rules') || heading.includes('purpose'))
  ) {
    score += 0.025;
  }
  if (intent.asksVaultStructure && row.path === '06-ops/vault-map.md') score += 0.04;
  if (intent.asksReleaseInfo && row.noteType === 'decision') score += 0.012;
  if (intent.asksReleaseInfo && row.noteType === 'context' && heading.includes('stable facts only')) score += 0.024;
  if (intent.asksReleaseInfo && row.noteType === 'context' && heading.includes('technical shape')) score += 0.014;
  if (intent.asksReleaseInfo && row.noteType === 'tasks') score -= 0.012;
  if (intent.asksLimitations && heading.includes('known limitations')) score += 0.05;
  if (intent.asksLimitations && row.noteType === 'tasks' && heading.includes('next')) score += 0.03;
  if (intent.asksLimitations && (preview.includes('google search console') || preview.includes('csp'))) score += 0.05;
  if (intent.asksMarketingSite && row.noteType === 'project') score += 0.012;
  if (
    intent.prefersTechnical &&
    (heading.includes('technical shape') ||
      preview.includes('fastify') ||
      preview.includes('tanstack') ||
      preview.includes('trigger') ||
      preview.includes('prisma') ||
      preview.includes('postgresql') ||
      preview.includes('astro') ||
      preview.includes('next.js'))
  ) {
    score += 0.05;
  }

  return score;
}

function extractScopeKey(filePath) {
  const parts = String(filePath || '').split('/');
  if (parts.length >= 3 && ['01-projects', '02-workstreams'].includes(parts[0])) {
    return `${parts[0]}/${parts[1]}`;
  }
  return parts[0] || filePath;
}

function buildScopeBoosts(rows, seedIndex, matchedEntityIds) {
  const primaryScopes = new Set();
  const relatedPaths = new Set();

  const registerEntity = (entity) => {
    if (!entity) return;
    for (const entityPath of entity.paths || []) {
      primaryScopes.add(extractScopeKey(entityPath));
    }
    for (const relatedId of entity.related_entities || []) {
      const relatedEntity = seedIndex.entityById.get(relatedId);
      if (!relatedEntity) continue;
      for (const entityPath of relatedEntity.paths || []) {
        relatedPaths.add(entityPath);
      }
    }
  };

  for (const entityId of matchedEntityIds) {
    registerEntity(seedIndex.entityById.get(entityId));
  }
  for (const row of rows.slice(0, 4)) {
    registerEntity(seedIndex.pathLookup.get(row.path));
  }

  const boosts = new Map();
  for (const row of rows) {
    let boost = 0;
    const scopeKey = extractScopeKey(row.path);
    if (primaryScopes.has(extractScopeKey(row.path))) {
      if (row.noteType === 'tasks') boost += 0.022;
      if (row.noteType === 'context') boost += 0.016;
      if (row.noteType === 'decision') boost += 0.018;
      if (row.noteType === 'project') boost += 0.016;
    }
    if (relatedPaths.has(row.path)) {
      boost += row.noteType === 'decision' ? 0.018 : 0.008;
    }
    if (
      primaryScopes.size &&
      !primaryScopes.has(scopeKey) &&
      !relatedPaths.has(row.path) &&
      scopeKey.startsWith('01-projects/')
    ) {
      boost -= 0.04;
    }
    boosts.set(row.id, boost);
  }
  return boosts;
}

function diversifyResults(rows, limit) {
  const remaining = [...rows];
  const selected = [];
  const pathCounts = new Map();
  const scopeCounts = new Map();

  while (remaining.length && selected.length < limit) {
    let bestIndex = 0;
    let bestScore = -Infinity;

    for (let index = 0; index < remaining.length; index += 1) {
      const row = remaining[index];
      const pathCount = pathCounts.get(row.path) || 0;
      const scopeKey = extractScopeKey(row.path);
      const scopeCount = scopeCounts.get(scopeKey) || 0;
      let score = row.finalScore;
      if (pathCount > 0) score -= 0.018 * pathCount;
      if (scopeCount > 1) score -= 0.006 * (scopeCount - 1);
      if (pathCount > 0 && row.sectionHeading === 'Metadata') score -= 0.01;
      if (score > bestScore) {
        bestScore = score;
        bestIndex = index;
      }
    }

    const [picked] = remaining.splice(bestIndex, 1);
    selected.push(picked);
    pathCounts.set(picked.path, (pathCounts.get(picked.path) || 0) + 1);
    const scopeKey = extractScopeKey(picked.path);
    scopeCounts.set(scopeKey, (scopeCounts.get(scopeKey) || 0) + 1);
  }

  return selected;
}

function relatedExpansion(baseResults, fileLookup, relatedDepth = 1, relatedBoost = 0.18) {
  if (!relatedDepth) return [];
  const expansions = new Map();

  function visit(path, score, depth, visited) {
    if (depth === 0) return;
    const node = fileLookup.get(path);
    if (!node) return;
    const related = unique([...(node.links || []), ...(node.backlinks || [])]);
    for (const target of related) {
      if (visited.has(target)) continue;
      const nextScore = score * relatedBoost;
      if (nextScore <= 0) continue;
      const existing = expansions.get(target) || 0;
      expansions.set(target, Math.max(existing, nextScore));
      const nextVisited = new Set(visited);
      nextVisited.add(target);
      visit(target, nextScore, depth - 1, nextVisited);
    }
  }

  for (const result of baseResults.slice(0, 6)) {
    visit(result.path, result.finalScore, relatedDepth, new Set([result.path]));
  }

  return [...expansions.entries()].map(([path, score]) => ({ path, score }));
}

export async function searchVault(paths, config, filters, graphSpec, query, options = {}) {
  const db = openDatabase(paths.dbFile);
  const intent = analyzeQueryIntent(query);
  const lexicalCandidates = query.trim()
    ? loadLexicalCandidates(db, query, filters, config)
    : [];
  const usedLexicalMatches = lexicalCandidates.length > 0;
  const fallbackCandidates = usedLexicalMatches
    ? lexicalCandidates
    : loadFallbackCandidates(db, filters, config);
  const pinnedPaths = [];
  if (intent.asksVaultStructure) {
    pinnedPaths.push('INDEX.md');
  }
  if (intent.prefersProtocol) {
    pinnedPaths.push('INDEX.md', 'AGENT_PROTOCOL.md');
  }
  const pinnedCandidates = loadPinnedCandidates(db, filters, unique(pinnedPaths));

  const seedIndex = buildSeedEntityIndex(graphSpec);
  const matchedEntityIds = new Set();
  const queryEntities = extractEntities({
    title: query,
    content: query,
    aliases: [],
  }).map((entry) => entry.toLowerCase());
  const normalizedQuery = query.toLowerCase();
  for (const [alias, entity] of seedIndex.aliasLookup.entries()) {
    if (normalizedQuery.includes(alias)) {
      matchedEntityIds.add(entity.entity_id);
      queryEntities.push(alias, entity.entity_id.toLowerCase(), entity.canonical_name.toLowerCase());
      for (const related of entity.related_entities || []) {
        queryEntities.push(String(related).toLowerCase());
      }
    }
  }

  let semanticCandidates = [];
  const embeddingParams = [];
  const embeddingFilterSql = buildFilterSql(filters, embeddingParams);
  const embeddingRows = db
    .prepare(
      `
      SELECT
        c.id,
        c.path,
        c.title,
        c.heading_path,
        c.section_heading,
        c.preview,
        c.note_type,
        c.note_status,
        c.tags_text,
        c.entities_json,
        c.mtime_ms,
        f.aliases_json,
        f.links_json,
        f.backlinks_json,
        e.embedding_json
      FROM embeddings e
      JOIN chunks c ON c.id = e.chunk_id
      JOIN files f ON f.path = c.path
      WHERE 1 = 1 ${embeddingFilterSql}
      LIMIT 5000
    `,
    )
    .all(...embeddingParams);

  if (embeddingRows.length && query.trim()) {
    try {
      const queryVector = await embedQuery(query, paths, config);
      semanticCandidates = similarityScores(
        queryVector,
        embeddingRows.map((row) => ({
          ...row,
          aliases: parseJson(row.aliases_json),
          links: parseJson(row.links_json),
          backlinks: parseJson(row.backlinks_json),
          entities: parseJson(row.entities_json),
          embedding: parseJson(row.embedding_json),
        })),
      )
        .sort((a, b) => b.semanticScore - a.semanticScore)
        .slice(0, config.candidateLimit)
        .map((row, index) => ({
          ...row,
          semanticRank: index + 1,
        }));
    } catch {
      semanticCandidates = [];
    }
  }

  const merged = new Map();
  const lexicalRanks = usedLexicalMatches ? groupRanks(fallbackCandidates, 'id') : new Map();
  const semanticRanks = groupRanks(semanticCandidates, 'id');

  const allRows = [...fallbackCandidates, ...semanticCandidates, ...pinnedCandidates];
  for (const row of allRows) {
    if (!merged.has(row.id)) {
      merged.set(row.id, {
        id: row.id,
        path: row.path,
        title: row.title,
        headingPath: row.heading_path,
        sectionHeading: row.section_heading,
        preview: row.preview,
        noteType: row.note_type,
        noteStatus: row.note_status,
        tagsText: row.tags_text,
        aliases: row.aliases || [],
        links: row.links || [],
        backlinks: row.backlinks || [],
        entities: row.entities || [],
        mtimeMs: row.mtime_ms,
        lexicalScore: 0,
        semanticScore: 0,
      });
    }
    const target = merged.get(row.id);
    if (row.lexicalScore != null) target.lexicalScore = row.lexicalScore;
    if (row.semanticScore != null) target.semanticScore = row.semanticScore;
  }

  const ranked = [...merged.values()].map((row) => {
    const lexicalRank = lexicalRanks.get(row.id);
    const semanticRank = semanticRanks.get(row.id);
    const entityScore = entityScoreForRow(queryEntities, row, graphSpec, seedIndex);
    const fuzzyScore = fuzzyScoreForRow(query, row);
    let finalScore = 0;
    if (lexicalRank) finalScore += reciprocalRankFusion(lexicalRank) * 1.2;
    if (semanticRank) finalScore += reciprocalRankFusion(semanticRank) * 1.3;
    finalScore += entityScore * 0.08;
    finalScore += fuzzyScore * 0.14;
    finalScore += contextualScoreAdjustment(row);
    finalScore += queryIntentBoost(row, intent);
    return {
      ...row,
      entityScore,
      fuzzyScore,
      finalScore,
      matchedSignals: [
        lexicalRank ? 'lexical' : null,
        semanticRank ? 'semantic' : null,
        entityScore ? 'entity' : null,
        fuzzyScore > 0.12 ? 'fuzzy' : null,
      ].filter(Boolean),
    };
  });

  const scopeBoosts = buildScopeBoosts(ranked, seedIndex, matchedEntityIds);
  for (const row of ranked) {
    row.finalScore += scopeBoosts.get(row.id) || 0;
  }
  ranked.sort((a, b) => b.finalScore - a.finalScore);

  const fileLookup = new Map(
    db
      .prepare(
        `
        SELECT path, links_json, backlinks_json
        FROM files
      `,
      )
      .all()
      .map((row) => [
        row.path,
        {
          links: parseJson(row.links_json),
          backlinks: parseJson(row.backlinks_json),
        },
      ]),
  );

  const expansions = relatedExpansion(
    ranked,
    fileLookup,
    options.relatedDepth ?? config.relatedDepth,
    config.relatedBoost,
  );

  const finalResults = diversifyResults(ranked, options.limit ?? config.searchLimit).map((result) => ({
    ...result,
    relatedPaths: expansions
      .filter((entry) => entry.path !== result.path)
      .slice(0, 5)
      .map((entry) => entry.path),
  }));

  db.close();
  return {
    query,
    resultCount: finalResults.length,
    embeddingsUsed: Boolean(semanticCandidates.length),
    results: finalResults,
  };
}
