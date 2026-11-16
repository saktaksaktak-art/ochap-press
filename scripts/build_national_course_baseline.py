"""Build frozen six-month national comparisons from official K archives and grade schedules."""
from argparse import ArgumentParser
from calendar import monthrange
from collections import Counter
from datetime import date, timedelta
from hashlib import sha256
import json
import re
from pathlib import Path
from read_official_lzh import unpack

METHODS={'逃げ':'nige','差し':'sashi','まくり':'makuri','まくり差し':'makurisashi','抜き':'nuki','恵まれ':'megumare'}
VENUE=re.compile(r'(?ms)^(\d{2})KBGN[ \r]*\n(.*?)^\1KEND(?:\r?$)')
RACE=re.compile(r'(?m)^ *([0-9]{1,2})R +[^\r\n]*?H[0-9]+m[^\r\n]*')
PAYOUT=re.compile(r'(?m)^ *([0-9]{1,2})R +(\d-\d-\d|中[ 　]*止|不[ 　]*成[ 　]*立)')
FINISH=re.compile(r'^\s*(0[1-6])\s+([1-6])\s+([1-9]\d{3})\s+.*?\s+\d{1,3}\s+\d{1,3}\s+[\d.]+\s+([1-6])\s+(0?\.\d{2})\s')

def first_day(issue):
    y,m=divmod(issue.year*12+issue.month-1-6,12)
    return date(y,m+1,min(issue.day,monthrange(y,m+1)[1]))

def days(start,end):
    return (start+timedelta(days=i) for i in range((end-start).days+1))

def grades(sources):
    out={}
    for year,html in sources:
        for row in re.findall(r'<tr>(.*?)</tr>',html,re.S):
            g=re.search(r'class="is-p10-0 +is-(SGa|G1a|G1b|G2b)"',row)
            if not g or g[1] not in ('SGa','G1b'): continue
            dm=re.search(r'class="td_date">(\d\d)/(\d\d)-(\d\d)/(\d\d)<',row)
            ven=re.search(r'text_place1_(\d{2})\.png',row)
            if not dm or not ven: raise ValueError('grade schedule row is incomplete')
            a,b,c,d=map(int,dm.groups())
            if c<a: raise ValueError('exceptional cross-year grade requires explicit schedule evidence')
            grade='SG' if g[1]=='SGa' else 'G1'
            for day in days(date(year,a,b),date(year,c,d)):
                key=day,int(ven[1])
                if key in out and out[key]!=grade: raise ValueError(f'overlapping SG/G1 schedule: {key}')
                out[key]=grade
    return out

def parse_day(raw,day):
    filename,s=unpack(raw)
    if filename.upper()!=f'K{day:%y%m%d}.TXT' or not s.startswith('STARTK') or not s.strip().endswith('FINALK'):
        raise ValueError('archive identity mismatch')
    venues={};missing=[];excluded=Counter()
    for v,body in VENUE.findall(s):
        v=int(v)
        if v in venues or not 1<=v<=24: raise ValueError(f'duplicate or invalid venue {v}')
        venues[v]=[]
        if '全レース終了後に登録されます' in body:
            missing.append(v);continue
        if not re.search(fr'{day.year}/ *{day.month}/ *{day.day}(?!\d)',body):
            raise ValueError(f'{day} venue {v}: result date mismatch')
        split=list(RACE.finditer(body))
        payout=body[:split[0].start()] if split else body
        expected={int(n):v for n,v in PAYOUT.findall(payout)}
        present=set()
        for i,h in enumerate(split):
            rn=int(h[1])
            if rn in present: raise ValueError(f'duplicate race {day} {v} {rn}')
            present.add(rn)
            part=body[h.end():split[i+1].start() if i+1<len(split) else len(body)]
            meth=re.search(r'ﾚｰｽﾀｲﾑ\s*([^\r\n]+)',part)
            method=METHODS.get(meth[1].strip()) if meth else None
            entries=[(*map(int,m.groups()[:4]),float(m[5])) for line in part.splitlines() if (m:=FINISH.match(line))]
            winners=[e for e in entries if e[0]==1]
            if len(winners)!=1 or not method:
                excluded['ambiguous_or_unsettled']+=1
                continue
            if len({e[3] for e in entries})!=len(entries): raise ValueError(f'course collision {day} {v} {rn}')
            if rn in expected and '-' in expected[rn] and int(expected[rn][0])!=winners[0][1]:
                excluded['ambiguous_or_unsettled']+=1
                continue
            venues[v].append((method,entries))
        not_present={n:val for n,val in expected.items() if n not in present}
        unknown=[n for n,val in not_present.items() if '-' in val]
        if unknown or (not split and not expected): raise ValueError(f'incomplete race list {day} {v}: {unknown}')
        excluded['cancelled_or_unsettled']+=len(not_present)
    if len(VENUE.findall(s))!=len(re.findall(r'(?m)^\d\dKBGN',s)) or not venues:
        raise ValueError('venue markers incomplete')
    return venues,missing,excluded

