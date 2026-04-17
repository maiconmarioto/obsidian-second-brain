import fs from 'node:fs/promises';
import path from 'node:path';
import YAML from 'yaml';

import { fileExists, matchesGlob, parseList, toPosix } from './common.js';

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
    output.push(toPosix(path.relative(root, absolute)));
  }
  return output;
}

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

function validateByKind(kind, value) {
  if (kind === 'string') return typeof value === 'string' && value.trim().length > 0;
  if (kind === 'array') return Array.isArray(value) && value.length > 0;
  if (kind === 'string-or-array') {
    return (typeof value === 'string' && value.trim()) || (Array.isArray(value) && value.length > 0);
  }
  return value != null;
}

function validateFieldRule(field, rule, value) {
  const findings = [];
  if (value == null) return findings;
  const normalizedValue =
    typeof value === 'number' && field === 'decision_id' ? String(value).padStart(4, '0') : value;
  if (rule.kind && !validateByKind(rule.kind, normalizedValue)) {
    findings.push({
      field,
      severity: rule.severity || 'error',
      rule: 'kind',
      actual: normalizedValue,
    });
    return findings;
  }
  if (typeof normalizedValue === 'string') {
    if (rule.min_length && normalizedValue.trim().length < rule.min_length) {
      findings.push({
        field,
        severity: rule.severity || 'error',
        rule: 'min_length',
        expected: rule.min_length,
        actual: normalizedValue.trim().length,
      });
    }
    if (rule.pattern && !(new RegExp(rule.pattern).test(normalizedValue))) {
      findings.push({
        field,
        severity: rule.severity || 'error',
        rule: 'pattern',
        expected: rule.pattern,
        actual: normalizedValue,
      });
    }
    if (rule.allowed_values && !rule.allowed_values.includes(normalizedValue)) {
      findings.push({
        field,
        severity: rule.severity || 'error',
        rule: 'allowed_values',
        expected: rule.allowed_values,
        actual: normalizedValue,
      });
    }
  }
  if (Array.isArray(normalizedValue)) {
    if (rule.min_items && normalizedValue.length < rule.min_items) {
      findings.push({
        field,
        severity: rule.severity || 'error',
        rule: 'min_items',
        expected: rule.min_items,
        actual: normalizedValue.length,
      });
    }
    if (rule.unique_items && new Set(normalizedValue).size !== normalizedValue.length) {
      findings.push({
        field,
        severity: rule.severity || 'error',
        rule: 'unique_items',
        actual: normalizedValue,
      });
    }
    if (rule.item_pattern) {
      const invalid = normalizedValue.filter(
        (entry) => !new RegExp(rule.item_pattern).test(String(entry)),
      );
      if (invalid.length) {
        findings.push({
          field,
          severity: rule.severity || 'error',
          rule: 'item_pattern',
          expected: rule.item_pattern,
          actual: invalid,
        });
      }
    }
  }
  return findings;
}

function shouldLint(relativePath, rules) {
  const include = rules.lint_scope?.include || ['**/*.md'];
  const exclude = rules.lint_scope?.exclude || [];
  const included = include.some((glob) => glob === relativePath || matchesGlob(glob, relativePath));
  const excluded = exclude.some((glob) => glob === relativePath || matchesGlob(glob, relativePath));
  return included && !excluded;
}

export async function lintFrontmatter(paths, rules) {
  if (!(await fileExists(paths.frontmatterRulesFile))) {
    return {
      ok: true,
      filesChecked: 0,
      findings: [],
      message: `No rules file found at ${paths.frontmatterRulesFile}`,
    };
  }

  const files = await walkMarkdown(paths.root, paths.root);
  const findings = [];

  for (const relativePath of files) {
    if (!shouldLint(relativePath, rules)) continue;
    const absolutePath = path.join(paths.root, relativePath);
    const raw = await fs.readFile(absolutePath, 'utf8');
    const frontmatter = parseFrontmatter(raw);
    const noteType = frontmatter.type;
    const isTemplate = relativePath.startsWith('05-templates/');

    for (const field of rules.global?.required_keys || []) {
      if (!isTemplate && frontmatter[field] == null) {
        findings.push({
          path: relativePath,
          type: noteType || 'unknown',
          field,
          severity: 'error',
          rule: 'required_key',
          actual: null,
        });
      }
    }

    for (const [field, rule] of Object.entries(rules.global?.field_rules || {})) {
      if (noteType === 'context-pack' && field === 'scope') continue;
      if (
        isTemplate &&
        (frontmatter[field] === '' ||
          (Array.isArray(frontmatter[field]) && frontmatter[field].length === 0))
      ) {
        continue;
      }
      for (const finding of validateFieldRule(field, rule, frontmatter[field])) {
        findings.push({ path: relativePath, type: noteType || 'unknown', ...finding });
      }
    }

    const typeRule = rules.type_rules?.[noteType];
    if (typeRule) {
      for (const field of typeRule.required || []) {
        if (!isTemplate && frontmatter[field] == null) {
          findings.push({
            path: relativePath,
            type: noteType || 'unknown',
            field,
            severity: 'error',
            rule: 'required_by_type',
            actual: null,
          });
        }
      }
      if (frontmatter.status && typeRule.allowed_status && !typeRule.allowed_status.includes(frontmatter.status)) {
        findings.push({
          path: relativePath,
          type: noteType || 'unknown',
          field: 'status',
          severity: 'error',
          rule: 'allowed_status',
          expected: typeRule.allowed_status,
          actual: frontmatter.status,
        });
      }
      for (const tag of typeRule.tag_expectations || []) {
        if (!parseList(frontmatter.tags).includes(tag)) {
          findings.push({
            path: relativePath,
            type: noteType || 'unknown',
            field: 'tags',
            severity: 'warning',
            rule: 'tag_expectations',
            expected: tag,
            actual: frontmatter.tags ?? null,
          });
        }
      }
    }

    for (const hint of rules.path_hints || []) {
      if ((hint.glob === relativePath || matchesGlob(hint.glob, relativePath)) && noteType !== hint.expected_type) {
        findings.push({
          path: relativePath,
          type: noteType || 'unknown',
          field: 'type',
          severity: 'warning',
          rule: 'path_hint',
          expected: hint.expected_type,
          actual: noteType ?? null,
        });
      }
    }
  }

  return {
    ok: findings.length === 0,
    filesChecked: files.length,
    findings,
  };
}
