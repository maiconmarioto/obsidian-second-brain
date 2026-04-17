import fs from 'node:fs/promises';
import path from 'node:path';
import YAML from 'yaml';

import { DEFAULTS, fileExists } from './common.js';

export function resolveRoot(cwd = process.cwd()) {
  return cwd;
}

export function createPaths(root) {
  const opsDir = path.join(root, '06-ops');
  const vaultAiDir = path.join(opsDir, 'vault-ai');
  return {
    root,
    dbDir: path.join(root, '.vault-ai'),
    dbFile: path.join(root, '.vault-ai', 'index.sqlite'),
    indexStateFile: path.join(root, '.vault-ai', 'index-state.json'),
    cacheDir: path.join(root, '.vault-ai', 'cache'),
    packOutputDir: path.join(root, '.vault-ai', 'packs'),
    reportDir: path.join(root, '.vault-ai', 'reports'),
    logsDir: path.join(root, '.vault-ai', 'logs'),
    opsDir,
    vaultAiDir,
    contextPackDir: path.join(opsDir, 'context-packs'),
    configFile: path.join(vaultAiDir, 'search-config.json'),
    benchmarkFile: path.join(vaultAiDir, 'benchmarks', 'benchmark-set.v1.json'),
    frontmatterRulesFile: path.join(vaultAiDir, 'governance', 'frontmatter-rules.v1.json'),
    graphSpecFile: path.join(vaultAiDir, 'governance', 'retrieval-governance.v1.json'),
  };
}

export async function ensureDirectories(paths) {
  await Promise.all([
    fs.mkdir(paths.dbDir, { recursive: true }),
    fs.mkdir(paths.cacheDir, { recursive: true }),
    fs.mkdir(paths.packOutputDir, { recursive: true }),
    fs.mkdir(paths.reportDir, { recursive: true }),
    fs.mkdir(paths.logsDir, { recursive: true }),
    fs.mkdir(paths.vaultAiDir, { recursive: true }),
    fs.mkdir(paths.contextPackDir, { recursive: true }),
  ]);
}

export async function loadSearchConfig(paths) {
  const config = { ...DEFAULTS };
  if (await fileExists(paths.configFile)) {
    const raw = await fs.readFile(paths.configFile, 'utf8');
    Object.assign(config, JSON.parse(raw));
  }
  return config;
}

export async function loadYamlFile(filePath, fallback = null) {
  if (!(await fileExists(filePath))) return fallback;
  const raw = await fs.readFile(filePath, 'utf8');
  return YAML.parse(raw);
}

export async function loadFrontmatterRules(paths) {
  if (!(await fileExists(paths.frontmatterRulesFile))) return { type_rules: {} };
  return JSON.parse(await fs.readFile(paths.frontmatterRulesFile, 'utf8'));
}

export async function loadGraphSpec(paths) {
  if (!(await fileExists(paths.graphSpecFile))) {
    return { staleness: {}, duplication: {}, entity_aliases: {} };
  }
  return JSON.parse(await fs.readFile(paths.graphSpecFile, 'utf8'));
}

export async function loadContextPackManifest(paths, packId) {
  const variants = [
    path.join(paths.contextPackDir, `${packId}.md`),
    path.join(paths.contextPackDir, `${packId}.yaml`),
    path.join(paths.contextPackDir, `${packId}.yml`),
    path.join(paths.contextPackDir, `${packId}.json`),
  ];
  for (const candidate of variants) {
    if (!(await fileExists(candidate))) continue;
    if (candidate.endsWith('.json')) {
      return {
        path: candidate,
        manifest: JSON.parse(await fs.readFile(candidate, 'utf8')),
      };
    }
    const raw = await fs.readFile(candidate, 'utf8');
    if (candidate.endsWith('.md')) {
      const match = raw.match(/```ya?ml\n([\s\S]*?)\n```/);
      if (!match) continue;
      return {
        path: candidate,
        manifest: YAML.parse(match[1]),
      };
    }
    return {
      path: candidate,
      manifest: YAML.parse(raw),
    };
  }
  return null;
}
