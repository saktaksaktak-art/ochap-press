#!/usr/bin/env python3
"""Add frozen-source category membership; never alter tickets, results or metrics."""
import argparse
import base64
import gzip
import hashlib
import json
import re
from html.parser import HTMLParser
from pathlib import Path

GROUPS = ('main', 'reverse', 'navi')

class NewspaperBets(HTMLParser):
    def __init__(self):
        super().__init__()
        self.stack = []
        self.rows = {}
        self.race = None
        self.copy = self.heading = self.list_depth = self.ticket_depth = None
        self.group = None
        self.heading_text = self.ticket_text = ''

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag in ('area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr'):
            return
        self.stack.append(tag)
        depth = len(self.stack)
        classes = attrs.get('class', '').split()
        if tag == 'article' and re.fullmatch(r'v\d+-r\d+', attrs.get('id', '')):
            self.race = attrs['id']
        if self.race and tag == 'div' and 'copy' in classes:
            self.copy = depth
            self.rows[self.race] = {k: [] for k in GROUPS}
        if self.copy is None:
            return
        if tag == 'h3':
            self.heading, self.heading_text = depth, ''
        if tag == 'div' and 'tickets' in classes and self.group:
            self.list_depth = depth
        if self.list_depth and 'ticket' in classes:
            self.ticket_depth, self.ticket_text = depth, ''

    def handle_data(self, data):
        if self.heading:
            self.heading_text += data
        if self.ticket_depth:
            self.ticket_text += data

    def handle_endtag(self, tag):
        if not self.stack or tag not in self.stack:
            return
        while self.stack and self.stack[-1] != tag:
            self.stack.pop()
        depth = len(self.stack)
        if self.ticket_depth == depth:
            ticket = self.ticket_text.strip()
            if re.fullmatch(r'[1-6]-[1-6]-[1-6]', ticket) and len(set(ticket.split('-'))) == 3:
                self.rows[self.race][self.group].append(ticket)
            self.ticket_depth = None
        if self.list_depth == depth:
            self.list_depth = None
        if self.heading == depth:
            text = self.heading_text.strip()
            self.group = 'main' if text.startswith('本線') else 'reverse' if text.startswith('逆張り') else 'navi' if text.startswith('舟券ナビ') else None
            self.heading = None
        if self.copy == depth:
            self.copy = None
            self.group = None
        if tag == 'article':
            self.race = None
        if self.stack:
            self.stack.pop()

def enrich(root, date):
    path = root / 'data/consensus' / (date + '.json')
    data = json.loads(path.read_text())
    before = json.loads(json.dumps(data))
    assert data['date'] == date
    index = json.loads((root / 'data/issue-index.json').read_text())
    issue = next(x for x in index['issues'] if x['date'] == date)
    archive = root / issue['path']
    assert issue['compression'] == 'base64gzip'
    parser = NewspaperBets()
    parser.feed(gzip.decompress(base64.b64decode(archive.read_text())).decode())
    gemi_path = root / issue['gemi_json']
    raw = gemi_path.read_bytes()
    gemi = json.loads(gzip.decompress(base64.b64decode(raw)) if gemi_path.name.endswith('.gz.b64.txt') else raw)
    assert gemi['date'] == date and gemi['reporter'] == 'gemi'
    count = 0
    for row in data['races']:
        rid = row['race_id']
        for reporter in ('ocha', 'gemi'):
            groups = parser.rows.get(rid) if reporter == 'ocha' else gemi['races'].get(rid, {}).get('bets')
            if not groups:
                continue
            categories = {k: sorted(set(groups.get(k, []))) for k in GROUPS}
            flat = sorted(set(t for group in categories.values() for t in group))
            assert flat == sorted(set(row['reporters'][reporter]['3'])), (date, rid, reporter, 'frozen ticket mismatch')
            main_two = sorted(set('-'.join(t.split('-')[:2]) for t in categories['main']))
            assert main_two == sorted(set(row['reporters'][reporter]['2'])), (date, rid, reporter, 'main projection mismatch')
            row['reporters'][reporter]['categories'] = categories
            count += 1
    # Verify removal of the additive fields exactly reproduces the prior public data.
    stripped = json.loads(json.dumps(data))
    for row in stripped['races']:
        for reporter in row['reporters'].values():
            reporter.pop('categories', None)
    for row in before['races']:
        for reporter in row['reporters'].values():
            reporter.pop('categories', None)
    assert stripped == before
    path.write_text(json.dumps(data, ensure_ascii=False, separators=(',', ':')) + '\n')
    return {'date': date, 'reporter_races': count, 'races': len(data['races']), 'archive_sha256': hashlib.sha256(archive.read_bytes()).hexdigest()}

if __name__ == '__main__':
    args = argparse.ArgumentParser()
    args.add_argument('dates', nargs='+')
    opts = args.parse_args()
    root = Path(__file__).resolve().parents[1]
    for date in opts.dates:
        print(json.dumps(enrich(root, date), ensure_ascii=False))
