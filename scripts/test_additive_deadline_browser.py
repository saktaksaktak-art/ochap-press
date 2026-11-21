#!/usr/bin/env python3
"""Additive-only browser checks for deadline boards and original newspaper."""
import json
from datetime import datetime, timezone, timedelta
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
JST = timezone(timedelta(hours=9))
FIXED = datetime(2026, 11, 21, 17, 0, tzinfo=JST)

def check_no_overflow(page):
    assert page.evaluate("document.documentElement.scrollWidth <= innerWidth"), "horizontal overflow"

def check_checkbox_caption(checkbox, label):
    # Measure the checkbox and its adjacent text glyph, not the full label width.
    gap = label.evaluate("""label => {
      const input = label.querySelector('input[type="checkbox"]');
      const text = [...label.childNodes].find(n => n.nodeType === Node.TEXT_NODE && n.textContent.trim());
      if (!input || !text) return null;
      const index = text.textContent.length - text.textContent.trimStart().length;
      const range = document.createRange();
      range.setStart(text,index);
      range.setEnd(text,text.textContent.length);
      const t = range.getBoundingClientRect(), b = input.getBoundingClientRect();
      return {gap:t.left-b.right, dy:Math.abs((t.top+t.bottom)/2-(b.top+b.bottom)/2),
              labelWidth:label.getBoundingClientRect().width};
    }""")
    assert gap is not None, "checkbox or caption missing"
    assert 0 <= gap['gap'] <= 16, f"{gap}: caption too far from checkbox"
    assert gap['dy'] <= 12, f"{gap}: checkbox/caption vertical misalignment"

