/* OchaP Press: Gemini reporter tab (v1.2.5)
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
  if (!articleNodes.length || window.__OCHAP_GEMI_REPORTER_INITIALIZED__) return;
  // One initialization per document even if old archives and the entry page
  // both include the reporter script.
  window.__OCHAP_GEMI_REPORTER_INITIALIZED__ = true;
  window.__OCHAP_GEMI_REPORTER_VERSION__ = '1.2.5';

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
        <text x="596" y="${yText - 1}" font-size="15" font-weight="700" fill="#3c6147">${esc(row.label || '未取得')}</text>`;
    }).join('');

    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 720 410" class="slit-svg" role="img" aria-label="${esc(raceTitle)} Gemi兄予想スリット隊形">
      <style>text{font-family:system-ui,-apple-system,sans-serif}</style>
      <rect width="720" height="410" rx="12" fill="#f4f5e9"/>
      <text x="18" y="30" font-size="13" font-weight="700" fill="#5b7360">進入</text>
      <text x="62" y="30" font-size="13" font-weight="700" fill="#5b7360">艇・選手</text>
      <text x="188" y="30" font-size="13" font-weight="700" fill="#5b7360">基準ST</text>
      <text x="262" y="30" font-size="13" font-weight="700" fill="#5b7360">後手</text>
      <text x="408" y="30" font-size="12" font-weight="700" fill="#3c6147">標準スリット</text>
      <text x="525" y="30" font-size="13" font-weight="700" fill="#5b7360">先行 →</text>
      <text x="596" y="30" font-size="13" font-weight="700" fill="#5b7360">相対的な読み</text>
      ${rowsSvg}
    </svg>`;
  }

  // Extract per-boat course win-method stats (sashi, makuri, makurisashi) from Section 02 table if present
  function parseCourseWinMethods(article) {
    const source = window.__OCHAP_GEMI_COURSE_METHODS__?.[article?.id];
    if (source) return source;
    const wm = {};
    if (!article) return wm;
    const tables = article.querySelectorAll('table');
    if (tables.length < 2) return wm;
    const pNum = (s) => {
      const m = String(s || '').match(/([0-9]+(?:\.[0-9]+)?)/);
      return m ? parseFloat(m[1]) : 0.0;
    };
    tables[1].querySelectorAll('tbody tr, tr').forEach(tr => {
      const tds = tr.querySelectorAll('td');
      if (tds.length >= 6) {
        const bMatch = String(tds[0].textContent || '').match(/([1-6])\s*\//);
        if (bMatch) {
          const bNo = parseInt(bMatch[1], 10);
          wm[bNo] = {
            nige: pNum(tds[2].textContent),
            sashi: pNum(tds[3].textContent),
            makuri: pNum(tds[4].textContent),
            makurisashi: pNum(tds[5].textContent)
          };
        }
      }
    });
    return wm;
  }

  // Build Gemi兄's independent 1M Turn Trajectory SVG (viewBox 0 0 560 465)
  // - OchaP-reference geometry: straight stand approach (M36..L286), circular 8-segment Bezier turn around (286,235), straight horizontal backstretch (L286..LxLineEnd)
  // - Course 1..6 tactical scenario engine with realistic post-turn trajectory crossings (差し / まくり / まくり差し / 二番差し / 最内小回り)
  function buildGemi1MSvg(raceTitle, branchTitle, branchSpec, entryOrder, slitCourses, article) {
    if (!branchSpec || !branchSpec.winner) return '';
    const winner = Number(branchSpec.winner);
    const method = String(branchSpec.method || '');
    const order2 = Array.isArray(branchSpec.order_2nd) ? branchSpec.order_2nd.map(Number) : [];
    const order3 = Array.isArray(branchSpec.order_3rd) ? branchSpec.order_3rd.map(Number) : [];
    const fullOrder = [winner, ...order2.filter(b => b !== winner)];
    for (const b of order3) {
      if (!fullOrder.includes(b)) fullOrder.push(b);
    }
    for (let b = 1; b <= 6; b++) {
      if (!fullOrder.includes(b)) fullOrder.push(b);
    }
    const courses = Array.isArray(entryOrder) && entryOrder.length === 6 ? entryOrder.map(Number) : [1, 2, 3, 4, 5, 6];
    const rankIndex = new Map();
    fullOrder.forEach((b, idx) => rankIndex.set(b, idx));

    const stMap = new Map();
    if (Array.isArray(slitCourses)) {
      slitCourses.forEach(sc => {
        const b = Number(sc?.boat);
        const stVal = parseFloat(sc?.c_st ?? sc?.off_st);
        if (b >= 1 && b <= 6 && !Number.isNaN(stVal)) stMap.set(b, stVal);
      });
    }
    const wmMap = parseCourseWinMethods(article);

    const baseRIn = [72.0, 94.0, 116.0, 138.0, 160.0, 182.0];
    const rOuts = new Array(6).fill(0);

    // Compute tactical exit radius rOut[cIdx] for each course (0..5) based on Boat Race 1M scenario patterns
    courses.forEach((bNo, cIdx) => {
      const rnk = rankIndex.get(bNo) ?? cIdx;
      const isWinner = (bNo === winner);
      const st = stMap.get(bNo) ?? 0.16;
      const wm = wmMap[bNo] || { nige: 0, sashi: 0, makuri: 0, makurisashi: 0 };
      const secondBoat = fullOrder[1];
      const thirdBoat = fullOrder[2];

      if (cIdx === 0) {
        // 1コース: 逃げ成立時は72.0先マイ、逃げ崩壊時（差され・まくられ・まくり差され）は106.0へ膨らむ
        rOuts[0] = isWinner ? 72.0 : 106.0;
      } else if (cIdx === 1) {
        // 2コース: 差し1着=78.0（1コース106.0の内をクロス差し抜け）、ジカまくり1着=112.0
        if (isWinner) {
          rOuts[1] = (method === 'まくり') ? 112.0 : 78.0;
        } else if (winner === courses[0]) {
          // イン逃げ成立時: 3コースがまくり差し2着(secondBoat===courses[2] && wm3.makurisashi>=wm3.makuri)なら2コースが112.0へ膨らみ3コース(106.0)とクロス
          const b3 = courses[2];
          const wm3 = wmMap[b3] || { sashi: 0, makuri: 0, makurisashi: 0 };
          if (secondBoat === b3 && (wm3.makurisashi > wm3.makuri || rnk >= 3)) {
            rOuts[1] = 112.0;
          } else if (rnk === 1 || wm.sashi >= 7.0) {
            rOuts[1] = 87.0; // コンパクトな差し追走
          } else if (wm.makuri >= 10.0 && st <= 0.14) {
            rOuts[1] = 112.0;
          } else {
            rOuts[1] = 94.0;
          }
        } else {
          rOuts[1] = (rnk === 1 && wm.sashi >= wm.makuri) ? 87.0 : 94.0;
        }
      } else if (cIdx === 2) {
        // 3コース: まくり差し1着=84.0（1・2コースをクロス割り）、差し1着=99.0、まくり1着=134.0
        if (isWinner) {
          if (method === 'まくり') rOuts[2] = 134.0;
          else if (method === '差し') rOuts[2] = 99.0;
          else rOuts[2] = 84.0;
        } else if (winner === courses[0]) {
          // イン逃げ成立時: 2コースが膨らみ(112.0)で3コースがまくり差し2着なら106.0/99.0で内へクロス、それ以外は外マイ握り(134.0/124.0)
          if (rOuts[1] >= 112.0 && rnk <= 2) {
            rOuts[2] = wm.sashi >= 4.5 ? 99.0 : 106.0;
          } else if (wm.sashi >= 4.5 && wm.sashi > wm.makuri && rnk <= 2) {
            rOuts[2] = 99.0;
          } else if (wm.makurisashi > wm.makuri && wm.makurisashi >= 11.0 && rnk === 1 && secondBoat === bNo && thirdBoat !== courses[3]) {
            rOuts[2] = 106.0;
          } else if (rnk <= 2 || wm.makuri >= 5.0 || st <= 0.15) {
            rOuts[2] = 134.0; // 3コース外マイ・ツケマイ攻め
          } else {
            rOuts[2] = 124.0;
          }
        } else {
          if (winner === courses[3] && method === 'まくり差し') {
            rOuts[2] = 124.0; // 4コースに叩かれ外へ
          } else if (rnk <= 2 && wm.makurisashi > wm.makuri && rOuts[1] >= 94.0) {
            rOuts[2] = 106.0;
          } else {
            rOuts[2] = (rnk <= 2 || wm.makuri >= 8.0) ? 134.0 : 124.0;
          }
        }
      } else if (cIdx === 3) {
        // 4コース: カドまくり1着=156.0、カドまくり差し/差し1着=90.0（1〜3コースを斜めに横断クロス）
        if (isWinner) {
          rOuts[3] = (method === 'まくり') ? 156.0 : 90.0;
        } else if (winner === courses[4] && method === 'まくり差し') {
          rOuts[3] = 127.0; // 4コースがカドから仕掛けて5コースのまくり差しスペースを開ける
        } else if (rOuts[2] >= 124.0 && (rnk <= 3 || wm.sashi + wm.makurisashi >= wm.makuri)) {
          // 3コースが外マイ(124/134)で握った懐へ4コースが二番差し・まくり差し(119.0)でクロス切り込み！
          rOuts[3] = (wm.sashi >= 6.0 && wm.makuri === 0) ? 111.0 : 119.0;
        } else if (wm.makuri >= 7.0 || st <= 0.14 || (rnk === 1 && wm.makuri > wm.makurisashi)) {
          rOuts[3] = 156.0; // カド外マイ強襲
        } else {
          rOuts[3] = 146.0;
        }
      } else if (cIdx === 4) {
        // 5コース: まくり差し1着=96.0（内4艇の懐へ大クロス）、まくり1着=168.0
        if (isWinner) {
          rOuts[4] = (method === 'まくり') ? 168.0 : 96.0;
        } else if ((rnk <= 2 && rOuts[3] >= 138.0) || (wm.makurisashi >= 4.8 && rOuts[3] >= 146.0)) {
          // 4コースが外(138/146/156)へ行った内側へ5コースがまくり差し(132.0)でクロス切り込み！
          rOuts[4] = 132.0;
        } else if (rnk >= 4 || st >= 0.18) {
          rOuts[4] = 168.0;
        } else {
          rOuts[4] = 160.0;
        }
      } else if (cIdx === 5) {
        // 6コース: まくり差し/差し1着=102.0、2〜3着浮上時は最内小回り差し(135.0/145.0)で4・5コースの内へクロス！
        if (isWinner) {
          rOuts[5] = (method === 'まくり') ? 182.0 : 102.0;
        } else if (rnk <= 2 || wm.sashi >= 4.5) {
          rOuts[5] = (rnk === 1 || wm.sashi >= 4.5) ? 135.0 : 145.0;
        } else {
          rOuts[5] = 182.0;
        }
      }
    });

    const xBoatByRank = [68.0, 138.0, 208.0, 278.0, 168.0, 248.0];
    const pathsSvg = [];
    const boatsSvg = [];
    const placedBoats = [];

    courses.forEach((bNo, cIdx) => {
      const rIn = baseRIn[cIdx] || (72.0 + cIdx * 22.0);
      const rOut = rOuts[cIdx] || rIn;
      const rnk = rankIndex.get(bNo) ?? cIdx;
      const isWinner = (bNo === winner);
      const pal = BOAT_PALETTE[bNo] || BOAT_PALETTE[1];

      const yStart = 235.0 + 0.92 * rIn;
      const yEnd = 235.0 - 0.92 * rOut;
      let xBoat = xBoatByRank[rnk] || 208.0;
      if (placedBoats.some(([px, py]) => Math.abs(yEnd - py) < 28.0 && Math.abs(xBoat - px) < 64.0)) {
        const cands = [68.0, 138.0, 168.0, 208.0, 248.0, 278.0, 128.0, 303.0].sort((a, b) => Math.abs(a - xBoat) - Math.abs(b - xBoat));
        for (const cand of cands) {
          if (placedBoats.every(([qx, qy]) => !(Math.abs(yEnd - qy) < 28.0 && Math.abs(cand - qx) < 64.0))) {
            xBoat = cand;
            break;
          }
        }
      }
      placedBoats.push([xBoat, yEnd]);
      const xLineEnd = xBoat - 23.0;

      function evalPt(u) {
        const s = 3.0 * u * u - 2.0 * u * u * u;
        const ds = 6.0 * u * (1.0 - u);
        const R = rIn + (rOut - rIn) * s;
        const dR = (rOut - rIn) * ds;
        const th = Math.PI * u;
        const x = 286.0 + R * Math.sin(th);
        const y = 235.0 + 0.92 * R * Math.cos(th);
        const dx = dR * Math.sin(th) + Math.PI * R * Math.cos(th);
        const dy = 0.92 * (dR * Math.cos(th) - Math.PI * R * Math.sin(th));
        return [x, y, dx, dy];
      }

      const segs = [];
      for (let k = 0; k < 8; k++) {
        const u0 = k / 8.0, u1 = (k + 1) / 8.0;
        const [x0, y0, dx0, dy0] = evalPt(u0);
        const [x1, y1, dx1, dy1] = evalPt(u1);
        const c1x = x0 + dx0 / 24.0, c1y = y0 + dy0 / 24.0;
        const c2x = x1 - dx1 / 24.0, c2y = y1 - dy1 / 24.0;
        segs.push(`C${c1x.toFixed(3)} ${c1y.toFixed(3)} ${c2x.toFixed(3)} ${c2y.toFixed(3)} ${x1.toFixed(3)} ${y1.toFixed(3)}`);
      }

      const dPath = `M36 ${yStart.toFixed(3)}L286 ${yStart.toFixed(3)}${segs.join('')}L${xLineEnd.toFixed(3)} ${yEnd.toFixed(3)}`;

      const [xm, ym, dxm, dym] = evalPt(0.5);
      const norm = Math.hypot(dxm, dym) || 1.0;
      const tx = dxm / norm, ty = dym / norm;
      const nx = -ty, ny = tx;
      const bx = xm - 7.7 * tx, by = ym - 7.7 * ty;
      const pLx = bx + 4.7 * nx, pLy = by + 4.7 * ny;
      const pRx = bx - 4.7 * nx, pRy = by - 4.7 * ny;

      const outlineW = isWinner ? '8.2' : '5.5';
      const mainW = isWinner ? '5.7' : '3';
      const outlineColor = bNo === 1 ? '#889f98' : '#ffffff';

      pathsSvg.push(
        `<path d="${dPath}" fill="none" stroke="${outlineColor}" stroke-width="${outlineW}" stroke-linecap="round"/>`,
        `<path d="${dPath}" fill="none" stroke="${pal.fill}" stroke-width="${mainW}" stroke-linecap="round"/>`,
        `<path d="M${xm.toFixed(1)} ${ym.toFixed(1)}L${pLx.toFixed(1)} ${pLy.toFixed(1)}L${pRx.toFixed(1)} ${pRy.toFixed(1)}Z" fill="${pal.fill}" stroke="#526f66" stroke-width=".5"/>`
      );

      boatsSvg.push(
        `<g transform="translate(${xBoat.toFixed(2)} ${yEnd.toFixed(2)})">
          <path transform="rotate(180)" d="M-23 -14H9Q21 -14 31 0Q21 14 9 14H-23Z" fill="${pal.fill}" stroke="${pal.stroke}" stroke-width="1.5"/>
          <text x="1" y="7" text-anchor="middle" font-size="21" font-weight="800" fill="${pal.text}">${bNo}</text>
        </g>`
      );
    });

    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 560 465" class="turn-svg" role="img" aria-label="${esc(raceTitle)} ${esc(branchTitle)} ${winner}${esc(method)}">
      <style>text{font-family:system-ui,-apple-system,sans-serif}</style>
      <rect width="560" height="465" rx="12" fill="#dfedf0"/>
      ${pathsSvg.join('')}
      ${boatsSvg.join('')}
      <circle cx="286" cy="235" r="15" fill="#fff5eb" stroke="#b54b43"/>
      <path d="M286 215L276 246H296Z" fill="#d54a45"/>
      <text x="250" y="275" font-size="13" fill="#526e68">1マーク</text>
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
    if (issueDate === '2026-11-04') return '【Gemi兄の締切前原稿／正式認定保留】';
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
    if (rec?.closing_at && new Date(rec.closing_at) <= new Date(window.__OCHAP_ISSUE_INDEX__?.issues?.find(x=>x.date===issueDate)?.gemi_publication_timing_checked_at)) return '【締切後・参考】';
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
      return `<div class="ochap-gemi-quickbar"><b>✦ Gemi兄記者</b>：Gemi兄入力SHA-256不一致のため表示を停止しました。</div>`;
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
      return `<section class="section"><h3>Gemi兄記者の予想</h3><p class="ochap-gemi-status">Gemi兄入力ハッシュ不一致のため表示を停止しました。</p></section>`;
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
    const escSvg = ''; // User paused turn diagrams on 2026-11-07.
    const colSvg = '';

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
    const sharedFacts = Array.from(article.querySelectorAll(':scope > .copy > details'))
      .filter(node => /^0[12]\s/.test(node.querySelector('summary')?.textContent || ''))
      .map(node => node.outerHTML.replace('🍵Pコースデータ', 'コースデータ')).join('');

    return `
      <div class="copy">
        <p class="lead">${esc(rec.reason)}</p>
        <h3>本線3点</h3><div class="tickets">${renderComboList(bets.main)}</div>
        <h3>逆張り</h3><div class="tickets reverse">${renderComboList(bets.reverse)}</div>
        ${revSummary.head ? `<p>予想決まり手：${boatBadge(revSummary.head)} ${esc(revSummary.method || '')}</p>` : ''}
        <h3>舟券ナビ</h3><div class="tickets">${renderComboList(bets.navi, '推奨不成立')}</div>
        <p>${esc(naviDetails.reason || naviDetails.axis_reason || '')}</p>
        <div class="branches">
          <section><h3>①逃げ成立｜${boatBadge(1)} 逃げ</h3><p>${esc(scenario.escape)}</p>
            <p>2着比較 ${renderRankChain(escBranch.order_2nd)}</p><p>3着比較 ${renderRankChain(escBranch.order_3rd)}</p></section>
          <section><h3>①逃げ崩壊｜${boatBadge(colBranch.winner)} ${esc(colBranch.method)}</h3><p>${esc(scenario.collapse)}</p>
            <p>2着比較 ${renderRankChain(colBranch.order_2nd)}</p><p>3着比較 ${renderRankChain(colBranch.order_3rd)}</p></section>
        </div>
        <p>${esc(rec.first_mark || '')}</p>
      </div>
      ${sharedFacts}
      <details><summary>03 ST詳細・スリット隊形</summary>
        ${slitSvg ? `<figure class="slit-figure">${slitSvg}</figure>` : ''}
        <div class="table-scroll"><table><thead><tr><th>艇/C</th><th>選手・級</th><th>C平均ST</th><th>全国平均ST</th><th>ST順位</th><th>F数</th><th>スリット判定</th></tr></thead><tbody>${slitTableRows}</tbody></table></div>
        <p>${esc(rec.st_comment || '')}</p>
      </details>
`;
  }

  const WRONG_REPORTER_LABEL = /Gemi兄|Gemini/i;
  let batchSwitch = false;
  let floatingSwitch = null;

  function scrollInstantBy(delta) {
    if (!(Math.abs(delta) > 1)) return;
    const htmlEl = document.documentElement;
    const prev = htmlEl ? htmlEl.style.scrollBehavior : '';
    if (htmlEl) htmlEl.style.scrollBehavior = 'auto';
    window.scrollBy(0, delta);
    if (htmlEl) htmlEl.style.scrollBehavior = prev;
  }

  function reporterView(article, showGemi, preserveScroll = false) {
    const info = panes.get(article);
    if (!info) return;
    const prevTop = preserveScroll ? article.getBoundingClientRect().top : null;
    const { ochaButton, gemiButton, gemiBanner, gemiPane, hideInGemi, headingRewrites } = info;
    article.dataset.ochapReporterActive = showGemi ? 'gemi' : 'ocha';
    for (const node of hideInGemi) {
      node.hidden = showGemi;
      node.classList.toggle('ochap-ocha-only', showGemi);
    }
    for (const item of headingRewrites) {
      item.node.textContent = showGemi ? item.neutral : item.original;
    }
    gemiBanner.hidden = !showGemi;
    gemiPane.hidden = !showGemi;
    ochaButton.setAttribute('aria-pressed', String(!showGemi));
    gemiButton.setAttribute('aria-pressed', String(showGemi));
    if (preserveScroll && prevTop !== null) {
      const nextTop = article.getBoundingClientRect().top;
      scrollInstantBy(nextTop - prevTop);
    }
    if (!batchSwitch) syncFloatingSwitch();
  }

  function setup(article) {
    const raceHead = article.querySelector(':scope > .race-head');
    if (!raceHead || article.dataset.ochapGemiSetup === '1' || article.querySelector(':scope > .ochap-report-tabs')) return;
    article.dataset.ochapGemiSetup = '1';
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

    const sharedList = Array.from(article.querySelectorAll(':scope > details')).filter(section =>
      /^\s*0[12]\s/.test(section.querySelector('summary')?.textContent || '')
    );
    const sharedSections = new Set(sharedList);
    const sharedHeadings = [
      { match: /^\s*02\s/, neutral: '02 コース別6か月データ・決まり手' }
    ];
    const headingRewrites = [];
    for (const section of sharedList) {
      const h3 = section.querySelector('summary');
      if (!h3) continue;
      for (const spec of sharedHeadings) {
        if (spec.match.test(h3.textContent || '')) {
          headingRewrites.push({ node: h3, original: h3.textContent, neutral: spec.neutral });
        }
      }
    }

    const pane = document.createElement('div');
    pane.className = 'ochap-gemi-pane';
    pane.hidden = true;
    pane.innerHTML = gemiContent(article.id, article);

    const lastShared = banner;
    lastShared.insertAdjacentElement('afterend', pane);

    const hiddenNodes = Array.from(article.children).filter(
      x => x !== raceHead && x !== tabs && x !== banner && x !== pane && !sharedSections.has(x)
    );
    for (const node of hiddenNodes) {
      const editorialText = node.textContent || '';
      if (WRONG_REPORTER_LABEL.test(editorialText)) {
        node.dataset.ochapAttributionWarning = 'true';
      }
    }
    panes.set(article, {
      ochaButton: ocha,
      gemiButton: gemi,
      gemiBanner: banner,
      gemiPane: pane,
      hideInGemi: hiddenNodes,
      headingRewrites,
    });
    ocha.addEventListener('click', () => reporterView(article, false, true));
    gemi.addEventListener('click', () => reporterView(article, true, true));
  }

  articleNodes.forEach(setup);
  if (!issueDate) return;
  async function loadGemiIssueData(date) {
    for (const path of [`./data/gemi/${date}.json.gz.b64.txt`, `./data/gemi/${date}.json`]) {
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

  function syncFloatingSwitch() {
    if (!floatingSwitch) return;
    let gemiCount = 0;
    let ochaCount = 0;
    for (const [article] of panes) {
      if (article.dataset.ochapReporterActive === 'gemi') gemiCount++;
      else ochaCount++;
    }
    const allGemi = gemiCount > 0 && ochaCount === 0;
    const allOcha = ochaCount > 0 && gemiCount === 0;
    floatingSwitch.ocha.setAttribute('aria-pressed', String(allOcha));
    floatingSwitch.gemi.setAttribute('aria-pressed', String(allGemi));
    floatingSwitch.wrap.title = (!allGemi && !allOcha)
      ? 'レースごとに記者の表示が異なります。押すと全レースを統一します。'
      : '表示中の位置から全レースの記者を切り替えます';
  }

  function switchAllReporters(showGemi) {
    // Keep the currently viewed race in place even though earlier race panels
    // can have very different heights between the two reporters.
    const viewportTop = 122;
    let anchor = null;
    let previousTop = 0;
    let fraction = 0;
    for (const [article] of panes) {
      const rect = article.getBoundingClientRect();
      if (rect.bottom > viewportTop && rect.top < window.innerHeight) {
        anchor = article;
        previousTop = rect.top;
        fraction = Math.max(0, Math.min(1, (viewportTop - rect.top) / Math.max(1, rect.height)));
        break;
      }
    }
    batchSwitch = true;
    try {
      for (const [article] of panes) reporterView(article, showGemi);
    } finally {
      batchSwitch = false;
    }
    syncFloatingSwitch();
    if (anchor) {
      const now = anchor.getBoundingClientRect();
      const desiredTop = previousTop > viewportTop ? previousTop : viewportTop - fraction * now.height;
      scrollInstantBy(now.top - desiredTop);
    }
  }

  function addGlobalReporterControl() {
    if (document.getElementById('ochap-global-reporter-switch')) return;
    const wrap = document.createElement('nav');
    wrap.id = 'ochap-global-reporter-switch';
    wrap.setAttribute('aria-label', '全レースの記者を切り替え');
    const caption = document.createElement('span');
    caption.className = 'ochap-floating-reporter-caption';
    caption.textContent = '記者切替';
    const btnOcha = document.createElement('button');
    btnOcha.type = 'button';
    btnOcha.textContent = '🍵 お茶P';
    btnOcha.setAttribute('aria-label', '全レースをお茶P記者に切り替え');
    const btnGemi = document.createElement('button');
    btnGemi.type = 'button';
    btnGemi.textContent = '✦ Gemi兄';
    btnGemi.setAttribute('aria-label', '全レースをGemi兄記者に切り替え');
    btnOcha.addEventListener('click', () => switchAllReporters(false));
    btnGemi.addEventListener('click', () => switchAllReporters(true));
    wrap.append(caption, btnOcha, btnGemi);
    document.body.append(wrap);
    document.body.classList.add('ochap-has-global-reporter-switch');
    floatingSwitch = { wrap, ocha: btnOcha, gemi: btnGemi };
    syncFloatingSwitch();

    // Hide while viewing results/comparison; return immediately in the newspaper view.
    const archiveHeader = document.querySelector('header#top');
    if (archiveHeader) {
      const refreshVisibility = () => {
        const hidden = archiveHeader.classList.contains('ochap-public-original-hidden');
        wrap.hidden = hidden;
        wrap.classList.toggle('ochap-global-hidden', hidden);
      };
      new MutationObserver(refreshVisibility).observe(archiveHeader, {
        attributes: true, attributeFilter: ['class']
      });
      refreshVisibility();
    }
  }

  loadGemiIssueData(issueDate)
    .then(data => {
      if (!data || data.date !== issueDate || data.reporter !== 'gemi' || typeof data.races !== 'object' || Array.isArray(data.races)) return;
      issueMeta = data;
      sharedInputMeta = (data.shared_input && typeof data.shared_input === 'object') ? data.shared_input : null;
      records = data.races;
      const issueCaption = document.querySelector('header#top > p');
      if (issueCaption) issueCaption.textContent = issueCaption.textContent.replace('おちゃっぴー記者', 'お茶P・Gemi兄');
      batchSwitch = true;
      try {
        for (const [article, info] of panes) {
          info.gemiBanner.innerHTML = gemiQuickBanner(article.id);
          info.gemiPane.innerHTML = gemiContent(article.id, article);
          // Do not auto-switch to Gemini when OchaP's M0 is missing.
          // Both journalists' forecasts remain separately attributed.
        }
      } finally {
        batchSwitch = false;
      }
      addGlobalReporterControl();
      syncFloatingSwitch();
    })
    .catch(() => { /* Missing Gemini issue is displayed as 未登録. */ });
})();

