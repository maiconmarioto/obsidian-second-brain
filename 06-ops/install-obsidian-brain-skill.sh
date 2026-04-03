#!/usr/bin/env bash

set -euo pipefail

SOURCE_DIR="/Users/maiconmarioto/Documents/obsidian-second-brain/06-ops/skills/obsidian-brain"

TARGETS=(
  "$HOME/.claude/skills/obsidian-brain"
  "$HOME/.codex/skills/obsidian-brain"
  "$HOME/.config/opencode/skills/obsidian-brain"
)

ensure_parent_dir() {
  local target="$1"
  mkdir -p "$(dirname "$target")"
}

link_skill() {
  local target="$1"

  ensure_parent_dir "$target"

  if [ -L "$target" ]; then
    local current
    current="$(readlink "$target")"
    if [ "$current" = "$SOURCE_DIR" ]; then
      echo "ok: $target -> $SOURCE_DIR"
      return
    fi
    ln -sfn "$SOURCE_DIR" "$target"
    echo "updated symlink: $target -> $SOURCE_DIR"
    return
  fi

  if [ -e "$target" ]; then
    echo "skip: $target exists and is not a symlink"
    return
  fi

  ln -s "$SOURCE_DIR" "$target"
  echo "created symlink: $target -> $SOURCE_DIR"
}

if [ ! -d "$SOURCE_DIR" ]; then
  echo "error: source skill directory not found: $SOURCE_DIR" >&2
  exit 1
fi

echo "Installing obsidian-brain skill from:"
echo "  $SOURCE_DIR"

for target in "${TARGETS[@]}"; do
  link_skill "$target"
done

echo
echo "Done."
echo "Installed targets:"
for target in "${TARGETS[@]}"; do
  if [ -L "$target" ]; then
    echo "  $target -> $(readlink "$target")"
  else
    echo "  $target (not linked)"
  fi
done
