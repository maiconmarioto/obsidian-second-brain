import fs from 'node:fs/promises';
import path from 'node:path';

import { fileExists, nowIso, slugify, toPosix } from './common.js';

function yamlScalar(value) {
  return JSON.stringify(String(value));
}

function replaceEmptyFrontmatterScalar(raw, key, value) {
  return raw.replace(new RegExp(`^(${key}):\\s*$`, 'm'), `$1: ${value}`);
}

function applyTemplate(raw, replacements) {
  let next = String(raw);
  for (const [key, value] of Object.entries(replacements)) {
    next = next.replaceAll(`{{${key}}}`, value);
  }
  return next;
}

async function readTemplate(paths, name) {
  return fs.readFile(path.join(paths.root, '05-templates', name), 'utf8');
}

function buildIndexContent(template, { title, slug, status, owner, isoDate }) {
  let next = applyTemplate(template, {
    title,
    'project-name': slug,
  });
  next = replaceEmptyFrontmatterScalar(next, 'created', isoDate);
  next = replaceEmptyFrontmatterScalar(next, 'updated', isoDate);
  next = next.replace(/^status:\s*proposed$/m, `status: ${status}`);
  if (owner) {
    next = replaceEmptyFrontmatterScalar(next, 'owner', yamlScalar(owner));
  }
  return next;
}

function buildSimpleContent(template, isoDate) {
  return replaceEmptyFrontmatterScalar(template, 'updated', isoDate);
}

export async function scaffoldProject(paths, options = {}) {
  const slug = slugify(options.slug || options.project || options.name);
  if (!slug) {
    throw new Error('project-init requires a project slug or name');
  }

  const rawTitle = String(options.title || slug)
    .trim()
    .replace(/\s+/g, ' ');
  const title = rawTitle || slug;
  const status = String(options.status || 'proposed').trim() || 'proposed';
  const owner = options.owner ? String(options.owner).trim() : '';
  const isoDate = nowIso().slice(0, 10);
  const rootDir = path.join(paths.root, '01-projects', slug);
  const directories = [
    rootDir,
    path.join(rootDir, 'knowledge'),
    path.join(rootDir, 'decisions'),
    path.join(rootDir, 'sessions'),
  ];
  const files = [
    {
      path: path.join(rootDir, 'index.md'),
      content: buildIndexContent(await readTemplate(paths, 'template-project.md'), {
        title,
        slug,
        status,
        owner,
        isoDate,
      }),
    },
    {
      path: path.join(rootDir, 'context.md'),
      content: buildSimpleContent(await readTemplate(paths, 'template-context.md'), isoDate),
    },
    {
      path: path.join(rootDir, 'tasks.md'),
      content: buildSimpleContent(await readTemplate(paths, 'template-tasks.md'), isoDate),
    },
  ];

  if (!options.force) {
    const existingPaths = [];
    for (const directory of directories) {
      if (await fileExists(directory)) existingPaths.push(directory);
    }
    for (const file of files) {
      if (await fileExists(file.path)) existingPaths.push(file.path);
    }
    if (existingPaths.length > 0) {
      throw new Error(
        `project scaffold already exists for '${slug}': ${existingPaths
          .map((entry) => toPosix(path.relative(paths.root, entry)) || '.')
          .join(', ')}`,
      );
    }
  }

  if (!options.dryRun) {
    for (const directory of directories) {
      await fs.mkdir(directory, { recursive: true });
    }
    for (const file of files) {
      await fs.writeFile(file.path, file.content, 'utf8');
    }
  }

  return {
    ok: true,
    dryRun: Boolean(options.dryRun),
    slug,
    title,
    status,
    owner: owner || null,
    projectRoot: toPosix(path.relative(paths.root, rootDir)),
    createdDirectories: directories.map((entry) => toPosix(path.relative(paths.root, entry))),
    createdFiles: files.map((entry) => toPosix(path.relative(paths.root, entry.path))),
  };
}