def fold(records, *, sparse=False, racer=None):
    rows=[None]+[dict(n=0, wins=Counter(), losses=Counter(), st=0) for _ in range(6)]
    for method,entries in records:
        for place,boat,id_,course,st in entries:
            if racer is not None and id_!=racer:continue
            row=rows[course];row['n']+=1;row['st']+=round(st*100)
            if place==1: row['wins'][method]+=1
            else:
                row['losses'][method]+=1
                row['losses'][f'place{place}']+=1
    out=[]
    for c,row in enumerate(rows[1:],1):
        n=row['n']
        if n<=0:
            if sparse: continue
            raise ValueError('empty course')
        rate=lambda count: round(100*count/n,2)
        out.append({'course':c,'sample_count':n,
         **({'first':rate(sum(row['wins'].values())), 'second':rate(row['losses']['place2']), 'third':rate(row['losses']['place3']),'average_st':round(row['st']/100/n,2)} if sparse else {}),
         'win_rates_pct':{k:rate(row['wins'][k]) for k in (['nige'] if c==1 else ['sashi','makuri','makurisashi'])},
         'loss_rates_pct':{k:rate(row['losses'][m]) for k,m in zip(('sasare','makurare','makuraresashi'),('sashi','makuri','makurisashi'))} if c==1 else {},
         'nigashi_rate_pct':None})
    return out

def build(directory,schedules,issue):
    start,end=first_day(issue), issue-timedelta(days=1)
    all_rows=[];sg_rows=[];seen=set();missing=[];seen_grade=set();sha=sha256();excluded=Counter()
    for day in days(start,end):
        raw=(directory/f'{day}.lzh').read_bytes()
        sha.update(str(day).encode()+sha256(raw).digest())
        venues,absent,skip=parse_day(raw,day);excluded.update(skip)
        missing.extend((str(day),v) for v in absent)
        seen.update(v for v in venues if v not in absent)
        for v,rs in venues.items():
            all_rows.extend(rs)
            if (day,v) in schedules and v not in absent:
                sg_rows.extend(rs);seen_grade.add((day,v))
    if len(seen)!=24:raise ValueError('not all venues were present')
    missing_grade=sorted((str(d),v) for d,v in schedules if start<=d<=end and (d,v) not in seen_grade)
    if missing_grade:raise ValueError(f'missing scheduled SG/G1 records: {missing_grade}')
    confirmed_cancelled={('2026-05-16',13),('2026-05-17',13),('2026-05-18',13),('2026-07-30',9),('2026-07-31',9),('2026-08-01',9)}
    unknown=[x for x in missing if x not in confirmed_cancelled]
    if unknown:raise ValueError(f'Unresolved venue days: {unknown}')
    groups={}
    for category,recs,outages in [('all',all_rows,missing),('sg_g1',sg_rows,missing_grade)]:
        groups[category]={'6':{'status':'verified','source':'official_results','scope':'national','race_class':category,
          'period_months':6,'period_start':str(start),'period_end':str(end),'venue_count':24,
          'grades':['SG','G1'] if category=='sg_g1' else 'all',
          'courses':fold(recs),'races':len(recs),'nigashi_definition_verified':False,
          'officially_cancelled_venue_days':outages}}
    players={}
    index={}
    for method,entries in sg_rows:
        for _,_,racer,_,_ in entries: index.setdefault(racer,[]).append((method,entries))
    for racer,rows in sorted(index.items()):
        players[str(racer)]=fold(rows,sparse=True,racer=racer)
    return {'sg_g1_venues':sorted(v for (d,v) in schedules if d==issue),'sg_g1_players_6m':players,'schema':'ochap.course-national-benchmark.v1','as_of_date':str(issue),'groups':groups,
     'evidence':{'official_archive_sha256_chain':sha.hexdigest(),'excluded':dict(excluded),
       'denominator':'boats with an official numeric finish, actual entry course, unique race winner',
       'grade_schedule_scope':'SG and regular G1 only; excludes PG1 and G2',
       'cancellation_sources':['https://www.boatrace.jp/owpc/pc/race/raceindex?hd=20260516&jcd=13','https://www.boatrace.jp/owpc/pc/race/raceindex?hd=20260728&jcd=09'],
       'official_archive_source':'https://www.boatrace.jp/owpc/pc/extra/data/download.html'}}
if __name__=='__main__':
    p=ArgumentParser();p.add_argument('archives',type=Path);p.add_argument('issue',type=date.fromisoformat)
    p.add_argument('sg',type=Path);p.add_argument('g1',type=Path);p.add_argument('output',type=Path)
    a=p.parse_args()
    g=grades([(a.issue.year,z.read_text()) for z in (a.sg,a.g1)])
    v=build(a.archives,g,a.issue)
    a.output.write_text(json.dumps(v,ensure_ascii=False,separators=(',',':'))+'\n')
