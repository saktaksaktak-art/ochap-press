#!/usr/bin/env python3
"""Concurrent-safe public results merge. Official legacy rows never downgraded.
Unverified API rows may be corrected by fresher API data. No BC writes.
"""
from __future__ import annotations
import argparse,json,re
from datetime import datetime
from pathlib import Path

SOURCE_RE=re.compile(r'^https://www\.boatrace\.jp/owpc/pc/race/raceresult\?')
API_RE=re.compile(r'^https://boatraceopenapi\.github\.io/api/v1/\d{4}/\d{8}\.json$')
DATE_RE=re.compile(r'^\d{4}-\d{2}-\d{2}$')
CORE=('venue_code','race_no','order','method','trifecta_payout_yen')
def checked(payload):
    if not isinstance(payload,dict) or payload.get('schema_version')!='1.0':
        raise ValueError('Invalid public results format')
    day=payload.get('date')
    if not isinstance(day,str) or not DATE_RE.fullmatch(day) or not isinstance(payload.get('races'),list):
        raise ValueError('Missing date or races')
    rows={}
    for r in payload['races']:
        if not isinstance(r,dict):raise ValueError('Invalid race row')
        venue,no=r.get('venue_code'),r.get('race_no')
        if type(venue)!=int or not 1<=venue<=24 or type(no)!=int or not 1<=no<=12:
            raise ValueError('Invalid race identity')
        order=r.get('order')
        if not isinstance(order,list) or len(order)!=3 or any(type(n)!=int or not 1<=n<=6 for n in order) or len(set(order))!=3:
            raise ValueError('Invalid race order')
        if r.get('method') is not None and not isinstance(r.get('method'),str):
            raise ValueError('Invalid result method')
        if type(r.get('trifecta_payout_yen'))!=int or r['trifecta_payout_yen']<100:
            raise ValueError('Invalid payout')
        if r.get('official_confirmed') is True:
            if not r.get('method') or not SOURCE_RE.match(str(r.get('official_result_source_ref',''))):
                raise ValueError('Official row missing original evidence')
        elif r.get('official_confirmed') is False:
            if r.get('result_status')!='API_REPORTED' or not API_RE.fullmatch(str(r.get('result_source_ref',''))):
                raise ValueError('Unverified API row missing source/status')
            if not r.get('source_observed_at_jst'):
                raise ValueError('API observation time missing')
            t=datetime.fromisoformat(r['source_observed_at_jst'])
            if t.tzinfo is None:raise ValueError('API timestamp missing time zone')
        else:
            raise ValueError('Unknown official confirmation state')
        key=(venue,no)
        if key in rows:raise ValueError('Duplicate race key')
        rows[key]=r
    return day,rows

def merge(current, proposed):
    new_day,new_rows=checked(proposed)
    if current is None:return proposed
    old_day,old_rows=checked(current)
    if old_day!=new_day:raise ValueError('Cross-date results merge forbidden')
    joined=dict(old_rows)
    changes=0
    for key,new in new_rows.items():
        old=joined.get(key)
        if old is None:
            joined[key]=new;changes+=1
            continue
        if old['official_confirmed'] is True:
            if new['official_confirmed'] is True and any(old.get(x)!=new.get(x) for x in CORE):
                raise ValueError('Conflicting confirmed race result: '+str(key))
            continue  # official legacy evidence is never downgraded by new API
        if new['official_confirmed'] is True:
            joined[key]=new;changes+=1
            continue
        if all(old.get(x)==new.get(x) for x in CORE):
            continue  # unchanged result should not trigger extra Git commits
        old_at=datetime.fromisoformat(old['source_observed_at_jst'])
        new_at=datetime.fromisoformat(new['source_observed_at_jst'])
        if new_at>old_at:
            joined[key]=new;changes+=1
        elif new_at==old_at:
            raise ValueError('Inconsistent API correction timestamps: '+str(key))
    if not changes:return current
    out=dict(proposed)
    out['races']=[joined[k] for k in sorted(joined)]
    return out

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--current',required=True,type=Path)
    parser.add_argument('--incoming',required=True,type=Path)
    parser.add_argument('--output',required=True,type=Path)
    args=parser.parse_args()
    old=json.loads(args.current.read_text(encoding='utf-8')) if args.current.exists() else None
    new=json.loads(args.incoming.read_text(encoding='utf-8'))
    merged=merge(old,new)
    args.output.parent.mkdir(parents=True,exist_ok=True)
    args.output.write_text(json.dumps(merged,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print('RECONCILED_PUBLIC_RESULTS',args.output,'rows',len(merged['races']))

if __name__=='__main__': main()
