#!/usr/bin/env python3
"""Validate HTML and decoded reader fragments without altering audit originals."""
import argparse
import base64
import gzip
import hashlib
import json
from pathlib import Path
import re
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[1]
PAYLOAD = re.compile(rb'<script id="ochap-rich-payload"[^>]*>([A-Za-z0-9+/=\s]+)</script>')
FORBIDDEN = re.compile(
    r'05 データの母数・期間・取得日|v\d+-r\d+:sources|締切前参考M0・対象|当日締切前M0凍結|'
    r'PDF準備中|保存元の連対率差分による参考値|朝刊の凍結原本と保存入力|'
    r'実際の踏込みを確定する値ではありません。|原本の(?:受益候補|2着候補順|役割)|'
    r'forecast_sha256|取得\s*20\d\d-\d\d-\d\dT|予想凍結[：:]|'
    r'OCHAP_(?:SHARED_INPUT|GEMI)_|\b[0-9a-fA-F]{64}\b'
)


def read(path):
    raw = path.read_bytes()
    return gzip.decompress(base64.b64decode(raw)) if path.suffix == '.txt' else raw


def payload(html):
    packed = PAYLOAD.search(html)
    assert packed, 'Missing embedded editorial data'
    raw = gzip.decompress(base64.b64decode(packed[1]))
    return raw, json.loads(raw)


def validate(html, date):
    raw, data = payload(html)
    assert set(data) == {'schema', 'date', 'fragments'}, 'Unexpected reader metadata'
    assert data['schema'] == 'ochap.editorial-fragments.v2' and data['date'] == date
    assert not (leak := FORBIDDEN.search(PAYLOAD.sub(b'', html).decode())), leak
    assert not (leak := FORBIDDEN.search(raw.decode())), leak
    ids = re.findall(rb'<article\b[^>]*\bid="(v\d+-r\d+)"', html)
    keys = [rid.decode() + ':' + kind for rid in ids for kind in ('st', 'notes')]
    assert ids and len(ids) == len(set(ids))
    assert set(keys) == set(data['fragments'])
    assert keys == [key.decode() for key in re.findall(rb'data-rich-key="([^"]+)"', html)]
    assert all('全6艇の比較' in data['fragments'][key] for key in keys if key.endswith(':notes'))
    assert all('<table>' in data['fragments'][key] for key in keys if key.endswith(':st'))
    return raw, data


def archive_test():
    day = '2026-11-16'
    issue = next(i for i in json.loads((ROOT/'data/issue-index.json').read_bytes())['issues'] if i['date'] == day)
    old, new = read(ROOT/issue['path']), read(ROOT/issue['reader_path'])
    old_raw, old_data = payload(old)
    new_raw, new_data = validate(new, day)
    assert old_data['forecast_sha256'] == issue['forecast_sha256']
    assert hashlib.sha256(old_raw).hexdigest() == issue['editorial_data_sha256']
    assert len(old_data['fragments']) == 360 and len(new_data['fragments']) == 240
    assert re.findall(rb'<article\b[^>]+>', old) == re.findall(rb'<article\b[^>]+>', new)
    for pattern in (rb'<p class="lead">[^\n]*?</p>', rb'<b class="ticket">[^\n]*?</b>', rb'<div class="branches">.*?</div>'):
        old_parts, new_parts = re.findall(pattern, old), re.findall(pattern, new)
        assert old_parts and old_parts == new_parts, pattern
    for key, fragment in new_data['fragments'].items():
        if key.endswith(':st'):
            assert old_data['fragments'][key] == fragment, key
    assert len(new_raw) < len(old_raw)
    print(f'PASS: 120 untouched forecasts, 240 reader fragments, {len(old_raw):,} -> {len(new_raw):,} bytes')


