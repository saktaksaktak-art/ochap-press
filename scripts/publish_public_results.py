#!/usr/bin/env python3
"""Public速報: read unified third-party API results, no BOAT RACE official-page HTTP.
Only formal BC performs the official verification. Preserve certified legacy rows.
"""
from __future__ import annotations
import argparse
from datetime import datetime
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen
from zoneinfo import ZoneInfo
import json
from reconcile_public_results import checked, merge

JST = ZoneInfo('Asia/Tokyo')
VENUES = {
    1:'桐生',2:'戸田',3:'江戸川',4:'平和島',5:'多摩川',6:'浜名湖',
    7:'蒲郡',8:'常滑',9:'津',10:'三国',11:'びわこ',12:'住之江',
    13:'尼崎',14:'鳴門',15:'丸亀',16:'児島',17:'宮島',18:'徳山',
    19:'下関',20:'若松',21:'芦屋',22:'福岡',23:'唐津',24:'大村'
}
METHODS = {'逃げ','差し','まくり','まくり差し','抜き','恵まれ'}

def fetch(url, limit=8_000_000):
    req=Request(url, headers={'User-Agent':'OchaPPressAPIResults/1.1',
        'Accept':'application/json'})
    with urlopen(req, timeout=20) as response:
        if response.status != 200: raise ValueError('API HTTP '+str(response.status))
        raw=response.read(limit+1)
    if len(raw)>limit: raise ValueError('API exceeds byte budget')
    return json.loads(raw)

def parse_api_result(result, date, venue, rno, source_url, observed_at):
    """Require real 6-boat race, ordered podium, and matching 3連単.
    No official confirmation is claimed, and provisional/malformed data stays out."""
    if not isinstance(result,dict) or result.get('date')!=date: return None
    if type(result.get('stadium_number')) is not int or result['stadium_number']!=venue: return None
    if type(result.get('race_number')) is not int or result['race_number']!=rno: return None
    racers=result.get('racers')
    if not isinstance(racers,dict) or set(racers)!=set('123456'): return None
    ranked={}
    for boatno in range(1,7):
        v=racers[str(boatno)]
        if not isinstance(v,dict) or v.get('entry_number') != boatno: return None
        if type(v.get('number')) is not int or not 1000<=v['number']<=9999: return None
        p=v.get('place_number')
        if type(p) is int and 1<=p<=3:
            if p in ranked: return None
            ranked[p]=boatno
    if set(ranked)!={1,2,3}: return None
    order=[ranked[k] for k in (1,2,3)]
    payouts=result.get('payouts')
    if not isinstance(payouts,dict): return None
    tf=payouts.get('trifecta')
    if not isinstance(tf,list) or len(tf)!=1 or not isinstance(tf[0],dict): return None
    price=tf[0].get('amount')
    if type(price) is not int or price<100 or price>100_000_000: return None
    if tf[0].get('combination')!='-'.join(map(str,order)): return None
    method=result.get('technique_number_source')
    if method not in METHODS: method=None
    return {
        'venue':VENUES[venue], 'venue_code':venue, 'race_no':rno,
        'order':order, 'method':method, 'trifecta_payout_yen':price,
        'official_confirmed':False, 'result_status':'API_REPORTED',
        'result_source_ref':source_url, 'source_observed_at_jst':observed_at
    }

def unified_v1_results(payload, date, source_url, observed_at):
    if not isinstance(payload,dict): raise ValueError('Not an API object')
    prog=payload.get('programs')
    venues=prog.get('stadiums') if isinstance(prog,dict) else None
    if not isinstance(venues,dict) or not venues:
        raise ValueError('No API stadiums; schema may have changed')
    rows={}
    for key,stadium in venues.items():
        if not isinstance(key,str) or not key.isdecimal() or int(key) not in VENUES:
            raise ValueError('Invalid venue in API')
        venue=int(key)
        races=stadium.get('races') if isinstance(stadium,dict) else None
        if not isinstance(races,dict): raise ValueError('Invalid races object in API')
        for rkey,race in races.items():
            if not isinstance(rkey,str) or not rkey.isdecimal() or not 1<=int(rkey)<=12:
                raise ValueError('Invalid race number in API')
            rno=int(rkey)
            result=race.get('result') if isinstance(race,dict) else None
            if result is None: continue
            row=parse_api_result(result,date,venue,rno,source_url,observed_at)
            if row is not None:
                if (venue,rno) in rows:raise ValueError('Duplicate API race')
                rows[(venue,rno)]=row
    return [rows[key] for key in sorted(rows)]

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--date',default=datetime.now(JST).date().isoformat())
    args=parser.parse_args()
    day=datetime.strptime(args.date,'%Y-%m-%d').date()
    now=datetime.now(JST)
    if day>now.date():parser.error('Do not publish future results')
    source=f'https://boatraceopenapi.github.io/api/v1/{day.year}/{day:%Y%m%d}.json'
    target=Path('data/public-results')/(args.date+'.json')
    previous=None
    if target.exists():
        previous=json.loads(target.read_text(encoding='utf-8'))
        old_day,_=checked(previous)
        if old_day!=args.date:raise ValueError('Existing results date mismatch')
    try:
        api=fetch(source)
    except (HTTPError,URLError,TimeoutError,ValueError) as ex:
        print('API_FETCH_UNAVAILABLE_KEEP_EXISTING',str(ex))
        return
    observed=datetime.now(JST).isoformat(timespec='seconds')
    rows=unified_v1_results(api,args.date,source,observed)
    if not rows:
        print('NO_COMPLETE_API_RESULTS_KEEP_EXISTING',args.date)
        return
    incoming={
      'schema_version':'1.0','date':args.date,
      'status':'API_RESULTS_REFERENCE_ONLY',
      'checked_at_jst':observed,
      'source_policy':'Unified third-party API; official-page confirmation belongs only to formal BC.',
      'not_formal_m0':True,'not_formal_bc':True,
      'races':rows
    }
    combined=merge(previous,incoming)
    if previous is not None and combined==previous:
        print('NO_CHANGED_API_RESULTS',args.date,len(combined['races']))
        return
    target.parent.mkdir(parents=True,exist_ok=True)
    tmp=target.with_suffix('.tmp')
    tmp.write_text(json.dumps(combined,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    tmp.replace(target)
    print('PUBLISHED_API_REFERENCE',args.date,len(combined['races']),
          'new_or_changed',len([r for r in combined['races'] if not r['official_confirmed']]))

if __name__=='__main__':
    main()
