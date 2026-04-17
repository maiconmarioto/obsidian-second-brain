import fs from 'node:fs/promises';

import { normalizeText } from './common.js';

export async function runBenchmarks(paths, searchFn) {
  const raw = await fs.readFile(paths.benchmarkFile, 'utf8');
  const benchmarks = JSON.parse(raw);
  const results = [];

  for (const benchmark of benchmarks.queries || []) {
    const output = await searchFn(benchmark.query, benchmark.filters || {}, {
      limit: benchmark.limit || 8,
      relatedDepth: benchmark.relatedDepth ?? 1,
    });
    const matchedPaths = [...new Set(output.results.map((row) => row.path))];
    const misses = [];

    for (const expected of benchmark.expected_primary_hits || []) {
      const index = matchedPaths.indexOf(expected.path);
      if (index === -1 || index + 1 > expected.rank_at_most) {
        misses.push({
          kind: 'primary',
          expectedPath: expected.path,
          expectedRankAtMost: expected.rank_at_most,
          actualRank: index === -1 ? null : index + 1,
        });
      }
    }

    for (const expected of benchmark.expected_supporting_hits || []) {
      const index = matchedPaths.indexOf(expected.path);
      if (index === -1 || index + 1 > expected.rank_at_most) {
        misses.push({
          kind: 'supporting',
          expectedPath: expected.path,
          expectedRankAtMost: expected.rank_at_most,
          actualRank: index === -1 ? null : index + 1,
        });
      }
    }

    const flattenedText = normalizeText(
      output.results
        .map((row) => `${row.path} ${row.headingPath} ${row.preview} ${row.noteStatus || ''}`)
        .join('\n'),
    );
    const missingTerms = (benchmark.must_include_terms || []).filter(
      (term) => !flattenedText.includes(normalizeText(term)),
    );
    for (const term of missingTerms) {
      misses.push({ kind: 'term', expectedTerm: term });
    }

    results.push({
      id: benchmark.id,
      query: benchmark.query,
      expectedPrimaryHits: benchmark.expected_primary_hits || [],
      expectedSupportingHits: benchmark.expected_supporting_hits || [],
      matchedPaths,
      missingTerms,
      passed: misses.length === 0,
      misses,
    });
  }

  return {
    ok: results.every((result) => result.passed),
    total: results.length,
    passed: results.filter((result) => result.passed).length,
    failed: results.filter((result) => !result.passed).length,
    results,
  };
}
