#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
VAULT_ROOT_DEFAULT="$(cd -- "$SCRIPT_DIR/.." && pwd)"
VAULT_NAME_DEFAULT="$(basename "$VAULT_ROOT_DEFAULT")"
CANONICAL_SKILL_DIR="$SCRIPT_DIR/skills/obsidian-brain"
TEMPLATE_FILE="$CANONICAL_SKILL_DIR/SKILL.template.md"
LOCAL_ROOT="${XDG_DATA_HOME:-$HOME/.local/share}/obsidian-brain"
RENDER_DIR="$LOCAL_ROOT/current"
CONFIG_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/obsidian-brain"
CONFIG_FILE="$CONFIG_DIR/config.env"
LOCAL_BIN_DIR="${HOME}/.local/bin"
VAULT_AI_LAUNCHER_PATH="$LOCAL_BIN_DIR/vault-ai"
OBSIDIAN_BRAIN_HOOK_LAUNCHER_PATH="$LOCAL_BIN_DIR/obsidian-brain-hook"
LAST_INDEX_REPORT_REL=".vault-ai/reports/last-index.json"
CLAUDE_SETTINGS_PATH="$HOME/.claude/settings.json"
CODEX_CONFIG_PATH="$HOME/.codex/config.toml"
CODEX_HOOKS_PATH="$HOME/.codex/hooks.json"
OPENCODE_PLUGIN_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/opencode/plugins"
KIRO_AGENT_DIR="$HOME/.kiro/agents"

AGENTS=()
VAULT_NAME="${VAULT_NAME_DEFAULT}"
VAULT_ROOT="${VAULT_ROOT_DEFAULT}"
NON_INTERACTIVE=0
DRY_RUN=0

usage() {
  cat <<'EOF'
Usage:
  install-obsidian-brain-skill.sh [options]

Options:
  --vault-name NAME         Vault name to use in Obsidian CLI commands
  --vault-root PATH         Absolute path to the target vault
  --agents LIST             Comma-separated list: claude,codex,opencode,kiro
  --non-interactive         Skip prompts and require values from flags or defaults
  --dry-run                 Show what would happen without writing files or links
  --help                    Show this help
EOF
}

shell_rc_file() {
  local shell_name
  shell_name="$(basename "${SHELL:-}")"

  case "$shell_name" in
    zsh) printf '%s' "$HOME/.zshrc" ;;
    bash) printf '%s' "$HOME/.bashrc" ;;
    *)
      printf '%s' "$HOME/.profile"
      ;;
  esac
}

join_by() {
  local delimiter="$1"
  shift
  local first=1
  for value in "$@"; do
    if [ $first -eq 1 ]; then
      printf '%s' "$value"
      first=0
    else
      printf '%s%s' "$delimiter" "$value"
    fi
  done
}

is_interactive_tty() {
  [ -t 0 ] && [ -t 1 ]
}

clear_screen() {
  if command -v tput >/dev/null 2>&1 && [ -n "${TERM:-}" ] && tput clear >/dev/null 2>&1; then
    tput clear
  else
    printf '\033[2J\033[H'
  fi
}

agent_label() {
  case "$1" in
    claude) printf '%s' "Claude Code" ;;
    codex) printf '%s' "Codex" ;;
    opencode) printf '%s' "OpenCode" ;;
    kiro) printf '%s' "Kiro" ;;
    *)
      echo "error: unsupported agent '$1'" >&2
      exit 1
      ;;
  esac
}

agent_is_selected() {
  local agent="$1"
  local selected
  for selected in "${AGENTS[@]}"; do
    if [ "$selected" = "$agent" ]; then
      return 0
    fi
  done
  return 1
}

agent_toggle() {
  local agent="$1"
  local updated=()
  local selected

  if agent_is_selected "$agent"; then
    for selected in "${AGENTS[@]}"; do
      if [ "$selected" != "$agent" ]; then
        updated+=("$selected")
      fi
    done
    AGENTS=("${updated[@]}")
    return
  fi

  AGENTS+=("$agent")
}

print_header() {
  echo "== obsidian-brain installer =="
  echo "Configure one machine-wide installation for Claude Code, Codex, OpenCode, and Kiro."
  echo
}

parse_agents_csv() {
  local csv="$1"
  local cleaned="${csv// /}"
  local value
  IFS=',' read -r -a values <<< "$cleaned"
  AGENTS=()
  for value in "${values[@]}"; do
    case "$value" in
      claude|codex|opencode|kiro)
        AGENTS+=("$value")
        ;;
      "")
        ;;
      *)
        echo "error: unsupported agent '$value'" >&2
        exit 1
        ;;
    esac
  done
}

prompt_text() {
  local prompt="$1"
  local default_value="$2"
  local value=""

  printf "%s [%s]: " "$prompt" "$default_value" >&2
  read -r value
  value="${value:-$default_value}"

  printf '%s' "$value"
}

