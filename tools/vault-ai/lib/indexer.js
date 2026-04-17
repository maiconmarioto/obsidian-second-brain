import fs from 'node:fs/promises';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { fileExists, hashText, nowIso, readJson, toPosix } from './common.js';
import { parseVault, walkVault } from './markdown.js';
import { embedTexts } from './embeddings.js';

const INDEX_STATE_VERSION = 1;

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

function hasRequiredTables(db) {
  const tables = new Set(
    db
      .prepare(
        `
        SELECT name
        FROM sqlite_master
        WHERE type IN ('table', 'view')
      `,
      )
      .all()
      .map((row) => row.name),
  );
  return ['files', 'chunks', 'chunk_fts', 'embeddings'].every((name) => tables.has(name));
}

function createConfigFingerprint(config, options = {}) {
  return hashText(
    JSON.stringify({
      chunkHardLimit: config.chunkHardLimit,
      chunkSoftLimit: config.chunkSoftLimit,
      embeddingDType: config.embeddingDType,
      embeddingEnabled: !options.noEmbeddings,
      embeddingModel: options.noEmbeddings ? null : config.embeddingModel,
    }),
  );
}

function buildIndexState(parsedFiles, config, options = {}) {
  return {
    version: INDEX_STATE_VERSION,
    generatedAt: nowIso(),
    configFingerprint: createConfigFingerprint(config, options),
    embeddingEnabled: !options.noEmbeddings,
    embeddingModel: options.noEmbeddings ? null : config.embeddingModel,
    files: parsedFiles
      .map((file) => ({
        path: file.path,
        mtimeMs: Math.round(file.mtimeMs),
        size: Buffer.byteLength(file.raw, 'utf8'),
        hash: file.fileHash,
      }))
      .sort((a, b) => a.path.localeCompare(b.path)),
  };
}

async function writeIndexArtifacts(paths, summary, state) {
  await fs.writeFile(
    `${paths.reportDir}/last-index.json`,
    `${JSON.stringify(summary, null, 2)}\n`,
  );
  if (state) {
    await fs.writeFile(paths.indexStateFile, `${JSON.stringify(state, null, 2)}\n`);
  }
}

function prepareStatements(db) {
  return {
    insertChunk: db.prepare(`
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
    `),
    insertEmbedding: db.prepare(`
      INSERT INTO embeddings (chunk_id, embedding_json, model, created_at)
      VALUES (?, ?, ?, ?)
    `),
    insertFile: db.prepare(`
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
    `),
    insertFts: db.prepare(`
      INSERT INTO chunk_fts (rowid, title, aliases_text, heading_path, content)
      VALUES (?, ?, ?, ?, ?)
    `),
    selectChunkRowidsByPath: db.prepare(`
      SELECT rowid
      FROM chunks
      WHERE path = ?
    `),
    updateFile: db.prepare(`
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
      ON CONFLICT(path) DO UPDATE SET
        canonical_name = excluded.canonical_name,
        basename = excluded.basename,
        title = excluded.title,
        aliases_json = excluded.aliases_json,
        tags_json = excluded.tags_json,
        links_json = excluded.links_json,
        backlinks_json = excluded.backlinks_json,
        note_type = excluded.note_type,
        note_status = excluded.note_status,
        updated = excluded.updated,
        mtime_ms = excluded.mtime_ms,
        frontmatter_json = excluded.frontmatter_json,
        file_hash = excluded.file_hash
    `),
  };
}

function buildSummary(mode, parsedFiles, chunksIndexed, embeddingEnabled, embeddingError, paths, extra = {}) {
  return {
    mode,
    filesIndexed: parsedFiles.length,
    chunksIndexed,
    embeddingEnabled,
    embeddingModel: embeddingEnabled ? extra.embeddingModel : null,
    embeddingError,
    dbFile: paths.dbFile,
    indexStateFile: paths.indexStateFile,
    ...extra,
  };
}

function diffIndexStates(previousState, currentState) {
  const previous = new Map((previousState?.files || []).map((entry) => [entry.path, entry]));
  const current = new Map((currentState?.files || []).map((entry) => [entry.path, entry]));
  const added = [];
  const changed = [];
  const deleted = [];

  for (const [filePath, currentEntry] of current.entries()) {
    const previousEntry = previous.get(filePath);
    if (!previousEntry) {
      added.push(filePath);
      continue;
    }
    if (previousEntry.hash !== currentEntry.hash) {
      changed.push(filePath);
    }
  }

  for (const filePath of previous.keys()) {
    if (!current.has(filePath)) deleted.push(filePath);
  }

  return { added, changed, deleted };
}

