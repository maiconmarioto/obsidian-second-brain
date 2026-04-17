import fs from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';

import { nowIso } from './common.js';
import { parseVault } from './markdown.js';
import { embedTexts } from './embeddings.js';

function openDatabase(dbFile) {
  const db = new DatabaseSync(dbFile);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    PRAGMA foreign_keys = ON;
  `);
  return db;
}

function createSchema(db) {
  db.exec(`
    DROP TABLE IF EXISTS chunk_fts;
    DROP TABLE IF EXISTS embeddings;
    DROP TABLE IF EXISTS chunks;
    DROP TABLE IF EXISTS files;

    CREATE TABLE files (
      path TEXT PRIMARY KEY,
      canonical_name TEXT NOT NULL,
      basename TEXT NOT NULL,
      title TEXT NOT NULL,
      aliases_json TEXT NOT NULL,
      tags_json TEXT NOT NULL,
      links_json TEXT NOT NULL,
      backlinks_json TEXT NOT NULL,
      note_type TEXT,
      note_status TEXT,
      updated TEXT,
      mtime_ms INTEGER NOT NULL,
      frontmatter_json TEXT NOT NULL,
      file_hash TEXT NOT NULL
    );

    CREATE TABLE chunks (
      rowid INTEGER PRIMARY KEY AUTOINCREMENT,
      id TEXT NOT NULL UNIQUE,
      path TEXT NOT NULL,
      title TEXT NOT NULL,
      aliases_text TEXT NOT NULL,
      heading_path TEXT NOT NULL,
      section_heading TEXT NOT NULL,
      section_depth INTEGER NOT NULL,
      content TEXT NOT NULL,
      preview TEXT NOT NULL,
      note_type TEXT,
      note_status TEXT,
      tags_text TEXT NOT NULL,
      entities_json TEXT NOT NULL,
      chunk_index INTEGER NOT NULL,
      updated TEXT,
      mtime_ms INTEGER NOT NULL,
      file_hash TEXT NOT NULL,
      chunk_hash TEXT NOT NULL,
      FOREIGN KEY(path) REFERENCES files(path) ON DELETE CASCADE
    );

    CREATE VIRTUAL TABLE chunk_fts USING fts5(
      title,
      aliases_text,
      heading_path,
      content,
      tokenize = 'porter unicode61 remove_diacritics 2'
    );

    CREATE TABLE embeddings (
      chunk_id TEXT PRIMARY KEY,
      embedding_json TEXT NOT NULL,
      model TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(chunk_id) REFERENCES chunks(id) ON DELETE CASCADE
    );
  `);
}

export async function buildIndex(paths, config, options = {}) {
  const db = openDatabase(paths.dbFile);
  createSchema(db);

  const parsedFiles = await parseVault(paths.root, config);

  const insertFile = db.prepare(`
    INSERT INTO files (
      path,
      canonical_name,
      basename,
      title,
      aliases_json,
      tags_json,
      links_json,
      backlinks_json,
      note_type,
      note_status,
      updated,
      mtime_ms,
      frontmatter_json,
      file_hash
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertChunk = db.prepare(`
    INSERT INTO chunks (
      id,
      path,
      title,
      aliases_text,
      heading_path,
      section_heading,
      section_depth,
      content,
      preview,
      note_type,
      note_status,
      tags_text,
      entities_json,
      chunk_index,
      updated,
      mtime_ms,
      file_hash,
      chunk_hash
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertFts = db.prepare(`
    INSERT INTO chunk_fts (rowid, title, aliases_text, heading_path, content)
    VALUES (?, ?, ?, ?, ?)
  `);

  const insertEmbedding = db.prepare(`
    INSERT INTO embeddings (chunk_id, embedding_json, model, created_at)
    VALUES (?, ?, ?, ?)
  `);

  const chunksForEmbedding = [];
  db.exec('BEGIN');
  try {
    for (const file of parsedFiles) {
      insertFile.run(
        file.path,
        file.canonicalName,
        file.basename,
        file.title,
        JSON.stringify(file.aliases),
        JSON.stringify(file.tags),
        JSON.stringify(file.resolvedLinks || []),
        JSON.stringify(file.backlinks || []),
        file.type,
        file.status,
        file.updated,
        Math.round(file.mtimeMs),
        JSON.stringify(file.frontmatter || {}),
        file.fileHash,
      );

      for (const chunk of file.chunks) {
        const aliasesText = file.aliases.join(' ');
        const tagsText = file.tags.join(' ');
        const chunkHash = `${file.fileHash}:${chunk.chunkIndex}`;
        const info = insertChunk.run(
          chunk.id,
          file.path,
          file.title,
          aliasesText,
          chunk.headingPath,
          chunk.sectionHeading,
          chunk.sectionDepth,
          chunk.content,
          chunk.preview,
          file.type,
          file.status,
          tagsText,
          JSON.stringify(chunk.entities),
          chunk.chunkIndex,
          file.updated,
          Math.round(file.mtimeMs),
          file.fileHash,
          chunkHash,
        );
        insertFts.run(
          info.lastInsertRowid,
          file.title,
          aliasesText,
          chunk.headingPath,
          chunk.content,
        );
        chunksForEmbedding.push({
          id: chunk.id,
          text: `${file.title}\n${chunk.headingPath}\n${chunk.content}`.slice(0, 5000),
        });
      }
    }
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }

  let embeddingEnabled = !options.noEmbeddings;
  let embeddingError = null;

  if (embeddingEnabled && chunksForEmbedding.length) {
    try {
      const batchSize = 8;
      for (let i = 0; i < chunksForEmbedding.length; i += batchSize) {
        const batch = chunksForEmbedding.slice(i, i + batchSize);
        const vectors = await embedTexts(
          batch.map((entry) => entry.text),
          paths,
          config,
          'passage',
        );
        const insertedAt = nowIso();
        for (let j = 0; j < batch.length; j += 1) {
          insertEmbedding.run(
            batch[j].id,
            JSON.stringify(vectors[j]),
            config.embeddingModel,
            insertedAt,
          );
        }
      }
    } catch (error) {
      embeddingEnabled = false;
      embeddingError = error instanceof Error ? error.message : String(error);
    }
  }

  const summary = {
    filesIndexed: parsedFiles.length,
    chunksIndexed: chunksForEmbedding.length,
    embeddingEnabled,
    embeddingModel: embeddingEnabled ? config.embeddingModel : null,
    embeddingError,
    dbFile: paths.dbFile,
  };

  await fs.writeFile(
    `${paths.reportDir}/last-index.json`,
    `${JSON.stringify(summary, null, 2)}\n`,
  );

  db.close();
  return summary;
}