prompt_agents() {
  local options=("claude" "codex" "opencode" "kiro")
  local current_index=0
  local key=""
  local option=""

  if [ ${#AGENTS[@]} -gt 0 ]; then
    return
  fi

  if ! is_interactive_tty; then
    echo "error: interactive agent selection requires a TTY" >&2
    echo "Use --non-interactive with --agents claude,codex,opencode,kiro when running without a terminal." >&2
    exit 1
  fi

  AGENTS=("claude" "codex")

  while true; do
    clear_screen
    echo "== obsidian-brain installer =="
    echo "Configure one machine-wide installation for Claude Code, Codex, OpenCode, and Kiro."
    echo
    echo "Select agents:"
    echo "Use ↑/↓ to move, Space to toggle, Enter to confirm."
    echo

    for current in "${!options[@]}"; do
      option="${options[$current]}"
      local pointer=" "
      local mark=" "

      if [ "$current" -eq "$current_index" ]; then
        pointer=">"
      fi

      if agent_is_selected "$option"; then
        mark="x"
      fi

      printf " %s [%s] %s\n" "$pointer" "$mark" "$(agent_label "$option")"
    done

    IFS= read -rsn1 key

    case "$key" in
      "")
        if [ ${#AGENTS[@]} -eq 0 ]; then
          echo
          echo "Select at least one agent." >&2
          sleep 1
          continue
        fi
        echo
        break
        ;;
      " ")
        agent_toggle "${options[$current_index]}"
        ;;
      $'\x1b')
        IFS= read -rsn1 key
        if [ "$key" = "[" ]; then
          IFS= read -rsn1 key
          case "$key" in
            A)
              if [ "$current_index" -gt 0 ]; then
                current_index=$((current_index - 1))
              fi
              ;;
            B)
              if [ "$current_index" -lt $((${#options[@]} - 1)) ]; then
                current_index=$((current_index + 1))
              fi
              ;;
          esac
        fi
        ;;
    esac
  done

  if [ ${#AGENTS[@]} -eq 0 ]; then
    echo "error: select at least one agent" >&2
    exit 1
  fi
}

parse_args() {
  while [ $# -gt 0 ]; do
    case "$1" in
      --vault-name)
        VAULT_NAME="$2"
        shift 2
        ;;
      --vault-root)
        VAULT_ROOT="$2"
        shift 2
        ;;
      --agents)
        parse_agents_csv "$2"
        shift 2
        ;;
      --non-interactive)
        NON_INTERACTIVE=1
        shift
        ;;
      --dry-run)
        DRY_RUN=1
        shift
        ;;
      --help)
        usage
        exit 0
        ;;
      *)
        echo "error: unknown argument '$1'" >&2
        usage >&2
        exit 1
        ;;
    esac
  done
}

validate_inputs() {
  if [ ! -d "$CANONICAL_SKILL_DIR" ]; then
    echo "error: canonical skill directory not found: $CANONICAL_SKILL_DIR" >&2
    exit 1
  fi

  if [ ! -f "$TEMPLATE_FILE" ]; then
    echo "error: template file not found: $TEMPLATE_FILE" >&2
    exit 1
  fi

  if [ ! -d "$VAULT_ROOT" ]; then
    echo "error: vault root not found: $VAULT_ROOT" >&2
    exit 1
  fi

  if [ ! -f "$VAULT_ROOT/INDEX.md" ]; then
    echo "warning: $VAULT_ROOT does not look like a fully initialized vault" >&2
  fi

  if ! command -v obsidian >/dev/null 2>&1; then
    echo "error: obsidian CLI not found in PATH" >&2
    echo "Install Obsidian and register the CLI before running this installer." >&2
    exit 1
  fi

  if ! command -v node >/dev/null 2>&1; then
    echo "error: node not found in PATH" >&2
    echo "Install Node.js before running this installer." >&2
    exit 1
  fi

  if ! command -v npm >/dev/null 2>&1; then
    echo "error: npm not found in PATH" >&2
    echo "Install npm before running this installer." >&2
    exit 1
  fi

  if [ ! -f "$VAULT_ROOT/package.json" ]; then
    echo "error: package.json not found in vault root: $VAULT_ROOT" >&2
    exit 1
  fi
}

preflight_cli() {
  local output

  if output="$(obsidian vault="$VAULT_NAME" read path="INDEX.md" 2>&1)"; then
    echo "preflight: Obsidian CLI is operational for vault '$VAULT_NAME'"
    return
  fi

  echo "error: Obsidian CLI is installed but not operational for vault '$VAULT_NAME'" >&2
  echo "The Obsidian app may not be running, the CLI may not be registered, or the vault name may be wrong." >&2
  echo >&2
  echo "CLI output:" >&2
  echo "$output" >&2
  exit 1
}