async function scanVaultState(paths, config, previousState = null) {
  const previousByPath = new Map((previousState?.files || []).map((entry) => [entry.path, entry]));
  const absolutePaths = await walkVault(paths.root);
  const files = [];

  for (const absolutePath of absolutePaths) {
    const stat = await fs.stat(absolutePath);
    const relativePath = toPosix(path.relative(paths.root, absolutePath));
    const mtimeMs = Math.round(stat.mtimeMs);
    const size = stat.size;
    const previousEntry = previousByPath.get(relativePath);

    let hash = previousEntry?.hash || null;
    if (!previousEntry || previousEntry.mtimeMs !== mtimeMs || previousEntry.size !== size) {
      const raw = await fs.readFile(absolutePath, 'utf8');
      hash = hashText(raw);
    }

    files.push({
      path: relativePath,
      mtimeMs,
      size,
      hash,
    });
  }

  return {
    version: INDEX_STATE_VERSION,
    generatedAt: nowIso(),
    configFingerprint: createConfigFingerprint(config),
    embeddingEnabled: true,
    embeddingModel: config.embeddingModel,
    files,
  };
}

function shouldUseFullRebuild(previousState, currentState, changeSet, config) {
  if (!previousState) return true;
  if (previousState.version !== INDEX_STATE_VERSION) return true;
  if (previousState.configFingerprint !== currentState.configFingerprint) return true;
  if (!previousState.embeddingEnabled) return true;
  if (previousState.embeddingModel !== config.embeddingModel) return true;

  const churn = changeSet.added.length + changeSet.changed.length + changeSet.deleted.length;
  const totalFiles = Math.max(currentState.files.length, 1);
  const churnRatio = churn / totalFiles;

  if (churn >= (config.fullRebuildThresholdFiles ?? 25)) return true;
  if (churnRatio >= (config.fullRebuildThresholdRatio ?? 0.35)) return true;

  return false;
}

async function embedChunkBatch(batch, insertEmbedding, paths, config) {
  const vectors = await embedTexts(
    batch.map((entry) => entry.text),
    paths,
    config,
    'passage',
  );
  const insertedAt = nowIso();
  for (let index = 0; index < batch.length; index += 1) {
    insertEmbedding.run(
      batch[index].id,
      JSON.stringify(vectors[index]),
      config.embeddingModel,
      insertedAt,
    );
  }
}

