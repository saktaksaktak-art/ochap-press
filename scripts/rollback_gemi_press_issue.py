#!/usr/bin/env python3
"""Safe Rollback / Unregistered Fallback Generator for OchaP Press Gemi兄 Issues.

Writes an empty object-keyed races payload ({schema_version: "1.1", reporter: "gemi", date: YYYY-MM-DD, races: {}})
so the frontend cleanly displays 'このレースは原稿未登録です。' without breaking OchaP's original newspaper.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys


def write_unregistered_fallback(issue_date: str, output_path: Path, reason: str) -> None:
    payload = {
        "schema_version": "1.1",
        "reporter": "gemi",
        "date": issue_date,
        "rollback_reason": reason,
        "races": {},
    }
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Rolled back {output_path} for {issue_date} to empty races={{}} (reason: {reason})")


def main() -> int:
    parser = argparse.ArgumentParser(description="Rollback Gemi兄 issue JSON to safe unregistered state.")
    parser.add_argument("--date", required=True, help="Issue date YYYY-MM-DD")
    parser.add_argument("--output", type=Path, required=True, help="Path to data/gemi/YYYY-MM-DD.json")
    parser.add_argument("--reason", default="manual_or_gate_rollback", help="Reason for rollback")
    args = parser.parse_args()
    write_unregistered_fallback(args.date, args.output, args.reason)
    return 0


if __name__ == "__main__":
    sys.exit(main())
