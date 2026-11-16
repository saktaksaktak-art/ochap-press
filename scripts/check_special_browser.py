#!/usr/bin/env python3
"""Mobile smoke test for the newspaper preview, using the runner's Chrome."""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread
from playwright.sync_api import expect, sync_playwright

ROOT = Path(__file__).resolve().parents[1]
handler = partial(SimpleHTTPRequestHandler, directory=str(ROOT))

with ThreadingHTTPServer(("127.0.0.1", 0), handler) as server, sync_playwright() as pw:
    Thread(target=server.serve_forever, daemon=True).start()
    url = f"http://127.0.0.1:{server.server_port}/?date="
    browser = pw.chromium.launch(channel="chrome", args=["--no-sandbox"])
    page = browser.new_page(viewport={"width": 390, "height": 844}, is_mobile=True,
                            has_touch=True, device_scale_factor=1, timezone_id="Asia/Tokyo")
    page.set_default_timeout(12000)
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))

    page.goto(url + "2026-11-16&view=special")
    cards = page.locator(".special-card")
    expect(cards).to_have_count(12)
    expect(cards.filter(has_text="🎯 鉄板特選")).to_have_count(6)
    expect(cards.filter(has_text="🔥 妙味特選")).to_have_count(6)
    top = page.locator("#ochap-public-roles button").evaluate_all(
        "(buttons) => buttons.map(b => b.getBoundingClientRect().top)")
    assert len(top) == 5 and len(set(top)) == 1, top
    assert page.evaluate("document.documentElement.scrollWidth <= innerWidth")
    page.get_by_role("combobox", name="特選区分").select_option("special_teppan")
    expect(cards).to_have_count(6)
    link = cards.first.get_by_role("link", name="レース詳報")
    race_id = link.get_attribute("href").split("#")[1]
    link.click()
    expect(page.locator(f"#{race_id} .special-badge").first).to_be_visible()

    page.get_by_role("button", name="結果速報", exact=True).click()
    expect(page.locator(".lr-special-grid .lr-category")).to_have_count(4)
    page.get_by_role("button", name="特選レースのみ表示").click()
    expect(page.locator("#lr-list .lr-race")).to_have_count(12)
    expect(page.locator("#lr-list h3")).to_have_text("特選レース｜結果一覧")
    expect(page.locator(".lr-compact table")).to_be_visible()
    assert page.evaluate("document.documentElement.scrollWidth <= innerWidth")
    assert page.locator(".lr-compact table").evaluate(
        "(table) => table.getBoundingClientRect().width <= table.parentElement.clientWidth + 1"
    )
    page.get_by_role("button", name="おちゃっぴー vs Gemini", exact=True).click()
    expect(page.locator(".ochap-score-by-group")).to_be_visible()
    expect(page.locator(".ochap-score-by-group .ochap-score-denom").first).to_be_visible()
    assert page.locator(".ochap-score-by-group").evaluate(
        "(t) => t.getBoundingClientRect().width < 700")
    assert page.evaluate("document.documentElement.scrollWidth <= innerWidth")
    page.get_by_role("button", name="お茶P Gemi兄　予想一致レース").click()
    expect(page.locator("#ochap-consensus-view .public-number").filter(has_text="円")).to_be_visible()
    page.get_by_role("button", name="2連単", exact=True).click()
    expect(page.locator("#ochap-consensus-view .public-number").filter(has_text="円")).to_be_visible()

    page.goto(url + "2026-11-15&view=special")
    expect(cards).to_have_count(28)
    expect(cards.filter(has_text="🔥 妙味特選")).to_have_count(13)
    assert not errors, errors
    print("PASS: 390×844 tabs, specials, details link, bulletin filter, scorecard widths and historical edition")
