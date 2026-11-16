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
check "index.html" "4122905abbbad5b9a7fda00588170ebd5254281b"
check "scripts/render_ochap_frozen.mjs" "33f1c2875a102af88c2dc3305ebede115b6b0f99"
check "scripts/reader_methods.mjs" "86fb794cb427ac1a09caabd86c72fb1466a61c72"
check "assets/reader-table-layout.css" "97889bbd8b8eadfc53316d1fcfe3db6ca8660f13"
check "assets/reader-table-layout.js" "0a7878c1425fed1b97ad7db636b2829fd4d4eb97"
check "assets/reader-course-baseline.mjs" "5cc536c43c605b5aad220dd9e335468a9e583e00"
check "assets/reader-course-copy.js" "a65e3be0fdf82cde47af861b9f1bc7c34031e77d"
if grep -Eq 'OchaPReaderPresentation\.(cleanMarkup|install)|readerPresentation\.cleanMarkup' index.html scripts/render_ochap_frozen.mjs; then
  echo "::error::Unapproved HTML filtering is active"
  exit 1
fi
echo "PASS: approved newspaper reader and generator unchanged."
