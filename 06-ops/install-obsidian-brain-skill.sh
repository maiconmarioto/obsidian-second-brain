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
  --agents LIST             Comma-separated list: claude,codex,opencode
  --non-interactive         Skip prompts and require values from flags or defaults
  --dry-run                 Show what would happen without writing files or links
  --help                    Show this help
EOF
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
  echo "Configure one machine-wide installation for Claude Code, Codex, and OpenCode."
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
      claude|codex|opencode)
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
  local options=("claude" "codex" "opencode")
  local current_index=0
  local key=""
  local option=""

  if [ ${#AGENTS[@]} -gt 0 ]; then
    return
  fi

  if ! is_interactive_tty; then
    echo "error: interactive agent selection requires a TTY" >&2
    echo "Use --non-interactive with --agents claude,codex,opencode when running without a terminal." >&2
    exit 1
  fi

  AGENTS=("claude" "codex")

  while true; do
    clear_screen
    echo "== obsidian-brain installer =="
    echo "Configure one machine-wide installation for Claude Code, Codex, and OpenCode."
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
    '{
      gsub(/__VAULT_NAME__/, vault_name)
      gsub(/__VAULT_ROOT__/, vault_root)
      print
    }' "$TEMPLATE_FILE" > "$RENDER_DIR/SKILL.md"

  cat > "$RENDER_DIR/README.md" <<EOF
# obsidian-brain

Rendered local installation for this machine.

- Vault name: $VAULT_NAME
- Vault root: $VAULT_ROOT
- Canonical source: $CANONICAL_SKILL_DIR
EOF

  cat > "$CONFIG_FILE" <<EOF
VAULT_NAME='$VAULT_NAME'
VAULT_ROOT='$VAULT_ROOT'
AGENTS='$(join_by , "${AGENTS[@]}")'
CANONICAL_SKILL_DIR='$CANONICAL_SKILL_DIR'
RENDER_DIR='$RENDER_DIR'
EOF
}

link_agent() {
  local agent="$1"
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

show_summary() {
  local agent target
  echo
  echo "Done."
  echo "Vault name: $VAULT_NAME"
  echo "Vault root: $VAULT_ROOT"
  echo "Rendered skill: $RENDER_DIR"
  echo "Selected agents: $(join_by ', ' "${AGENTS[@]}")"
  echo "Config file: $CONFIG_FILE"
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
      AGENTS=(claude codex opencode)
    fi
  fi

  validate_inputs
  preflight_cli
  render_template

  for agent in "${AGENTS[@]}"; do
    link_agent "$agent"
  done

  show_summary
}

main "$@"
