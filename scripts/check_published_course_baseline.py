"""Open the real reader entry point and verify the published edition renders the baseline."""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
from threading import Thread
from playwright.sync_api import expect, sync_playwright

root = Path(__file__).resolve().parents[1]
date = '2026-11-16'
data = json.loads((root / f'data/course-national/{date}.json').read_text())
with ThreadingHTTPServer(('127.0.0.1',0), partial(SimpleHTTPRequestHandler,directory=str(root))) as server:
    Thread(target=server.serve_forever,daemon=True).start()
    with sync_playwright() as p:
        browser = p.chromium.launch(channel='chrome',args=['--no-sandbox'])
        for width in (320,390):
            page = browser.new_page(viewport={'width':width,'height':844},is_mobile=True,has_touch=True)
            page.goto(f'http://127.0.0.1:{server.server_port}/?date={date}')
            expect(page.locator('#v18-r1 .ochap-method-table')).to_be_attached(timeout=15000)
            for r,scope in (('v18-r1','all'),('v11-r1','sg_g1')):
                race = page.locator('#'+r)
                docket = race.locator('.compact-docket > summary')
                expect(docket).to_be_visible()
                docket.click()
                summary = race.locator('summary',has_text='決まり手').first
                if not summary.evaluate('node=>node.parentElement.open'): summary.click()
                table = race.locator('.ochap-method-table')
                expect(table).to_be_visible()
                expect(table.locator('thead th')).to_have_count(6)
                course = race.locator('table.ochap-grade-course' if scope=='sg_g1' else 'table.rich-course').first
                expect(course).to_be_visible()
                expect(course.locator('tbody tr')).to_have_count(6)
                assert course.evaluate("""t => {
                    const body=t.tBodies[0], first=body.rows[0], last=body.rows[5];
                    const box=t.getBoundingClientRect(), parent=t.parentElement.getBoundingClientRect();
                    return !t.hasAttribute('data-ochap-wide') &&
                      getComputedStyle(t.tHead).display==='table-header-group' &&
                      getComputedStyle(first).display==='table-row' &&
                      first.cells[1].getBoundingClientRect().left===last.cells[1].getBoundingClientRect().left &&
                      box.width<=parent.width+1 && box.right<=innerWidth+1 && t.scrollWidth<=t.clientWidth+1 &&
                      getComputedStyle(first.cells[1]).borderRightStyle==='solid';
                }""")
                if scope=='all':
                    expect(course.locator('tbody tr').nth(0)).to_contain_text('山下 友貴')
                    expect(course.locator('tbody tr').nth(1)).to_contain_text('本橋 克洋')
                    expect(course.locator('tbody tr').nth(2)).to_contain_text('生方 靖亜')
                    expect(course.locator('tbody tr').first.locator('td').nth(1)).to_have_text('20')
                    expect(course.locator('tbody tr').first.locator('td').nth(2)).to_have_text('55.01位')
                    expect(course.locator('tbody tr').nth(1).locator('td').nth(2)).to_have_text('7.1')
                    expect(course.locator('tbody tr').nth(1).locator('td').nth(3)).to_have_text('0.0')
                    expect(course.locator('tbody tr').first.locator('td').nth(7)).to_have_text('0.151位')
                    expect(course.locator('td.rank1').first).to_have_css('background-color','rgb(255, 223, 184)')
                    expect(course.locator('td.rank2').first).to_have_css('background-color','rgb(229, 237, 247)')
                first = data['groups'][scope]['6']['courses'][0]
                row = table.locator('tfoot tr:visible')
                expect(row).to_contain_text(f"{first['sample_count']:,}")
                expect(row).to_contain_text(f"{first['win_rates_pct']['nige']}%")
                if scope=='sg_g1':
                    expect(race.locator('.ochap-grade-course tbody td').first).not_to_have_text('未取得')
                    assert course.evaluate(r"""t => {
                        const rates=[...t.tBodies[0].rows].flatMap(r=>[...r.cells].slice(2,5))
                          .map(c=>c.firstChild.textContent.trim()).filter(v=>v!=='未取得');
                        return rates.length>0 && rates.every(v=>/^\d+\.\d$/.test(v));
                    }""")
                race.locator('[data-ochap-baseline-picker]').select_option('2')
                if scope=='sg_g1':
                    reference = data['groups'][scope]['6']['nigashi_reference']
                    expect(row).to_contain_text('逃し（参考）')
                    expect(row).to_contain_text(f"{reference['rate_pct']:g}%")
                    expect(table.locator('tbody tr').nth(1)).to_contain_text('全国参考')
                    expect(table.locator('tbody tr').nth(1)).to_contain_text(f"{reference['rate_pct']:g}%")
                else:
                    expect(row).to_contain_text('照合中')
                    expect(table.locator('tbody tr').nth(1)).not_to_contain_text('全国参考')
                assert table.evaluate("""t => {
                    const h=t.querySelector('th'), c=getComputedStyle(h);
                    return c.borderRightStyle==='solid' && c.borderRightColor==='rgb(143, 163, 189)' &&
                      t.getBoundingClientRect().width<=t.parentElement.clientWidth+1 &&
                      document.documentElement.scrollWidth<=innerWidth+1;
                }""")
            page.close()
        browser.close()
