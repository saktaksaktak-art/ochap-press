/* OchaP Press: optional Gemini reporter tab (v1.1). Original OchaP markup remains untouched. */
(() => {
  'use strict';
  const title = document.querySelector('header#top > p')?.textContent || '';
  const dateMatch = title.match(/(\d{4})\/(\d{1,2})\/(\d{1,2})/);
  const issueDate = dateMatch ? `${dateMatch[1]}-${dateMatch[2].padStart(2,'0')}-${dateMatch[3].padStart(2,'0')}` : null;
  const articleNodes = Array.from(document.querySelectorAll('main article[id]'));
  if (!articleNodes.length) return;
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const list = (items, emptyText = '未登録') => Array.isArray(items) && items.length ? items.map(x => esc(x)).join(' ／ ') : emptyText;
  let records = {};
  let sharedInputMeta = null;
  let retrospectiveMode = false;
  const panes = new Map();

  function renderIndependentSvg(diagram) {
    if (!diagram || diagram.chatgpt_diagram_reused !== false || !Array.isArray(diagram.boats) || diagram.boats.length !== 6) {
      return '';
    }
    const boatColors = {
      '1': {fill: '#ffffff', stroke: '#222222', text: '#111111'},
      '2': {fill: '#222222', stroke: '#111111', text: '#ffffff'},
      '3': {fill: '#d62828', stroke: '#9e1b1b', text: '#ffffff'},
      '4': {fill: '#1d4ed8', stroke: '#1e3a8a', text: '#ffffff'},
      '5': {fill: '#eab308', stroke: '#a16207', text: '#111111'},
      '6': {fill: '#15803d', stroke: '#14532d', text: '#ffffff'}
    };
    const slitX = 230;
    const markX = 560;
    const markY = 108;
    const rowsSvg = diagram.boats.map((b, idx) => {
      const y = 30 + idx * 28;
      const offsetPx = Math.max(-55, Math.min(55, Number(b.slit_offset_m || 0) * 6.5));
      const bx = slitX + offsetPx;
      const col = boatColors[String(b.boat)] || boatColors['1'];
      const isMain = String(b.boat) === String(diagram.main_boat);
      const isSecond = String(b.boat) === String(diagram.second_boat);
      const targetY = isMain ? markY - 18 : (isSecond ? markY + 4 : y);
      const ctrlX = isMain ? markX - 40 : markX - 85;
      const strokeW = isMain ? '2.6' : (isSecond ? '1.9' : '1.1');
      const dash = isMain || isSecond ? '' : 'stroke-dasharray="4 3"';
      return `<g>
        <text x="12" y="${y + 4}" font-size="11" fill="#2c4237" font-weight="700">${esc(b.course)}C</text>
        <path d="M ${bx + 14} ${y} Q ${ctrlX} ${y}, ${markX - 28} ${targetY}" fill="none" stroke="${col.stroke}" stroke-width="${strokeW}" ${dash} opacity="${isMain || isSecond ? '0.9' : '0.45'}"/>
        <rect x="${bx - 12}" y="${y - 9}" width="24" height="18" rx="4" fill="${col.fill}" stroke="${col.stroke}" stroke-width="1.5"/>
        <text x="${bx}" y="${y + 4}" font-size="11" text-anchor="middle" fill="${col.text}" font-weight="800">${esc(b.boat)}</text>
        <text x="${bx + 18}" y="${y + 4}" font-size="10.5" fill="#174a37">${esc(b.st_display || '')} ${esc(b.motivation_label || '')}</text>
      </g>`;
    }).join('');

    return `<div class="ochap-gemi-diagram">
      <h4>Gemi兄 独立スリット・1M展開図（◎${esc(diagram.main_boat)}号艇 ${esc(diagram.predicted_method || '')}）</h4>
      <svg viewBox="0 0 680 205" role="img" aria-label="Gemi兄記者 独立スリット・1M展開図">
        <rect x="0" y="0" width="680" height="205" rx="6" fill="#eef6f2" stroke="#b5c9bd"/>
        <line x1="${slitX}" y1="12" x2="${slitX}" y2="192" stroke="#b04b39" stroke-width="1.5" stroke-dasharray="5 3"/>
        <text x="${slitX}" y="11" font-size="10" text-anchor="middle" fill="#b04b39" font-weight="700">SLIT</text>
        <circle cx="${markX}" cy="${markY}" r="14" fill="#ea580c" stroke="#9a3412" stroke-width="2"/>
        <text x="${markX}" y="${markY + 4}" font-size="10" text-anchor="middle" fill="#ffffff" font-weight="800">1M</text>
        ${rowsSvg}
      </svg>
    </div>`;
  }

  function gemiContent(raceId) {
    const rec = records[raceId];
    // Never display drafts, unverified predictions, or mismatched shared input hashes as published reports.
    if (!rec || rec.status !== 'published' || !rec.freeze_at || !rec.source_ref) {
      return `<h3>Gemi兄記者の予想</h3><p class="ochap-gemi-status">このレースは原稿未登録です。</p>`;
    }
    if (sharedInputMeta && sharedInputMeta.sha256 && rec.input_sha256 && rec.input_sha256 !== sharedInputMeta.sha256) {
      return `<h3>Gemi兄記者の予想</h3><p class="ochap-gemi-status">共通入力ハッシュ不一致のため表示を停止しました。</p>`;
    }
    const bets = rec.bets || {};
    const marks = rec.marks || {};
    const scenario = rec.scenarios || {};
    const naviDetails = rec.navi_details || {};
    const naviEmpty = naviDetails.status === 'not_recommended' ? '推奨不成立（見送り）' : '未登録';
    const naviAimHtml = naviDetails.aim_label ? `<p class="ochap-gemi-aim">${esc(naviDetails.aim_label)}</p>` : '';
    const sharedBadge = sharedInputMeta && sharedInputMeta.snapshot_id
      ? ` ／ 共通入力：${esc(sharedInputMeta.snapshot_id)} (SHA256:${esc(String(sharedInputMeta.sha256 || '').slice(0, 12))}…)`
      : '';
    return `<h3>Gemi兄記者の予想</h3>
      ${retrospectiveMode ? '<p class="ochap-gemi-status">事後検証テスト（締切後生成・実戦M0ではありません）</p>' : ""}
      <p class="lead">${esc(rec.reason || '解説未登録')}</p>
      <div class="ochap-gemi-grid">
        <div class="ochap-gemi-box"><h4>◎○▲△・決まり手</h4><p><b>◎</b> ${esc(marks.main || '—')}　<b>○</b> ${esc(marks.second || '—')}　<b>▲</b> ${esc(marks.third || '—')}　<b>△</b> ${esc(marks.fourth || '—')}</p><p>決まり手：${esc(rec.predicted_method || '—')}</p></div>
        <div class="ochap-gemi-box"><h4>本線3点</h4><div class="ochap-gemi-combos">${list(bets.main)}</div></div>
        <div class="ochap-gemi-box"><h4>逆張り</h4><div class="ochap-gemi-combos">${list(bets.reverse)}</div></div>
        <div class="ochap-gemi-box"><h4>舟券ナビ</h4><div class="ochap-gemi-combos">${list(bets.navi, naviEmpty)}</div>${naviAimHtml}</div>
      </div>
      ${scenario.escape ? `<h4>①逃げ成立</h4><p>${esc(scenario.escape)}</p>` : ''}
      ${scenario.collapse ? `<h4>①逃げ崩壊</h4><p>${esc(scenario.collapse)}</p>` : ''}
      ${rec.st_comment ? `<h4>予想ST・スリット</h4><p>${esc(rec.st_comment)}</p>` : ''}
      ${rec.first_mark ? `<h4>1M展開</h4><p>${esc(rec.first_mark)}</p>` : ''}
      ${renderIndependentSvg(rec.diagram_spec)}
      <p class="ochap-gemi-details">予想凍結：${esc(rec.freeze_at)} ／ 原本：${esc(rec.source_ref)}${sharedBadge}</p>`;
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
      sharedInputMeta = (data.shared_input && typeof data.shared_input === 'object') ? data.shared_input : null;
      retrospectiveMode = data.execution_mode === 'retrospective_m0_shared_input_verification';
      records=data.races;
      for(const [article,info] of panes){info.gemiPane.innerHTML=gemiContent(article.id)}
    })
    .catch(()=>{ /* Missing Gemini issue is displayed as 未登録. */ });
})();
