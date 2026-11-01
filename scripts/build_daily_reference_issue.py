#!/usr/bin/env python3
"""Build a dated *reference program* edition, NOT a retroactive M0 prediction.

Preserves existing date-navigation architecture and prior newspaper originals.
"""
from __future__ import annotations
import argparse
from datetime import datetime
from hashlib import sha256
from html import escape
import json
from pathlib import Path
from urllib.request import Request, urlopen
from zoneinfo import ZoneInfo

JST = ZoneInfo("Asia/Tokyo")
VENUES = {
 1:"桐生",2:"戸田",3:"江戸川",4:"平和島",5:"多摩川",6:"浜名湖",
 7:"蒲郡",8:"常滑",9:"津",10:"三国",11:"びわこ",12:"住之江",
 13:"尼崎",14:"鳴門",15:"丸亀",16:"児島",17:"宮島",18:"徳山",
 19:"下関",20:"若松",21:"芦屋",22:"福岡",23:"唐津",24:"大村"
}
STYLES = """
:root{color-scheme:light}*{box-sizing:border-box}
body{background:#f4f7f2;color:#193a2c;font:15px/1.55 system-ui,-apple-system,sans-serif;margin:0}
header#top{background:#fff;border-bottom:4px solid #206244;padding:24px 4vw}
header#top h1{font-size:1.7rem;margin:0 0 7px}
header#top p{margin:4px 0}
.notice{background:#fff3e4;color:#814915;border-left:4px solid #bb7034;padding:11px 14px;margin:12px 0;font-weight:600}
.summary{color:#395e4d}
nav.venue-links{display:flex;flex-wrap:wrap;gap:7px;padding:12px 4vw;background:#e1eee6}
nav.venue-links a{color:#17563b;text-decoration:none;padding:4px 8px;background:white;border-radius:6px}
main{max-width:1480px;margin:auto;padding:16px 3vw;display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,500px),1fr));gap:14px}
article{background:white;border:1px solid #cddbd3;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px #193a2c0b}
.race-head{padding:12px 15px;background:#edf5ee;border-bottom:1px solid #cddbd3}
.race-head h2{font-size:1.16rem;margin:0;color:#1c5339}
.race-head p{font-size:.83rem;margin:4px 0 0;color:#526b5e}
.table-scroll{overflow-x:auto}
table{width:100%;min-width:455px;border-collapse:collapse;font-size:.82rem}
th,td{border-bottom:1px solid #e4eae5;padding:7px 4px;text-align:right;white-space:nowrap}
th:first-child,td:first-child{text-align:center;padding-left:10px}
th:nth-child(2),td:nth-child(2){text-align:left;white-space:normal}
thead{background:#fafbf9;color:#415a4a}
.bnum{display:inline-block;border-radius:50%;width:24px;height:24px;text-align:center;line-height:23px;font-weight:800;border:1px solid #999}
.b1{background:white;color:#111}.b2{background:#282828;color:white}
.b3{background:#d83737;color:white}.b4{background:#3469dd;color:white}
.b5{background:#f5d22b;color:#111}.b6{background:#319153;color:white}
.pending{margin:0;padding:10px 15px;color:#84623e;font-size:.84rem}
footer{background:#e5eee8;padding:20px 4vw;font-size:.86rem;color:#425c4c}
"""
def fmt(v, suffix=""):
    if v is None: return "—"
    return escape(str(v))+suffix
def clean(v):
    return escape(str(v or ""), quote=True)
def render_race(venue_no, race_no, race):
    name=VENUES.get(venue_no,f"{venue_no}場")
    close=(race.get("closed_at") or "")
    hhmm=close[11:16] if len(close)>=16 else "—"
    subtitle=race.get("subtitle") or race.get("title") or ""
    rows=[]
    for n in range(1,7):
        p=race["racers"][str(n)]
        pname=clean(p.get("name") or "氏名未取得")
        row=(f'<tr><td><span class="bnum b{n}">{n}</span></td>'
             f'<td>{pname}<small>（{fmt(p.get("number"))}・{clean(p.get("rank_number_source"))}）</small></td>'
             f'<td>{fmt(p.get("average_start_timing"))}</td>'
             f'<td>{fmt(p.get("national_top_2_percent"),"%")}</td>'
             f'<td>{fmt(p.get("motor_top_2_percent"),"%")}</td>'
             f'<td>{fmt(p.get("flying_count"))}</td></tr>')
        rows.append(row)
    return (f'<article id="v{venue_no}-r{race_no}" data-venue="{venue_no}" data-race="{race_no}">'
            f'<div class="race-head"><h2>{clean(name)} {race_no}R　締切 {clean(hhmm)}</h2>'
            f'<p>{clean(subtitle)}／{clean(race.get("day_number_source") or "")}</p></div>'
            '<div class="table-scroll"><table><thead><tr><th>艇</th><th>選手（登録番号・級）</th><th>平均ST</th>'
            '<th>全国2連</th><th>モーター2連</th><th>F</th></tr></thead><tbody>'
            +''.join(rows)+'</tbody></table></div>'
            '<p class="pending">おちゃっぴー記者M0予想：未登録（事後作成しません）</p></article>')
