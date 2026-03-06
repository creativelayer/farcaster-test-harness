#!/bin/bash
# Install the farcaster-test-harness skill into a Claude Code project.
#
# Usage (from your mini app project directory):
#   bash ../farcaster-test-harness/install-skill.sh
#
# Or with an explicit path:
#   bash /path/to/farcaster-test-harness/install-skill.sh /path/to/my-miniapp

set -e

HARNESS_DIR="$(cd "$(dirname "$0")" && pwd)"
TARGET_DIR="${1:-.}"
SKILL_DIR="$TARGET_DIR/.claude/skills/farcaster-test-harness"

mkdir -p "$SKILL_DIR"
cp "$HARNESS_DIR/SKILL.md" "$SKILL_DIR/SKILL.md"

echo "Installed farcaster-test-harness skill to $SKILL_DIR/SKILL.md"
