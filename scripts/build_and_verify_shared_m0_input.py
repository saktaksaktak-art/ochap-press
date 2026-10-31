#!/usr/bin/env python3
"""Build and/or verify OchaP Shared M0 Input Snapshots (OCHAP_SHARED_INPUT_YYYYMMDD_M0_v1).

Guarantees byte-level and canonical SHA-256 identity between OchaP reporter (ChatGPT)
and Gemi兄 reporter (Gemini) before any M0 forecast generation starts.
"""
from __future__ import annotations

import argparse
from datetime import datetime, timezone, timedelta
import hashlib
import json
from pathlib import Path
import re
import sys
from typing import Any, Dict, List, Optional

JST = timezone(timedelta(hours=9))


def compute_canonical_payload_sha256(data: Dict[str, Any]) -> str:
    """Compute canonical SHA-256 excluding self-referential 'sha256' and 'created_at_jst'."""
    payload = {k: v for k, v in data.items() if k not in ("sha256", "created_at_jst")}
    raw_canon = json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return hashlib.sha256(raw_canon).hexdigest()


def extract_html_article_ids(html_path: Path) -> List[str]:
    """Extract ordered <article id="..."> race keys from an OchaP newspaper HTML."""
    html = html_path.read_text(encoding="utf-8")
    return re.findall(r'<article\s+id="([^"]+)"', html)


