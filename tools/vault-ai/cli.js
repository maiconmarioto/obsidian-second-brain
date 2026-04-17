#!/usr/bin/env node
import fs from 'node:fs/promises';

import { runBenchmarks } from './lib/benchmark.js';
import {
  createPaths,
  ensureDirectories,
  loadContextPackManifest,
  loadFrontmatterRules,
  loadGraphSpec,
  loadSearchConfig,
  resolveRoot,
} from './lib/config.js';
import { formatJson } from './lib/common.js';
import { lintFrontmatter } from './lib/frontmatter-lint.js';
import { runHealthChecks } from './lib/health.js';
import { buildIndex, ensureFreshIndex } from './lib/indexer.js';
import { buildPack } from './lib/packs.js';
import { searchVault } from './lib/search.js';

function parseArgs(argv) {
  const [command = 'help', ...rest] = argv;
  const flags = {};
  const positionals = [];

  for (let i = 0; i < rest.length; i += 1) {
    const token = rest[i];
    if (!token.startsWith('--')) {
      positionals.push(token);
      continue;
    }
    const key = token.slice(2);
    const next = rest[i + 1];
    if (next && !next.startsWith('--')) {
      flags[key] = next;
      i += 1;
    } else {
      flags[key] = true;
    }
  }

  return { command, flags, positionals };
}

function printHelp() {
  process.stdout.write(
    [
      'vault-ai commands:',
      '  index [--no-embeddings]',
      '  search <query> [--limit N] [--type TYPE] [--status STATUS] [--tag TAG] [--path PATH] [--related-depth N] [--json]',
      '  benchmark [--json]',
      '  lint-frontmatter [--json]',
      '  pack-build <pack-id> [--project slug] [--json]',
      '  health [--json]',
      '',
    ].join('\n'),
  );
}

async function main() {
  const { command, flags, positionals } = parseArgs(process.argv.slice(2));
  if (command === 'help' || command === '--help' || command === '-h') {
    printHelp();
    return;
  }

  const root = resolveRoot();
  const paths = createPaths(root);
  await ensureDirectories(paths);
  const config = await loadSearchConfig(paths);
  const graphSpec = await loadGraphSpec(paths);
  const autoRefreshIndex = () => ensureFreshIndex(paths, config);

  const searchFn = (query, filters = {}, options = {}) =>
    searchVault(paths, config, filters, graphSpec, query, options);

  let output;

  switch (command) {
    case 'index': {
      output = await buildIndex(paths, config, {
        noEmbeddings: Boolean(flags['no-embeddings']),
      });
      break;
    }
    case 'search': {
      const query = positionals.join(' ').trim();
      if (!query) {
        throw new Error('search requires a query');
      }
      await autoRefreshIndex();
      output = await searchFn(
        query,
        {
          type: flags.type,
          status: flags.status,
          tag: flags.tag,
          path: flags.path,
        },
        {
          limit: flags.limit ? Number(flags.limit) : undefined,
          relatedDepth: flags['related-depth']
            ? Number(flags['related-depth'])
            : undefined,
        },
      );
      break;
    }
    case 'benchmark': {
      await autoRefreshIndex();
      output = await runBenchmarks(paths, searchFn);
      break;
    }
    case 'lint-frontmatter': {
      const rules = await loadFrontmatterRules(paths);
      output = await lintFrontmatter(paths, rules);
      break;
    }
    case 'pack-build': {
      const packId = positionals[0];
      if (!packId) {
        throw new Error('pack-build requires a pack id');
      }
      await autoRefreshIndex();
      const manifest = await loadContextPackManifest(paths, packId);
      output = await buildPack(paths, manifest, {
        packId,
        project: flags.project,
        scope: flags.scope,
      });
      break;
    }
    case 'health': {
      output = await runHealthChecks(paths, graphSpec, config);
      break;
    }
    default:
      printHelp();
      throw new Error(`Unknown command '${command}'`);
  }

  if (flags.json || command === 'index') {
    process.stdout.write(formatJson(output));
  } else if (command === 'search') {
    process.stdout.write(
      `${output.results
        .map(
          (row, index) =>
            `${index + 1}. ${row.path} :: ${row.headingPath} :: ${row.matchedSignals.join(', ')} :: ${row.preview}`,
        )
        .join('\n')}\n`,
    );
  } else {
    process.stdout.write(formatJson(output));
  }
}

main().catch(async (error) => {
  const message = error instanceof Error ? error.stack || error.message : String(error);
  process.stderr.write(`${message}\n`);
  try {
    const root = resolveRoot();
    const paths = createPaths(root);
    await ensureDirectories(paths);
    await fs.writeFile(`${paths.logsDir}/last-error.log`, `${message}\n`);
  } catch {}
  process.exitCode = 1;
});
