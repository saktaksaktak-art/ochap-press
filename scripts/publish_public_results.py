#!/usr/bin/env python3
"""Incremental public RESULTS feed. Third-party index nominates races; each row
is independently confirmed against BOAT RACE's actual race result HTML.
Never certify formal M0/BC from this file. Fail closed on any discrepancy."""
from __future__ import annotations
import argparse
from datetime import datetime
from hashlib import sha256
import json, re, time, unicodedata
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen
from zoneinfo import ZoneInfo
from bs4 import BeautifulSoup

JST=ZoneInfo('Asia/Tokyo')
VENUES={1:'桐生',2:'戸田',3:'江戸川',4:'平和島',5:'多摩川',6:'浜名湖',7:'蒲郡',
8:'常滑',9:'津',10:'三国',11:'びわこ',12:'住之江',13:'尼崎',14:'鳴門',
15:'丸亀',16:'児島',17:'宮島',18:'徳山',19:'下関',20:'若松',21:'芦屋',
22:'福岡',23:'唐津',24:'大村'}
METHODS={'逃げ','差し','まくり','まくり差し','抜き','恵まれ'}

def fetch(url, limit=8000000):
    req=Request(url,headers={'User-Agent':'OchaPPressResults/1.0 public reference verifier',
           'Accept':'text/html,application/json;q=0.9,*/*;q=0.5'})
    with urlopen(req,timeout=18) as res:
        if res.status!=200: raise ValueError('HTTP '+str(res.status))
        data=res.read(limit+1)
    if len(data)>limit:raise ValueError('oversize source')
    return data

def norm(value):
    return unicodedata.normalize('NFKC',str(value)).replace('\xa0',' ').strip()

def candidate(entry, day):
    if not isinstance(entry,dict) or entry.get('date')!=day:return None
    venue,n=entry.get('stadium_number'),entry.get('number')
    if type(venue)!=int or venue not in VENUES or type(n)!=int or not 1<=n<=12:return None
    boats=entry.get('boats')
    if not isinstance(boats,list):return None
    ranked={}
    for boat in boats:
        if not isinstance(boat,dict):return None
        p,b=boat.get('racer_place_number'),boat.get('racer_boat_number')
        if type(p)==int and 1<=p<=3:
            if p in ranked or type(b)!=int or not 1<=b<=6:return None
            ranked[p]=b
    if set(ranked)!={1,2,3} or len(set(ranked.values()))!=3:return None
    order=[ranked[p] for p in (1,2,3)]
    payout=(entry.get('payouts') or {}).get('trifecta',[])
    if not isinstance(payout,list) or len(payout)!=1:return None
    p=payout[0]
    if not isinstance(p,dict) or type(p.get('amount'))!=int or p['amount']<100:return None
    if norm(p.get('combination',''))!='-'.join(map(str,order)):return None
    return dict(jcd=venue,race_no=n,order=order,payout=p['amount'])

def official_verify(raw, item, url):
    soup=BeautifulSoup(raw,'html.parser')
    rank_tables=[]; payout_tables=[]; method_tables=[]
    for table in soup.select('table'):
        heads=[norm(h.get_text(' ',strip=True)) for h in table.select('th')]
        if all(x in heads for x in ('着','枠','ボートレーサー')):rank_tables.append(table)
        if all(x in heads for x in ('勝式','組番','払戻金')):payout_tables.append(table)
        if heads==['決まり手']:method_tables.append(table)
    if any(len(t)!=1 for t in (rank_tables,payout_tables,method_tables)):return None
    rank={}
    for tr in rank_tables[0].select('tr'):
        cells=tr.find_all('td',recursive=False)
        if len(cells)<3:continue
        place,boat=norm(cells[0].get_text(' ',strip=True)),norm(cells[1].get_text(' ',strip=True))
        if place in ('1','2','3') and re.fullmatch('[1-6]',boat):
            if int(place) in rank:return None
            rank[int(place)]=int(boat)
    if set(rank)!={1,2,3}:return None
    order=[rank[i] for i in (1,2,3)]
    if order!=item['order']:return None
    payouts=[]
    for tr in payout_tables[0].select('tr'):
        cells=tr.find_all('td',recursive=False)
        if len(cells)<3 or norm(cells[0].get_text(' ',strip=True))!='3連単':continue
        boats=[norm(x.get_text(strip=True)) for x in cells[1].select('.numberSet1_number')]
        amount=cells[2].select_one('.is-payout1')
        if len(boats)!=3 or not amount or any(not re.fullmatch('[1-6]',b) for b in boats):continue
        price=re.sub('[,¥￥\\s]','',norm(amount.get_text(' ',strip=True)))
        if price.isdigit():payouts.append(([int(x) for x in boats],int(price)))
    if len(payouts)!=1 or payouts[0]!=(order,item['payout']):return None
    methods=[norm(td.get_text(' ',strip=True)) for td in method_tables[0].select('td')]
    if len(methods)!=1 or methods[0] not in METHODS:return None
    return dict(venue=VENUES[item['jcd']],venue_code=item['jcd'],race_no=item['race_no'],
       order=order,method=methods[0],trifecta_payout_yen=item['payout'],
       official_confirmed=True,official_result_source_ref=url,
       official_html_sha256=sha256(raw).hexdigest(),
       source_confirmed_at_jst=datetime.now(JST).isoformat(timespec='seconds'))

