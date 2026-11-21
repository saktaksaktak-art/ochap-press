#!/usr/bin/env python3
"""Manual smartphone/tablet/desktop view: additive-only browser regression."""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
with ThreadingHTTPServer(("127.0.0.1", 0),
                         partial(SimpleHTTPRequestHandler, directory=str(ROOT))) as http, sync_playwright() as pw:
    Thread(target=http.serve_forever, daemon=True).start()
    base=f"http://127.0.0.1:{http.server_port}/"
    browser=pw.chromium.launch(channel="chrome", args=["--no-sandbox"])
    for width, mobile in ((390,True),(820,False),(1280,False)):
        context=browser.new_context(viewport={"width":width,"height":850},
                                    is_mobile=mobile,has_touch=mobile)
        page=context.new_page()
        errors=[]
        page.on("pageerror",lambda error: errors.append(str(error)))
        page.goto(base+"index.html?date=2026-11-16&view=favorites")
        expect(page.locator("#ochap-view-mode-entry select")).to_have_value("auto")
        expect(page.locator("#ochap-public-roles button")).to_have_count(6)
        assert page.evaluate("document.documentElement.scrollWidth<=innerWidth")
        page.get_by_label("表示モード",exact=True).select_option("mobile")
        page.wait_for_url("**/view-mode.html?*")
        expect(page.locator("#ochap-view-select")).to_have_value("mobile")
        frame=page.frame_locator("#ochap-view-frame")
        expect(frame.locator("#ochap-public-roles button")).to_have_count(6)
        assert page.evaluate("document.querySelector('#ochap-view-frame').contentWindow.innerWidth")==390
        assert frame.locator("#ochap-view-mode-entry").count()==0
        for selected,frame_width in (("tablet",820),("desktop",1280),("mobile",390)):
            page.get_by_label("表示モード",exact=True).select_option(selected)
            assert page.evaluate("document.querySelector('#ochap-view-frame').contentWindow.innerWidth")==frame_width
            assert page.evaluate("document.documentElement.scrollWidth<=innerWidth")
            assert page.evaluate("document.querySelector('#ochap-view-frame').contentWindow.matchMedia('(max-width:430px)').matches")==(selected=="mobile")
        # A viewport switch must not reload or discard the loaded edition and reader tabs.
        assert frame.locator("#ochap-public-roles button").count()==6
        page.reload()
        expect(frame.locator("#ochap-public-roles button")).to_have_count(6)
        page.get_by_label("表示モード",exact=True).select_option("auto")
        page.wait_for_url("**/index.html?*")
        expect(page.locator("#ochap-view-mode-entry select")).to_have_value("auto")
        assert "date=2026-11-16" in page.url and "view=favorites" in page.url
        assert not errors, (width,errors)
        context.close()
    # Board pages also expose the same switch without modifying their data/render logic.
    page=browser.new_page(viewport={"width":390,"height":844})
    page.goto(base+"deadline.html?date=2026-11-21")
    expect(page.locator("#ochap-view-mode-entry select")).to_have_value("auto")
    page.get_by_label("表示モード",exact=True).select_option("tablet")
    page.wait_for_url("**/view-mode.html?*")
    assert page.evaluate("document.querySelector('#ochap-view-frame').contentWindow.innerWidth")==820
    assert "deadline.html" in page.url
    page.get_by_label("表示モード",exact=True).select_option("auto")
    page.wait_for_url("**/deadline.html?*")
    page.goto(base+"m1.html?date=2026-11-21")
    expect(page.locator("#ochap-view-mode-entry select")).to_have_value("auto")
    page.close()
    browser.close()
    print("PASS: 390/820/1280 modes, persistence, auto restore, M0, deadline, M1, no default layout change.")