target_for_agent() {
  case "$1" in
    claude) printf '%s' "$HOME/.claude/skills/obsidian-brain" ;;
    codex) printf '%s' "$HOME/.codex/skills/obsidian-brain" ;;
    opencode) printf '%s' "$HOME/.config/opencode/skills/obsidian-brain" ;;
    kiro) printf '%s' "$KIRO_AGENT_DIR/obsidian-brain.json" ;;
    *)
      echo "error: unsupported agent '$1'" >&2
      exit 1
      ;;
  esac
}

ensure_parent_dir() {
  local path="$1"
  mkdir -p "$(dirname "$path")"
}

render_template() {
  if [ "$DRY_RUN" -eq 1 ]; then
    echo "dry-run: would render template:"
    echo "  template: $TEMPLATE_FILE"
    echo "  output:   $RENDER_DIR/SKILL.md"
    echo "  config:   $CONFIG_FILE"
    return
  fi

  mkdir -p "$RENDER_DIR"
  mkdir -p "$CONFIG_DIR"

  awk \
    -v vault_name="$VAULT_NAME" \
    -v vault_root="$VAULT_ROOT" \
    -v vault_ai_launcher="$VAULT_AI_LAUNCHER_PATH" \
    '{
      gsub(/__VAULT_NAME__/, vault_name)
      gsub(/__VAULT_ROOT__/, vault_root)
      gsub(/__VAULT_AI_LAUNCHER__/, vault_ai_launcher)
      print
    }' "$TEMPLATE_FILE" > "$RENDER_DIR/SKILL.md"

  cat > "$RENDER_DIR/README.md" <<EOF
# obsidian-brain

Rendered local installation for this machine.

- Vault name: $VAULT_NAME
- Vault root: $VAULT_ROOT
- Vault AI launcher: $VAULT_AI_LAUNCHER_PATH
- Hook launcher: $OBSIDIAN_BRAIN_HOOK_LAUNCHER_PATH
- Canonical source: $CANONICAL_SKILL_DIR
EOF

  cat > "$CONFIG_FILE" <<EOF
VAULT_NAME='$VAULT_NAME'
VAULT_ROOT='$VAULT_ROOT'
AGENTS='$(join_by , "${AGENTS[@]}")'
CANONICAL_SKILL_DIR='$CANONICAL_SKILL_DIR'
RENDER_DIR='$RENDER_DIR'
VAULT_AI_LAUNCHER_PATH='$VAULT_AI_LAUNCHER_PATH'
OBSIDIAN_BRAIN_HOOK_LAUNCHER_PATH='$OBSIDIAN_BRAIN_HOOK_LAUNCHER_PATH'
EOF
}

render_vault_ai_launcher() {
  local launcher_dir="$RENDER_DIR/bin"
  local launcher_file="$launcher_dir/vault-ai"

  if [ "$DRY_RUN" -eq 1 ]; then
    echo "dry-run: would render vault-ai launcher:"
    echo "  output:   $launcher_file"
    return
  fi

  mkdir -p "$launcher_dir"

  cat > "$launcher_file" <<EOF
#!/usr/bin/env bash
set -euo pipefail
export OBSIDIAN_BRAIN_VAULT_ROOT="$VAULT_ROOT"
exec node "$VAULT_ROOT/tools/vault-ai/cli.js" "\$@"
EOF

  chmod +x "$launcher_file"
}

render_hook_launcher() {
  local launcher_dir="$RENDER_DIR/bin"
  local launcher_file="$launcher_dir/obsidian-brain-hook"

  if [ "$DRY_RUN" -eq 1 ]; then
    echo "dry-run: would render obsidian-brain hook launcher:"
    echo "  output:   $launcher_file"
    return
  fi

  mkdir -p "$launcher_dir"

  cat > "$launcher_file" <<EOF
#!/usr/bin/env bash
set -euo pipefail
export OBSIDIAN_BRAIN_VAULT_NAME="$VAULT_NAME"
export OBSIDIAN_BRAIN_VAULT_ROOT="$VAULT_ROOT"
exec node "$VAULT_ROOT/tools/obsidian-brain-hooks/cli.js" "\$@"
EOF

  chmod +x "$launcher_file"
}

