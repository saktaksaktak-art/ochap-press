/* Shared forecast tickets. Public data is built from frozen originals, never results. */
(() => {
  'use strict';
  const element=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
  const pct=n=>n==null?'—':n.toFixed(1)+'%';
  const yen=n=>n==null?'保留':n.toLocaleString('ja-JP')+'円';
  const label={2:'2連単',3:'3連単'};
  const ticketKey=k=>k===2?'exacta':'trifecta';
  function ticketList(tickets){
    const wrap=element('div',undefined,'consensus-tickets');
    for(const ticket of tickets){
      const span=element('span',undefined,'ochap-ticket-color');
      ticket.split('-').forEach((boat,i)=>{
        if(i)span.append(document.createTextNode('-'));
        span.append(element('span',boat,'ochap-ticket-boat oc-b'+boat));
      });wrap.append(span);
    }return wrap;
  }
  function resultStatus(r,kind){
    if(!r.result)return '結果待ち';
    if(!r.pair_timing_eligible)return '比較対象外';
    if(r.result.excluded_reason)return '参考';
    const ts=r[ticketKey(kind)];
    if(ts.every(t=>t.split('-').some(b=>r.result.refunded_boats.includes(Number(b)))))return '返還';
    return ts.includes(r.result.order.slice(0,kind).join('-'))?'的中':'不的中';
  }
  function table(headers,rows){
    const wrap=element('div',undefined,'public-table-wrap'),t=element('table'),head=element('thead'),tr=element('tr');
    headers.forEach(h=>tr.append(element('th',h)));head.append(tr);t.append(head);
    const body=element('tbody');
    rows.forEach(row=>{const tr=element('tr');row.forEach(v=>{const td=element('td');td.append(v instanceof Node?v:document.createTextNode(String(v)));tr.append(td);});body.append(tr);});
    t.append(body);wrap.append(t);return wrap;
  }
  const cache=new Map();
  async function mount(root,date){
    if(root.dataset.consensusDate===date)return;
    root.dataset.consensusDate=date;
    root.replaceChildren(element('h2','お茶P Gemi兄　予想一致レース'),element('p','読み込み中…'));
    let data;
    try{
      if(!cache.has(date))cache.set(date,fetch('./data/consensus/'+date+'.json',{cache:'no-store'}).then(r=>r.ok?r.json():null));
      data=await cache.get(date);
      if(!data||data.schema_version!=='ochap.public.consensus.v1'||data.date!==date||!Array.isArray(data.races))throw Error();
    }catch(_){
      root.replaceChildren(element('h2','お茶P Gemi兄　予想一致レース'),element('p','この日の一致予想は未集計です。'));
      root.dataset.consensusDate='';cache.delete(date);return;
    }
    if(root.dataset.consensusDate!==date)return;
    let kind=new URL(location.href).searchParams.get('bet')==='2'?2:3,venue='',status='',page=0;
    function render(){
      const m=data.metrics[String(kind)],key=ticketKey(kind),available=data.races.filter(r=>r[key].length);
      root.replaceChildren(element('h2','お茶P Gemi兄　予想一致レース'));
      const tabs=element('div',undefined,'public-controls consensus-kind');
      [2,3].forEach(k=>{const b=element('button',label[k]);b.type='button';b.setAttribute('aria-pressed',String(kind===k));b.onclick=()=>{kind=k;page=0;const u=new URL(location.href);u.searchParams.set('bet',String(k));history.replaceState(null,'',u.pathname+u.search+u.hash);render();};tabs.append(b);});root.append(tabs);
      root.append(element('p',kind===2?'両記者の本線3連単を1・2着に置き換え、重複を除いた共通券。':'本線・逆張り・舟券ナビの全区分で、両記者が共通して挙げた3連単。','public-note'));
      const summary=element('div',undefined,'public-grid');
      [['一致レース',available.length+'R'],['共通券的中',m.hits+'/'+m.n+'R（'+pct(m.hit_rate_pct)+'）'],['100円平買い回収率',pct(m.return_rate_pct)],['平買い収支',(m.profit_yen>0?'+':'')+yen(m.profit_yen)]].forEach(([title,value])=>{const c=element('div',undefined,'public-card');c.append(element('span',title),element('strong',value,'public-number'));summary.append(c);});root.append(summary);
      root.append(element('p','成績は11/5 18:34時点の参考集計。的中率は通常レース、収支は事故・返還分を含む'+m.finance_races+'R・'+m.ticket_points+'点。一致して外れたRも含みます。','public-note'));
      const evaluation=element('div',undefined,'public-card');evaluation.append(element('h3','一致予想は有効か'));
      evaluation.append(element('p',kind===2?'レースを絞る手掛かりはありますが、共通券購入の優位性は未確認です。':'共通券購入の優位性は未確認です。共通券なしの比較群は3Rしかなく、判定には足りません。'));
      if(kind===2)evaluation.append(element('p','共通券があるRでGemi兄の本線2連単は38/84R、ないRでは5/34R的中。場別に調整した検定でも差が出ましたが、共通券だけを買う効果とは別です。','public-note'));
      const details=element('details');details.append(element('summary','同じレース・点数・検証の内訳'));
      details.append(table(['予想','的中 / 同じ通常R','点数','回収率（同じ金融R）'],[
        ['共通券',m.hits+'/'+m.n+'R',m.normal_ticket_points+'点',pct(m.return_rate_pct)],
        ...[['ocha','お茶P'],['gemi','Gemi兄']].map(([a,n])=>{const s=m.same_cohort_reporters[a];return [n,s.hits+'/'+s.n+'R',s.ticket_points+'点',pct(m.same_financial_cohort[a].return_rate_pct)];})]));
      details.append(element('p','上の点数は通常Rでの比較。回収率は共通券がある同一の'+m.finance_races+'Rで比較しています。購入点数が異なるため、的中率だけでは優劣を判定できません。','public-note'));
      details.append(element('p','共通券回収率の95%推定区間：'+m.roi_cluster_bootstrap95_pct.map(pct).join('〜')+'。場ごとに再抽出した参考値で、100%をまたぎます。1日分の途中結果であり、翌日以降の再現確認が必要です。','public-note'));
      details.append(element('p','的中率の95%区間：'+m.wilson95_hit_pct.map(pct).join('〜')+'。レース選別の検定は各記者の全本線（3連単は全区分）を共通券あり／なしの別R群で比較し、場別条件付き検定・4比較のHolm補正を使用。お茶P p='+m.agreement_selection_test.ocha.holm_adjusted_p_four_tests.toFixed(3)+'、Gemi兄 p='+m.agreement_selection_test.gemi.holm_adjusted_p_four_tests.toFixed(3)+'。探索的な関連の検証で、収益改善の証明ではありません。','public-note'));
      evaluation.append(details);root.append(evaluation);
      const filters=element('div',undefined,'public-controls');
      function select(name,options,value,onchange){const l=element('label',name+' '),s=element('select');s.setAttribute('aria-label',name);options.forEach(([v,n])=>{const o=element('option',n);o.value=v;s.append(o);});s.value=value;s.onchange=()=>{onchange(s.value);page=0;render();};l.append(s);return l;}
      filters.append(select('場',[['','全場'],...Array.from(new Set(available.map(r=>r.venue))).map(v=>[v,v])],venue,v=>venue=v));
      filters.append(select('結果',[['','すべて'],...['的中','不的中','結果待ち','参考','比較対象外'].map(v=>[v,v])],status,v=>status=v));root.append(filters);
      const rows=available.filter(r=>(!venue||r.venue===venue)&&(!status||resultStatus(r,kind)===status));
      page=Math.min(page,Math.max(0,Math.ceil(rows.length/12)-1));
      root.append(element('p',rows.length+'R中 '+(rows.length?page*12+1:0)+'〜'+Math.min(rows.length,(page+1)*12)+'Rを表示','public-note'));
      const list=element('div',undefined,'consensus-races');
      rows.slice(page*12,page*12+12).forEach(r=>{
        const c=element('article',undefined,'public-card consensus-race');const head=element('div',undefined,'consensus-race-heading');
        head.append(element('h3',r.venue+' '+r.race_no+'R'),element('span',resultStatus(r,kind),'consensus-result'));c.append(head);
        c.append(element('p','共通 '+r[key].length+'点','public-note'),ticketList(r[key]));
        if(r.result)c.append(element('p','結果 '+r.result.order.slice(0,kind).join('-')+' ／ '+yen(r.result[kind===2?'exacta_payout_yen':'trifecta_payout_yen'])));
        const d=element('details');d.append(element('summary','両記者の掲載券'));
        [['ocha','お茶P'],['gemi','Gemi兄']].forEach(([a,n])=>{d.append(element('h4',n),ticketList(r.reporters[a][String(kind)]));});c.append(d);list.append(c);
      });root.append(list);
      if(!rows.length)root.append(element('p','該当する一致レースはありません。'));
      const pagination=element('div',undefined,'public-controls');
      [['前へ',-1,page===0],['次へ',1,(page+1)*12>=rows.length]].forEach(([n,delta,disabled])=>{const b=element('button',n);b.type='button';b.disabled=disabled;b.onclick=()=>{page+=delta;render();root.querySelector('.consensus-races')?.scrollIntoView({block:'start'});};pagination.append(b);});root.append(pagination);
    }render();
  }
  window.OchaPConsensus={mount};
})();
