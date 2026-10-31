#!/usr/bin/env python3
"""Check reporter-facing attribution before publishing OchaP Press.
No external Python dependencies. An OchaP original is allowed to contain
"OchaP forecast" headings; the Gemini view must hide those sections.
"""
from __future__ import annotations

import json
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = (ROOT / "assets/gemi-reporter.js").read_text(encoding="utf-8")
STYLE = (ROOT / "assets/gemi-reporter.css").read_text(encoding="utf-8")
MANIFEST = json.loads((ROOT / "data/issue-index.json").read_text(encoding="utf-8"))
WRONG = re.compile(r"(?:おちゃっぴー|お茶P記者|ChatGPT|🍵P)(?:の|による)?\s*予想")

def require(condition: bool, message: str):
    if not condition:
        raise AssertionError(message)

def main():
    require("article.dataset.ochapReporterActive" in SCRIPT,
            "No active-reporter state on each article")
    require("node.classList.toggle('ochap-ocha-only', showGemi)" in SCRIPT,
            "OchaP-only sections are not hidden by the tab switcher")
    require('article[data-ochap-reporter-active="gemi"] > .ochap-ocha-only' in STYLE,
            "No CSS isolation of OchaP-only sections")
    require("display:none !important" in STYLE, "No strong hidden rule")
    require("sharedHeadings" in SCRIPT and "item.neutral" in SCRIPT,
            "Shared data headers are not neutralized in Gemini view")
    require("WRONG_REPORTER_LABEL.test(editorialText)" in SCRIPT,
            "No visible Gemini-copy attribution guard")
    require("gemiPane.hidden = !showGemi" in SCRIPT,
            "Gemini pane must hide when the OchaP tab is selected")

    issues = MANIFEST.get("issues") or []
    require(bool(issues), "Issue list is empty")
    for item in issues:
        if not item.get("gemi_tabs") or item.get("compression") != "none":
            continue
        path = ROOT / item["path"]
        require(path.is_file(), f"Missing issue HTML: {path}")
        html = path.read_text(encoding="utf-8")
        require("article" in html, f"No races in {path.name}")
        if 'data-reporter-default="gemi"' in html:
            require("Gemi兄" in html, "Gemini-only page lacks Gemini attribution")
            require("おちゃっぴー予想" not in html,
                    "Gemini-only newspaper contains OchaP forecast headings")
        else:
            require("05 おちゃっぴー予想" in html,
                    "Expected original OchaP newspaper missing; preserve its original")
            require("01 出走表" in html and "02 🍵Pコースデータ" in html,
                    "Original factual tables missing")
    for f in sorted((ROOT / "data/gemi").glob("*.json")):
        doc = json.loads(f.read_text(encoding="utf-8"))
        if doc.get("reporter") != "gemi":
            continue
        for rid, report in (doc.get("races") or {}).items():
            editorial = {key: report.get(key) for key in (
                "reason", "scenarios", "st_comment", "first_mark", "navi_details")}
            require(not WRONG.search(json.dumps(editorial, ensure_ascii=False)),
                    f"{f.name}/{rid}: Gemini copy incorrectly attributes an OchaP forecast")
    print(f"Reporter attribution checks passed: {len(issues)} indexed issues.")

if __name__ == "__main__":
    main()
