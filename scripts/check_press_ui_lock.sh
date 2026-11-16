#!/usr/bin/env bash
# Approved reader contract (restored 2026-11-10). Bump hashes only with explicit user approval.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
check() {
  local path="$1" expected="$2" actual
  actual="$(git hash-object "$path")"
  if [[ "$actual" != "$expected" ]]; then
    echo "::error file=$path::UNAPPROVED_READER_CHANGE: expected $expected, got $actual"
    echo "Do not auto-rewrite reader HTML, hide data sections or redesign the newspaper."
    echo "Restore the approved version or obtain explicit owner approval and update this lock in a reviewed PR."
    return 1
  fi
}
check "index.html" "cdb4e5c95025bc6438354e5e95c85a1a17aa1d15"
check "scripts/render_ochap_frozen.mjs" "24ed2e7b317c935871e5f177effe32363cd2d22a"
if grep -Eq 'OchaPReaderPresentation\.(cleanMarkup|install)|readerPresentation\.cleanMarkup' index.html scripts/render_ochap_frozen.mjs; then
  echo "::error::Unapproved HTML filtering is active"
  exit 1
fi
echo "PASS: approved newspaper reader and generator unchanged."
