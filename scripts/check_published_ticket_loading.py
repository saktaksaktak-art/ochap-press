#!/usr/bin/env python3
"""Exercise the live ticket reader against the newest published HTML originals.

No network, no forecast changes and no third-party DOM dependencies.
"""
import base64
import gzip
import json
import re
import subprocess
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
VOID = set('area base br col embed hr img input link meta param source track wbr'.split())

class Node:
    def __init__(self, tag='', attrs=()):
        self.tag, self.attrs, self.children = tag, dict(attrs), []
    def has(self, name): return name in (self.attrs.get('class') or '').split()
    def text(self, annotations=True):
        return ''.join(x if isinstance(x, str) else x.text(annotations) for x in self.children
                       if isinstance(x, str) or annotations or not (x.tag == 'small' or x.has('ticket-rank') or x.has('ticket-reason')))
    def walk(self):
        yield self
        for x in self.children:
            if isinstance(x, Node): yield from x.walk()

class Document(HTMLParser):
    def __init__(self, text):
        super().__init__(convert_charrefs=True)
        self.root = Node(); self.stack = [self.root]; self.feed(text)
    def handle_starttag(self, tag, attrs):
        n = Node(tag, attrs); self.stack[-1].children.append(n)
        if tag not in VOID: self.stack.append(n)
    def handle_endtag(self, tag):
        for i in range(len(self.stack)-1, 0, -1):
            if self.stack[i].tag == tag:
                del self.stack[i:]; break
    def handle_data(self, text): self.stack[-1].children.append(text)

def read_issue(issue):
    path = ROOT / issue['path']
    raw = path.read_bytes()
    compression = issue.get('compression')
    if compression == 'base64gzip': raw = gzip.decompress(base64.b64decode(raw))
    elif compression == 'gzip': raw = gzip.decompress(raw)
    return Document(raw.decode('utf-8')).root

def main():
    manifest = json.loads((ROOT/'data/issue-index.json').read_text())
    issues = sorted((x for x in manifest['issues'] if x.get('forecast_sha256')), key=lambda x:x['date'], reverse=True)[:2]
    assert issues, 'No published forecast issue to validate'
    fixtures, ranges, sources = [], [], []
    for issue in issues:
        articles = [n for n in read_issue(issue).walk() if n.tag == 'article' and n.attrs.get('id')]
        assert len({n.attrs['id'] for n in articles}) == len(articles), 'Duplicate race ID'
        readable = 0
        for article in articles:
            copy = next((n for n in article.children if isinstance(n, Node) and n.has('copy')), None)
            if copy is None: continue
            children = [n for n in copy.children if isinstance(n, Node)]
            main_count = 0
            for i, node in enumerate(children[:-1]):
                if node.tag != 'h3' or not re.match(r'^(本線|逆張り|舟券ナビ)', node.text().strip()): continue
                group = children[i+1]
                if not group.has('tickets'): continue
                tickets = [n for n in group.walk() if n.has('ticket')]
                if node.text().startswith('本線'):
                    main_count += len(tickets)
                    declared_count = re.search(r'本線\s*(\d+)\s*点', node.text())
                    if declared_count: assert len(tickets) == int(declared_count[1]), f"{issue['date']} {article.attrs['id']}: main count mismatch"
                start = len(fixtures)
                for ticket in tickets:
                    fixtures.append({'raw':ticket.text(), 'boats':[n.text().strip() for n in ticket.children if isinstance(n,Node) and n.has('bnum')], 'plain':ticket.text(False), 'declared':ticket.attrs.get('data-ticket')})
                ranges.append((start, len(fixtures), f"{issue['date']}/{article.attrs['id']}/{node.text()}"))
            readable += bool(main_count)
        expected = issue.get('expected_races', issue.get('races'))
        if expected is not None:
            assert readable >= expected-issue.get('unissued_races',0), f"{issue['date']}: only {readable}/{expected} newspaper forecasts are readable"
        assert readable, f"{issue['date']}: all forecast tickets missing"
        sources.append(f"{issue['date']}: {readable} races")
    result = subprocess.run(['node','scripts/test_ticket_loading.js','--contract'], cwd=ROOT, input=json.dumps(fixtures,ensure_ascii=False),text=True,capture_output=True,check=True)
    tickets = json.loads(result.stdout)
    assert len(tickets) == len(fixtures)
    for start,end,label in ranges:
        assert all(tickets[start:end]), f'{label}: ranked/annotated ticket could not be read'
        assert len(tickets[start:end]) == len(set(tickets[start:end])), f'{label}: duplicate within category'
    print(f"PASS: published HTML ticket contract ({'; '.join(sources)}; {len(tickets)} tickets)")

if __name__ == '__main__': main()