render_opencode_plugin() {
  local plugin_dir="$RENDER_DIR/opencode"
  local plugin_file="$plugin_dir/obsidian-brain-hooks.js"
  local hook_lib_path="$VAULT_ROOT/tools/obsidian-brain-hooks/lib.js"
  local hook_lib_literal

  hook_lib_literal="$(node -e 'console.log(JSON.stringify(process.argv[1]))' "$hook_lib_path")"

  if [ "$DRY_RUN" -eq 1 ]; then
    echo "dry-run: would render OpenCode plugin:"
    echo "  output:   $plugin_file"
    return
  fi

  mkdir -p "$plugin_dir"

  cat > "$plugin_file" <<EOF
const { evaluateHook } = await import(${hook_lib_literal});

function firstText(value) {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    return value.map((entry) => firstText(entry)).filter(Boolean).join("\\n");
  }
  if (typeof value === "object") {
    if (typeof value.text === "string") return value.text;
    if (typeof value.message === "string") return value.message;
    if (typeof value.content === "string") return value.content;
    if (Array.isArray(value.parts)) return firstText(value.parts);
    if (Array.isArray(value.result)) return firstText(value.result);
  }
  return "";
}

function pickSessionId(event) {
  return (
    event?.properties?.sessionID ||
    event?.properties?.sessionId ||
    event?.properties?.session_id ||
    event?.properties?.id ||
    event?.sessionID ||
    event?.sessionId ||
    event?.session_id ||
    null
  );
}

function pickRole(event) {
  return (
    event?.properties?.message?.role ||
    event?.properties?.role ||
    event?.role ||
    null
  );
}

function pickUserPrompt(event) {
  return (
    firstText(event?.properties?.message) ||
    firstText(event?.properties?.parts) ||
    firstText(event?.properties?.prompt) ||
    ""
  );
}

async function addContext(client, sessionId, text) {
  if (!sessionId || !text) return;
  await client.session.prompt({
    path: { id: sessionId },
    body: {
      noReply: true,
      parts: [{ type: "text", text }],
    },
  });
}

async function latestAssistantMessage(client, sessionId) {
  const response = await client.session.messages({ path: { id: sessionId } });
  const messages = response?.data ?? response ?? [];
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const entry = messages[index];
    const role = entry?.info?.role || entry?.role || null;
    if (role !== "assistant") continue;
    const text = firstText(entry?.parts) || firstText(entry?.info?.message) || firstText(entry?.info?.content);
    if (text) return text;
  }
  return "";
}

export const ObsidianBrainHooks = async ({ client }) => {
  return {
    "tool.execute.before": async (input, output) => {
      const result = evaluateHook({
        platform: "opencode",
        event: "preToolUse",
        input: {
          session_id: input?.sessionID || input?.sessionId || input?.session_id || "",
          tool_name: input?.tool || input?.tool_name || "",
          tool_input: output?.args || input?.args || {},
        },
        vaultName: "${VAULT_NAME}",
        vaultRoot: "${VAULT_ROOT}",
      });

      if (result.type === "block") {
        throw new Error(result.reason);
      }
    },

    "tool.execute.after": async (input, output) => {
      evaluateHook({
        platform: "opencode",
        event: "postToolUse",
        input: {
          session_id: input?.sessionID || input?.sessionId || input?.session_id || "",
          tool_name: input?.tool || input?.tool_name || "",
          tool_input: input?.args || {},
          tool_response: output,
        },
        vaultName: "${VAULT_NAME}",
        vaultRoot: "${VAULT_ROOT}",
      });
    },

    event: async ({ event }) => {
      const sessionId = pickSessionId(event);

      if (event?.type === "session.created" && sessionId) {
        const result = evaluateHook({
          platform: "opencode",
          event: "sessionStart",
          input: { session_id: sessionId },
          vaultName: "${VAULT_NAME}",
          vaultRoot: "${VAULT_ROOT}",
        });

        if (result.type === "context") {
          await addContext(client, sessionId, result.additionalContext);
        }
      }

      if (event?.type === "message.updated" && sessionId && pickRole(event) === "user") {
        const result = evaluateHook({
          platform: "opencode",
          event: "userPromptSubmit",
          input: {
            session_id: sessionId,
            prompt: pickUserPrompt(event),
          },
          vaultName: "${VAULT_NAME}",
          vaultRoot: "${VAULT_ROOT}",
        });

        if (result.type === "context") {
          await addContext(client, sessionId, result.additionalContext);
        }
      }

      if (event?.type === "session.idle" && sessionId) {
        const lastAssistantMessage = await latestAssistantMessage(client, sessionId);
        const result = evaluateHook({
          platform: "opencode",
          event: "stop",
          input: {
            session_id: sessionId,
            last_assistant_message: lastAssistantMessage,
          },
          vaultName: "${VAULT_NAME}",
          vaultRoot: "${VAULT_ROOT}",
        });

        if (result.type === "continue") {
          await client.session.prompt({
            path: { id: sessionId },
            body: {
              parts: [{ type: "text", text: result.reason }],
            },
          });
        }
      }
    },
  };
};
EOF
}