with ThreadingHTTPServer(("127.0.0.1", 0),
                         partial(SimpleHTTPRequestHandler, directory=str(ROOT))) as http, sync_playwright() as pw:
    Thread(target=http.serve_forever, daemon=True).start()
    base = f"http://127.0.0.1:{http.server_port}/"
    browser = pw.chromium.launch(channel="chrome", args=["--no-sandbox"])

    for width in (390, 1280):
        page = browser.new_page(viewport={"width": width, "height": 850},
                                timezone_id="Asia/Tokyo")
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.clock.install(time=FIXED)
        page.goto(base+"deadline.html?date=2026-11-21")
        expect(page.locator("#board-status")).to_contain_text("未締切")
        expect(page.locator(".board-card")).not_to_have_count(0)
        page.get_by_role("combobox", name="開催場").select_option("12")
        cards = page.locator(".board-card")
        expect(cards).to_have_count(8)
        expect(cards.first.locator("h2")).to_have_text("住之江 5R")
        assert cards.filter(has_text="住之江 4R").count() == 0
        check_no_overflow(page)
        checkbox=page.get_by_label("締切済みも表示")
        check_checkbox_caption(checkbox, checkbox.locator(".."))
        checkbox.check()
        expect(cards).to_have_count(12)
        expect(cards.last.locator("h2")).to_have_text("住之江 4R")
        assert cards.first.locator(".board-time").inner_text().startswith("締切 ")
        page.goto(base+"m1.html?date=2026-11-21")
        expect(page.locator("#board-list")).to_contain_text("未掲載")
        expect(page.locator(".board-card")).to_have_count(0)
        page.goto(base+"index.html?date=2026-11-16&view=favorites")
        expect(page.locator("#ochap-public-roles button")).to_have_text([
            "予想","お気に入り場","特選レース","買い目一致","結果速報","記者比較"])
        page.get_by_role("button",name="徳山",exact=True).click()
        expect(page.locator(".favorite-race")).to_have_count(12)
        check_no_overflow(page)

        # Today's original Favorites: same cards, upcoming first, closed on demand.
        page.goto(base+"index.html?date=2026-11-21&view=favorites")
        finance=page.get_by_label("平買い収支を表示")
        check_checkbox_caption(finance, finance.locator(".."))
        fav=page.locator("#ochap-favorites-view")
        fav.get_by_role("button",name="住之江",exact=True).click()
        expect(fav.locator(".favorite-race")).to_have_count(8)
        expect(fav.locator(".favorite-race").first.locator("h3")).to_have_text("住之江 5R")
        expect(fav.locator(".favorite-time-controls a")).to_have_count(2)
        checkbox=fav.get_by_label("締切済みも表示")
        check_checkbox_caption(checkbox, checkbox.locator(".."))
        checkbox.check()
        expect(fav.locator(".favorite-race")).to_have_count(12)
        expect(fav.locator(".favorite-race").last.locator("h3")).to_have_text("住之江 4R")
        check_no_overflow(page)

        # Today's special races: preserve both original category filters and cards,
        # but show only pre-cutoff races until the user opts in to past cutoffs.
        page.goto(base+"index.html?date=2026-11-21&view=special")
        special=page.locator("#ochap-special-view")
        cards=special.locator(".special-card")
        closed_checkbox=special.get_by_label("締切済みも表示")
        expect(closed_checkbox).to_be_visible()
        check_checkbox_caption(closed_checkbox, closed_checkbox.locator(".."))
        expect(special.locator(".special-time-count")).to_contain_text("未締切")
        upcoming_count=cards.count()
        assert upcoming_count>0, "Expected upcoming special races at 17:00 JST"
        expect(cards.first.locator(".special-card-head > span")).to_contain_text("締切 ")
        closed_checkbox.check()
        all_count=cards.count()
        assert all_count>upcoming_count, (all_count,upcoming_count)
        expect(cards.nth(upcoming_count).locator(".special-card-head > span")).to_contain_text("締切済")
        # Existing category filter keeps working without hiding the new toggle.
        special.get_by_role("combobox",name="特選区分").select_option("special_teppan")
        expect(closed_checkbox).to_be_visible()
        special.get_by_role("combobox",name="特選区分").select_option("")
        # Open details survive an automatic reorder at a deadline.
        cards.first.locator("details > summary").click()
        assert cards.first.locator("details").get_attribute("open") is not None
        closed_checkbox.uncheck()
        page.clock.set_fixed_time(datetime(2026,11,21,21,0,tzinfo=JST))
        page.evaluate("document.dispatchEvent(new Event('visibilitychange'))")
        expect(cards).to_have_count(0)
        expect(special.locator(".special-time-count")).to_contain_text("未締切 0R")
        closed_checkbox.check()
        expect(cards).to_have_count(all_count)
        check_no_overflow(page)

        # Historical special editions must retain their original complete list and controls.
        page.goto(base+"index.html?date=2026-11-15&view=special")
        historical=page.locator("#ochap-special-view")
        expect(historical.locator(".special-card")).to_have_count(28)
        expect(historical.get_by_label("締切済みも表示")).to_have_count(0)
        check_no_overflow(page)
        assert not errors, (width, errors)
        page.close()

    # Confirm the M1 publication boundary in a standalone mocked sample.
    page = browser.new_page(viewport={"width":390,"height":844},timezone_id="Asia/Tokyo")
    page.clock.install(time=datetime(2026, 11, 21, 17, 10, tzinfo=JST))
    item={"race_id":"v12-r5","venue_code":12,"venue":"住之江","race_no":5,
          "deadline":"2026-11-21T17:15:00+09:00",
          "frozen_at_jst":"2026-11-21T17:03:00+09:00",
          "source_sha256":"a"*64,
          "marks":["1","6","3","4"],"method":"逃げ",
          "main":["1-6-3","1-3-6","1-6-4","1-3-4"],
          "reverse":["3-1-6"],"navi":["1-6-2"]}
    def serve_m1(route):
        route.fulfill(status=200, content_type="application/json",
                      body=json.dumps({"schema_version":"ochap.public.m1.v1",
                                       "date":"2026-11-21","races":[item]},ensure_ascii=False))
    page.route("**/data/m1/2026-11-21.json",serve_m1)
    page.goto(base+"m1.html?date=2026-11-21")
    expect(page.locator(".board-card")).to_have_count(1)
    expect(page.locator(".board-card .board-ticket")).to_have_count(6)
    check_no_overflow(page)
    page.close()

    # A forecast first recorded after the official cutoff must never be shown as predeadline M1.
    page = browser.new_page(viewport={"width":390,"height":844},timezone_id="Asia/Tokyo")
    page.clock.install(time=datetime(2026, 11, 21, 17, 10, tzinfo=JST))
    item["frozen_at_jst"]="2026-11-21T17:16:00+09:00"
    page.route("**/data/m1/2026-11-21.json",serve_m1)
    page.goto(base+"m1.html?date=2026-11-21")
    expect(page.locator(".board-card")).to_have_count(0)
    page.close()
    browser.close()
    print("PASS: 390px/1280px, JST deadline order, old favorites, upcoming/past special races, historical specials, M1 missing/valid/late.")
