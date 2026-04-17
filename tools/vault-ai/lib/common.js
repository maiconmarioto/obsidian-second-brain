import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

export const DEFAULTS = {
  embeddingModel: 'Xenova/multilingual-e5-small',
  embeddingDType: 'q8',
  chunkSoftLimit: 1400,
  chunkHardLimit: 2200,
  searchLimit: 8,
  candidateLimit: 40,
  relatedDepth: 1,
  relatedBoost: 0.18,
  fullRebuildThresholdRatio: 0.35,
  fullRebuildThresholdFiles: 25,
  staleDays: {
    project: 14,
    tasks: 7,
    context: 21,
    decision: 45,
    session: 7,
    knowledge: 60,
    default: 30,
  },
};

export function hashText(input) {
  return crypto.createHash('sha256').update(input).digest('hex');
}

export function nowIso() {
  return new Date().toISOString();
}

export function slugify(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
}

export function normalizeText(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s/_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

export function parseList(value) {
  if (value == null) return [];
  if (Array.isArray(value)) return value.flatMap((entry) => parseList(entry));
  if (typeof value === 'string') {
    return value
      .split(/[,\n]/)
      .map((entry) => entry.trim())
      .filter(Boolean);
  }
  return [String(value)];
}

export function toPosix(value) {
  return String(value || '').split(path.sep).join('/');
}

export function ensureArray(value) {
  return Array.isArray(value) ? value : value == null ? [] : [value];
}

export async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function readJson(filePath, fallback = null) {
  if (!(await fileExists(filePath))) return fallback;
  const raw = await fs.readFile(filePath, 'utf8');
  return JSON.parse(raw);
}

export function safeNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function toIsoDateFromEpochMs(epochMs) {
  if (!Number.isFinite(epochMs) || epochMs <= 0) return null;
  return new Date(epochMs).toISOString();
}

export function daysBetween(a, b = Date.now()) {
  return Math.floor((b - a) / 86400000);
}

export function cosineSimilarity(a = [], b = []) {
  if (!a.length || !b.length || a.length !== b.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / Math.sqrt(normA * normB);
}

export function trigramSet(value) {
  const normalized = `  ${normalizeText(value)}  `;
  const set = new Set();
  for (let i = 0; i < normalized.length - 2; i += 1) {
    set.add(normalized.slice(i, i + 3));
  }
  return set;
}

export function trigramSimilarity(a, b) {
  const aSet = trigramSet(a);
  const bSet = trigramSet(b);
  if (!aSet.size || !bSet.size) return 0;
  let overlap = 0;
  for (const tri of aSet) {
    if (bSet.has(tri)) overlap += 1;
  }
  return overlap / (aSet.size + bSet.size - overlap);
}

export function reciprocalRankFusion(rank, k = 60) {
  return 1 / (k + rank);
}

export function formatJson(data) {
  return `${JSON.stringify(data, null, 2)}\n`;
}

export function globToRegExp(glob) {
  const escaped = String(glob)
    .replace(/[.+^${}\\]/g, '\\$&')
    .replace(/\*\*/g, '::DOUBLE_STAR::')
    .replace(/\*/g, '[^/]*')
    .replace(/\?/g, '.')
    .replace(/::DOUBLE_STAR::/g, '.*');
  return new RegExp(`^${escaped}$`);
}

export function matchesGlob(glob, value) {
  try {
    return globToRegExp(glob).test(value);
  } catch {
    return false;
  }
}
