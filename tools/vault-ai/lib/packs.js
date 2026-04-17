import fs from 'node:fs/promises';
import path from 'node:path';

import {
  clipText,
  fileExists,
  formatJson,
  normalizeText,
  PACK_BUDGET_PRESETS,
  toPosix,
  unique,
} from './common.js';
import { buildFrontmatterSummary, chunkMarkdown, stripFrontmatter } from './markdown.js';

function replaceVariables(value, variables) {
  return String(value).replace(/\{([a-zA-Z0-9_-]+)\}/g, (_, key) => variables[key] ?? '');
}

function detectScopeType(scopePath) {
  if (String(scopePath || '').startsWith('02-workstreams/')) return 'workstream';
  if (String(scopePath || '').startsWith('03-shared-knowledge/')) return 'shared';
  return 'project';
}

function fileRank(entry) {
  if (entry.endsWith('/index.md')) return 0;
  if (entry.endsWith('/tasks.md')) return 1;
  if (entry.endsWith('/context.md')) return 2;
  if (entry.includes('/decisions/')) return 3;
  if (entry.includes('/sessions/')) return 4;
  return 10;
}

function preferredOrderRank(entry, preferredOrder = []) {
  const index = preferredOrder.findIndex((pattern) => pattern === entry);
  return index === -1 ? Number.POSITIVE_INFINITY : index;
}

function sortCandidates(filePaths, preferredOrder = []) {
  return [...new Set(filePaths)].sort((a, b) => {
    const preferred = preferredOrderRank(a, preferredOrder) - preferredOrderRank(b, preferredOrder);
    if (preferred !== 0) return preferred;
    return fileRank(a) - fileRank(b) || a.localeCompare(b);
  });
}

function resolveVariables(manifest, args) {
  const scopePath =
    args.scopePath ||
    args.scope ||
    (args.project ? `01-projects/${args.project}` : manifest.target?.default_scope_path || '');
  return {
    project: args.project || '',
    scope_path: scopePath,
    scope_type: detectScopeType(scopePath),
    stable_background_needed: Boolean(args.stableBackgroundNeeded),
    operational_history_needed: Boolean(args.operationalHistoryNeeded),
    recent_release_activity: Boolean(args.recentReleaseActivity),
    tag_hint: args.tagHint || '',
    topic: args.topic || '',
  };
}

function shouldInclude(entry, variables) {
  if (!entry.when) return true;
  const rule = String(entry.when);
  if (rule.includes('scope_type == "workstream"')) return variables.scope_type === 'workstream';
  if (rule.includes('scope_type != "shared"')) return variables.scope_type !== 'shared';
  if (rule.includes('stable_background_needed == true')) return variables.stable_background_needed;
  if (rule.includes('operational_history_needed == true')) return variables.operational_history_needed;
  if (rule.includes('recent_release_activity == true')) return variables.recent_release_activity;
  if (rule.includes('tag_hint != null')) return Boolean(variables.tag_hint);
  return true;
}

async function collectFolderEntries(root, folderPath, limit = Infinity) {
  const absolute = path.join(root, folderPath);
  if (!(await fileExists(absolute))) return [];
  return (await fs.readdir(absolute))
    .filter((item) => item.endsWith('.md'))
    .sort()
    .reverse()
    .slice(0, limit)
    .map((item) => toPosix(path.join(folderPath, item)));
}

async function expandSelectors(paths, manifest, variables) {
  const selections = [];
  const seed = manifest.selection?.seed || [];
  const include = manifest.selection?.include || [];
  const preferredOrder = (manifest.output?.preferred_order || []).map((entry) =>
    replaceVariables(entry, variables),
  );

  for (const entry of [...seed, ...include]) {
    if (!shouldInclude(entry, variables)) continue;
    if (entry.path) {
      selections.push(replaceVariables(entry.path, variables));
    }
    if (entry.folder) {
      selections.push(
        ...(await collectFolderEntries(
          paths.root,
          replaceVariables(entry.folder, variables),
          entry.limit ?? Infinity,
        )),
      );
    }
  }

  return sortCandidates(selections, preferredOrder);
}