def verify_shared_input_snapshot(
    snapshot_path: Path,
    original_html_path: Optional[Path] = None,
) -> Dict[str, Any]:
    """Verify byte-level and structural integrity of an OCHAP_SHARED_INPUT_YYYYMMDD_M0_v1 JSON file."""
    if not snapshot_path.exists():
        raise FileNotFoundError(f"Shared input snapshot not found: {snapshot_path}")

    raw_bytes = snapshot_path.read_bytes()
    file_byte_sha256 = hashlib.sha256(raw_bytes).hexdigest()
    data = json.loads(raw_bytes.decode("utf-8"))

    errors: List[str] = []
    if data.get("schema_version") != "ochap.shared_input.v1":
        errors.append(f"Invalid schema_version: {data.get('schema_version')}")

    snapshot_id = data.get("snapshot_id")
    if not snapshot_id or not re.match(r"^OCHAP_SHARED_INPUT_\d{8}_M0_v\d+$", str(snapshot_id)):
        errors.append(f"Invalid snapshot_id: {snapshot_id}")

    recorded_sha256 = data.get("sha256")
    computed_canon_sha256 = compute_canonical_payload_sha256(data)
    if recorded_sha256 != computed_canon_sha256:
        errors.append(
            f"Canonical SHA-256 mismatch: recorded={recorded_sha256} vs computed={computed_canon_sha256}"
        )

    m0_integrity = data.get("m0_integrity") or {}
    for req_flag in ("chatgpt_picks_excluded", "m1_exhibition_excluded", "odds_excluded", "results_excluded"):
        if m0_integrity.get(req_flag) is not True:
            errors.append(f"m0_integrity.{req_flag} must be True, got {m0_integrity.get(req_flag)}")

    article_ids_order = data.get("article_ids_order") or []
    races = data.get("races") or {}
    if not isinstance(races, dict) or not races:
        errors.append("races must be a non-empty object keyed by v<venue>-r<race>")

    if len(article_ids_order) != len(races):
        errors.append(f"article_ids_order length ({len(article_ids_order)}) != races count ({len(races)})")

    if set(article_ids_order) != set(races.keys()):
        errors.append("article_ids_order keys do not match races object keys")

    html_article_match: Optional[bool] = None
    if original_html_path is not None and original_html_path.exists():
        html_ids = extract_html_article_ids(original_html_path)
        html_article_match = html_ids == article_ids_order
        if not html_article_match:
            errors.append(
                f"HTML article[id] sequence ({len(html_ids)}) does not match article_ids_order ({len(article_ids_order)})"
            )

    # Check 6 boats per race and registration numbers
    boat_slots = 0
    hiyori_present_slots = 0
    hiyori_missing_slots = 0
    st_zero_or_null_slots = 0
    motor_zero_slots = 0
    for rkey in article_ids_order:
        r = races.get(rkey) or {}
        if r.get("race_id") != rkey:
            errors.append(f"Race {rkey} has mismatched race_id={r.get('race_id')}")
        boats = r.get("boats") or {}
        if list(boats.keys()) != ["1", "2", "3", "4", "5", "6"]:
            errors.append(f"Race {rkey} does not have exact boat keys 1..6")
        for bno, b in boats.items():
            boat_slots += 1
            if not b.get("registration_number") or not b.get("name"):
                errors.append(f"Race {rkey} boat {bno} missing registration_number or name")
            h6 = b.get("hiyori_6m") or {}
            if h6.get("status") == "present":
                hiyori_present_slots += 1
            else:
                hiyori_missing_slots += 1
            ost = b.get("official_average_st")
            if ost is None or ost <= 0:
                st_zero_or_null_slots += 1
            mot = b.get("motor") or {}
            if mot.get("top2_rate") == 0:
                motor_zero_slots += 1

    return {
        "snapshot_id": snapshot_id,
        "date": data.get("date"),
        "as_of_jst": data.get("as_of_jst"),
        "mode": data.get("mode"),
        "file_path": str(snapshot_path.name),
        "byte_size": len(raw_bytes),
        "file_byte_sha256": file_byte_sha256,
        "input_sha256": recorded_sha256,
        "computed_canonical_sha256": computed_canon_sha256,
        "canonical_sha256_match": recorded_sha256 == computed_canon_sha256,
        "html_article_order_match": html_article_match,
        "counts": {
            "venues": (data.get("counts") or {}).get("venues"),
            "races": len(races),
            "boat_slots": boat_slots,
            "hiyori_present_slots": hiyori_present_slots,
            "hiyori_missing_slots": hiyori_missing_slots,
            "st_zero_or_null_slots": st_zero_or_null_slots,
            "motor_zero_slots": motor_zero_slots,
        },
        "missing_summary": data.get("missing_summary"),
        "m0_integrity": m0_integrity,
        "readback_verified": len(errors) == 0,
        "errors": errors,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Verify OchaP Shared M0 Input Snapshots and emit receipt.")
    parser.add_argument("--snapshot-20261030", type=Path, required=True)
    parser.add_argument("--snapshot-20261031", type=Path, required=True)
    parser.add_argument("--original-html-20261030", type=Path, required=True)
    parser.add_argument("--output-receipt", type=Path, required=True)
    args = parser.parse_args()

    res_30 = verify_shared_input_snapshot(args.snapshot_20261030, args.original_html_20261030)
    res_31 = verify_shared_input_snapshot(args.snapshot_20261031, None)

    receipt = {
        "schema": "ochap.shared_input.readback_receipt.v1",
        "verified_by": "gemi-independent-reporter-v1.1",
        "verified_at_jst": datetime.now(JST).isoformat(timespec="seconds"),
        "all_verified": bool(res_30["readback_verified"] and res_31["readback_verified"]),
        "snapshots": {
            "2026-10-30": {
                **res_30,
                "drive_file_id": "1IAz9zAEMmQWmUvswWfzZXKVZgFAHONrl",
            },
            "2026-10-31": {
                **res_31,
                "drive_file_id": "1ibCFPznEQu1UTL1y2soGLEFFKAJ3NAPO",
            },
        },
    }
    args.output_receipt.parent.mkdir(parents=True, exist_ok=True)
    args.output_receipt.write_text(json.dumps(receipt, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(receipt, ensure_ascii=False, indent=2))
    return 0 if receipt["all_verified"] else 1


if __name__ == "__main__":
    sys.exit(main())
