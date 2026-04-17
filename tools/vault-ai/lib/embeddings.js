import { env, pipeline } from '@huggingface/transformers';

import { cosineSimilarity } from './common.js';

let extractorPromise = null;

export async function getExtractor(paths, config) {
  if (!extractorPromise) {
    env.cacheDir = paths.cacheDir;
    extractorPromise = pipeline('feature-extraction', config.embeddingModel, {
      dtype: config.embeddingDType,
    });
  }
  return extractorPromise;
}

export async function embedTexts(texts, paths, config, mode = 'passage') {
  const extractor = await getExtractor(paths, config);
  const prefixed = texts.map((text) => `${mode}: ${text}`);
  const output = await extractor(prefixed, { pooling: 'mean', normalize: true });
  if (Array.isArray(output)) {
    return output.map((tensor) => Array.from(tensor.data));
  }
  const rows = output.dims?.[0] || texts.length;
  const cols = output.dims?.[1] || 0;
  const vectors = [];
  for (let row = 0; row < rows; row += 1) {
    const start = row * cols;
    vectors.push(Array.from(output.data.slice(start, start + cols)));
  }
  return vectors;
}

export async function embedQuery(query, paths, config) {
  const [vector] = await embedTexts([query], paths, config, 'query');
  return vector;
}

export function similarityScores(queryVector, rows) {
  return rows.map((row) => ({
    ...row,
    semanticScore: cosineSimilarity(queryVector, row.embedding),
  }));
}