function resolvePackBudget(args, manifest) {
  const presetKey = args.compact ? 'low' : args.budget || manifest.defaults?.token_budget || 'medium';
  const preset = PACK_BUDGET_PRESETS[presetKey] || PACK_BUDGET_PRESETS.medium;
  return {
    name: preset.name,
    maxNotes: args.maxNotes ?? manifest.defaults?.max_notes ?? preset.maxNotes,
    charsPerNote: args.charsPerNote ?? preset.charsPerNote,
    sectionsPerNote: args.sectionsPerNote ?? preset.sectionsPerNote,
  };
}

function noteTypeFromPath(relativePath) {
  if (relativePath.endsWith('/index.md')) return 'index';
  if (relativePath.endsWith('/tasks.md')) return 'tasks';
  if (relativePath.endsWith('/context.md')) return 'context';
  if (relativePath.includes('/decisions/')) return 'decision';
  if (relativePath.includes('/sessions/')) return 'session';
  return 'note';
}

function buildHintTerms(manifest, relativePath) {
  const hintTerms = [];
  for (const value of manifest.output?.sections || []) hintTerms.push(value);
  for (const value of manifest.selection?.prioritize?.sections || []) hintTerms.push(value);
  for (const value of manifest.selection?.promote?.from_sessions?.sections || []) hintTerms.push(value);
  for (const value of manifest.output?.extraction_hints || []) hintTerms.push(value);

  const noteType = noteTypeFromPath(relativePath);
  if (noteType === 'index') hintTerms.push('metadata', 'purpose', 'current operating state', 'active risks');
  if (noteType === 'tasks') hintTerms.push('now', 'next', 'blocked', 'decision needed');
  if (noteType === 'context') hintTerms.push('stable facts only', 'technical shape', 'known limitations', 'repository');
  if (noteType === 'decision') hintTerms.push('decision', 'context', 'consequences');
  if (noteType === 'session') hintTerms.push('outputs', 'next steps', 'decisions or changes', 'volatile facts');

  return unique(hintTerms.map((entry) => normalizeText(entry)).filter(Boolean));
}

function scoreSection(relativePath, section, hintTerms) {
  const heading = normalizeText(section.headingPath);
  const content = normalizeText(section.content);
  const noteType = noteTypeFromPath(relativePath);
  let score = 0;

  if (section.sectionHeading === 'Metadata') score += 0.4;
  for (const hint of hintTerms) {
    if (heading.includes(hint)) score += 0.16;
    else if (content.includes(hint)) score += 0.05;
  }

  if (noteType === 'index' && /(purpose|current operating state|active risks)/.test(heading)) score += 0.12;
  if (noteType === 'tasks' && /(now|next|blocked|decision needed)/.test(heading)) score += 0.14;
  if (noteType === 'context' && /(stable facts only|technical shape|known limitations)/.test(heading)) score += 0.12;
  if (noteType === 'decision' && /(decision|consequences|context)/.test(heading)) score += 0.1;
  if (noteType === 'session' && /(outputs|next steps|decisions|volatile facts)/.test(heading)) score += 0.12;

  return score;
}

