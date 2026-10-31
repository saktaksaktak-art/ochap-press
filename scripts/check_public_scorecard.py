#!/usr/bin/env python3
"""Validate public-only paired scorecard data. Does not ingest or expose internal BC.

A true 'paired_verified' field still requires independent evidence verification upstream.
"""
from __future__ import annotations

from datetime import datetime
from pathlib import Path
import json
import re
import sys

ROOT = Path(__file__).resolve().parents[1]
PERFORMANCE_PATH = ROOT / "data" / "public-performance.json"
SHA256 = re.compile(r"^[a-f0-9]{64}$")
TRIFECTA = re.compile(r"^[1-6]-[1-6]-[1-6]$")


def require(ok, reason):
    if not ok:
        raise ValueError(reason)


def parse_time(value, context):
    t = datetime.fromisoformat(value)
    require(t.tzinfo is not None, f"{context}: timestamp must have timezone")
    return t


def validate(payload):
    require(payload.get("schema_version") == "1.0", "wrong public scorecard version")
    records = payload.get("records")
    require(isinstance(records, list), "records must be an array")
    seen = set()
    for index, r in enumerate(records):
        label = f"records[{index}]"
        require(isinstance(r, dict), f"{label}: invalid record")
        race = r.get("race_key")
        require(isinstance(race, str) and race, f"{label}: missing race_key")
        require(race not in seen, f"{label}: duplicate race_key")
        seen.add(race)
        require(r.get("mode") == "M0", f"{label}: mixed M1/beta/retrospective records")
        require(r.get("official_confirmed") is True and r.get("paired_verified") is True,
                f"{label}: unconfirmed results or unpaired forecasts")
        require(bool(r.get("official_result_source_ref")), f"{label}: official result evidence missing")
        sha = r.get("shared_input_sha256", "")
        require(isinstance(sha, str) and bool(SHA256.fullmatch(sha)),
                f"{label}: shared snapshot SHA256 invalid")
        actual = r.get("actual_order")
        require(isinstance(actual, list) and len(actual) == 3 and
                len(set(map(str, actual))) == 3 and
                all(str(x) in "123456" for x in actual), f"{label}: actual order invalid")
        # Official *actual entry order*: boat numbers ordered by 1C,2C,...,6C.
        # Missing entry is allowed, but must never be guessed from the boat number.
        # If any course-related evidence is supplied, all three fields are required.
        course_keys = ("actual_entry_order", "official_entry_verified", "official_entry_source_ref")
        if any(k in r for k in course_keys):
            course_order = r.get("actual_entry_order")
            require(r.get("official_entry_verified") is True,
                    f"{label}: actual course data must be officially verified")
            require(isinstance(r.get("official_entry_source_ref"), str) and
                    bool(r["official_entry_source_ref"].strip()),
                    f"{label}: official entry source reference missing")
            require(isinstance(course_order, list) and len(course_order) == 6 and
                    set(map(str, course_order)) == set("123456") and
                    all(str(v) in "123456" and not isinstance(v, bool) for v in course_order),
                    f"{label}: actual_entry_order must be a 6-boat permutation by course")
            require(str(actual[0]) in [str(v) for v in course_order],
                    f"{label}: winning boat missing from actual course ordering")
        closing = parse_time(r["closing_at"], label)
        reporters = r.get("reporters")
        require(isinstance(reporters, dict) and all(k in reporters for k in ("ocha", "gemi")),
                f"{label}: two independent reporters required")
        for key in ("ocha", "gemi"):
            f = reporters[key]
            require(f.get("input_sha256") == sha and f.get("published_before_cutoff") is True
                    and f.get("retrospective") is False, f"{label}/{key}: input/time lock mismatch")
            require(parse_time(f["freeze_at"], f"{label}/{key}") < closing,
                    f"{label}/{key}: forecast generated after the deadline")
            require(bool(f.get("forecast_source_ref")), f"{label}/{key}: original forecast evidence missing")
            grade = f.get("scenario_grade")
            require(grade in (None, "A", "B", "C", "D"), f"{label}/{key}: invalid scenario grade")
            if f.get("scenario_review_verified") is True:
                require(grade in ("A", "B", "C", "D") and bool(f.get("scenario_evidence_ref")),
                        f"{label}/{key}: graded scenario lacks evidence")
            else:
                require(grade is None, f"{label}/{key}: unverified scenario grade")
            main_bets = f.get("main_bets", [])
            require(isinstance(main_bets, list) and len(main_bets) == 3,
                    f"{label}/{key}: main bets not 3")
            require(all(TRIFECTA.fullmatch(str(v)) and len(set(str(v).split("-"))) == 3 for v in main_bets),
                    f"{label}/{key}: invalid main bets")
    return len(records)


if __name__ == "__main__":
    try:
        count = validate(json.loads(PERFORMANCE_PATH.read_text(encoding="utf-8")))
        print(f"PUBLIC_SCORECARD_CHECK_PASS: {count} certified pairs")
    except (ValueError, KeyError, TypeError) as e:
        print(f"PUBLIC_SCORECARD_CHECK_FAILED: {e}", file=sys.stderr)
        raise SystemExit(1)