render_kiro_agent() {
  local agent_dir="$RENDER_DIR/kiro"
  local agent_file="$agent_dir/obsidian-brain.json"
  local prompt_literal
  local spawn_command
  local prompt_command
  local pretool_command
  local posttool_command
  local stop_command

  prompt_literal="$(node -e 'console.log(JSON.stringify("file://" + encodeURI(process.argv[1]).replace(/#/g, "%23")))' "$RENDER_DIR/SKILL.md")"
  spawn_command="$(node -e 'console.log(JSON.stringify(`"${process.argv[1]}" kiro agentSpawn`))' "$OBSIDIAN_BRAIN_HOOK_LAUNCHER_PATH")"
  prompt_command="$(node -e 'console.log(JSON.stringify(`"${process.argv[1]}" kiro userPromptSubmit`))' "$OBSIDIAN_BRAIN_HOOK_LAUNCHER_PATH")"
  pretool_command="$(node -e 'console.log(JSON.stringify(`"${process.argv[1]}" kiro preToolUse`))' "$OBSIDIAN_BRAIN_HOOK_LAUNCHER_PATH")"
  posttool_command="$(node -e 'console.log(JSON.stringify(`"${process.argv[1]}" kiro postToolUse`))' "$OBSIDIAN_BRAIN_HOOK_LAUNCHER_PATH")"
  stop_command="$(node -e 'console.log(JSON.stringify(`"${process.argv[1]}" kiro stop`))' "$OBSIDIAN_BRAIN_HOOK_LAUNCHER_PATH")"

  if [ "$DRY_RUN" -eq 1 ]; then
    echo "dry-run: would render Kiro agent:"
    echo "  output:   $agent_file"
    return
  fi

  mkdir -p "$agent_dir"

  cat > "$agent_file" <<EOF
{
  "name": "obsidian-brain",
  "description": "Use vault-ai and Obsidian CLI as external engineering memory regardless of the current project directory.",
  "prompt": $prompt_literal,
  "includeMcpJson": true,
  "hooks": {
    "agentSpawn": [
      {
        "command": $spawn_command
      }
    ],
    "userPromptSubmit": [
      {
        "command": $prompt_command
      }
    ],
    "preToolUse": [
      {
        "matcher": "execute_bash",
        "command": $pretool_command
      }
    ],
    "postToolUse": [
      {
        "matcher": "execute_bash",
        "command": $posttool_command
      }
    ],
    "stop": [
      {
        "command": $stop_command
      }
    ]
  }
}
EOF
}

run_vault_ai_setup() {
  local install_cmd=("npm" "install")

  if [ -f "$VAULT_ROOT/package-lock.json" ]; then
    install_cmd=("npm" "ci")
  fi

  if [ "$DRY_RUN" -eq 1 ]; then
    echo "dry-run: would install vault-ai dependencies in $VAULT_ROOT"
    echo "  command: (cd \"$VAULT_ROOT\" && ${install_cmd[*]})"
    echo "dry-run: would build initial vault-ai index"
    echo "  command: (cd \"$VAULT_ROOT\" && npm run vault-ai:index)"
    echo "dry-run: would run vault-ai smoke checks"
    echo "  command: (cd \"$VAULT_ROOT\" && npm run vault-ai:health)"
    echo "  command: (cd \"$VAULT_ROOT\" && npm run vault-ai:lint)"
    return
  fi

  echo "Installing vault-ai dependencies..."
  (
    cd "$VAULT_ROOT"
    "${install_cmd[@]}"
  )

  echo "Building initial vault-ai index..."
  (
    cd "$VAULT_ROOT"
    npm run vault-ai:index
  )

  echo "Running vault-ai smoke checks..."
  (
    cd "$VAULT_ROOT"
    npm run vault-ai:health
    npm run vault-ai:lint
  )
}

link_vault_ai_launcher() {
  local source="$RENDER_DIR/bin/vault-ai"
  local target="$VAULT_AI_LAUNCHER_PATH"

  if [ "$DRY_RUN" -eq 1 ]; then
    if [ -L "$target" ]; then
      local current
      current="$(readlink "$target")"
      if [ "$current" = "$source" ]; then
        echo "dry-run: ok, vault-ai launcher already correct: $target -> $source"
      else
        echo "dry-run: would update vault-ai launcher symlink: $target -> $source"
      fi
      return
    fi

    if [ -e "$target" ]; then
      echo "dry-run: would skip existing non-symlink launcher target: $target"
      return
    fi

    echo "dry-run: would create vault-ai launcher symlink: $target -> $source"
    return
  fi

  mkdir -p "$LOCAL_BIN_DIR"

  if [ -L "$target" ]; then
    local current
    current="$(readlink "$target")"
    if [ "$current" = "$source" ]; then
      echo "ok: $target -> $source"
      return
    fi
    ln -sfn "$source" "$target"
    echo "updated vault-ai launcher: $target -> $source"
    return
  fi

  if [ -e "$target" ]; then
    echo "skip: $target exists and is not a symlink"
    return
  fi

  ln -s "$source" "$target"
  echo "created vault-ai launcher: $target -> $source"
}