function summarizeSections(relativePath, frontmatter, body, manifest, budget) {
  const metadataSummary = buildFrontmatterSummary(frontmatter);
  const sourceSections = [
    ...(metadataSummary
      ? [
          {
            headingPath: 'Metadata',
            sectionHeading: 'Metadata',
            content: metadataSummary,
          },
        ]
      : []),
    ...chunkMarkdown(body, { chunkSoftLimit: 500, chunkHardLimit: 900 }),
  ];

  const hintTerms = buildHintTerms(manifest, relativePath);
  const ranked = sourceSections
    .map((section) => ({
      headingPath: section.headingPath,
      sectionHeading: section.sectionHeading,
      excerpt: clipText(section.content, Math.min(budget.charsPerNote, 280)),
      score: scoreSection(relativePath, section, hintTerms),
    }))
    .filter((section) => section.excerpt)
    .sort((a, b) => b.score - a.score || a.headingPath.localeCompare(b.headingPath));

  const selected = [];
  let totalChars = 0;
  for (const section of ranked) {
    if (selected.length >= budget.sectionsPerNote) break;
    const sectionChars = section.headingPath.length + section.excerpt.length;
    if (selected.length && totalChars + sectionChars > budget.charsPerNote) continue;
    selected.push(section);
    totalChars += sectionChars;
  }

  if (!selected.length && ranked.length) {
    selected.push(ranked[0]);
    totalChars = ranked[0].headingPath.length + ranked[0].excerpt.length;
  }

  return {
    noteType: noteTypeFromPath(relativePath),
    sections: selected,
    chars: totalChars,
  };
}

function renderNoteSummary(relativePath, noteSummary) {
  const lines = [`## ${relativePath}`, `- note_type: ${noteSummary.noteType}`, `- chars: ${noteSummary.chars}`];
  for (const section of noteSummary.sections) {
    lines.push(`### ${section.headingPath}`);
    lines.push(`- ${section.excerpt}`);
  }
  return `${lines.join('\n')}\n`;
}

export async function buildPack(paths, manifestData, args = {}) {
  if (!manifestData) {
    throw new Error(`Context pack manifest not found for '${args.packId}'.`);
  }

  const { manifest, path: manifestPath } = manifestData;
  const variables = resolveVariables(manifest, args);
  if (!variables.scope_path) {
    throw new Error('pack-build requires --project or --scope');
  }

  const budget = resolvePackBudget(args, manifest);
  const selectedPaths = (await expandSelectors(paths, manifest, variables)).slice(0, budget.maxNotes);
  const noteSummaries = [];
  const rendered = [];

  for (const relativePath of selectedPaths) {
    const absolutePath = path.join(paths.root, relativePath);
    if (!(await fileExists(absolutePath))) continue;
    const raw = await fs.readFile(absolutePath, 'utf8');
    const { frontmatter, body } = stripFrontmatter(raw);
    const noteSummary = summarizeSections(relativePath, frontmatter, body, manifest, budget);
    noteSummaries.push({
      path: relativePath,
      noteType: noteSummary.noteType,
      chars: noteSummary.chars,
      sections: noteSummary.sections.map((section) => ({
        headingPath: section.headingPath,
        excerpt: section.excerpt,
      })),
    });
    rendered.push(renderNoteSummary(relativePath, noteSummary));
  }

  const title = manifest.pack_id || args.packId;
  const output = {
    id: manifest.pack_id || args.packId,
    title,
    manifestPath,
    manifestOutput: manifest.output || null,
    selectedPaths: noteSummaries.map((entry) => entry.path),
    noteSummaries,
    budget,
    generatedAt: new Date().toISOString(),
  };

  const outputBase = path.join(
    paths.packOutputDir,
    `${output.id}${variables.project ? `--${variables.project}` : ''}`,
  );

  await fs.writeFile(`${outputBase}.json`, formatJson(output));
  await fs.writeFile(
    `${outputBase}.md`,
    [
      `# ${title}`,
      '',
      `Generated at: ${output.generatedAt}`,
      `Budget: ${budget.name} | max_notes=${budget.maxNotes} | chars_per_note=${budget.charsPerNote} | sections_per_note=${budget.sectionsPerNote}`,
      '',
      ...rendered,
    ].join('\n'),
  );

  return {
    ...output,
    outputJson: `${outputBase}.json`,
    outputMarkdown: `${outputBase}.md`,
  };
}
