/* OchaP Press: Gemini reporter tab (v1.2.3)
 * - Compatible with date-restore-20261101 (window.__OCHAP_SELECTED_DATE__) & reader-three-views-20261101
 * - Neutralizes shared Section 02 heading while in Gemi兄 tab (Gate 5)
 * - Enforces shared_input.sha256 match, retrospective vs pre-deadline M0 labeling, and missed_cutoff handling (Gates 1, 3, 4)
 * - Renders boat colors (.boat.b1..b6), Gemi兄 independent Slit SVG, and Gemi兄 independent 1M Turn SVGs
 * - Original OchaP markup remains untouched.
 */
(() => {
  'use strict';
  const title = document.querySelector('header#top > p')?.textContent || '';
  const dateMatch = title.match(/(\d{4})\/(\d{1,2})\/(\d{1,2})/);
  const parsedHeaderDate = dateMatch ? `${dateMatch[1]}-${dateMatch[2].padStart(2,'0')}-${dateMatch[3].padStart(2,'0')}` : null;
  const issueDate = (typeof window.__OCHAP_SELECTED_DATE__ === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(window.__OCHAP_SELECTED_DATE__))
    ? window.__OCHAP_SELECTED_DATE__
    : parsedHeaderDate;
  const articleNodes = Array.from(document.querySelectorAll('main article[id]'));
  if (!articleNodes.length) return;

  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));

  const BOAT_PALETTE = {
    1: { fill: '#fffdf2', text: '#173d30', stroke: '#405b4c' },
    2: { fill: '#26302c', text: '#ffffff', stroke: '#405b4c' },
    3: { fill: '#d24048', text: '#ffffff', stroke: '#405b4c' },
    4: { fill: '#286db2', text: '#ffffff', stroke: '#405b4c' },
    5: { fill: '#e5bd29', text: '#233b2f', stroke: '#405b4c' },
    6: { fill: '#25855b', text: '#ffffff', stroke: '#405b4c' },
  };

  function boatBadge(num) {
    const n = String(num ?? '').trim();
    if (/^[1-6]$/.test(n)) {
      return `<span class="boat b${n}">${n}</span>`;
    }
    return esc(n || '—');
  }

  function renderCombo(comboStr) {
    const raw = String(comboStr ?? '').trim();
    const parts = raw.split('-');
    if (parts.length === 3) {
      const p0 = /^[1-6]$/.test(parts[0]) ? boatBadge(parts[0]) : esc(parts[0]);
      const p1 = /^[1-6]$/.test(parts[1]) ? boatBadge(parts[1]) : esc(parts[1]);
      const p2 = /^[1-6]$/.test(parts[2]) ? boatBadge(parts[2]) : esc(parts[2]);
      return `<div class="combo">${p0}<span class="ticket-dash">-</span>${p1}<span class="ticket-dash">-</span>${p2}</div>`;
    }
    return `<div class="combo">${esc(raw)}</div>`;
  }

  function renderComboList(items, emptyLabel = '未登録') {
    if (!Array.isArray(items) || !items.length) {
      return `<span class="note">${esc(emptyLabel)}</span>`;
    }
    return items.map(renderCombo).join('');
  }

  function renderRankChain(arr) {
    if (!Array.isArray(arr) || !arr.length) return '—';
    return arr.map(b => boatBadge(b)).join(' › ');
  }

  function formatAxisInline(axisStr) {
    if (!axisStr) return '<span class="note">見送り</span>';
    const p = String(axisStr).split('-');
    if (p.length === 3) {
      return `${boatBadge(p[0])}<span class="ticket-dash">-</span>${boatBadge(p[1])}<span class="ticket-dash">-</span>${esc(p[2])}`;
    }
    return esc(axisStr);
  }

  // Build Gemi兄's independent Slit SVG (viewBox 0 0 720 410)
  function buildGemiSlitSvg(raceTitle, slitCourses) {
    if (!Array.isArray(slitCourses) || slitCourses.length !== 6) return '';
    const rowsSvg = slitCourses.map((row, idx) => {
      const yRect = 44 + idx * 55;
      const yCenter = yRect + 23;
      const yText = yRect + 29;
      const bNo = Number(row.boat) || (idx + 1);
      const pal = BOAT_PALETTE[bNo] || BOAT_PALETTE[1];
      const offset = Math.max(-46, Math.min(46, Number(row.offset_px) || 0));
      const xBoat = (425 + offset).toFixed(1);
      const stTxt = row.c_st && row.c_st !== '未取得' ? `C平均 ${row.c_st}` : `全国 ${row.off_st || '—'}`;
      return `
        <rect x="252" y="${yRect}" width="330" height="46" rx="4" fill="#e0eadd"/>
        <line x1="363" y1="${yRect}" x2="363" y2="${yRect+46}" stroke="#c6d6bf" stroke-dasharray="3 3"/>
        <line x1="394" y1="${yRect}" x2="394" y2="${yRect+46}" stroke="#c6d6bf" stroke-dasharray="3 3"/>
        <line x1="425" y1="${yRect}" x2="425" y2="${yRect+46}" stroke="#88a896" stroke-width="1.4" stroke-dasharray="4 2"/>
        <line x1="456" y1="${yRect}" x2="456" y2="${yRect+46}" stroke="#c6d6bf" stroke-dasharray="3 3"/>
        <line x1="487" y1="${yRect}" x2="487" y2="${yRect+46}" stroke="#c6d6bf" stroke-dasharray="3 3"/>
        <text x="20" y="${yText}" font-size="16" font-weight="800" fill="#174a37">${esc(row.course)}C</text>
        <text x="62" y="${yText}" font-size="17" font-weight="700" fill="#264635">${esc(row.name)}</text>
        <text x="188" y="${yText}" font-size="12" fill="#526e61">${esc(stTxt)}</text>
        <g transform="translate(${xBoat} ${yCenter})">
          <path d="M-23 -14H9Q21 -14 31 0Q21 14 9 14H-23Z" fill="${pal.fill}" stroke="${pal.stroke}" stroke-width="1.6"/>
          <text x="1" y="7" text-anchor="middle" font-size="20" font-weight="800" fill="${pal.text}">${bNo}</text>
        </g>
        <text x="596" y="${yText - 1}" font-size="15" font-weight="700" fill="#3c6147">${esc(row.label || '同体圏')}</text>`;
    }).join('');

    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 720 410" role="img" aria-label="${esc(raceTitle)} Gemi兄予想スリット隊形">
      <style>text{font-family:system-ui,-apple-system,sans-serif}</style>
      <rect width="720" height="410" rx="12" fill="#f4f5e9"/>
      <text x="18" y="30" font-size="13" font-weight="700" fill="#5b7360">進入</text>
      <text x="62" y="30" font-size="13" font-weight="700" fill="#5b7360">艇・選手（Gemi兄独自評価）</text>
      <text x="188" y="30" font-size="13" font-weight="700" fill="#5b7360">基準ST</text>
      <text x="262" y="30" font-size="13" font-weight="700" fill="#5b7360">後手</text>
      <text x="408" y="30" font-size="12" font-weight="700" fill="#3c6147">標準スリット</text>
      <text x="525" y="30" font-size="13" font-weight="700" fill="#5b7360">先行 →</text>
      <text x="596" y="30" font-size="13" font-weight="700" fill="#5b7360">相対的な読み</text>
      ${rowsSvg}
    </svg>`;
  }

  // Build Gemi兄's independent 1M Turn Trajectory SVG (viewBox 0 0 560 465)
  function buildGemi1MSvg(raceTitle, branchTitle, branchSpec, entryOrder) {
    if (!branchSpec || !branchSpec.winner) return '';
    const winner = Number(branchSpec.winner);
    const method = String(branchSpec.method || '逃げ');
    const order2 = Array.isArray(branchSpec.order_2nd) ? branchSpec.order_2nd.map(Number) : [];
    const fullOrder = [winner, ...order2.filter(b => b !== winner)];
    for (let b = 1; b <= 6; b++) {
      if (!fullOrder.includes(b)) fullOrder.push(b);
    }

    const courses = Array.isArray(entryOrder) && entryOrder.length === 6 ? entryOrder.map(Number) : [1, 2, 3, 4, 5, 6];
    const rankIndex = new Map();
    fullOrder.forEach((b, idx) => rankIndex.set(b, idx));

    const pathsSvg = [];
    const boatsSvg = [];

    courses.forEach((bNo, cIdx) => {
      const yStart = 301.24 + cIdx * 20.24;
      const rnk = rankIndex.get(bNo) ?? cIdx;
      const isWinner = (bNo === winner);
      const pal = BOAT_PALETTE[bNo] || BOAT_PALETTE[1];

      let xApex = 362 + cIdx * 19;
      let yEnd = 165 - cIdx * 18;
      if (isWinner) {
        if (method === '逃げ') {
          xApex = 358;
          yEnd = 168.5;
        } else if (method === '差し') {
          xApex = 370;
          yEnd = 164.0;
        } else if (method === 'まくり差し') {
          xApex = 384;
          yEnd = 156.0;
        } else {
          xApex = 418;
          yEnd = 104.0;
        }
      } else if (bNo === 1 && winner !== 1) {
        if (method === 'まくり') {
          xApex = 374;
          yEnd = 142.0;
        } else {
          xApex = 376;
          yEnd = 136.0;
        }
      } else {
        yEnd = 160 - cIdx * 16 + (rnk - cIdx) * 4;
        yEnd = Math.max(66, Math.min(176, yEnd));
      }

      const xBoatByRank = [68, 128, 178, 224, 258, 284][rnk] || 240;
      const xLineEnd = Math.max(44, xBoatByRank - 22);

      const cp1x = (286 + (xApex - 286) * 0.92).toFixed(1);
      const cp2x = xApex.toFixed(1);
      const dPath = `M36 ${yStart.toFixed(1)} L286 ${yStart.toFixed(1)} C${cp1x} ${yStart.toFixed(1)} ${cp2x} ${(yStart - 18).toFixed(1)} ${cp2x} 235.0 C${cp2x} ${(yEnd + 18).toFixed(1)} ${cp1x} ${yEnd.toFixed(1)} 286 ${yEnd.toFixed(1)} L${xLineEnd.toFixed(1)} ${yEnd.toFixed(1)}`;

      const outlineW = isWinner ? '8.4' : '5.5';
      const mainW = isWinner ? '5.8' : '3.1';
      const outlineColor = bNo === 1 ? '#889f98' : '#ffffff';

      pathsSvg.push(
        `<path d="${dPath}" fill="none" stroke="${outlineColor}" stroke-width="${outlineW}" stroke-linecap="round"/>`,
        `<path d="${dPath}" fill="none" stroke="${pal.fill}" stroke-width="${mainW}" stroke-linecap="round"/>`,
        `<path d="M${xApex.toFixed(1)} 235.0 L${(xApex + 4.7).toFixed(1)} 242.7 L${(xApex - 4.7).toFixed(1)} 242.7 Z" fill="${pal.fill}" stroke="#526f66" stroke-width="0.6"/>`
      );

      boatsSvg.push(
        `<g transform="translate(${xBoatByRank.toFixed(1)} ${yEnd.toFixed(1)})">
          <path transform="rotate(180)" d="M-23 -14H9Q21 -14 31 0Q21 14 9 14H-23Z" fill="${pal.fill}" stroke="${pal.stroke}" stroke-width="${isWinner ? '2.2' : '1.5'}"/>
          <text x="1" y="7" text-anchor="middle" font-size="21" font-weight="800" fill="${pal.text}">${bNo}</text>
        </g>`
      );
    });

    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 560 465" role="img" aria-label="${esc(raceTitle)} ${esc(branchTitle)}">
      <style>text{font-family:system-ui,-apple-system,sans-serif}</style>
      <rect width="560" height="465" rx="12" fill="#dfedf0"/>
      <text x="18" y="28" font-size="13" font-weight="700" fill="#2c5446">Gemi兄 独自1M展開図｜${esc(branchTitle)}（1着：${winner}号艇 ${esc(method)}）</text>
      ${pathsSvg.join('')}
      ${boatsSvg.join('')}
      <circle cx="286" cy="235" r="15" fill="#fff5eb" stroke="#b54b43" stroke-width="1.5"/>
      <path d="M286 215L276 246H296Z" fill="#d54a45"/>
      <text x="250" y="275" font-size="13" font-weight="700" fill="#526e68">1マーク</text>
    </svg>`;
  }

  let records = {};
  let issueMeta = {};
  let sharedInputMeta = null;
  const panes = new Map();

  function resolveRaceRecord(raceId) {
    if (!raceId) return null;
    if (records[raceId]) return records[raceId];
    const m = String(raceId).match(/^v0*(\d+)-r0*(\d+)$/i);
    if (m) {
      const norm = `v${Number(m[1])}-r${Number(m[2])}`;
      if (records[norm]) return records[norm];
    }
    return null;
  }

  function modeBadgeText(rec) {
    if (rec?.m0_status === 'LATE_RECOVERED_REFERENCE_NOT_FROZEN_M0' || issueMeta?.m0_status === 'LATE_RECOVERED_REFERENCE_NOT_FROZEN_M0') {
      if (rec?.frozen_before_race_closing === true) {
        return '【緊急復旧参照予想：09:17 JST遅延取得（07:00前正式M0対象外・当該R締切前凍結／日和不足238名は未取得明記）】';
      }
      return '【締切後・緊急復旧参照検証：09:17 JST遅延取得（07:00前正式M0/実戦集計対象外）】';
    }
    const isRetro = Boolean(
      rec?.retrospective === true ||
      issueMeta?.retrospective === true ||
      issueMeta?.execution_mode === 'retrospective_m0_input_test' ||
      String(issueMeta?.execution_mode || '').includes('retrospective')
    );
    if (isRetro) {
      return '【事後検証：共通M0入力固定テスト（締切前実戦M0・vs集計対象外）】';
    }
    if (rec?.published_before_cutoff === true) {
      return '【当日締切前M0凍結】';
    }
    return '【M0予想原稿】';
  }

  function gemiQuickBanner(raceId) {
    const rec = resolveRaceRecord(raceId);
    if (!rec) {
      return `<div class="ochap-gemi-quickbar"><b>✦ Gemi兄記者</b>：このレースは原稿未登録です。</div>`;
    }
    if (rec.status === 'missed_cutoff') {
      return `<div class="ochap-gemi-quickbar"><b>✦ Gemi兄記者</b>：締切前M0凍結に間に合わなかったため欠測（事後予想非掲載）です。</div>`;
    }
    if (rec.status !== 'published' || !rec.freeze_at || !rec.source_ref) {
      return `<div class="ochap-gemi-quickbar"><b>✦ Gemi兄記者</b>：このレースは原稿未登録です。</div>`;
    }
    if (sharedInputMeta && sharedInputMeta.sha256 && rec.input_sha256 && rec.input_sha256 !== sharedInputMeta.sha256) {
      return `<div class="ochap-gemi-quickbar"><b>✦ Gemi兄記者</b>：共通入力SHA-256不一致のため表示を停止しました。</div>`;
    }
    const marks = rec.marks || {};
    const bets = rec.bets || {};
    const diag = rec.diagrams || {};
    const revSummary = diag.reverse_summary || {};
    const naviDetails = rec.navi_details || {};
    return `<div class="ochap-gemi-quickbar">
      <div class="ochap-gemi-quickrow">
        <span><b>✦ Gemi兄 印</b>：<b>◎</b> ${boatBadge(marks.main)}　<b>○</b> ${boatBadge(marks.second)}　<b>▲</b> ${boatBadge(marks.third)}　<b>△</b> ${boatBadge(marks.fourth)}</span>
        <span><b>決まり手</b>：${boatBadge(marks.main)} <b>${esc(rec.predicted_method || '—')}</b></span>
        <span><b>本線3点</b>：${renderComboList(bets.main)}</span>
        <span><b>逆張り</b>：${formatAxisInline(revSummary.axis || (Array.isArray(bets.reverse) && bets.reverse[0] ? bets.reverse[0].slice(0,3)+'-流' : ''))}</span>
        <span><b>舟券ナビ</b>：${naviDetails.status === 'recommended' ? formatAxisInline(naviDetails.axis || (Array.isArray(bets.navi) && bets.navi[0] ? bets.navi[0].slice(0,3)+'-流' : '')) : '<span class="note">見送り</span>'}</span>
        <span class="note">${esc(modeBadgeText(rec))}</span>
      </div>
    </div>`;
  }

  function gemiContent(raceId, article) {
    const rec = resolveRaceRecord(raceId);
    if (!rec) {
      return `<section class="section"><h3>Gemi兄記者の予想</h3><p class="ochap-gemi-status">このレースは原稿未登録です。</p></section>`;
    }
    if (rec.status === 'missed_cutoff') {
      return `<section class="section"><h3>Gemi兄記者の予想</h3><p class="ochap-gemi-status">このレースは締切時刻（${esc(rec.closing_at || '締切')}）前に両記者のM0凍結が完了しなかったため欠測扱いとし、事後予想は掲載しません。</p></section>`;
    }
    if (rec.status !== 'published' || !rec.freeze_at || !rec.source_ref) {
      return `<section class="section"><h3>Gemi兄記者の予想</h3><p class="ochap-gemi-status">このレースは原稿未登録です。</p></section>`;
    }
    if (sharedInputMeta && sharedInputMeta.sha256 && rec.input_sha256 && rec.input_sha256 !== sharedInputMeta.sha256) {
      return `<section class="section"><h3>Gemi兄記者の予想</h3><p class="ochap-gemi-status">共通入力ハッシュ不一致のため表示を停止しました。</p></section>`;
    }
    const raceTitle = article?.querySelector('.race-head h2')?.textContent || raceId;
    const bets = rec.bets || {};
    const marks = rec.marks || {};
    const scenario = rec.scenarios || {};
    const diag = rec.diagrams || {};
    const slitCourses = diag.slit_courses || [];
    const escBranch = diag.escape_branch || { winner: 1, method: '逃げ', order_2nd: [2,3,4,5,6], order_3rd: [3,2,4,5,6] };
    const colBranch = diag.collapse_branch || { winner: Number(marks.main) !== 1 ? Number(marks.main) : Number(marks.second) || 3, method: rec.predicted_method !== '逃げ' ? rec.predicted_method : 'まくり差し', order_2nd: [1,2,4,5,6], order_3rd: [2,1,4,5,6] };
    const entryOrder = diag.entry_order || [1, 2, 3, 4, 5, 6];

    const slitSvg = buildGemiSlitSvg(raceTitle, slitCourses);
    const escSvg = buildGemi1MSvg(raceTitle, '①逃げ成立', escBranch, entryOrder);
    const colSvg = buildGemi1MSvg(raceTitle, '①逃げ崩壊', colBranch, entryOrder);

    const slitTableRows = slitCourses.map(r => `
      <tr>
        <td>${boatBadge(r.boat)}/${esc(r.course)}C</td>
        <td>${esc(r.name)} / ${esc(r.class)}</td>
        <td>${esc(r.c_st)}</td>
        <td>${esc(r.off_st)}</td>
        <td>${esc(r.st_rank)}</td>
        <td>F${esc(r.f_count)}</td>
        <td><b>${esc(r.label)}</b></td>
      </tr>`).join('');

    const revSummary = diag.reverse_summary || {};
    const revAxisHtml = revSummary.axis
      ? `<div class="combo">${formatAxisInline(revSummary.axis)}</div>`
      : '';

    const naviDetails = rec.navi_details || {};
    const naviAxisHtml = (naviDetails.status === 'recommended' && naviDetails.axis)
      ? `<div class="combo">${formatAxisInline(naviDetails.axis)}</div>`
      : `<div class="combo"><span class="note">見送り（推奨不成立）</span></div>`;

    const shaShort = String(rec.input_sha256 || sharedInputMeta?.sha256 || '').slice(0, 12);
    const snapId = sharedInputMeta?.snapshot_id || `OCHAP_SHARED_INPUT_${String(issueDate || '').replaceAll('-','')}_M0_v1`;

    return `
      <section class="section">
        <h3>03 スタート体型・ST詳細（Gemi兄独自スリット予想）</h3>
        ${slitSvg ? `<figure class="slit-figure">${slitSvg}</figure>` : ''}
        ${slitTableRows ? `<div class="scroll"><table><thead><tr><th>艇/C</th><th>選手・級</th><th>C平均ST</th><th>全国平均ST</th><th>ST順位</th><th>F数</th><th>Gemi兄スリット判定</th></tr></thead><tbody>${slitTableRows}</tbody></table></div>` : ''}
        ${rec.st_comment ? `<p class="note" style="margin-top:8px">${esc(rec.st_comment)}</p>` : ''}
      </section>

      <section class="section">
        <h3>04 展開予想（Gemi兄独自1M旋回図）</h3>
        <div class="diagram-grid">
          <details class="diagram-branch" open>
            <summary>①逃げ成立｜予想決まり手：${boatBadge(1)} 逃げ</summary>
            ${escSvg ? `<figure>${escSvg}</figure>` : ''}
            <p>${esc(scenario.escape || '')}</p>
            <p class="diagram-ranks">2着：${renderRankChain(escBranch.order_2nd)}<br>3着：${renderRankChain(escBranch.order_3rd)}</p>
          </details>
          <details class="diagram-branch" open>
            <summary>①逃げ崩壊｜予想決まり手：${boatBadge(colBranch.winner)} ${esc(colBranch.method)}</summary>
            ${colSvg ? `<figure>${colSvg}</figure>` : ''}
            <p>${esc(scenario.collapse || '')}</p>
            <p class="diagram-ranks">2着：${renderRankChain(colBranch.order_2nd)}<br>3着：${renderRankChain(colBranch.order_3rd)}</p>
          </details>
        </div>
        <p class="lead">${esc(rec.reason || '解説未登録')}</p>
        ${rec.first_mark ? `<p>${esc(rec.first_mark)}</p>` : ''}
        <div class="grid">
          <div class="panel">
            <h3>①逃げ成立｜予想決まり手：${boatBadge(1)} 逃げ</h3>
            <p>${esc(escBranch.caption || '')}</p>
            <p>2着：${renderRankChain(escBranch.order_2nd)}</p>
            <p>3着：${renderRankChain(escBranch.order_3rd)}</p>
          </div>
          <div class="panel">
            <h3>①逃げ崩壊｜予想決まり手：${boatBadge(colBranch.winner)} ${esc(colBranch.method)}</h3>
            <p>${esc(colBranch.caption || '')}</p>
            <p>2着：${renderRankChain(colBranch.order_2nd)}</p>
            <p>3着：${renderRankChain(colBranch.order_3rd)}</p>
          </div>
        </div>
      </section>

      <section class="section">
        <h3>05 Gemi兄記者予想（◎ ${boatBadge(marks.main)}　○ ${boatBadge(marks.second)}　▲ ${boatBadge(marks.third)}　△ ${boatBadge(marks.fourth)}）</h3>
        <div class="picks">
          <div class="panel">
            <h3>本線</h3>
            ${renderComboList(bets.main)}
            <p>予想決まり手：${boatBadge(marks.main)} ${esc(rec.predicted_method || '—')}</p>
          </div>
          <div class="panel reverse">
            <h3>逆張り</h3>
            ${revAxisHtml}
            <div style="margin-top:6px;font-size:15px">${renderComboList(bets.reverse)}</div>
            ${revSummary.head ? `<p>予想決まり手：${boatBadge(revSummary.head)} ${esc(revSummary.method || '')}</p>` : ''}
          </div>
          <div class="panel nav">
            <h3>舟券ナビ</h3>
            ${naviAxisHtml}
            ${Array.isArray(bets.navi) && bets.navi.length ? `<div style="margin-top:6px;font-size:15px">${renderComboList(bets.navi)}</div>` : ''}
            ${naviDetails.status === 'recommended' && diag.navi_summary?.head ? `<p>予想決まり手：${boatBadge(diag.navi_summary.head)} ${esc(diag.navi_summary.method || '')}</p>` : ''}
            <p>${esc(naviDetails.reason || naviDetails.axis_reason || '')}</p>
          </div>
        </div>
        <p class="ochap-gemi-details">${esc(modeBadgeText(rec))} ｜ 予想凍結：${esc(rec.freeze_at)} ／ 共通入力：${esc(snapId)} (SHA256:${esc(shaShort)}…) ／ 原本：${esc(rec.source_ref)}</p>
      </section>`;
  }

  function reporterView(article, showGemi) {
    const info = panes.get(article);
    if (!info) return;
    for (const node of info.hideInGemi) node.hidden = showGemi;
    info.gemiBanner.hidden = !showGemi;
    info.gemiPane.hidden = !showGemi;
    // Gate 5: Keep shared factual Section 02 heading neutral in Gemi兄 view and restore exact OchaP text in OchaP view.
    if (info.sec02Heading) {
      info.sec02Heading.textContent = showGemi ? '02 コース別6か月データ・決まり手' : info.sec02OriginalText;
    }
    info.ochaButton.setAttribute('aria-pressed', String(!showGemi));
    info.gemiButton.setAttribute('aria-pressed', String(showGemi));
  }

  function setup(article) {
    const raceHead = article.querySelector(':scope > .race-head');
    if (!raceHead) return;
    const tabs = document.createElement('div');
    tabs.className = 'ochap-report-tabs';
    tabs.setAttribute('role', 'group');
    tabs.setAttribute('aria-label', '記者の予想を切り替え');
    const ocha = document.createElement('button');
    ocha.type = 'button';
    ocha.textContent = '🍵 お茶P記者';
    ocha.setAttribute('aria-pressed', 'true');
    const gemi = document.createElement('button');
    gemi.type = 'button';
    gemi.textContent = '✦ Gemi兄記者';
    gemi.setAttribute('aria-pressed', 'false');
    tabs.append(ocha, gemi);
    raceHead.insertAdjacentElement('afterend', tabs);

    const banner = document.createElement('div');
    banner.className = 'ochap-gemi-banner-wrap';
    banner.hidden = true;
    banner.innerHTML = gemiQuickBanner(article.id);
    tabs.insertAdjacentElement('afterend', banner);

    const sharedList = Array.from(article.querySelectorAll(':scope > section.section')).filter(section =>
      /^\s*0[12]\s/.test(section.querySelector('h3')?.textContent || '')
    );
    const sharedSections = new Set(sharedList);
    const sec02 = sharedList.find(section => /^\s*02\s/.test(section.querySelector('h3')?.textContent || ''));
    const sec02Heading = sec02 ? sec02.querySelector('h3') : null;
    const sec02OriginalText = sec02Heading ? sec02Heading.textContent : '';

    const pane = document.createElement('div');
    pane.className = 'ochap-gemi-pane';
    pane.hidden = true;
    pane.innerHTML = gemiContent(article.id, article);

    // Place 03/04/05 of Gemi兄 right after Section 02 (exact same flow as OchaP's 03/04/05)
    const lastShared = sharedList.length ? sharedList[sharedList.length - 1] : banner;
    lastShared.insertAdjacentElement('afterend', pane);

    const hiddenNodes = Array.from(article.children).filter(
      x => x !== raceHead && x !== tabs && x !== banner && x !== pane && !sharedSections.has(x)
    );
    panes.set(article, {
      ochaButton: ocha,
      gemiButton: gemi,
      gemiBanner: banner,
      gemiPane: pane,
      hideInGemi: hiddenNodes,
      sec02Heading,
      sec02OriginalText,
    });
    ocha.addEventListener('click', () => reporterView(article, false));
    gemi.addEventListener('click', () => reporterView(article, true));
  }

  articleNodes.forEach(setup);
  if (!issueDate) return;
  async function loadGemiIssueData(date) {
    for (const path of [`./data/gemi/${date}.json`, `./data/gemi/${date}.json.gz.b64.txt`]) {
      try {
        const resp = await fetch(path, { cache: 'no-store' });
        if (!resp.ok) continue;
        const rawText = (await resp.text()).trim();
        if (!rawText) continue;
        if (rawText.startsWith('{')) {
          const parsed = JSON.parse(rawText);
          if (parsed && parsed.races && Object.keys(parsed.races).length > 0) return parsed;
          if (path.endsWith('.json')) continue;
          return parsed;
        }
        if (/^[A-Za-z0-9+/=\s]+$/.test(rawText) && ('DecompressionStream' in window)) {
          const clean = rawText.replace(/\s+/g, '');
          const bin = atob(clean);
          const bytes = Uint8Array.from(bin, c => c.charCodeAt(0));
          const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
          const decompressed = await new Response(stream).text();
          const parsed = JSON.parse(decompressed);
          if (parsed && parsed.races && Object.keys(parsed.races).length > 0) return parsed;
        }
      } catch (_) {}
    }
    return null;
  }

  function addGlobalReporterControl() {
    const controls = document.querySelector('.controls');
    if (!controls || document.getElementById('ochap-global-reporter-switch')) return;
    const wrap = document.createElement('span');
    wrap.id = 'ochap-global-reporter-switch';
    wrap.style.cssText = 'display:inline-flex;gap:4px;align-items:center;margin-left:4px';
    const btnGemi = document.createElement('button');
    btnGemi.type = 'button';
    btnGemi.textContent = '全R：✦ Gemi兄';
    btnGemi.style.cssText = 'background:#174c3a;color:#fff9e8;border:1px solid #174c3a;border-radius:5px;padding:6px 10px;font-weight:700;cursor:pointer';
    const btnOcha = document.createElement('button');
    btnOcha.type = 'button';
    btnOcha.textContent = '全R：🍵 お茶P';
    btnOcha.style.cssText = 'background:#fffdf5;color:#174a37;border:1px solid #849b8d;border-radius:5px;padding:6px 10px;font-weight:700;cursor:pointer';
    btnGemi.addEventListener('click', () => {
      for (const [article] of panes) reporterView(article, true);
      btnGemi.style.background = '#174c3a'; btnGemi.style.color = '#fff9e8';
      btnOcha.style.background = '#fffdf5'; btnOcha.style.color = '#174a37';
    });
    btnOcha.addEventListener('click', () => {
      for (const [article] of panes) reporterView(article, false);
      btnOcha.style.background = '#174c3a'; btnOcha.style.color = '#fff9e8';
      btnGemi.style.background = '#fffdf5'; btnGemi.style.color = '#174a37';
    });
    wrap.append(btnGemi, btnOcha);
    controls.append(wrap);
  }

  loadGemiIssueData(issueDate)
    .then(data => {
      if (!data || data.date !== issueDate || data.reporter !== 'gemi' || typeof data.races !== 'object' || Array.isArray(data.races)) return;
      issueMeta = data;
      sharedInputMeta = (data.shared_input && typeof data.shared_input === 'object') ? data.shared_input : null;
      records = data.races;
      addGlobalReporterControl();
      for (const [article, info] of panes) {
        info.gemiBanner.innerHTML = gemiQuickBanner(article.id);
        info.gemiPane.innerHTML = gemiContent(article.id, article);
        const ochaUnregistered = info.hideInGemi.some(n => (n.textContent || '').includes('未登録'));
        if (ochaUnregistered && resolveRaceRecord(article.id)) {
          reporterView(article, true);
        }
      }
    })
    .catch(() => { /* Missing Gemini issue is displayed as 未登録. */ });
})();
