#!/usr/bin/env python3
"""Reject saved Gemini forecasts disconnected from their indexed newspaper."""
import base64
import gzip
import hashlib
import json
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]

def read_bytes(path):
    raw = (ROOT / path).read_bytes()
    if path.endswith('.gz.b64.txt'):
        return gzip.decompress(base64.b64decode(raw, validate=True))
    if path.endswith('.gz'):
        return gzip.decompress(raw)
    return raw

def main():
    manifest = json.loads((ROOT / 'data/issue-index.json').read_text())
    issues = {item['date']: item for item in manifest['issues']}
    for file in (ROOT / 'data/gemi').glob('*.json*'):
        date = file.name[:10]
        if date not in issues or date < '2026-11-05':
            continue
        item = issues[date]
        assert item.get('gemi_tabs') is True, f'{date}: saved Gemi forecast has no tabs'
        assert item.get('gemi_json'), f'{date}: saved Gemi forecast disconnected from results'
    count = 0
    for date, item in issues.items():
        if not item.get('gemi_public_sha256'):
            continue  # Legacy editions retain their original publication contract.
        raw = read_bytes(item['gemi_json'])
        assert hashlib.sha256(raw).hexdigest() == item['gemi_public_sha256'], date
        doc = json.loads(raw)
        assert doc['date'] == date and doc['reporter'] == 'gemi', date
        html = read_bytes(item['path']).decode()
        ids = re.findall(r'<article\b[^>]*\bid="([^"]+)"', html)
        assert len(ids) == item['races'] and set(ids) == set(doc['races']), date
        ocha_sha = item['reporters']['ocha']['input_sha256']
        sha = item['reporters']['gemi']['input_sha256']
        assert doc['shared_input']['sha256'] == sha, date
        if sha != ocha_sha:
            # Both originals remain readable; an explicitly recorded difference
            # must never be certified as an identical-input comparison.
            assert item.get('reporter_input_versions_differ') is True, date
            assert item.get('pair_comparison_eligible') is False, date
            assert item.get('formal_bc_eligible') is False, date
        assert (ROOT / item['gemi_script']).is_file(), date
        for rid, rec in doc['races'].items():
            assert rec['status'] == 'published' and rec['input_sha256'] == sha, rid
            assert rec['freeze_at'] == item['reporters']['gemi']['recorded_freeze_at_jst'], rid
            assert len(rec['bets']['main']) == 3, rid
            for tickets in rec['bets'].values():
                assert all(re.fullmatch('[1-6]-[1-6]-[1-6]', t) and len(set(t.split('-'))) == 3 for t in tickets), rid
        count += len(ids)
    print(f'Gemi publication linkage passed: {count} source-verified race panels')

if __name__ == '__main__':
    main()