link_hook_launcher() {
  local source="$RENDER_DIR/bin/obsidian-brain-hook"
  local target="$OBSIDIAN_BRAIN_HOOK_LAUNCHER_PATH"

  if [ "$DRY_RUN" -eq 1 ]; then
    if [ -L "$target" ]; then
      local current
      current="$(readlink "$target")"
      if [ "$current" = "$source" ]; then
        echo "dry-run: ok, hook launcher already correct: $target -> $source"
      else
        echo "dry-run: would update hook launcher symlink: $target -> $source"
      fi
      return
    fi

    if [ -e "$target" ]; then
      echo "dry-run: would skip existing non-symlink hook target: $target"
      return
    fi

    echo "dry-run: would create hook launcher symlink: $target -> $source"
    return
  fi

  mkdir -p "$LOCAL_BIN_DIR"

  if [ -L "$target" ]; then
    local current
    current="$(readlink "$target")"
    if [ "$current" = "$source" ]; then
      echo "ok: $target -> $source"
      return
    fi
    ln -sfn "$source" "$target"
    echo "updated hook launcher: $target -> $source"
    return
  fi

  if [ -e "$target" ]; then
    echo "skip: $target exists and is not a symlink"
    return
  fi

  ln -s "$source" "$target"
  echo "created hook launcher: $target -> $source"
}

merge_claude_settings_hooks() {
  local hook_launcher="$OBSIDIAN_BRAIN_HOOK_LAUNCHER_PATH"

  if [ "$DRY_RUN" -eq 1 ]; then
    echo "dry-run: would merge Claude Code hooks into $CLAUDE_SETTINGS_PATH"
    return
  fi

  mkdir -p "$(dirname "$CLAUDE_SETTINGS_PATH")"

  node - <<'NODE' "$CLAUDE_SETTINGS_PATH" "$hook_launcher"
import fs from 'node:fs';

const [settingsPath, hookLauncher] = process.argv.slice(2);
let settings = {};
if (fs.existsSync(settingsPath)) {
  settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
}

settings.hooks ||= {};

function ensureHook(eventName, matcher, hook) {
  settings.hooks[eventName] ||= [];
  let group = settings.hooks[eventName].find((entry) => (entry.matcher ?? '') === matcher);
  if (!group) {
    group = { matcher, hooks: [] };
    settings.hooks[eventName].push(group);
  }
  group.hooks ||= [];
  const exists = group.hooks.some(
    (entry) => entry.type === hook.type && entry.command === hook.command,
  );
  if (!exists) {
    group.hooks.push(hook);
  }
}

ensureHook('SessionStart', '', {
  type: 'command',
  command: `"${hookLauncher}" claude sessionstart`,
});
ensureHook('UserPromptSubmit', '', {
  type: 'command',
  command: `"${hookLauncher}" claude userpromptsubmit`,
});
ensureHook('PreToolUse', 'Bash', {
  type: 'command',
  command: `"${hookLauncher}" claude pretooluse`,
});
ensureHook('PostToolUse', 'Bash', {
  type: 'command',
  command: `"${hookLauncher}" claude posttooluse`,
});
ensureHook('Stop', '', {
  type: 'command',
  command: `"${hookLauncher}" claude stop`,
});

fs.writeFileSync(settingsPath, `${JSON.stringify(settings, null, 2)}\n`, 'utf8');
NODE

  echo "installed Claude Code hooks: $CLAUDE_SETTINGS_PATH"
}

