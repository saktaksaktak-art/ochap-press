#!/usr/bin/env python3
"""Pre-publication Verification Gate for OchaP Press Gemi兄 Reporter Issues.

Enforces Request 044 Section 3 & Section 5:
1. Exact shared_input.snapshot_id & sha256 match against OCHAP_SHARED_INPUT_YYYYMMDD_M0_v1.json.
2. Object-keyed 'races' (never an array), matching 100% of article[id] keys.
3. Validated marks (4 distinct boats 1..6) and legal 3-trifecta syntax (main=3, reverse=0 overlap with main, navi=4 or []).
4. Required scenarios (escape, collapse), st_comment, first_mark, navi_details, and independent diagram_spec.
5. Zero secret, token, internal Drive path, or BC internal metric exposure.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import re
import sys
from typing import Any, Dict, List, Optional

from build_and_verify_shared_m0_input import compute_canonical_payload_sha256, extract_html_article_ids

TRIFECTA_RE = re.compile(r"^([1-6])-([1-6])-([1-6])$")
FORBIDDEN_PATTERNS = [
    re.compile(r"GOCSPX-[A-Za-z0-9_\-]+"),
    re.compile(r"ya29\.[A-Za-z0-9_\-]+"),
    re.compile(r"1//[A-Za-z0-9_\-]{20,}"),
    re.compile(r"/working_dir/"),
    re.compile(r"refresh_token", re.IGNORECASE),
    re.compile(r"client_secret", re.IGNORECASE),
]


def is_legal_trifecta(combo: str) -> bool:
    m = TRIFECTA_RE.match(str(combo))
    if not m:
        return False
    a, b, c = m.group(1), m.group(2), m.group(3)
    return len({a, b, c}) == 3


def validate_gemi_issue(
    gemi_json_path: Path,
    shared_input_path: Path,
    original_html_path: Optional[Path] = None,
) -> Dict[str, Any]:
    errors: List[str] = []
    warnings: List[str] = []

    raw_gemi_text = gemi_json_path.read_text(encoding="utf-8")
    for pat in FORBIDDEN_PATTERNS:
        if pat.search(raw_gemi_text):
            errors.append(f"Forbidden secret/internal pattern matched: {pat.pattern}")

    gemi = json.loads(raw_gemi_text)
    shared = json.loads(shared_input_path.read_text(encoding="utf-8"))

    # 1. Top-level checks
    if gemi.get("schema_version") not in ("1.0", "1.1"):
        errors.append(f"Unsupported schema_version: {gemi.get('schema_version')}")
    if gemi.get("reporter") != "gemi":
        errors.append(f"reporter must be 'gemi', got {gemi.get('reporter')}")
    if gemi.get("date") != shared.get("date"):
        errors.append(f"Date mismatch: gemi={gemi.get('date')} vs shared={shared.get('date')}")

    # 2. Shared input identity check
    expected_sha256 = compute_canonical_payload_sha256(shared)
    if shared.get("sha256") != expected_sha256:
        errors.append("Shared input file failed internal canonical SHA-256 verification")

    gemi_shared = gemi.get("shared_input") or {}
    if gemi_shared.get("snapshot_id") != shared.get("snapshot_id"):
        errors.append(
            f"shared_input.snapshot_id mismatch: {gemi_shared.get('snapshot_id')} != {shared.get('snapshot_id')}"
        )
    if gemi_shared.get("sha256") != expected_sha256:
        errors.append(f"shared_input.sha256 mismatch: {gemi_shared.get('sha256')} != {expected_sha256}")

    # 3. Object-keyed races & HTML article[id] coverage
    races = gemi.get("races")
    if not isinstance(races, dict) or isinstance(races, list):
        errors.append("races must be a JSON object keyed by article.id, not an array")
        return {"passed": False, "errors": errors}

    expected_ids = list(shared.get("article_ids_order") or [])
    if original_html_path is not None and original_html_path.exists():
        html_ids = extract_html_article_ids(original_html_path)
        if html_ids != expected_ids:
            errors.append(f"HTML article IDs ({len(html_ids)}) != shared article_ids_order ({len(expected_ids)})")

    if set(races.keys()) != set(expected_ids):
        missing = set(expected_ids) - set(races.keys())
        extra = set(races.keys()) - set(expected_ids)
        errors.append(f"Race key mismatch: missing={sorted(missing)[:5]}, extra={sorted(extra)[:5]}")

    # 4. Per-race contract checks
    published_count = 0
    for rid in expected_ids:
        rec = races.get(rid)
        if not isinstance(rec, dict):
            errors.append(f"{rid}: missing race object")
            continue
        if rec.get("status") != "published":
            errors.append(f"{rid}: status is {rec.get('status')}, expected 'published'")
        else:
            published_count += 1
        if not rec.get("freeze_at") or not rec.get("source_ref"):
            errors.append(f"{rid}: missing freeze_at or source_ref")
        if rec.get("input_sha256") != expected_sha256:
            errors.append(f"{rid}: input_sha256 mismatch")

        marks = rec.get("marks") or {}
        m_vals = [marks.get("main"), marks.get("second"), marks.get("third"), marks.get("fourth")]
        if any(v not in ("1", "2", "3", "4", "5", "6") for v in m_vals) or len(set(m_vals)) != 4:
            errors.append(f"{rid}: invalid marks {marks}")

        bets = rec.get("bets") or {}
        b_main = bets.get("main") or []
        b_rev = bets.get("reverse") or []
        b_navi = bets.get("navi") or []

        if len(b_main) != 3 or len(set(b_main)) != 3 or not all(is_legal_trifecta(x) for x in b_main):
            errors.append(f"{rid}: bets.main must be 3 distinct legal trifectas, got {b_main}")
        if not b_rev or not all(is_legal_trifecta(x) for x in b_rev):
            errors.append(f"{rid}: bets.reverse must be non-empty legal trifectas, got {b_rev}")
        if set(b_main) & set(b_rev):
            errors.append(f"{rid}: bets.main and bets.reverse overlap: {set(b_main) & set(b_rev)}")

        nd = rec.get("navi_details") or {}
        if nd.get("status") == "recommended":
            if len(b_navi) != 4 or len(set(b_navi)) != 4 or not all(is_legal_trifecta(x) for x in b_navi):
                errors.append(f"{rid}: recommended bets.navi must be 4 distinct legal trifectas, got {b_navi}")
            prefixes = {x[:3] for x in b_navi}
            if len(prefixes) != 1:
                errors.append(f"{rid}: bets.navi must share a single 1-2 axis, got {b_navi}")
            for req_nd in ("complement_target", "missed_outcome", "axis_reason", "third_spread_reason", "invalid_conditions"):
                if not nd.get(req_nd):
                    errors.append(f"{rid}: navi_details missing {req_nd}")
        elif nd.get("status") == "not_recommended":
            if b_navi != []:
                errors.append(f"{rid}: not_recommended bets.navi must be [], got {b_navi}")
        else:
            errors.append(f"{rid}: invalid navi_details.status={nd.get('status')}")

        scen = rec.get("scenarios") or {}
        if not scen.get("escape") or not scen.get("collapse"):
            errors.append(f"{rid}: missing escape or collapse scenario")
        if not rec.get("reason") or not rec.get("st_comment") or not rec.get("first_mark"):
            errors.append(f"{rid}: missing reason, st_comment, or first_mark")

        dspec = rec.get("diagram_spec") or {}
        if dspec.get("chatgpt_diagram_reused") is not False:
            errors.append(f"{rid}: diagram_spec.chatgpt_diagram_reused must be False")

    return {
        "passed": len(errors) == 0,
        "date": gemi.get("date"),
        "gemi_file": gemi_json_path.name,
        "gemi_file_sha256": hashlib.sha256(gemi_json_path.read_bytes()).hexdigest(),
        "shared_snapshot_id": shared.get("snapshot_id"),
        "shared_input_sha256": expected_sha256,
        "total_expected_races": len(expected_ids),
        "published_races": published_count,
        "error_count": len(errors),
        "warning_count": len(warnings),
        "errors": errors[:20],
        "warnings": warnings[:20],
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Validate Gemi兄 daily JSON issue before web publication.")
    parser.add_argument("--gemi-json", type=Path, required=True)
    parser.add_argument("--shared-input", type=Path, required=True)
    parser.add_argument("--original-html", type=Path, default=None)
    args = parser.parse_args()

    res = validate_gemi_issue(args.gemi_json, args.shared_input, args.original_html)
    print(json.dumps(res, ensure_ascii=False, indent=2))
    return 0 if res["passed"] else 1


if __name__ == "__main__":
    sys.exit(main())
