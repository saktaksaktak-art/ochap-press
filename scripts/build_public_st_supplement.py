"""Project verified late ST observations onto a reader-only JSON sidecar."""
import argparse
import base64
from datetime import date, datetime, timedelta, timezone
import gzip
from hashlib import sha256
from html.parser import HTMLParser
import json
from pathlib import Path
import re
import io
import os
import tempfile

JST = timezone(timedelta(hours=9))
KEYS = ('st_stability_pct', 'st_breakout_pct', 'st_late_pct')


def stamp(value, day):
    if not isinstance(value, str) or not re.fullmatch(
        r'\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,6})?\+09:00', value
    ):
        raise ValueError('Missing explicit JST timestamp')
    t = datetime.fromisoformat(value)
    if t.date() != day:
        raise ValueError('Timestamp is not in target date')
    return t


def read_checkpoint(encoded, day):
    """Decode the private GitHub handoff without copying the envelope to Pages."""
    envelope = json.loads(encoded)
    digest = envelope.get('raw_sha256')
    length = envelope.get('raw_bytes')
    if (envelope.get('schema') != 'ochap.acquisition-checkpoint.v1' or envelope.get('kind') != 'st'
        or envelope.get('date_jst') != day.strftime('%Y%m%d')
        or not isinstance(digest, str) or re.fullmatch(r'[0-9a-f]{64}', digest) is None
        or type(length) is not int or not 0 < length <= 20_000_000):
        raise ValueError('Wrong ST checkpoint identity')
    saved = stamp(envelope.get('checkpointed_at_jst'), day)
    with gzip.GzipFile(fileobj=io.BytesIO(base64.b64decode(envelope['gzip_base64'], validate=True))) as z:
        raw = z.read(length + 1)
    if len(raw) != length or sha256(raw).hexdigest() != digest:
        raise ValueError('ST checkpoint SHA/size mismatch')
    snapshot = json.loads(raw)
    status = snapshot.get('status')
    records = snapshot.get('records')
    if status not in ('partial','complete') or envelope.get('source_status') != status or not isinstance(records,dict):
        raise ValueError('ST checkpoint content mismatch')
    if any(stamp(r.get('fetched_at_jst'), day) > saved for r in records.values()):
        raise ValueError('ST observation postdates the checkpoint')
    return raw, digest


class Reader(HTMLParser):
    def __init__(self):
        super().__init__()
        self.races = {}
        self.key = None
        self.in_entry = self.in_small = False
        self.cell = []

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == 'article':
            key = attrs.get('id', '')
            m = re.fullmatch(r'v(\d{1,2})-r(\d{1,2})', key)
            self.key = key if m else None
            if m:
                if key in self.races:
                    raise ValueError('Duplicate reader race: ' + key)
                self.races[key] = (attrs.get('data-deadline'), [])
            self.in_entry = False
        elif self.key and tag == 'summary':
            self.cell = []
            self.in_summary = True
        elif self.key and self.in_entry and tag == 'small':
            self.cell = []
            self.in_small = True

    def handle_endtag(self, tag):
        if tag == 'summary' and getattr(self, 'in_summary', False):
            self.in_entry = ''.join(self.cell).strip().startswith('01 出走表')
            self.in_summary = False
        elif tag == 'small' and self.in_small:
            self.in_small = False
            m = re.match(r'^\s*(\d{4})(?!\d)', ''.join(self.cell))
            if m:
                self.races[self.key][1].append(m[1])
        elif tag == 'details':
            self.in_entry = False
        elif tag == 'article':
            self.key = None

    def handle_data(self, data):
        if self.in_small or getattr(self, 'in_summary', False):
            self.cell.append(data)