function upsertFileRow(updateFile, file) {
  updateFile.run(
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
}

function insertFileChunks(file, statements, chunksForEmbedding) {
  for (const chunk of file.chunks) {
    const aliasesText = file.aliases.join(' ');
    const tagsText = file.tags.join(' ');
    const chunkHash = `${file.fileHash}:${chunk.chunkIndex}`;
    const info = statements.insertChunk.run(
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
    statements.insertFts.run(
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

function deleteChunksForPath(statements, db, filePath) {
  const rowIds = statements.selectChunkRowidsByPath.all(filePath).map((row) => row.rowid);
  for (const rowId of rowIds) {
    db.prepare('DELETE FROM chunk_fts WHERE rowid = ?').run(rowId);
  }
  db.prepare('DELETE FROM chunks WHERE path = ?').run(filePath);
}

function deleteFilePath(statements, db, filePath) {
  deleteChunksForPath(statements, db, filePath);
  db.prepare('DELETE FROM files WHERE path = ?').run(filePath);
}

async function runFullBuild(paths, config, options = {}) {
  const db = openDatabase(paths.dbFile);
  createSchema(db);

  const parsedFiles = await parseVault(paths.root, config);
  const statements = prepareStatements(db);
  const chunksForEmbedding = [];

  db.exec('BEGIN');
  try {
    for (const file of parsedFiles) {
      statements.insertFile.run(
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
      insertFileChunks(file, statements, chunksForEmbedding);
    }
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    db.close();
    throw error;
  }

  let embeddingEnabled = !options.noEmbeddings;
  let embeddingError = null;

  if (embeddingEnabled && chunksForEmbedding.length) {
    try {
      const batchSize = 8;
      for (let index = 0; index < chunksForEmbedding.length; index += batchSize) {
        await embedChunkBatch(
          chunksForEmbedding.slice(index, index + batchSize),
          statements.insertEmbedding,
          paths,
          config,
        );
      }
    } catch (error) {
      embeddingEnabled = false;
      embeddingError = error instanceof Error ? error.message : String(error);
    }
  }

  const state = buildIndexState(parsedFiles, config, options);
  const summary = buildSummary(
    'full',
    parsedFiles,
    chunksForEmbedding.length,
    embeddingEnabled,
    embeddingError,
    paths,
    {
      embeddingModel: config.embeddingModel,
      filesAdded: parsedFiles.length,
      filesChanged: 0,
      filesDeleted: 0,
    },
  );
  await writeIndexArtifacts(paths, summary, state);

  db.close();
  return summary;
}

async function runIncrementalBuild(paths, config, previousState, currentState, changeSet) {
  const parsedFiles = await parseVault(paths.root, config);
  const parsedByPath = new Map(parsedFiles.map((file) => [file.path, file]));
  const db = openDatabase(paths.dbFile);

  if (!hasRequiredTables(db)) {
    db.close();
    return runFullBuild(paths, config);
  }

  const statements = prepareStatements(db);
  const changedPaths = [...new Set([...changeSet.added, ...changeSet.changed])];
  const chunksForEmbedding = [];

  db.exec('BEGIN');
  try {
    for (const deletedPath of changeSet.deleted) {
      deleteFilePath(statements, db, deletedPath);
    }

    for (const file of parsedFiles) {
      upsertFileRow(statements.updateFile, file);
    }

    for (const filePath of changedPaths) {
      const file = parsedByPath.get(filePath);
      if (!file) continue;
      deleteChunksForPath(statements, db, filePath);
      insertFileChunks(file, statements, chunksForEmbedding);
    }

    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    db.close();
    throw error;
  }

  let embeddingEnabled = true;
  let embeddingError = null;

  if (chunksForEmbedding.length) {
    try {
      const batchSize = 8;
      for (let index = 0; index < chunksForEmbedding.length; index += batchSize) {
        await embedChunkBatch(
          chunksForEmbedding.slice(index, index + batchSize),
          statements.insertEmbedding,
          paths,
          config,
        );
      }
    } catch (error) {
      embeddingEnabled = false;
      embeddingError = error instanceof Error ? error.message : String(error);
    }
  }

  const state = buildIndexState(parsedFiles, config);
  const summary = buildSummary(
    'incremental',
    parsedFiles,
    chunksForEmbedding.length,
    embeddingEnabled,
    embeddingError,
    paths,
    {
      embeddingModel: config.embeddingModel,
      filesAdded: changeSet.added.length,
      filesChanged: changeSet.changed.length,
      filesDeleted: changeSet.deleted.length,
      previousIndexGeneratedAt: previousState.generatedAt || null,
    },
  );
  await writeIndexArtifacts(paths, summary, state);

  db.close();
  return summary;
}

export async function ensureFreshIndex(paths, config) {
  const dbExists = await fileExists(paths.dbFile);
  const previousState = await readJson(paths.indexStateFile, null);
  const currentState = await scanVaultState(paths, config, previousState);
  const changeSet = diffIndexStates(previousState, currentState);

  if (
    dbExists &&
    previousState &&
    !changeSet.added.length &&
    !changeSet.changed.length &&
    !changeSet.deleted.length
  ) {
    const previousSerialized = previousState ? JSON.stringify(previousState.files || []) : '';
    const currentSerialized = JSON.stringify(currentState.files || []);
    if (previousSerialized !== currentSerialized) {
      await writeIndexArtifacts(
        paths,
        {
          mode: 'noop',
          filesAdded: 0,
          filesChanged: 0,
          filesDeleted: 0,
          note: 'Index content unchanged; state manifest refreshed.',
        },
        currentState,
      );
    }
    return {
      mode: 'noop',
      filesAdded: 0,
      filesChanged: 0,
      filesDeleted: 0,
    };
  }

  if (!dbExists || shouldUseFullRebuild(previousState, currentState, changeSet, config)) {
    return runFullBuild(paths, config);
  }

  return runIncrementalBuild(paths, config, previousState, currentState, changeSet);
}

export async function buildIndex(paths, config, options = {}) {
  return runFullBuild(paths, config, options);
}
