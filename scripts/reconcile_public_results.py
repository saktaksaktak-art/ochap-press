#!/usr/bin/env python3
"""Preserve officially verified race bulletin rows across concurrent GitHub pushes.

This is a local file merge, not a new result verification or formal BC update.
Never resolve a disagreement between verified result rows silently.
"""
from __future__ import annotations
import argparse,json,re
from pathlib import Path

SOURCE_RE=re.compile(r'^https://www\.boatrace\.jp/owpc/pc/race/raceresult\?')
DATE_RE=re.compile(r'^\d{4}-\d{2}-\d{2}$')

def checked(payload):
    if not isinstance(payload,dict) or payload.get('schema_version')!='1.0':
        raise ValueError('Invalid public results format')
    day=payload.get('date')
    if not isinstance(day,str) or not DATE_RE.fullmatch(day) or not isinstance(payload.get('races'),list):
        raise ValueError('Missing date or races')
    rows={}
    for r in payload['races']:
        if not isinstance(r,dict) or r.get('official_confirmed') is not True:
            raise ValueError('Unverified race row')
        venue,no=r.get('venue_code'),r.get('race_no')
        if type(venue)!=int or not 1<=venue<=24 or type(no)!=int or not 1<=no<=12:
            raise ValueError('Invalid race identity')
        order=r.get('order')
        if not isinstance(order,list) or len(order)!=3 or any(type(n)!=int or not 1<=n<=6 for n in order) or len(set(order))!=3:
            raise ValueError('Invalid race order')
        if not isinstance(r.get('method'),str) or not r['method']:
            raise ValueError('Missing confirmed method')
        if type(r.get('trifecta_payout_yen'))!=int or r['trifecta_payout_yen']<100:
            raise ValueError('Invalid payout')
        if not SOURCE_RE.match(str(r.get('official_result_source_ref',''))):
            raise ValueError('Missing official source')
        key=(venue,no)
        if key in rows:raise ValueError('Duplicate confirmed race key')
        rows[key]=r
    return day,rows

CORE=('venue_code','race_no','order','method','trifecta_payout_yen','official_result_source_ref')
def merge(current, proposed):
    new_day,new_rows=checked(proposed)
    if current is None:
        return proposed
    old_day,old_rows=checked(current)
    if old_day!=new_day:raise ValueError('Cross-date result merge forbidden')
    output=dict(current)
    joined=dict(old_rows)
    delta=0
    for key,row in new_rows.items():
        if key in joined:
            if any(joined[key].get(k)!=row.get(k) for k in CORE):
                raise ValueError('Conflicting verified race result: '+str(key))
        else:
            joined[key]=row
            delta+=1
    if not delta:return current
    output['races']=[joined[k] for k in sorted(joined)]
    output['checked_at_jst']=proposed.get('checked_at_jst',current.get('checked_at_jst'))
    return output

def main():
    p=argparse.ArgumentParser()
    p.add_argument('--current',required=True,type=Path)
    p.add_argument('--incoming',required=True,type=Path)
    p.add_argument('--output',required=True,type=Path)
    a=p.parse_args()
    old=json.loads(a.current.read_text(encoding='utf-8')) if a.current.exists() else None
    new=json.loads(a.incoming.read_text(encoding='utf-8'))
    united=merge(old,new)
    a.output.parent.mkdir(parents=True,exist_ok=True)
    a.output.write_text(json.dumps(united,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print('RECONCILED_PUBLIC_RESULTS',a.output,'count',len(united['races']))
if __name__=='__main__':main()
