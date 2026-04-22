import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

import { evaluateHook } from './lib.js';

test('explicit save intent unlocks repeated vault writes for current session', async () => {
  const stateDir = await fs.mkdtemp(path.join(os.tmpdir(), 'obsidian-brain-hooks-'));
  process.env.OBSIDIAN_BRAIN_HOOKS_STATE_DIR = stateDir;

  const base = {
    platform: 'codex',
    vaultName: 'obsidian-second-brain',
    vaultRoot: '/tmp/vault',
  };
  const sessionInput = { session_id: 'session-write-allowance' };

  evaluateHook({
    ...base,
    event: 'sessionstart',
    input: sessionInput,
  });

  const saveIntent = evaluateHook({
    ...base,
    event: 'userpromptsubmit',
    input: {
      ...sessionInput,
      prompt: 'pode salvar isso no vault e atualizar as notas',
    },
  });
  assert.equal(saveIntent.type, 'context');

  const firstWrite = evaluateHook({
    ...base,
    event: 'pretooluse',
    input: {
      ...sessionInput,
      tool_name: 'execute_bash',
      tool_input: {
        command: 'obsidian create "vault=obsidian-second-brain" "path=00-inbox/teste.md" "content=# Teste"',
      },
    },
  });
  assert.equal(firstWrite.type, 'noop');

  evaluateHook({
    ...base,
    event: 'posttooluse',
    input: {
      ...sessionInput,
      tool_name: 'execute_bash',
      tool_input: {
        command: 'obsidian create "vault=obsidian-second-brain" "path=00-inbox/teste.md" "content=# Teste"',
      },
    },
  });

  const secondWrite = evaluateHook({
    ...base,
    event: 'pretooluse',
    input: {
      ...sessionInput,
      tool_name: 'execute_bash',
      tool_input: {
        command: 'obsidian append "vault=obsidian-second-brain" "path=00-inbox/teste.md" "content=- continuidade"',
      },
    },
  });
  assert.equal(secondWrite.type, 'noop');

  delete process.env.OBSIDIAN_BRAIN_HOOKS_STATE_DIR;
  await fs.rm(stateDir, { recursive: true, force: true });
});