ensure_codex_hooks_enabled() {
  if [ "$DRY_RUN" -eq 1 ]; then
    echo "dry-run: would enable codex_hooks in $CODEX_CONFIG_PATH"
    return
  fi

  mkdir -p "$(dirname "$CODEX_CONFIG_PATH")"

  node - <<'NODE' "$CODEX_CONFIG_PATH"
import fs from 'node:fs';

const [configPath] = process.argv.slice(2);
let text = fs.existsSync(configPath) ? fs.readFileSync(configPath, 'utf8') : '';

if (/^\s*codex_hooks\s*=\s*true\s*$/m.test(text)) {
  process.exit(0);
}

if (/^\s*codex_hooks\s*=\s*false\s*$/m.test(text)) {
  text = text.replace(/^\s*codex_hooks\s*=\s*false\s*$/m, 'codex_hooks = true');
  fs.writeFileSync(configPath, text, 'utf8');
  process.exit(0);
}

if (!/\[features\]/.test(text)) {
  const suffix = text && !text.endsWith('\n') ? '\n' : '';
  text = `${text}${suffix}[features]\ncodex_hooks = true\n`;
  fs.writeFileSync(configPath, text, 'utf8');
  process.exit(0);
}

const lines = text.split('\n');
const next = [];
let inserted = false;
for (let index = 0; index < lines.length; index += 1) {
  const line = lines[index];
  next.push(line);
  if (line.trim() === '[features]') {
    let lookahead = index + 1;
    let hasKey = false;
    while (lookahead < lines.length && !/^\s*\[/.test(lines[lookahead])) {
      if (/^\s*codex_hooks\s*=/.test(lines[lookahead])) {
        hasKey = true;
        break;
      }
      lookahead += 1;
    }
    if (!hasKey) {
      next.push('codex_hooks = true');
      inserted = true;
    }
  }
}

if (!inserted) {
  next.push('[features]');
  next.push('codex_hooks = true');
}

fs.writeFileSync(configPath, `${next.join('\n').replace(/\n+$/, '\n')}`, 'utf8');
NODE

  echo "enabled Codex hooks in: $CODEX_CONFIG_PATH"
}

install_codex_hooks() {
  local hook_launcher="$OBSIDIAN_BRAIN_HOOK_LAUNCHER_PATH"

  if [ "$DRY_RUN" -eq 1 ]; then
    echo "dry-run: would install Codex hooks in $CODEX_HOOKS_PATH"
    return
  fi

  mkdir -p "$(dirname "$CODEX_HOOKS_PATH")"

  node - <<'NODE' "$CODEX_HOOKS_PATH" "$hook_launcher"
import fs from 'node:fs';

const [hooksPath, hookLauncher] = process.argv.slice(2);
let config = {};
if (fs.existsSync(hooksPath)) {
  const raw = fs.readFileSync(hooksPath, 'utf8').trim();
  config = raw ? JSON.parse(raw) : {};
}

config.hooks ||= {};

function ensureGroup(eventName, matcher, command) {
  config.hooks[eventName] ||= [];
  let group = config.hooks[eventName].find((entry) => (entry.matcher ?? '') === matcher);
  if (!group) {
    group = { matcher, hooks: [] };
    config.hooks[eventName].push(group);
  }
  group.hooks ||= [];
  const exists = group.hooks.some((entry) => entry.type === 'command' && entry.command === command);
  if (!exists) {
    group.hooks.push({ type: 'command', command });
  }
}

ensureGroup('SessionStart', '', `"${hookLauncher}" codex sessionstart`);
ensureGroup('UserPromptSubmit', '', `"${hookLauncher}" codex userpromptsubmit`);
ensureGroup('PreToolUse', 'Bash', `"${hookLauncher}" codex pretooluse`);
ensureGroup('PostToolUse', 'Bash', `"${hookLauncher}" codex posttooluse`);
ensureGroup('Stop', '', `"${hookLauncher}" codex stop`);

fs.writeFileSync(hooksPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
NODE

  echo "installed Codex hooks: $CODEX_HOOKS_PATH"
}

install_opencode_plugin() {
  local source="$RENDER_DIR/opencode/obsidian-brain-hooks.js"
  local target="$OPENCODE_PLUGIN_DIR/obsidian-brain-hooks.js"

  if [ "$DRY_RUN" -eq 1 ]; then
    echo "dry-run: would install OpenCode plugin: $target -> $source"
    return
  fi

  mkdir -p "$OPENCODE_PLUGIN_DIR"

  if [ -L "$target" ]; then
    local current
    current="$(readlink "$target")"
    if [ "$current" = "$source" ]; then
      echo "ok: $target -> $source"
      return
    fi
    ln -sfn "$source" "$target"
    echo "updated OpenCode plugin: $target -> $source"
    return
  fi

  if [ -e "$target" ]; then
    echo "skip: $target exists and is not a symlink"
    return
  fi

  ln -s "$source" "$target"
  echo "created OpenCode plugin: $target -> $source"
}

install_kiro_agent() {
  local source="$RENDER_DIR/kiro/obsidian-brain.json"
  local target="$KIRO_AGENT_DIR/obsidian-brain.json"

  if [ "$DRY_RUN" -eq 1 ]; then
    echo "dry-run: would install Kiro agent: $target -> $source"
    return
  fi

  mkdir -p "$KIRO_AGENT_DIR"

  if [ -L "$target" ]; then
    local current
    current="$(readlink "$target")"
    if [ "$current" = "$source" ]; then
      echo "ok: $target -> $source"
      return
    fi
    ln -sfn "$source" "$target"
    echo "updated Kiro agent: $target -> $source"
    return
  fi

  if [ -e "$target" ]; then
    echo "skip: $target exists and is not a symlink"
    return
  fi

  ln -s "$source" "$target"
  echo "created Kiro agent: $target -> $source"
}

check_local_bin_path() {
  local path_entry
  local rc_file
  local export_line='export PATH="$HOME/.local/bin:$PATH"'

  IFS=':' read -r -a path_entries <<< "${PATH:-}"
  for path_entry in "${path_entries[@]}"; do
    if [ "$path_entry" = "$LOCAL_BIN_DIR" ]; then
      echo "ok: $LOCAL_BIN_DIR is already in PATH"
      return
    fi
  done

  rc_file="$(shell_rc_file)"
  echo
  echo "warning: $LOCAL_BIN_DIR is not in PATH"
  echo "Add this line to $rc_file and open a new shell:"
  echo "  $export_line"
}

link_agent() {
  local agent="$1"

  if [ "$agent" = "kiro" ]; then
    install_kiro_agent
    return
  fi

  local target
  target="$(target_for_agent "$agent")"

  if [ "$DRY_RUN" -eq 1 ]; then
    if [ -L "$target" ]; then
      local current
      current="$(readlink "$target")"
      if [ "$current" = "$RENDER_DIR" ]; then
        echo "dry-run: ok, link already correct: $target -> $RENDER_DIR"
      else
        echo "dry-run: would update symlink: $target -> $RENDER_DIR"
      fi
      return
    fi

    if [ -e "$target" ]; then
      echo "dry-run: would skip existing non-symlink target: $target"
      return
    fi

    echo "dry-run: would create symlink: $target -> $RENDER_DIR"
    return
  fi

  ensure_parent_dir "$target"

  if [ -L "$target" ]; then
    local current
    current="$(readlink "$target")"
    if [ "$current" = "$RENDER_DIR" ]; then
      echo "ok: $target -> $RENDER_DIR"
      return
    fi
    ln -sfn "$RENDER_DIR" "$target"
    echo "updated symlink: $target -> $RENDER_DIR"
    return
  fi

  if [ -e "$target" ]; then
    echo "skip: $target exists and is not a symlink"
    return
  fi

  ln -s "$RENDER_DIR" "$target"
  echo "created symlink: $target -> $RENDER_DIR"
}

install_agent_integrations() {
  local agent="$1"
  case "$agent" in
    claude)
      merge_claude_settings_hooks
      ;;
    codex)
      ensure_codex_hooks_enabled
      install_codex_hooks
      ;;
    opencode)
      install_opencode_plugin
      ;;
    kiro)
      :
      ;;
    *)
      echo "error: unsupported agent '$agent'" >&2
      exit 1
      ;;
  esac
}

