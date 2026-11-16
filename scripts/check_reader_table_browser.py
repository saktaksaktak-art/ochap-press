"""Exercise approved table CSS on a real edition plus a generated methods table."""
from pathlib import Path
import base64
import gzip
import subprocess

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
archive = ROOT / 'archives/2026-11-16.reader.html.gz.b64.txt'
html = gzip.decompress(base64.b64decode(archive.read_bytes())).decode()
style = (ROOT / 'assets/reader-table-layout.css').read_text()
script = (ROOT / 'assets/reader-table-layout.js').read_text()
example = subprocess.check_output(['node', '--input-type=module', '-e', """
import {renderReaderMethods} from './scripts/reader_methods.mjs';
const date='2026-11-17';
const boats=Array.from({length:6},(_,i)=>({boat:i+1,method:{
  sample_count:18+i,win_rates_pct:{nige:57.14,sashi:7.14+i,makuri:i,makurisashi:i<3?1.23:0},
  loss_rates_pct:{sasare:9.52,makurare:23.81,makuraresashi:9.52},nigashi_rate_pct:57.14}}));
const courses=boats.map((b,i)=>({...b.method,course:i+1,sample_count:27412+i}));
const group={status:'verified',source:'official_results',scope:'national',race_class:'all',
period_months:6,period_start:'2026-05-17',period_end:'2026-11-16',venue_count:24,courses};
console.log(renderReaderMethods({boats},date,{schema:'ochap.course-national-benchmark.v1',
as_of_date:date,groups:{all:{6:group}}},n=>'<span class="bnum">'+n+'</span>'));
"""], cwd=ROOT, text=True)

with sync_playwright() as pw:
    browser = pw.chromium.launch(channel='chrome', args=['--no-sandbox'])
    for width in (320, 390, 760):
        page = browser.new_page(viewport={'width':width,'height':820}, is_mobile=width<600)
        page.set_content(html.replace('</head>', '<style>'+style+'</style></head>'))
        page.evaluate("""() => {
          const first = document.querySelector('main article');
          for (const a of document.querySelectorAll('main article')) if(a !== first) a.remove();
          for (const d of first.querySelectorAll('details')) d.open=true;
        }""")
        page.evaluate("""markup => document.querySelector('main article .copy')
          .insertAdjacentHTML('beforeend', markup)""", example)
        page.add_script_tag(content=script)
        page.locator('[data-ochap-baseline-picker]').select_option('2')
        selected = page.locator('tr[data-ochap-baseline-course="2"]')
        assert selected.is_visible() and '照合中' in selected.inner_text()
        assert selected.locator('td').first.inner_text().endswith('27,413')
        page.locator('[data-ochap-baseline-picker]').select_option('1')
        assert page.locator('tr[data-ochap-baseline-course="1"]').is_visible()
        failures = page.evaluate("""() => {
          const problems=[];
          const visible = node => node.getClientRects().length > 0;
          for (const table of document.querySelectorAll('table')) if (visible(table)) {
            const parent = table.parentElement;
            const box = table.getBoundingClientRect();
            if (box.right > innerWidth + 1 || box.width > parent.clientWidth + 1)
              problems.push(['table',table.className,box.right,parent.clientWidth]);
            const cell = table.querySelector('th');
            if (cell && getComputedStyle(cell).borderRightStyle === 'none')
              problems.push(['no vertical rule',table.className]);
          }
          const count = document.querySelector('tr[data-ochap-baseline-course="1"] td');
          if (count.scrollWidth > count.clientWidth + 1) problems.push(['count clipped']);
          if (document.documentElement.scrollWidth > innerWidth + 1) problems.push(['page overflow']);
          return problems;
        }""")
        assert not failures, (width, failures)
        comparison = page.locator('table.rich-course').first
        assert comparison.is_visible()
        assert comparison.get_attribute('data-ochap-wide') is None
        assert comparison.locator('thead').evaluate("h => getComputedStyle(h).display === 'table-header-group'")
        assert comparison.locator('tbody tr').count() == 6
        assert comparison.locator('tbody tr').first.evaluate("r => getComputedStyle(r).display === 'table-row'")
        page.close()
    browser.close()
print('PASS: course comparison rows, table rules, and full national counts at 320/390/760 px')
