import fs from 'node:fs/promises';
import path from 'node:path';
import YAML from 'yaml';

import { daysBetween, matchesGlob, parseList, toPosix, trigramSimilarity } from './common.js';

function parseFrontmatter(raw) {
  if (!raw.startsWith('---\n')) return {};
  const end = raw.indexOf('\n---\n', 4);
  if (end === -1) return {};
  try {
    return YAML.parse(raw.slice(4, end)) || {};
  } catch {
    return {};
  }
}

async function walkMarkdown(root, dir, output = []) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (['.git', '.obsidian', 'node_modules', '.vault-ai'].includes(entry.name)) continue;
    const absolute = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await walkMarkdown(root, absolute, output);
      continue;
    }
    if (!entry.isFile() || path.extname(entry.name) !== '.md') continue;
    output.push(absolute);
  }
  return output;
}

function resolveStalenessRule(graphSpec, type, status, relativePath) {
  const exception = (graphSpec.staleness?.exceptions || []).find(
    (entry) => entry.type === type && (!entry.status || entry.status.includes(status || '')),
  );
  if (exception) return exception;
  const override = (graphSpec.staleness?.path_overrides || []).find((entry) =>
    matchesGlob(entry.glob, relativePath),
  );
  if (override) return override;
  return (graphSpec.staleness?.rules || []).find(
    (entry) => entry.type === type && (!entry.status || entry.status.includes(status || '')),
  );
}

function isIgnoredDuplicate(graphSpec, leftPath, rightPath) {
  return (graphSpec.duplication?.ignore_rules || []).some((rule) => {
    const leftMatches = !rule.left_glob || matchesGlob(rule.left_glob, leftPath);
    const rightMatches = !rule.right_glob || matchesGlob(rule.right_glob, rightPath);
    const globMatches =
      !rule.glob || matchesGlob(rule.glob, leftPath) || matchesGlob(rule.glob, rightPath);
    return leftMatches && rightMatches && globMatches;
  });
}

function resolveFreshnessTimestamp(graphSpec, frontmatter, fallbackMs) {
  const priority = graphSpec.staleness?.date_field_priority || ['updated', 'date', 'created'];
  for (const field of priority) {
    const value = frontmatter[field];
    if (!value) continue;
    const parsed = new Date(value).getTime();
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return fallbackMs;
}

export async function runHealthChecks(paths, graphSpec, config) {
  const markdownFiles = await walkMarkdown(paths.root, paths.root);
  const staleFindings = [];
  const duplicateFindings = [];

  const records = [];
  for (const absolutePath of markdownFiles) {
    const raw = await fs.readFile(absolutePath, 'utf8');
    const frontmatter = parseFrontmatter(raw);
    const stat = await fs.stat(absolutePath);
    const type = frontmatter.type || 'default';
    const relativePath = toPosix(path.relative(paths.root, absolutePath));
    const rule = resolveStalenessRule(graphSpec, type, frontmatter.status, relativePath);
    const threshold =
      rule && Object.prototype.hasOwnProperty.call(rule, 'max_age_days')
        ? rule.max_age_days
        : config.staleDays?.[type] ?? config.staleDays?.default ?? 30;
    const ageDays = daysBetween(resolveFreshnessTimestamp(graphSpec, frontmatter, stat.mtimeMs));
    if (!relativePath.startsWith('05-templates/') && threshold != null && ageDays > threshold) {
      staleFindings.push({
        path: relativePath,
        type,
        status: frontmatter.status || null,
        ageDays,
        thresholdDays: threshold,
        severity: rule?.severity || 'warning',
      });
    }
    records.push({
      path: relativePath,
      type,
      title: frontmatter.title || path.basename(relativePath, '.md'),
      tags: parseList(frontmatter.tags),
    });
  }

  for (let i = 0; i < records.length; i += 1) {
    for (let j = i + 1; j < records.length; j += 1) {
      const a = records[i];
      const b = records[j];
      if (isIgnoredDuplicate(graphSpec, a.path, b.path)) continue;
      const sameFolder = path.posix.dirname(a.path) === path.posix.dirname(b.path);
      const isDecisionPair = a.path.includes('/decisions/') && b.path.includes('/decisions/');
      if (!sameFolder && !isDecisionPair) continue;

      const titleOverlap = trigramSimilarity(a.title, b.title);
      const sharedTags = a.tags.filter((tag) => b.tags.includes(tag)).length;
      if (titleOverlap > 0.9 && sharedTags > 0) {
        duplicateFindings.push({
          paths: [a.path, b.path],
          reason: 'Similar titles with shared tags',
          score: Number(titleOverlap.toFixed(3)),
        });
      }
    }
  }

  return {
    staleFindings,
    duplicateFindings,
  };
}