def main():
    p=argparse.ArgumentParser()
    p.add_argument("--date",default="2026-11-01")
    p.add_argument("--allow-existing",action="store_true")
    args=p.parse_args()
    day=datetime.strptime(args.date,"%Y-%m-%d").strftime("%Y%m%d")
    out=Path("archives")/(args.date+".html")
    manifest_path=Path("data/issue-index.json")
    manifest=json.loads(manifest_path.read_text(encoding="utf-8"))
    if out.exists() and not args.allow_existing:
        print("PRESERVE_EXISTING_ISSUE: refusing to replace "+str(out))
        return
    source=f"https://boatraceopenapi.github.io/api/v1/{day[:4]}/{day}.json"
    with urlopen(Request(source,headers={"User-Agent":"OchaPPressSource/1.0","Accept":"application/json"}),timeout=45) as response:
        raw=response.read(20_000_001)
    if len(raw)>20_000_000:raise SystemExit("Unexpected source size")
    data=json.loads(raw)
    stadiums=data.get("programs",{}).get("stadiums")
    if not isinstance(stadiums,dict) or len(stadiums)!=14:
        raise SystemExit("Expected exactly 14 venues; refusing incomplete reference")
    blocks=[]
    count=0
    for code in sorted(stadiums,key=int):
        v=stadiums[code]
        races=v.get("races")
        if not isinstance(races,dict) or set(races)!=set(str(i) for i in range(1,13)):
            raise SystemExit("Expected 12 races per venue")
        for rno in range(1,13):
            race=races[str(rno)]
            if race.get("date")!=args.date or int(race.get("stadium_number") or -1)!=int(code) or int(race.get("race_number") or -1)!=rno:
                raise SystemExit("Race identity mismatch")
            players=race.get("racers")
            if not isinstance(players,dict) or set(players)!=set("123456"):
                raise SystemExit("Missing six racers")
            if any(not isinstance(players[str(i)].get("number"),int) for i in range(1,7)):
                raise SystemExit("Invalid racer registration number")
            blocks.append(render_race(int(code),rno,race))
            count+=1
    if count!=168: raise SystemExit("Not 168 races")
    nav=''.join(f'<a href="#v{k}-r1">{clean(VENUES.get(int(k),k))}</a>' for k in sorted(stadiums,key=int))
    now=datetime.now(JST).strftime("%Y/%m/%d %H:%M JST")
    digest=sha256(raw).hexdigest()
    html=(f'<!doctype html><html lang="ja"><head><meta charset="utf-8">'
          f'<meta name="viewport" content="width=device-width,initial-scale=1">'
          f'<title>お茶P新聞｜{args.date} 出走表参考版</title><style>{STYLES}</style></head>'
          f'<body data-reporter-default="ocha"><header id="top">'
          f'<h1>🍵 お茶P新聞｜出走表参考版</h1>'
          f'<p>{args.date.replace("-","/")}｜14場168R・1,008艇</p>'
          f'<p class="notice">出走表の事後取得・参考表示です。正式な朝刊M0予想ではありません。締切前の予想原本は未登録であり、後から補いません。</p>'
          f'<p class="summary">第三者提供のBoatrace Open API掲載内容を参照。変更・欠場・進入はBOAT RACE公式で要確認。</p>'
          f'<p class="summary">取得確認：{clean(now)}／原本SHA-256：<code>{digest}</code></p>'
          f'</header><nav class="venue-links" aria-label="開催場へ移動">{nav}</nav>'
          f'<main>{"".join(blocks)}</main>'
          f'<footer>お茶P新聞｜当日出走情報の参照版。予想・決まり手・舟券・公式確定結果の掲載は行っていません。</footer>'
          f'</body></html>')
    out.parent.mkdir(parents=True,exist_ok=True)
    out.write_text(html,encoding="utf-8")
    item={"date":args.date,"path":out.as_posix(),"compression":"none","gemi_tabs":False,"edition_status":"program_reference_only"}
    issues=[x for x in manifest["issues"] if x.get("date")!=args.date]
    issues.insert(0,item)
    manifest["issues"]=issues
    manifest["default_date"]=args.date
    manifest_path.write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    receipt={"date":args.date,"source":source,"sha256":digest,"venues":14,"races":168,"boat_slots":1008,
             "verified":True,"kind":"public_program_reference_only","not_formal_m0":True,
             "generated_at_jst":now}
    Path("data").mkdir(exist_ok=True)
    Path("data") .joinpath("issue-source-2026-11-01.json").write_text(json.dumps(receipt,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    print("ISSUE_CREATED",out,"14 venues, 168 races, 1008 boats",len(html),"HTML chars",digest)
    assert html.count('<article id="v')==168
if __name__=="__main__":
    main()