def renderer_test():
    date = '2026-11-17'
    boat = lambda n: {'boat':n,'name':f'選手{n}', 'registration_number':4000+n,
        'program':{'average_start_timing':0.16}, 'st_metrics':{},
        'course':{'starts':10,'firstRate':10,'secondRate':20,'thirdRate':30,'top2Rate':30,'top3Rate':60,'averageST':0.16},
        'course_stats_by_scope':{}}
    race = {'race_id':'v18-r1','venue_number':'18','venue_name':'徳山','race_number':1,
        'closed_at_jst':date+'T08:35:00+09:00', 'deadline_display':'08:35','marks':{'◎':1,'○':2,'▲':3,'△':4},
        'main':[[1,2,3],[1,2,4],[1,3,2],[1,3,4]],'reverse':[[3,1,2]],'predicted_methods_by_head':{'3':'まくり'},
        'main_predicted_method':'逃げ','comment':'枠なり想定','attack_boat':3,'beneficiary_boats':[5],
        'navi':{'status':'recommended','tickets':[[1,2,3],[1,2,4],[1,2,5],[1,2,6]],'axis_reason':'追走候補を比較'},
        'scenarios':{'escape_established':{'winner':1,'method':'逃げ','reason':'先マイ','second_candidates':[2,3],'third_candidates':[4,5]},
                     'escape_collapsed':{'winner':3,'method':'まくり','reason':'外から攻める','second_candidates':[1,4],'third_candidates':[5,6]}}}
    evidence = {'target_date':date,'races':[{'race_id':'v18-r1','boats':[boat(n) for n in range(1,7)]}]}
    frozen_at = date+'T06:15:33+09:00'
    input_sha = hashlib.sha256(json.dumps(evidence).encode()).hexdigest()
    pred = {'date':date,'frozen_at_jst':frozen_at,'shared_input_sha256':input_sha,'races':[race]}
    with tempfile.TemporaryDirectory() as space:
        root = Path(space)
        for d in ('scripts','data','archives'):
            (root/d).mkdir()
        renderer = root/'scripts/render.mjs'
        renderer.write_bytes((ROOT/'scripts/render_ochap_frozen.mjs').read_bytes())
        (root/'data/issue-index.json').write_text('{"issues": []}')
        (root/'input.json').write_text(json.dumps(evidence))
        (root/'pred.json').write_text(json.dumps(pred))
        original_sha = hashlib.sha256((root/'pred.json').read_bytes()).hexdigest()
        import os
        env = dict(os.environ, OCHAP_PREDICTION_JSON=str(root/'pred.json'), OCHAP_INPUT_JSON=str(root/'input.json'),
                   OCHAP_FIRST_PUBLICATION_AT=date+'T06:25:30+09:00', OCHAP_PDFS_READY='0')
        env.pop('OCHAP_SOURCE_JSON', None)
        subprocess.run(['node',str(renderer),'--diagrams'],env=env,check=True,capture_output=True)
        html = (root/f'archives/{date}.html').read_bytes()
        _, data = validate(html, date)
        assert b'<footer>' not in html and b'<svg ' in data['fragments']['v18-r1:st'].encode()
        assert '<td class="rank1">30<small>1位</small>' in html.decode()
        assert '<h3>当地コース成績</h3><p class="small">データなし</p>' in html.decode()
        assert frozen_at.encode() not in html
        receipt = json.loads((root/f'data/issue-source-{date}.json').read_bytes())
        audit_bytes = read(root/receipt['editorial_data'])
        assert receipt['forecast_sha256'] == json.loads(audit_bytes)['forecast_sha256'] == original_sha
        assert receipt['forecast_frozen_at_jst'] == frozen_at
        assert receipt['reporters']['ocha']['input_sha256'] == input_sha
        assert receipt['editorial_data_sha256'] == hashlib.sha256(audit_bytes).hexdigest()
        assert receipt['html_sha256'] == hashlib.sha256(html).hexdigest()
        subprocess.run(['node',str(renderer)],env=dict(env,OCHAP_PDFS_READY='1'),check=True,capture_output=True)
        assert (root/f'archives/{date}.html').read_bytes().count(b'.pdf"') == 3
    print('PASS: future renderer, valid PDF links, and untouched SHA/frozen-at audit chain')


if __name__ == '__main__':
    cli = argparse.ArgumentParser()
    cli.add_argument('--html', type=Path)
    cli.add_argument('--date')
    args = cli.parse_args()
    if args.html:
        validate(read(args.html), args.date)
    else:
        archive_test()
        renderer_test()
