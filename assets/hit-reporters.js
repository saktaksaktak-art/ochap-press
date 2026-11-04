/* Attribute public bulletin hits to the published tickets of each journalist. */
(() => {
  'use strict';
  const labels = {ocha:'お茶P記者',gemi:'Gemi兄記者'};
  const groups = [['main','本線'],['reverse','逆張り'],['navi','舟券ナビ']];
  const validTicket = x => typeof x === 'string' && /^[1-6]-[1-6]-[1-6]$/.test(x) && new Set(x.split('-')).size === 3;
  function normalize(bets) {
    if (!bets || !Array.isArray(bets.main) || !bets.main.length) return null;
    const out = {};
    for (const [key] of groups) {
      const list = bets[key] ?? [];
      if (!Array.isArray(list) || !list.every(validTicket)) return null;
      out[key] = [...new Set(list)];
    }
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
          bets[key] = [...list.querySelectorAll('.ticket')].map(x=>x.textContent.trim());
        }
      }
      const parsed = normalize(bets);
      if (parsed) ocha[article.id] = parsed;
    }
  }
  const pending = new Map();
  async function load(date) {
    if (date !== window.__OCHAP_SELECTED_DATE__) return null;
    if (pending.has(date)) return pending.get(date);
    const request = (async () => {
      const forecasts = Object.fromEntries(Object.entries(ocha).map(([id,bets])=>[id,{ocha:bets}]));
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
        for (const [id,rec] of Object.entries(doc.races)) {
          if (rec.status !== 'published' || rec.retrospective === true) continue;
          const bets = normalize(rec.bets);
          if (bets) (forecasts[id] ||= {}).gemi = bets;
        }
      } catch (_) { /* Missing input stays unknown rather than an attributed miss. */ }
      return forecasts;
    })();
    pending.set(date,request);
    return request;
  }
  window.OchaPHitReporters = Object.freeze({load,match});
})();
