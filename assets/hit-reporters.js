/* Attribute public bulletin hits to the published tickets of each journalist. */
(() => {
  'use strict';
  const labels = {ocha:'お茶P記者',gemi:'Gemi兄記者'};
  const groups = [['main','本線'],['reverse','逆張り'],['navi','舟券ナビ']];
  const validTicket = x => typeof x === 'string' && /^[1-6]-[1-6]-[1-6]$/.test(x) && new Set(x.split('-')).size === 3;
  // Ranking and editorial copy belong to the reader, never to the bet key.
  // Read explicit numeric fields, or the legacy plain-ticket representation.
  function readTicket(node) {
    const declared = node.getAttribute('data-ticket');
    const boats = [...node.querySelectorAll(':scope > .bnum')].map(x=>x.textContent.trim());
    const colored = boats.join('-');
    if (declared !== null) {
      return validTicket(declared) && (!boats.length || colored === declared) ? declared : null;
    }
    if (boats.length) return boats.length === 3 && validTicket(colored) ? colored : null;
    const plain = node.cloneNode(true);
    plain.querySelectorAll('small,.ticket-rank,.ticket-reason').forEach(x=>x.remove());
    const ticket = plain.textContent.trim();
    return validTicket(ticket) ? ticket : null;
  }
  function normalize(bets) {
    if (!bets || !Array.isArray(bets.main) || !bets.main.length) return null;
    const out = {};
    for (const [key] of groups) {
      const list = bets[key] ?? [];
      if (!Array.isArray(list) || !list.every(validTicket)) return null;
      out[key] = [...new Set(list)];
    }
    const head = String(bets.main_pick || '');
    const heads = [...new Set(out.main.map(x=>x[0]))];
    out.main_pick = /^[1-6]$/.test(head) ? head : heads.length===1 ? heads[0] : null;
    return out;
  }
  function match(record, forecasts) {
    if (!Array.isArray(record?.order) || record.order.length !== 3 ||
        !record.order.every(n => Number.isInteger(n) && n >= 1 && n <= 6) ||
        new Set(record.order).size !== 3) return [];
    const ticket = record.order.join('-');
    return Object.entries(labels).map(([reporter,label]) => {
      const bets = normalize(forecasts?.[reporter]);
      return {reporter,label,known:!!bets,
        groups:bets ? groups.filter(([key])=>bets[key].includes(ticket)).map(([,name])=>name) : []};
    });
  }
  // Read only the OchaP copy. The Gemini pane and the active reporter tab
  // must never change whose tickets are attributed to OchaP.
  const ocha = {};
  const metadata = {};
  if (typeof document !== 'undefined') {
    for (const article of document.querySelectorAll('article[id]')) {
      const copy = article.querySelector(':scope > .copy');
      if (!copy) continue;
      const bets = {};
      for (const node of copy.children) {
        if (node.tagName !== 'H3') continue;
        const key = /^本線/.test(node.textContent.trim()) ? 'main'
          : /^逆張り/.test(node.textContent.trim()) ? 'reverse'
          : /^舟券ナビ/.test(node.textContent.trim()) ? 'navi' : null;
        const list = node.nextElementSibling;
        if (key && list?.classList.contains('tickets')) {
          bets[key] = [...list.querySelectorAll('.ticket')].map(readTicket);
        }
      }
      const parsed = normalize(bets);
      if (parsed) {
        const head=copy.querySelector('.lead')?.textContent.match(/◎\s*([1-6])/);
        if(head)parsed.main_pick=head[1];
        ocha[article.id] = article.dataset.postdeadlineReference==='true' ? null : parsed;
        const heading=article.querySelector('.race-head h2')?.textContent || '';
        const race=heading.match(/(.+?)\s+(\d+)R.*締切\s*(\d{1,2}:\d{2})/);
        if(race)metadata[article.id]={venue:race[1].replace(/^注目\s*/,''),race_no:Number(race[2]),closing_time:race[3],session:article.dataset.session||null,session_verified:article.dataset.sessionVerified==='true'};
      }
    }
  }
  const pending = new Map();
  async function load(date) {
    if (date !== window.__OCHAP_SELECTED_DATE__) return null;
    if (pending.has(date)) return pending.get(date);
    const request = (async () => {
      const forecasts = Object.fromEntries(Object.entries(ocha).map(([id,bets])=>[id,{ocha:bets,meta:metadata[id]}]));
      const issue = window.__OCHAP_ISSUE_INDEX__?.issues?.find(x=>x.date===date);
      const path = issue?.gemi_json;
      if (!path || !/^data\/gemi\/[\d-]+\.json(?:\.gz\.b64\.txt)?$/.test(path)) return forecasts;
      try {
        const response = await fetch('./'+path,{cache:'no-store'});
        if (!response.ok) return forecasts;
        let text = await response.text();
        if (path.endsWith('.gz.b64.txt')) {
          const ascii = text.replace(/\s+/g,'');
          if (!/^[A-Za-z0-9+/=]+$/.test(ascii) || !('DecompressionStream' in window)) return forecasts;
          const bytes = Uint8Array.from(atob(ascii),c=>c.charCodeAt(0));
          text = await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).text();
        }
        const doc = JSON.parse(text);
        if (doc.date !== date || doc.reporter !== 'gemi' || !doc.races || Array.isArray(doc.races)) return forecasts;
        // A completed publication receipt may coexist with an older pending flag
        // preserved by the publisher. Only a dated, observed receipt clears it.
        const firstPublication = issue.gemi_first_publication_confirmed_at_jst || issue.gemi_publication_timing_checked_at;
        const publishedAt = Date.parse(firstPublication);
        const receiptVerified = typeof firstPublication === 'string' &&
          /(?:Z|[+-]\d{2}:\d{2})$/.test(firstPublication) &&
          Number.isFinite(publishedAt) && publishedAt <= Date.now() &&
          new Date(publishedAt+9*60*60*1000).toISOString().slice(0,10) === date;
        for (const [id,rec] of Object.entries(doc.races)) {
          if ((issue.gemi_publication_pending === true && !receiptVerified) || rec.status !== 'published' || rec.retrospective === true || rec.frozen_before_race_closing === false || String(rec.m0_status||'').startsWith('POST_DEADLINE')) continue;
          if(firstPublication && (!receiptVerified || !rec.closing_at || !Number.isFinite(Date.parse(rec.closing_at)) || Date.parse(rec.closing_at)<=publishedAt)) continue;
          const bets = normalize({...rec.bets,main_pick:rec.marks?.main});
          if (bets) (forecasts[id] ||= {}).gemi = bets;
        }
      } catch (_) { /* Missing input stays unknown rather than an attributed miss. */ }
      return forecasts;
    })();
    pending.set(date,request);
    return request;
  }
  // Three-category tickets retain the existing independent-purchase policy:
  // deduplicate inside a category, but a ticket in main and navi is two purchases.
  function score(rows,forecasts,reporter,group='all',betType='three') {
    const out={n:0,headN:0,head:0,one:0,two:0,three:0,stake:0,totalStake:0,payout:0,refund:0,
      financeN:0,missingPayout:0,refundUnknown:0,hits:[]};
    const seen=new Set();
    for(const row of rows){
      const code=Number(row.venue_code),rn=Number(row.race_no);
      const key='v'+code+'-r'+rn;
      if(seen.has(key)||!Number.isInteger(code)||code<1||code>24||!Number.isInteger(rn)||rn<1||rn>12)continue;
      const f=normalize(forecasts?.[key]?.[reporter]);
      if(!f||!Array.isArray(row.order)||row.order.length!==3||
        new Set(row.order).size!==3||!row.order.every(n=>Number.isInteger(n)&&n>=1&&n<=6))continue;
      const keys=group==='all'?groups.map(([k])=>k):groups.filter(([k])=>k===group).map(([k])=>k);
      const buckets=keys.map(k=>f[k]).filter(a=>a.length);
      if(!buckets.length)continue;
      seen.add(key);
      const actual=row.order.join('-'),bets=buckets.flat();
      const selected=betType==='two'?buckets.flatMap(a=>[...new Set(a.map(t=>t.slice(0,3)))]) : bets;
      const hit3=bets.filter(t=>t===actual).length;
      const hit2=selected.filter(t=>t===actual.slice(0,3)).length;
      out.n++;
      if(f.main_pick){out.headN++;if(f.main_pick===String(row.order[0]))out.head++;}
      if(bets.some(t=>t[0]===actual[0]))out.one++;
      if(bets.some(t=>t.slice(0,3)===actual.slice(0,3)))out.two++;
      if(hit3)out.three++;
      if(hit3)out.hits.push(row);
      out.totalStake+=selected.length*100;
      const amount=betType==='two'?row.exacta_payout_yen:row.trifecta_payout_yen;
      const hitCount=betType==='two'?hit2:hit3;
      if(hitCount&&(!Number.isInteger(amount)||amount<100)){out.missingPayout++;continue;}
      const refundKnown=Array.isArray(row.refund_boats)&&row.refund_boats.every(n=>Number.isInteger(n)&&n>=1&&n<=6);
      const refunded=new Set(refundKnown?row.refund_boats:[]);
      const refundCount=selected.filter(t=>t.split('-').some(n=>refunded.has(Number(n)))).length;
      if(refundKnown&&refunded.size&&row.order.some(n=>refunded.has(n))){out.missingPayout++;continue;}
      out.financeN++;out.stake+=selected.length*100;
      out.refund+=refundCount*100;
      out.payout+=(hitCount ? hitCount*amount : 0)+refundCount*100;
      if(!refundKnown)out.refundUnknown++;
    }
    out.profit=out.payout-out.stake;
    out.roi=out.stake?out.payout/out.stake*100:null;
    return out;
  }
  window.OchaPHitReporters = Object.freeze({load,match,score,readTicket});
})();