def main():
    p=argparse.ArgumentParser()
    p.add_argument('--date',default=datetime.now(JST).date().isoformat())
    p.add_argument('--max-official',type=int,default=14)
    p.add_argument('--sleep',type=float,default=1.25)
    args=p.parse_args()
    if args.max_official not in range(1,25) or args.sleep<0.8:p.error('invalid request budget')
    date=datetime.strptime(args.date,'%Y-%m-%d').date()
    if date>datetime.now(JST).date():p.error('future date not eligible')
    target=Path('data/public-results')/(args.date+'.json')
    previous=[]
    if target.exists():
        saved=json.loads(target.read_text(encoding='utf-8'))
        if saved.get('schema_version')!='1.0' or saved.get('date')!=args.date or not isinstance(saved.get('races'),list):
            raise ValueError('Incompatible existing results file')
        previous=saved['races']
    confirmed={}
    for row in previous:
        key=(row.get('venue_code'),row.get('race_no'))
        if row.get('official_confirmed') is not True or not row.get('official_result_source_ref') or key in confirmed:
            raise ValueError('Prior verified data is inconsistent')
        confirmed[key]=row
    feed=f'https://boatraceopenapi.github.io/results/v3/{date.year}/{date:%Y%m%d}.json'
    try:
        payload=json.loads(fetch(feed))
    except (HTTPError,URLError,TimeoutError,ValueError) as exc:
        print('CANDIDATE_UNAVAILABLE_KEEP_EXISTING',str(exc))
        return
    if not isinstance(payload,dict) or not isinstance(payload.get('results'),list):
        raise ValueError('Third party index schema changed: fail closed')
    rows={}
    for entry in payload['results']:
        c=candidate(entry,args.date)
        if c:
            key=(c['jcd'],c['race_no'])
            if key in rows:raise ValueError('Duplicate candidate race key')
            rows[key]=c
    pending=[v for k,v in sorted(rows.items()) if k not in confirmed]
    added=0; failures=0
    for i,item in enumerate(pending[:args.max_official]):
        url='https://www.boatrace.jp/owpc/pc/race/raceresult?'+urlencode({
          'hd':f'{date:%Y%m%d}','jcd':f"{item['jcd']:02d}",'rno':item['race_no']})
        try:
            row=official_verify(fetch(url),item,url)
            if row:
                confirmed[(item['jcd'],item['race_no'])]=row
                added+=1
            else:
                failures+=1
                print('OFFICIAL_MISMATCH_OR_INCOMPLETE',item['jcd'],item['race_no'])
        except (HTTPError,URLError,TimeoutError,ValueError) as exc:
            failures+=1
            print('OFFICIAL_FETCH_FAILED',item['jcd'],item['race_no'],str(exc))
        if i+1<min(len(pending),args.max_official):time.sleep(args.sleep)
    if not added:
        print('NO_NEW_OFFICIAL_ROWS; previous kept',len(previous),'candidate',len(rows),'failures',failures)
        return
    output={
       'schema_version':'1.0','date':args.date,
       'status':'OFFICIAL_RACE_PAGE_VERIFIED_ONLY',
       'checked_at_jst':datetime.now(JST).isoformat(timespec='seconds'),
       'source_policy':'Candidates from third-party API; every published row independently checked against official BOAT RACE result page.',
       'not_formal_m0':True,'not_formal_bc':True,
       'races':sorted(confirmed.values(),key=lambda x:(x['venue_code'],x['race_no']))
    }
    target.parent.mkdir(parents=True,exist_ok=True)
    tmp=target.with_suffix('.tmp')
    tmp.write_text(json.dumps(output,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    tmp.replace(target)
    print('PUBLISHED_VERIFIED',args.date,'confirmed',len(output['races']),'new',added,'failures',failures)

if __name__=='__main__':
    main()
