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
    expect(page.locator("#ochap-public-roles button")).to_have_text(["予想","特選レース","買い目一致","結果速報","記者比較"])
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
    expect(page.locator(".lr-special-grid:visible .lr-category")).to_have_count(2)
    assert page.locator("#lr-list").evaluate("(list) => list.compareDocumentPosition(document.querySelector('#lr-high')) === Node.DOCUMENT_POSITION_FOLLOWING")
    page.get_by_role("button", name="特選レースのみ表示").click()
    expect(page.locator("#lr-list .lr-race")).to_have_count(12)
    expect(page.locator("#lr-list h3")).to_have_text("特選レース｜結果一覧")
    page.locator('details[data-drawer=high] > summary').click()
    expect(page.locator(".lr-compact table")).to_be_visible()
    assert page.evaluate("document.documentElement.scrollWidth <= innerWidth")
    assert page.locator(".lr-compact table").evaluate(
        "(table) => table.getBoundingClientRect().width <= table.parentElement.clientWidth + 1"
    )
    page.get_by_role("button", name="記者比較", exact=True).click()
    expect(page.locator(".ochap-score-compact")).to_be_visible()
    page.locator('details[data-drawer=categories] > summary').click()
    expect(page.locator(".ochap-score-by-group")).to_be_visible()
    expect(page.locator(".ochap-score-by-group .ochap-score-denom").first).to_be_visible()
    assert page.locator(".ochap-score-by-group").evaluate(
        "(t) => t.getBoundingClientRect().width < 700")
    assert page.evaluate("document.documentElement.scrollWidth <= innerWidth")
    page.get_by_role("button", name="買い目一致", exact=True).click()
    expect(page.locator("#ochap-consensus-view .public-number").filter(has_text="円")).to_be_visible()
    page.get_by_role("button", name="2連単", exact=True).click()
    expect(page.locator("#ochap-consensus-view .public-number").filter(has_text="円")).to_be_visible()

    if page.locator("script[src*=reader-jump]").count():
        expect(page.locator("body")).to_have_css("background-color", "rgb(247, 250, 255)")
        expect(page.locator('#ochap-public-roles [aria-pressed=true]')).to_have_css("background-color", "rgb(22, 63, 115)")
        page.locator("#ochap-jump-open").click()
        dialog = page.get_by_role("dialog", name="ページ内移動")
        expect(dialog).to_be_visible()
        dialog.get_by_role("button", name="一致レース一覧", exact=True).click()
        target = page.locator(".consensus-races")
        expect(target).to_be_focused()
        assert target.evaluate("(e) => e.getBoundingClientRect().top >= document.querySelector('#ochap-public-roles').getBoundingClientRect().bottom")
        page.locator("#ochap-jump-open").click()
        dialog.get_by_role("button", name="結果速報", exact=True).click()
        expect(page.locator(".lr-special-grid:visible")).to_be_visible()
        page.locator("#ochap-jump-open").click()
        dialog.get_by_role("button", name="特選レースの成績", exact=True).click()
        expect(page.locator(".lr-section:has(.lr-special-grid)")).to_be_focused()
        page.get_by_role("button", name="予想", exact=True).click()
        page.get_by_role("button", name="レース詳報", exact=True).click()
        page.locator("#ochap-jump-open").click()
        dialog.get_by_role("button", name="出走表・コース成績", exact=True).click()
        expect(page.locator(".compact-docket:visible > summary").first).to_be_focused()
        assert page.locator('.compact-forecast:visible').first.evaluate("""copy => {
          const picks=[...copy.querySelectorAll(':scope > h3')].map(x=>x.textContent);
          const details=[...copy.querySelectorAll(':scope > details > summary')].map(x=>x.textContent);
          const order=details.filter(x=>['出走表・コース成績','展開解説','ST・スリット'].includes(x));
          return /^本線/.test(picks[0]) && /^舟券ナビ/.test(picks[1]) && /^逆張り/.test(picks[2]) &&
            !!copy.querySelector(':scope > .tickets') && order.join('|')==='出走表・コース成績|展開解説|ST・スリット';
        }""")
        assert page.locator(".compact-forecast:visible .ticket").count() >= 10
        assert page.locator("summary:visible", has_text="01 出走表").first.evaluate("(e) => e.parentElement.open")
        expect(page.locator('article[id^="v"]:visible .ticket .b6').first).to_have_css("background-color", "rgb(37, 133, 91)")
        expect(page.locator('#ochap-issue-date')).to_be_visible()
        if page.locator('link[href*="navy-reader.css?v=2"]').count():
            source_summary = page.locator('article:visible details[data-rich-key$=":sources"] > summary').first
            expect(source_summary).to_have_text("05 データの母数・期間・取得日")
            expect(source_summary).to_be_hidden()
            expect(page.locator('article:visible details[data-rich-key$=":st"] > summary').first).to_be_visible()
            expect(page.locator('article:visible details[data-rich-key$=":notes"] > summary').first).to_be_visible()
            page.emulate_media(media="print")
            expect(source_summary).not_to_have_css("display", "none")
            page.emulate_media(media="screen")
        assert page.evaluate("document.documentElement.scrollWidth <= innerWidth")
        expect(page.locator('.compact-forecast:visible details[data-rich-key$=":st"]').first).not_to_have_attribute("open", "")
        page.locator('.compact-forecast:visible details[data-rich-key$=":st"] > summary').first.click()
        expect(page.locator('.compact-forecast:visible details[data-rich-key$=":st"] table').first).to_be_visible()
        gemi=page.get_by_role("button", name="全レースをGemi兄記者に切り替え")
        gemi.click()
        pane=page.locator(".ochap-gemi-pane:visible").first
        expect(pane.locator(".compact-gemi-detail")).to_have_count(2)
        assert pane.locator(".picks").evaluate("""p => {
          const labels=[...p.querySelectorAll('h3')].map(x=>x.textContent.trim());
          return labels.join('|')==='本線|舟券ナビ|逆張り';
        }""")
        page.locator("#ochap-jump-open").click()
        page.keyboard.press("Escape")
        expect(dialog).not_to_be_visible()

    if page.locator("script[src*=reader-course-copy]").count():
        page.goto(url + "2026-11-16")
        expect(page.locator("#ochap-public-roles button")).to_have_text(
            ["予想", "特選レース", "買い目一致", "結果速報", "記者比較"])
        first = page.locator("#v18-r1")
        expect(first).to_be_visible()
        first.locator(".compact-docket > summary").click()
        course = first.locator(".compact-docket > details").nth(1)
        expect(course.get_by_text("データなし", exact=True)).to_be_visible()
        expect(course.get_by_text("対象外", exact=True)).to_have_count(0)
        assert course.get_by_text("-", exact=True).count()
        assert course.get_by_text("未取得", exact=True).count()
        expect(course.get_by_text("保存元の連対率差分", exact=False)).to_have_count(0)
        expect(course.locator("th", has_text="2着%※")).to_have_count(0)
        expect(course.locator("th", has_text="2着%").first).to_be_visible()
        expect(page.locator("article h3:text-is('当地コース成績') + .table-scroll").first).to_be_attached()
        first.get_by_text("展開解説", exact=True).click()
        note = first.locator('details[data-rich-key$=":notes"] .rich-fragment')
        expect(note.get_by_text("全6艇の比較", exact=True)).to_be_visible()
        expect(note.get_by_text("朝刊の凍結原本と保存入力", exact=False)).to_have_count(0)

    page.goto(url + "2026-11-15&view=special")
    expect(cards).to_have_count(28)
    expect(cards.filter(has_text="🔥 妙味特選")).to_have_count(13)
    if page.locator("script[src*=reader-jump]").count():
        page.set_viewport_size({"width": 1280, "height": 900})
        page.locator("#ochap-jump-open").click()
        expect(page.get_by_role("dialog", name="ページ内移動")).to_be_visible()
        page.get_by_role("button", name="特選レース一覧", exact=True).click()
        expect(page.locator(".special-cards")).to_be_focused()
        assert page.evaluate("document.documentElement.scrollWidth <= innerWidth")
    assert not errors, errors
    print("PASS: 390×844 tabs, specials, section jumps, navy styling, unchanged boat colors, scorecard widths and historical edition")