def build(raw, source_sha, html, day, now):
    if sha256(raw).hexdigest() != source_sha:
        raise ValueError('ST source SHA mismatch')
    source = json.loads(raw)
    if source.get('schema') != 'ochap.hiyori-st-daily.v1' or source.get('target_date_jst') != day.strftime('%Y%m%d'):
        raise ValueError('Wrong ST schema or date')
    reader = Reader()
    reader.feed(html)
    rows = {}
    for k, r in source['records'].items():
        m = re.fullmatch(r'(\d{2}):(\d{2})', k)
        if not m or not isinstance(r, dict):
            continue
        venue, race = map(int, m.groups())
        match = reader.races.get(f'v{venue:02d}-r{race}') or reader.races.get(f'v{venue}-r{race}')
        if not match:
            continue
        end, racers = match
        if len(racers) != 6 or len(set(racers)) != 6 or r.get('racer_numbers') != racers:
            continue
        if (r.get('date_jst') != day.strftime('%Y%m%d') or r.get('venue') != venue or r.get('race') != race
            or r.get('source') != 'kyoteibiyori.com' or r.get('st_metrics_status') != 'verified'
            or ('before_race_deadline' in r and r['before_race_deadline'] is not True)):
            continue
        try:
            acquired = stamp(r.get('fetched_at_jst'), day)
            cutoff = stamp(end, day)
            if not acquired < cutoff or acquired > now:
                continue
            if 'closed_at_jst' in r and stamp(r['closed_at_jst'], day) != cutoff:
                continue
        except ValueError:
            continue
        data = r.get('st_metrics_by_waku')
        if not isinstance(data, dict):
            continue
        vals = []
        for name in KEYS:
            col = data.get(name)
            if not isinstance(col, list) or len(col) != 6:
                col = [None] * 6
            vals.append([v if type(v) in (float, int) and 0 <= v <= 100 else None for v in col])
        if not any(v is not None for col in vals for v in col):
            continue
        rows[k] = dict(acquired_at_jst=r['fetched_at_jst'], deadline_jst=end, racers=racers, metrics=vals)
    return dict(schema='ochap.public-st-supplement.v1', date=day.isoformat(),
                source='boatrace_hiyori', races=rows)


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--date', required=True, type=date.fromisoformat)
    source = p.add_mutually_exclusive_group(required=True)
    source.add_argument('--input', type=Path)
    source.add_argument('--checkpoint', type=Path)
    p.add_argument('--expected-sha')
    p.add_argument('--reader', required=True, type=Path)
    p.add_argument('--output', required=True, type=Path)
    p.add_argument('--archive', action='store_true', help='Explicitly build a historical reader annotation')
    args = p.parse_args()
    now = datetime.now(JST)
    if not args.archive and now.date() != args.date:
        p.error('Use current JST date for routine operations')
    blob = args.reader.read_bytes()
    if args.reader.name.endswith('.gz.b64.txt'):
        blob = gzip.decompress(base64.b64decode(blob.strip(), validate=True))
    if args.checkpoint:
        raw,digest = read_checkpoint(args.checkpoint.read_bytes(),args.date)
        if args.expected_sha and args.expected_sha != digest:
            p.error('Unexpected checkpoint SHA')
    else:
        if not args.expected_sha:
            p.error('--input requires --expected-sha')
        raw,digest = args.input.read_bytes(),args.expected_sha
    payload = build(raw, digest, blob.decode(), args.date, now)
    if args.output.exists():
        old = json.loads(args.output.read_text())
        if (old.get('schema'), old.get('date'), old.get('source')) != (payload['schema'], payload['date'], payload['source']):
            p.error('Existing output identity mismatch')
        for k, row in old['races'].items():
            new = payload['races'].get(k)
            if not new:
                payload['races'][k] = row
            elif new['racers'] != row['racers'] or new['deadline_jst'] != row['deadline_jst']:
                p.error('Previously published race identity conflict: ' + k)
            elif (stamp(new['acquired_at_jst'],args.date) <= stamp(row['acquired_at_jst'],args.date) or
                any(b is None and a is not None for oldcol,newcol in zip(row['metrics'],new['metrics'])
                    for a,b in zip(oldcol,newcol))):
                # Keep the prior coherent observation rather than mixing capture times.
                payload['races'][k] = row
    if not payload['races']:
        p.error('No verified usable records; nothing to publish')
    args.output.parent.mkdir(parents=True, exist_ok=True)
    encoded = (json.dumps(payload, ensure_ascii=False, separators=(',', ':'), sort_keys=True)+'\n').encode()
    if not args.output.exists() or args.output.read_bytes() != encoded:
        with tempfile.NamedTemporaryFile(dir=args.output.parent, delete=False) as stream:
            temp = Path(stream.name)
            try:
                stream.write(encoded)
                stream.close()
                os.replace(temp,args.output)
            finally:
                temp.unlink(missing_ok=True)
    print(f"{len(payload['races'])} verified reader ST records")

if __name__ == '__main__':
    main()
