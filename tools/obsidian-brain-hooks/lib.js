import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const DEFAULT_CONFIRM_TTL_MS = 20 * 60 * 1000;
const DEFAULT_PERSIST_COOLDOWN_MS = 2 * 60 * 1000;

const SAVE_INTENT_PATTERNS = [
  /\b(save|persist|record|remember|store|update)\b.{0,40}\b(vault|obsidian|memory|brain|note|notes)\b/i,
  /\b(salva|salvar|registre|registrar|guarde|guardar|lembra|lembrar|atualiza|atualizar)\b.{0,40}\b(vault|obsidian|mem[oó]ria|brain|nota|notas)\b/i,
];

const AFFIRMATIVE_PATTERNS = [
  /^(sim|yes|y|ok|okay|pode|pode sim|salva|save|save it|go ahead|manda ver|segue|please do|pode salvar|pode atualizar)\b/i,
  /\b(can save|can update|you can save|you can update|salva isso|atualiza isso)\b/i,
];

const NEGATIVE_PATTERNS = [
  /^(n[aã]o|no|nope|nah|deixa|deixa quieto|don't|do not)\b/i,
  /\b(n[aã]o salva|don't save|do not save|ignore the vault|sem vault)\b/i,
];

const MEMORY_SIGNAL_PATTERNS = [
  /\b(decision|trade-?off|root cause|next step|benchmark|validation|regression|incident|postmortem|architecture|workflow|installer|hook|config)\b/i,
  /\b(decis[aã]o|pr[oó]ximo passo|causa raiz|benchmark|valida[cç][aã]o|regress[aã]o|incidente|arquitetura|workflow|instalador|gancho|hook|configura[cç][aã]o)\b/i,
  /\b(feat|fix|refactor|commit|benchmark|lint|health|index)\b/i,
];

const ALREADY_ASKING_PATTERNS = [
  /\b(save|persist|record|update)\b.{0,30}\b(vault|obsidian|memory|brain)\b.{0,30}\?/i,
  /\b(quer que eu|deseja que eu)\b.{0,40}\b(salve|registre|atualize)\b/i,
];

const OBSIDIAN_WRITE_COMMAND = /\bobsidian\s+(create|append|prepend)\b/i;

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function defaultStateDir() {
  const root =
    process.env.OBSIDIAN_BRAIN_HOOKS_STATE_DIR ||
    (process.env.XDG_STATE_HOME
      ? path.join(process.env.XDG_STATE_HOME, 'obsidian-brain', 'hooks')
      : path.join(os.homedir(), '.local', 'state', 'obsidian-brain', 'hooks'));
  ensureDir(root);
  return root;
}

function stateFilePath(sessionKey) {
  return path.join(defaultStateDir(), `${sessionKey}.json`);
}

function normalizeSessionKey(platform, input) {
  const raw =
    input?.session_id ||
    input?.sessionId ||
    input?.turn_id ||
    input?.turnId ||
    input?.conversation_id ||
    input?.conversationId ||
    'global';
  return `${platform}-${String(raw).replace(/[^a-zA-Z0-9._-]/g, '_')}`;
}

function readState(sessionKey) {
  const filePath = stateFilePath(sessionKey);
  if (!fs.existsSync(filePath)) {
    return {};
  }

  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return {};
  }
}

function writeState(sessionKey, state) {
  const filePath = stateFilePath(sessionKey);
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
}

function clearExpiredState(state, now) {
  const next = { ...state };
  if (next.confirmedUntil && next.confirmedUntil < now) {
    delete next.confirmedUntil;
  }
  if (next.recentlyPersistedAt && now - next.recentlyPersistedAt > DEFAULT_PERSIST_COOLDOWN_MS) {
    delete next.recentlyPersistedAt;
  }
  return next;
}

function firstText(value) {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    return value.map((entry) => firstText(entry)).filter(Boolean).join('\n');
  }
  if (typeof value === 'object') {
    if (typeof value.text === 'string') return value.text;
    if (typeof value.message === 'string') return value.message;
    if (typeof value.content === 'string') return value.content;
    if (Array.isArray(value.parts)) return firstText(value.parts);
    if (Array.isArray(value.result)) return firstText(value.result);
  }
  return '';
}

function normalizePrompt(input) {
  return (
    firstText(input?.prompt) ||
    firstText(input?.user_prompt) ||
    firstText(input?.message) ||
    ''
  ).trim();
}