show_summary() {
  local agent target
  echo
  echo "Done."
  echo "Vault name: $VAULT_NAME"
  echo "Vault root: $VAULT_ROOT"
  echo "Rendered skill: $RENDER_DIR"
  echo "Selected agents: $(join_by ', ' "${AGENTS[@]}")"
  echo "Config file: $CONFIG_FILE"
  echo "Vault AI launcher: $VAULT_AI_LAUNCHER_PATH"
  echo "Hook launcher: $OBSIDIAN_BRAIN_HOOK_LAUNCHER_PATH"
  echo "Vault AI report: $VAULT_ROOT/$LAST_INDEX_REPORT_REL"
  if [ "$DRY_RUN" -eq 1 ]; then
    echo "Mode: dry-run"
  fi
  echo
  echo "Installed targets:"
  for agent in "${AGENTS[@]}"; do
    target="$(target_for_agent "$agent")"
    if [ -L "$target" ]; then
      echo "  $target -> $(readlink "$target")"
    elif [ "$DRY_RUN" -eq 1 ]; then
      echo "  $target (simulation only)"
    else
      echo "  $target (not linked)"
    fi
  done
}

main() {
  parse_args "$@"

  if [ "$NON_INTERACTIVE" -eq 0 ]; then
    if ! is_interactive_tty; then
      echo "error: interactive mode requires a terminal TTY" >&2
      echo "Use --non-interactive with the required flags when running in non-interactive environments." >&2
      exit 1
    fi
    print_header
    VAULT_NAME="$(prompt_text "Vault name" "$VAULT_NAME")"
    VAULT_ROOT="$(prompt_text "Vault path" "$VAULT_ROOT")"
    prompt_agents
  else
    print_header
    if [ ${#AGENTS[@]} -eq 0 ]; then
      AGENTS=(claude codex opencode kiro)
    fi
  fi

  validate_inputs
  preflight_cli
  render_template
  render_vault_ai_launcher
  render_hook_launcher
  render_opencode_plugin
  render_kiro_agent
  run_vault_ai_setup
  link_vault_ai_launcher
  link_hook_launcher
  check_local_bin_path

  for agent in "${AGENTS[@]}"; do
    install_agent_integrations "$agent"
    link_agent "$agent"
  done

  show_summary
}

main "$@"
