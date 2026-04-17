import fs from 'node:fs/promises';
import path from 'node:path';
import YAML from 'yaml';

import {
  hashText,
  normalizeText,
  parseList,
  slugify,
  toPosix,
  unique,
} from './common.js';

const EXCLUDED_DIRS = new Set([
  '.git',
  '.obsidian',
  'node_modules',
  '.vault-ai',
]);

const INDEXABLE_EXTENSIONS = new Set(['.md', '.base']);

function stripFrontmatter(raw) {
  if (!raw.startsWith('---\n')) {
    return { frontmatter: {}, body: raw };
  }
  const end = raw.indexOf('\n---\n', 4);
  if (end === -1) {
    return { frontmatter: {}, body: raw };
  }
  const yamlBlock = raw.slice(4, end);
  const body = raw.slice(end + 5);
  try {
    return { frontmatter: YAML.parse(yamlBlock) || {}, body };
  } catch {
    return { frontmatter: {}, body: raw };
  }
}

function cleanTitle(filePath) {
  return path.basename(filePath, path.extname(filePath));
}

function cleanInlineTags(raw) {
  return unique(
    [...raw.matchAll(/(^|\s)#([A-Za-z0-9/_-]+)/g)].map((match) => match[2]),
  );
}

function extractWikiLinks(raw) {
  return unique(
    [...raw.matchAll(/\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|[^\]]+)?\]\]/g)].map((match) =>
      match[1].trim(),
    ),
  );
}

