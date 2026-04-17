import fs from 'node:fs/promises';
import path from 'node:path';

import { fileExists, formatJson, toPosix } from './common.js';

function replaceVariables(value, variables) {
  return String(value).replace(/\{([a-zA-Z0-9_-]+)\}/g, (_, key) => variables[key] ?? '');
}

function sortCandidates(filePaths) {
  return [...new Set(filePaths)].sort((a, b) => {
    const rank = (entry) => {
      if (entry.endsWith('/index.md')) return 0;
      if (entry.endsWith('/tasks.md')) return 1;
      if (entry.endsWith('/context.md')) return 2;
      if (entry.includes('/decisions/')) return 3;
      if (entry.includes('/sessions/')) return 4;
      return 10;
    };
    return rank(a) - rank(b) || a.localeCompare(b);
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
  };
}

function shouldInclude(entry, variables) {
  if (!entry.when) return true;
  if (entry.when.includes('scope_type == "workstream"')) {
    return variables.scope_path.startsWith('02-workstreams/');
  }
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

  return sortCandidates(selections);
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

  const selectedPaths = await expandSelectors(paths, manifest, variables);
  const rendered = [];

  for (const relativePath of selectedPaths) {
    const absolutePath = path.join(paths.root, relativePath);
    if (!(await fileExists(absolutePath))) continue;
    const content = await fs.readFile(absolutePath, 'utf8');
    rendered.push(`## ${relativePath}\n\n${content.trim()}\n`);
  }

  const title = manifest.pack_id || args.packId;
  const output = {
    id: manifest.pack_id || args.packId,
    title,
    manifestPath,
    manifestOutput: manifest.output || null,
    selectedPaths,
    generatedAt: new Date().toISOString(),
  };

  const outputBase = path.join(
    paths.packOutputDir,
    `${output.id}${variables.project ? `--${variables.project}` : ''}`,
  );

  await fs.writeFile(`${outputBase}.json`, formatJson(output));
  await fs.writeFile(
    `${outputBase}.md`,
    `# ${title}\n\nGenerated at: ${output.generatedAt}\n\n${rendered.join('\n')}`,
  );

  return {
    ...output,
    outputJson: `${outputBase}.json`,
    outputMarkdown: `${outputBase}.md`,
  };
}
