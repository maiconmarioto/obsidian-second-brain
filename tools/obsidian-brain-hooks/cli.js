#!/usr/bin/env node

import { evaluateHook, formatHookResponse } from './lib.js';

function usage() {
  console.error('usage: node tools/obsidian-brain-hooks/cli.js <platform> <event>');
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8').trim();
}

function writePlatformResponse(platform, response) {
  if (platform === 'kiro') {
    if (response.stderr) {
      process.stderr.write(`${response.stderr}\n`);
    }
    if (response.stdout) {
      process.stdout.write(`${response.stdout}\n`);
    }
    process.exit(response.exitCode ?? 0);
  }

  if (response == null) {
    process.exit(0);
  }

  if (typeof response === 'string') {
    process.stdout.write(`${response}\n`);
    process.exit(0);
  }

  process.stdout.write(`${JSON.stringify(response)}\n`);
  process.exit(0);
}

async function main() {
  const [, , platform, event] = process.argv;
  if (!platform || !event) {
    usage();
    process.exit(1);
  }

  let input = {};
  const raw = await readStdin();
  if (raw) {
    input = JSON.parse(raw);
  }

  const vaultName = process.env.OBSIDIAN_BRAIN_VAULT_NAME || 'obsidian-second-brain';
  const vaultRoot = process.env.OBSIDIAN_BRAIN_VAULT_ROOT || '';

  const result = evaluateHook({
    platform,
    event,
    input,
    vaultName,
    vaultRoot,
  });

  const response = formatHookResponse({
    platform,
    event,
    result,
  });

  writePlatformResponse(platform, response);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exit(1);
});
