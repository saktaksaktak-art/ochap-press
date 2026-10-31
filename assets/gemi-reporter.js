/* OchaP Press: optional Gemini reporter tab. Original OchaP markup remains untouched. */
(() => {
  'use strict';
  const title = document.querySelector('header#top > p')?.textContent || '';
  const dateMatch = title.match(/(\d{4})\/(\d{1,2})\/(\d{1,2})/);
  const issueDate = dateMatch ? `${dateMatch[1]}-${dateMatch[2].padStart(2,'0')}-${dateMatch[3].padStart(2,'0')}` : null;
  const articleNodes = Array.from(document.querySelectorAll('main article[id]'));
  if (!articleNodes.length) return;
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const list = (items) => Array.isArray(items) && items.length ? items.map(x => esc(x)).join(' ／ ') : '未登録';
  let records = {};
  const panes = new Map();
  function gemiContent(raceId) {
    const rec = records[raceId];
    // Never display drafts or unverified predictions as published reports.
    if (!rec || rec.status !== 'published' || !rec.freeze_at || !rec.source_ref) {
      return `<h3>Gemi兄記者の予想</h3><p class="ochap-gemi-status">このレースは原稿未登録です。</p>`;
    }
    const bets=rec.bets || {};
    const marks=rec.marks || {};
    const scenario=rec.scenarios || {};
    return `<h3>Gemi兄記者の予想</h3>
      <p class="lead">${esc(rec.reason || '解説未登録')}</p>
      <div class="ochap-gemi-grid">
        <div class="ochap-gemi-box"><h4>◎○▲△・決まり手</h4><p><b>◎</b> ${esc(marks.main || '—')}　<b>○</b> ${esc(marks.second || '—')}　<b>▲</b> ${esc(marks.third || '—')}　<b>△</b> ${esc(marks.fourth || '—')}</p><p>決まり手：${esc(rec.predicted_method || '—')}</p></div>
        <div class="ochap-gemi-box"><h4>本線3点</h4><div class="ochap-gemi-combos">${list(bets.main)}</div></div>
        <div class="ochap-gemi-box"><h4>逆張り</h4><div class="ochap-gemi-combos">${list(bets.reverse)}</div></div>
        <div class="ochap-gemi-box"><h4>舟券ナビ</h4><div class="ochap-gemi-combos">${list(bets.navi)}</div></div>
      </div>
      ${scenario.escape ? `<h4>①逃げ成立</h4><p>${esc(scenario.escape)}</p>` : ''}
      ${scenario.collapse ? `<h4>①逃げ崩壊</h4><p>${esc(scenario.collapse)}</p>` : ''}
      ${rec.st_comment ? `<h4>予想ST・スリット</h4><p>${esc(rec.st_comment)}</p>` : ''}
      ${rec.first_mark ? `<h4>1M展開</h4><p>${esc(rec.first_mark)}</p>` : ''}
      <p class="ochap-gemi-details">予想凍結：${esc(rec.freeze_at)} ／ 原本：${esc(rec.source_ref)}</p>`;
  }
  function reporterView(article, showGemi) {
    const info = panes.get(article);
    if (!info) return;
    for(const node of info.hideInGemi) node.hidden = showGemi;
    info.gemiPane.hidden = !showGemi;
    info.ochaButton.setAttribute('aria-pressed',String(!showGemi));
    info.gemiButton.setAttribute('aria-pressed',String(showGemi));
  }
  function setup(article) {
    const raceHead=article.querySelector(':scope > .race-head');
    if(!raceHead)return;
    const tabs=document.createElement('div');
    tabs.className='ochap-report-tabs';
    tabs.setAttribute('role','group');
    tabs.setAttribute('aria-label','記者の予想を切り替え');
    const ocha=document.createElement('button');ocha.type='button';ocha.textContent='🍵 お茶P記者';ocha.setAttribute('aria-pressed','true');
    const gemi=document.createElement('button');gemi.type='button';gemi.textContent='Gemi兄記者';gemi.setAttribute('aria-pressed','false');
    tabs.append(ocha,gemi);
    raceHead.insertAdjacentElement('afterend',tabs);
    const pane=document.createElement('section');pane.className='ochap-gemi-pane';pane.hidden=true;
    pane.innerHTML=gemiContent(article.id);
    tabs.insertAdjacentElement('afterend',pane);
    // Common factual tables (01/02) are kept visible on both tabs;
    // OchaP's commentary, forecast ST, diagrams and tickets stay in its own tab.
    const sharedSections=new Set(Array.from(article.querySelectorAll(':scope > section.section')).filter(section=>/^\s*0[12]\s/.test(section.querySelector('h3')?.textContent || '')));
    const hiddenNodes=Array.from(article.children).filter(x=>x!==raceHead && x!==tabs && x!==pane && !sharedSections.has(x));
    panes.set(article,{ochaButton:ocha,gemiButton:gemi,gemiPane:pane,hideInGemi:hiddenNodes});
    ocha.addEventListener('click',()=>reporterView(article,false));
    gemi.addEventListener('click',()=>reporterView(article,true));
  }
  articleNodes.forEach(setup);
  if(!issueDate) return;
  fetch(`./data/gemi/${issueDate}.json`,{cache:'no-store'})
    .then(resp=>resp.ok?resp.json():null)
    .then(data=>{
      if(!data || data.date!==issueDate || data.reporter!=='gemi' || typeof data.races!=='object' || Array.isArray(data.races))return;
      records=data.races;
      for(const [article,info] of panes){info.gemiPane.innerHTML=gemiContent(article.id)}
    })
    .catch(()=>{ /* Missing Gemini issue is displayed as 未登録. */ });
})();
