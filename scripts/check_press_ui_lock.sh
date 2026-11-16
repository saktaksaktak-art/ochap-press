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
check "index.html" "461f412019ca50902d81133012a5361afffb3111"
check "scripts/render_ochap_frozen.mjs" "33f1c2875a102af88c2dc3305ebede115b6b0f99"
check "scripts/reader_methods.mjs" "86fb794cb427ac1a09caabd86c72fb1466a61c72"
check "assets/reader-table-layout.css" "640f1eee020ad10b7724c3a9cffc7999f3371aae"
check "assets/reader-table-layout.js" "147115893f5a7a2682214cc9912fd2604cf1fb56"
check "assets/reader-course-baseline.mjs" "5cc536c43c605b5aad220dd9e335468a9e583e00"
if grep -Eq 'OchaPReaderPresentation\.(cleanMarkup|install)|readerPresentation\.cleanMarkup' index.html scripts/render_ochap_frozen.mjs; then
  echo "::error::Unapproved HTML filtering is active"
  exit 1
fi
echo "PASS: approved newspaper reader and generator unchanged."