function normalizeAssistantMessage(input) {
  return (
    firstText(input?.last_assistant_message) ||
    firstText(input?.lastAssistantMessage) ||
    firstText(input?.assistant_message) ||
    ''
  ).trim();
}

function normalizeToolName(input) {
  return String(input?.tool_name || input?.toolName || '').trim();
}

function normalizeToolInput(input) {
  return input?.tool_input || input?.toolInput || {};
}

function normalizeCommand(toolName, toolInput) {
  if (typeof toolInput?.command === 'string') {
    return toolInput.command;
  }

  if (typeof toolInput?.cmd === 'string') {
    return toolInput.cmd;
  }

  if (toolName === 'execute_bash' && typeof toolInput?.script === 'string') {
    return toolInput.script;
  }

  return '';
}

function isSaveIntent(prompt) {
  return SAVE_INTENT_PATTERNS.some((pattern) => pattern.test(prompt));
}

function isAffirmative(prompt) {
  return AFFIRMATIVE_PATTERNS.some((pattern) => pattern.test(prompt.trim()));
}

function isNegative(prompt) {
  return NEGATIVE_PATTERNS.some((pattern) => pattern.test(prompt.trim()));
}

function isMemoryCandidate(message) {
  if (!message || message.length < 120) return false;
  if (ALREADY_ASKING_PATTERNS.some((pattern) => pattern.test(message))) return false;

  let score = 0;
  for (const pattern of MEMORY_SIGNAL_PATTERNS) {
    if (pattern.test(message)) score += 1;
  }
  if (/`[^`]+`/.test(message)) score += 1;
  if (/\/[A-Za-z0-9_.-]+/.test(message)) score += 1;
  if (/\b(pass(ed)?|ok|validat(ed|ion)|completed|implemented)\b/i.test(message)) score += 1;

  return score >= 2;
}

function isRecentPersistence(state, now) {
  return Boolean(state.recentlyPersistedAt && now - state.recentlyPersistedAt <= DEFAULT_PERSIST_COOLDOWN_MS);
}

function isConfirmed(state, now) {
  return Boolean(state.confirmedUntil && state.confirmedUntil >= now);
}

function isVaultWriteCommand(command) {
  return OBSIDIAN_WRITE_COMMAND.test(command);
}

function basePolicyContext(vaultName, vaultRoot) {
  return [
    `Obsidian vault policy: treat "${vaultName}" at "${vaultRoot}" as long-lived engineering memory.`,
    'If the user explicitly asks to save or update memory, you may write to the vault.',
    'If you independently think the turn produced durable engineering memory, ask the user before writing.',
    'Do not write to the vault speculatively or silently.',
  ].join(' ');
}

function askToPersistReason() {
  return 'Before ending the turn, ask the user in one short sentence whether this should be saved or updated in the Obsidian vault.';
}

function confirmationContext() {
  return 'The user confirmed that you should update the Obsidian vault in this turn. Proceed with an explicit Obsidian CLI write to the correct note.';
}

function rejectionContext() {
  return 'The user declined the Obsidian vault update. Do not write to the vault in this turn.';
}

function explicitSaveContext() {
  return 'The user explicitly asked to save or update memory in the Obsidian vault. You may write to the vault in this turn.';
}

function writeBlockedReason() {
  return 'Before writing to the Obsidian vault, ask the user to confirm that this information should be persisted and where it belongs.';
}

export function evaluateHook({ platform, event, input, vaultName, vaultRoot }) {
  const now = Date.now();
  const normalizedEvent = String(event || '').toLowerCase();
  const sessionKey = normalizeSessionKey(platform, input);
  let state = clearExpiredState(readState(sessionKey), now);
  let result = { type: 'noop' };

  if (normalizedEvent === 'sessionstart' || normalizedEvent === 'agentspawn') {
    result = { type: 'context', additionalContext: basePolicyContext(vaultName, vaultRoot) };
  }

  if (normalizedEvent === 'userpromptsubmit') {
    const prompt = normalizePrompt(input);
    if (prompt) {
      if (state.pendingConfirmation && isAffirmative(prompt)) {
        delete state.pendingConfirmation;
        state.confirmedUntil = now + DEFAULT_CONFIRM_TTL_MS;
        result = { type: 'context', additionalContext: confirmationContext() };
      } else if (state.pendingConfirmation && isNegative(prompt)) {
        delete state.pendingConfirmation;
        delete state.confirmedUntil;
        result = { type: 'context', additionalContext: rejectionContext() };
      } else if (isSaveIntent(prompt)) {
        state.confirmedUntil = now + DEFAULT_CONFIRM_TTL_MS;
        result = { type: 'context', additionalContext: explicitSaveContext() };
      }
    }
  }

  if (normalizedEvent === 'pretooluse') {
    const toolName = normalizeToolName(input);
    const toolInput = normalizeToolInput(input);
    const command = normalizeCommand(toolName, toolInput);
    if (command && isVaultWriteCommand(command) && !isConfirmed(state, now)) {
      state.pendingConfirmation = true;
      result = { type: 'block', reason: writeBlockedReason() };
    }
  }

  if (normalizedEvent === 'posttooluse') {
    const toolName = normalizeToolName(input);
    const toolInput = normalizeToolInput(input);
    const command = normalizeCommand(toolName, toolInput);
    if (command && isVaultWriteCommand(command)) {
      delete state.pendingConfirmation;
      delete state.confirmedUntil;
      state.recentlyPersistedAt = now;
    }
  }

  if (normalizedEvent === 'stop') {
    const message = normalizeAssistantMessage(input);
    const stopActive = Boolean(input?.stop_hook_active || input?.stopHookActive);
    if (!stopActive && !state.pendingConfirmation && !isRecentPersistence(state, now) && isMemoryCandidate(message)) {
      state.pendingConfirmation = true;
      result = { type: 'continue', reason: askToPersistReason() };
    }
  }

  writeState(sessionKey, state);
  return result;
}

export function formatHookResponse({ platform, event, result }) {
  const normalizedPlatform = String(platform || '').toLowerCase();
  const normalizedEvent = String(event || '').toLowerCase();

  if (normalizedPlatform === 'generic') {
    return result;
  }

  if (normalizedPlatform === 'claude') {
    if (normalizedEvent === 'pretooluse') {
      if (result.type === 'block') {
        return {
          hookSpecificOutput: {
            hookEventName: 'PreToolUse',
            permissionDecision: 'deny',
            permissionDecisionReason: result.reason,
          },
        };
      }
      if (result.type === 'context') {
        return {
          hookSpecificOutput: {
            hookEventName: 'PreToolUse',
            additionalContext: result.additionalContext,
          },
        };
      }
      return {
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
        },
      };
    }

    if (normalizedEvent === 'stop' && result.type === 'continue') {
      return { decision: 'block', reason: result.reason };
    }

    if ((normalizedEvent === 'sessionstart' || normalizedEvent === 'userpromptsubmit') && result.type === 'context') {
      return {
        hookSpecificOutput: {
          hookEventName: normalizedEvent === 'sessionstart' ? 'SessionStart' : 'UserPromptSubmit',
          additionalContext: result.additionalContext,
        },
      };
    }

    return null;
  }

  if (normalizedPlatform === 'codex') {
    if (normalizedEvent === 'pretooluse') {
      if (result.type === 'block') {
        return {
          hookSpecificOutput: {
            hookEventName: 'PreToolUse',
            permissionDecision: 'deny',
            permissionDecisionReason: result.reason,
          },
        };
      }
      return {
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
        },
      };
    }

    if (normalizedEvent === 'posttooluse') {
      return {
        hookSpecificOutput: {
          hookEventName: 'PostToolUse',
          additionalContext: result.type === 'context' ? result.additionalContext : '',
        },
      };
    }

    if (normalizedEvent === 'stop') {
      return result.type === 'continue' ? { decision: 'block', reason: result.reason } : {};
    }

    if ((normalizedEvent === 'sessionstart' || normalizedEvent === 'userpromptsubmit') && result.type === 'context') {
      return {
        hookSpecificOutput: {
          hookEventName: normalizedEvent === 'sessionstart' ? 'SessionStart' : 'UserPromptSubmit',
          additionalContext: result.additionalContext,
        },
      };
    }

    return {};
  }

  if (normalizedPlatform === 'kiro') {
    if (result.type === 'block') {
      return { stderr: result.reason, exitCode: 2 };
    }
    if (result.type === 'context') {
      return { stdout: result.additionalContext, exitCode: 0 };
    }
    return { stdout: '', exitCode: 0 };
  }

  return result;
}
