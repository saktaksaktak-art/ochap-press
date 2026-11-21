#!/usr/bin/env python3
"""Additive 100-yen result overlays, filters and presentation: browser regression."""
import json
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread
from playwright.sync_api import sync_playwright,expect

ROOT=Path(__file__).resolve().parents[1]
URL="https://www.boatrace.jp/owpc/pc/race/raceresult?hd=20261116&jcd=12&rno=7"
with ThreadingHTTPServer(("127.0.0.1",0),partial(SimpleHTTPRequestHandler,directory=str(ROOT))) as http,sync_playwright() as pw:
    Thread(target=http.serve_forever,daemon=True).start()
    base=f"http://127.0.0.1:{http.server_port}/"
    browser=pw.chromium.launch(channel="chrome",args=["--no-sandbox"])
    for width in (390,1280):
        page=browser.new_page(viewport={"width":width,"height":850},timezone_id="Asia/Tokyo")
        errors=[]
        page.on("pageerror",lambda e:errors.append(str(e)))
        page.goto(base+"index.html?date=2026-11-16")
        panel=page.locator("#ochap-settle-controls")
        expect(panel).to_be_visible()
        expect(page.locator("#ochap-public-roles button")).to_have_count(6)
        original=page.locator("#cards article[id^='v']").first
        id=original.get_attribute("id")
        assert id and id.startswith("v") and "-r" in id
        hit=original.locator(":scope > .copy").evaluate("""node=>{
          const heading=[...node.children].find(x=>x.tagName==='H3'&&/^本線/.test(x.textContent.trim()));
          const raw=heading?.nextElementSibling?.querySelector('.ticket');
          return raw?.getAttribute('data-ticket') ||
            [...(raw?.querySelectorAll(':scope > .bnum')||[])].map(x=>x.textContent.trim()).join('-');
        }""")
        assert hit and len(hit.split("-"))==3,(id,hit)
        code=int(id.split("-r")[0][1:]);race=int(id.split("-r")[1])
        result={"venue_code":code,"race_no":race,"order":[int(x) for x in hit.split("-")],
                "trifecta_payout_yen":1820,"official_confirmed":True,
                "official_result_source_ref":URL,"refund_boats":[]}
        page.route("**/data/public-results/2026-11-16.json",
          lambda route:route.fulfill(status=200,content_type="application/json",
            body=json.dumps({"schema_version":"1.0","date":"2026-11-16","races":[result]})))
        page.locator("#ochap-settle-refresh").click()
        outcome=original.locator(":scope > .ochap-settle-bulletin")
        expect(outcome).to_contain_text("公式確認済み")
        expect(outcome).to_contain_text("🎯 的中")
        expect(outcome).to_contain_text("1,820円")
        page.get_by_label("平買い収支を表示").check()
        expect(outcome).to_contain_text("収支")
        page.get_by_label("結果で絞り込み").select_option("official")
        expect(page.locator("#cards article[id^='v']:not(.ochap-settle-filtered)")).to_have_count(1)
        page.get_by_label("結果で絞り込み").select_option("hits")
        expect(page.locator("#cards article[id^='v']:not(.ochap-settle-filtered)")).to_have_count(1)
        page.get_by_label("表示の詳しさ").select_option("simple")
        page.get_by_label("表示の詳しさ").select_option("detail")
        page.get_by_label("表示の詳しさ").select_option("normal")
        page.get_by_label("結果で絞り込み").select_option("all")
        expect(page.locator("#cards article[id^='v']:not(.ochap-settle-filtered)")).not_to_have_count(1)
        assert page.evaluate("document.documentElement.scrollWidth <= innerWidth")
        assert not errors,errors
        page.close()
    # Data must not be called official if it came only from the OpenAPI.
    page=browser.new_page(viewport={"width":390,"height":844},timezone_id="Asia/Tokyo")
    page.goto(base+"index.html?date=2026-11-16")
    id=page.locator("#cards article[id^='v']").first.get_attribute("id")
    result["venue_code"]=int(id.split("-r")[0][1:]);result["race_no"]=int(id.split("-r")[1])
    result["official_confirmed"]=False;result.pop("official_result_source_ref",None)
    result["result_status"]="API_REPORTED"
    result["result_source_ref"]="https://boatraceopenapi.github.io/api/v1/2026/20261116.json"
    result["refund_boats"]=None
    page.route("**/data/public-results/2026-11-16.json",
      lambda route:route.fulfill(status=200,content_type="application/json",
        body=json.dumps({"schema_version":"1.0","date":"2026-11-16","races":[result]})))
    page.locator("#ochap-settle-refresh").click()
    expect(page.locator("#cards article[id='"+id+"'] .ochap-settle-bulletin")).to_contain_text("API速報・公式未確認")
    page.get_by_label("結果で絞り込み").select_option("official")
    expect(page.locator("#cards article[id^='v']:not(.ochap-settle-filtered)")).to_have_count(0)
    page.close()
    browser.close()
    print("PASS: settlement accuracy, 100-yen finance, A/B/D toggles, official/API boundary, 390/1280.")