function extractQuotedPhrases(raw) {
  return unique(
    [...raw.matchAll(/["'`“”]([^"'`“”]{3,120})["'`“”]/g)].map((match) =>
      match[1].trim(),
    ),
  );
}

function extractTitleCaseEntities(raw) {
  return unique(
    [...raw.matchAll(/\b(?:[A-ZÀ-Ý][\p{L}\d/-]+(?:\s+[A-ZÀ-Ý][\p{L}\d/-]+)+)\b/gu)].map(
      (match) => match[0].trim(),
    ),
  );
}

function extractLineEntities(raw) {
  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const candidates = [];
  for (const line of lines) {
    if (line.length > 4 && line.length < 80 && /[:/-]/.test(line) && /\w/.test(line)) {
      candidates.push(line);
    }
  }
  return unique(candidates);
}

export function extractEntities({ title, aliases = [], headingPath = '', content = '', tags = [] }) {
  return unique([
    title,
    ...aliases,
    ...tags,
    ...extractWikiLinks(content),
    ...extractQuotedPhrases(content),
    ...extractTitleCaseEntities(content),
    ...extractLineEntities(headingPath),
  ]).slice(0, 80);
}

function splitLargeSection(section, softLimit, hardLimit) {
  if (section.content.length <= hardLimit) {
    return [section];
  }
  const paragraphs = section.content
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
  const windows = [];
  let buffer = [];
  let bufferLength = 0;

  const flush = () => {
    if (!buffer.length) return;
    const content = buffer.join('\n\n').trim();
    if (!content) return;
    windows.push({
      ...section,
      content,
    });
  };

  for (const paragraph of paragraphs) {
    if (bufferLength >= softLimit && buffer.length) {
      flush();
      buffer = [buffer[buffer.length - 1], paragraph];
      bufferLength = buffer.join('\n\n').length;
      continue;
    }
    buffer.push(paragraph);
    bufferLength = buffer.join('\n\n').length;
  }
  flush();
  return windows;
}

export function chunkMarkdown(body, options = {}) {
  const softLimit = options.chunkSoftLimit ?? 1400;
  const hardLimit = options.chunkHardLimit ?? 2200;
  const lines = body.split(/\r?\n/);
  const sections = [];
  const stack = [];
  let buffer = [];
  let currentHeading = '';

  const flush = () => {
    const content = buffer.join('\n').trim();
    if (!content) {
      buffer = [];
      return;
    }
    sections.push({
      headingPath: stack.join(' > ') || 'Overview',
      sectionHeading: currentHeading || 'Overview',
      sectionDepth: stack.length || 1,
      content,
    });
    buffer = [];
  };

  for (const line of lines) {
    const match = line.match(/^(#{1,6})\s+(.*)$/);
    if (!match) {
      buffer.push(line);
      continue;
    }
    flush();
    const level = match[1].length;
    currentHeading = match[2].trim();
    stack[level - 1] = currentHeading;
    stack.length = level;
  }
  flush();

  if (!sections.length && body.trim()) {
    sections.push({
      headingPath: 'Overview',
      sectionHeading: 'Overview',
      sectionDepth: 1,
      content: body.trim(),
    });
  }

  return sections.flatMap((section) => splitLargeSection(section, softLimit, hardLimit));
}

export async function walkVault(root) {
  const files = [];

  async function walk(dir) {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith('.') && entry.name !== '.base') {
        if (EXCLUDED_DIRS.has(entry.name)) continue;
      }
      if (EXCLUDED_DIRS.has(entry.name)) continue;
      const absolute = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(absolute);
        continue;
      }
      const ext = path.extname(entry.name).toLowerCase();
      if (!INDEXABLE_EXTENSIONS.has(ext)) continue;
      files.push(absolute);
    }
  }

  await walk(root);
  return files.sort();
}

function relativePath(root, filePath) {
  return toPosix(path.relative(root, filePath));
}

function sameFolderRelativePath(basePath, target) {
  return toPosix(path.posix.normalize(path.posix.join(path.posix.dirname(basePath), target)));
}

function buildPreview(raw) {
  return raw.replace(/\s+/g, ' ').trim().slice(0, 420);
}

function buildFrontmatterSummary(frontmatter) {
  const summaryKeys = [
    'type',
    'status',
    'owner',
    'created',
    'updated',
    'date',
    'repo_path',
    'production_url',
    'baseline_commit',
    'primary_stack',
    'next_action',
    'decision_id',
    'scope',
    'topic',
    'pack_id',
  ];
  const lines = [];
  for (const key of summaryKeys) {
    const value = frontmatter[key];
    if (value == null || value === '') continue;
    if (Array.isArray(value)) {
      lines.push(`${key}: ${value.join(', ')}`);
      continue;
    }
    lines.push(`${key}: ${String(value)}`);
  }
  return lines.join('\n');
}

export async function parseVault(root, config) {
  const filePaths = await walkVault(root);
  const parsedFiles = [];
  const fileLookup = new Map();

  for (const filePath of filePaths) {
    const raw = await fs.readFile(filePath, 'utf8');
    const relative = relativePath(root, filePath);
    const ext = path.extname(filePath).toLowerCase();
    const { frontmatter, body } = ext === '.md' ? stripFrontmatter(raw) : { frontmatter: {}, body: raw };
    const title = frontmatter.title || cleanTitle(relative);
    const aliases = unique(parseList(frontmatter.aliases));
    const tags = unique([...parseList(frontmatter.tags), ...cleanInlineTags(body)]);
    const links = extractWikiLinks(body);
    const type = frontmatter.type ? String(frontmatter.type) : ext === '.base' ? 'base' : 'note';
    const status = frontmatter.status ? String(frontmatter.status) : '';
    const metadataSummary = buildFrontmatterSummary(frontmatter);
    const bodyChunks = chunkMarkdown(body, config);
    const sourceChunks = metadataSummary
      ? [
          {
            headingPath: 'Metadata',
            sectionHeading: 'Metadata',
            sectionDepth: 1,
            content: metadataSummary,
          },
          ...bodyChunks,
        ]
      : bodyChunks;
    const chunks = sourceChunks.map((chunk, index) => {
      const entities = extractEntities({
        title,
        aliases,
        headingPath: chunk.headingPath,
        content: chunk.content,
        tags,
      });
      return {
        id: `${relative}#${slugify(chunk.sectionHeading || 'overview')}-${index}`,
        chunkIndex: index,
        headingPath: chunk.headingPath,
        sectionHeading: chunk.sectionHeading,
        sectionDepth: chunk.sectionDepth,
        content: chunk.content,
        preview: buildPreview(chunk.content),
        entities,
      };
    });
    const stat = await fs.stat(filePath);
    const canonicalName = toPosix(relative.slice(0, -ext.length));
    const record = {
      absolutePath: filePath,
      path: relative,
      canonicalName,
      basename: cleanTitle(relative),
      title,
      aliases,
      tags,
      links,
      type,
      status,
      frontmatter,
      raw,
      body,
      fileHash: hashText(raw),
      updated: frontmatter.updated || frontmatter.date || null,
      mtimeMs: stat.mtimeMs,
      chunks,
    };
    parsedFiles.push(record);

    const keys = unique([canonicalName, normalizeText(canonicalName), cleanTitle(relative), normalizeText(cleanTitle(relative)), ...aliases, ...aliases.map(normalizeText)]);
    for (const key of keys) {
      if (!key) continue;
      if (!fileLookup.has(key)) fileLookup.set(key, new Set());
      fileLookup.get(key).add(relative);
    }
  }

  const backlinks = new Map();
  for (const file of parsedFiles) {
    const resolvedLinks = [];
    for (const link of file.links) {
      const normalizedLink = normalizeText(link.replace(/\.md$/i, '').replace(/\\/g, '/'));
      const directKey = toPosix(link.replace(/\.md$/i, ''));
      const relativeKey = sameFolderRelativePath(file.canonicalName, directKey);
      const candidates = [
        relativeKey,
        normalizeText(relativeKey),
        directKey,
        normalizedLink,
        path.basename(directKey),
        normalizeText(path.basename(directKey)),
      ];
      let resolved = null;
      for (const candidate of candidates) {
        const matches = fileLookup.get(candidate);
        if (matches?.size === 1) {
          resolved = [...matches][0];
          break;
        }
      }
      if (resolved) {
        resolvedLinks.push(resolved);
        if (!backlinks.has(resolved)) backlinks.set(resolved, new Set());
        backlinks.get(resolved).add(file.path);
      }
    }
    file.resolvedLinks = unique(resolvedLinks);
  }

  for (const file of parsedFiles) {
    file.backlinks = unique([...(backlinks.get(file.path) || new Set())]);
  }

  return parsedFiles;
}
