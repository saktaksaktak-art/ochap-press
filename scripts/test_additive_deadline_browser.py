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
        page.get_by_role("combobox", name="開催場").select_option("12")
        cards = page.locator(".board-card")
        expect(cards).to_have_count(8)
        expect(cards.first.locator("h2")).to_have_text("住之江 5R")
        assert cards.filter(has_text="住之江 4R").count() == 0
        check_no_overflow(page)
        page.get_by_label("締切済みも表示").check()
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
        assert not errors, (width, errors)
        page.close()

    # Confirm the M1 publication boundary in a standalone mocked sample.
    page = browser.new_page(viewport={"width":390,"height":844},timezone_id="Asia/Tokyo")
    page.clock.install(time=FIXED)
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
    page.clock.install(time=FIXED)
    item["frozen_at_jst"]="2026-11-21T17:16:00+09:00"
    page.route("**/data/m1/2026-11-21.json",serve_m1)
    page.goto(base+"m1.html?date=2026-11-21")
    expect(page.locator(".board-card")).to_have_count(0)
    page.close()
    browser.close()
    print("PASS: 390px/1280px, JST deadline order, closed toggle, old favorites, M1 missing/valid/late.")
