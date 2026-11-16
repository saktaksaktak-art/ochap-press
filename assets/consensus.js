/* Shared tickets come from frozen forecasts. Live results supply reference scoring. */
(() => {
  'use strict';
  const element=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
  const pct=n=>n==null?'—':n.toFixed(1)+'%';
  const yen=n=>n==null?'保留':n.toLocaleString('ja-JP')+'円';
  const label={2:'2連単',3:'3連単'};
  const ticketKey=k=>k===2?'exacta':'trifecta';
  const categoryNames=[['main','本線'],['reverse','逆張り'],['navi','舟券ナビ']];
  function ticketRoles(r,ticket,kind,reporter,forecasts){
    // Membership comes from the dated frozen source, never the result or the active reporter tab.
    if(kind===2)return r.reporters?.[reporter]?.['2']?.includes(ticket)?['本線']:[];
    const bets=r.reporters?.[reporter]?.categories||forecasts?.[r.race_id]?.[reporter];
    if(!bets)return [];
    return categoryNames.filter(([key])=>Array.isArray(bets[key])&&bets[key].includes(ticket)).map(([,name])=>name);
  }
  function commonTickets(r,kind,forecasts){
    const list=element('div',undefined,'consensus-ticket-list');
    for(const ticket of r[ticketKey(kind)]){
      const row=element('div',undefined,'consensus-ticket-row');
      row.append(ticketList([ticket]));
      const labels=element('div',undefined,'consensus-ticket-categories');
      for(const [reporter,name] of [['ocha','お茶P'],['gemi','Gemi兄']]){
        const line=element('div',undefined,'consensus-category-line');
        line.append(element('strong',name,'consensus-reporter-name'));
        const roles=ticketRoles(r,ticket,kind,reporter,forecasts);
        for(const role of roles.length?roles:['区分未確認'])line.append(element('span',role,'consensus-category-badge'));
        labels.append(line);
      }
      row.append(labels);list.append(row);
    }
    return list;
  }
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
    if(!r.pair_timing_eligible&&!r.reference_timing_eligible)return '比較対象外';
    if(r.result.excluded_reason)return '参考';
    const ts=r[ticketKey(kind)];
    if(ts.every(t=>t.split('-').some(b=>r.result.refunded_boats.includes(Number(b)))))return '返還';
    return ts.includes(r.result.order.slice(0,kind).join('-'))?'的中':'不的中';
  }
  function readTime(value){
    return typeof value==='string'&&/(Z|[+-]\d{2}:\d{2})$/.test(value)?Date.parse(value):NaN;
  }
  function referenceCutoff(data,issue){
    if(issue?.date!==data.date||data.edition!=='M0'||data.input_versions_differ||
      !/^[a-f0-9]{64}$/.test(data.source_hashes?.ocha)||!/^[a-f0-9]{64}$/.test(data.source_hashes?.gemi)||
      issue.forecast_sha256!==data.source_hashes?.ocha||
      issue.gemi_original_sha256!==data.source_hashes?.gemi||
      !/^[a-f0-9]{64}$/.test(data.shared_candidate_sha256)||
      issue.reporters?.ocha?.input_sha256!==data.shared_candidate_sha256||
      issue.reporters?.gemi?.input_sha256!==data.shared_candidate_sha256)return NaN;
    const timestamps=[data.snapshot_at_jst,issue.publication_timing_checked_at,
      issue.reporters.ocha.frozen_at_jst,issue.reporters.gemi.recorded_freeze_at_jst];
    if(issue.gemi_first_publication_confirmed_at_jst)timestamps.push(issue.gemi_first_publication_confirmed_at_jst);
    return Math.max(...timestamps.map(readTime));
  }
  const boat=n=>Number.isInteger(n)&&n>=1&&n<=6;
  const raceKey=r=>r.venue_code+':'+r.race_no;
  function attachLiveResults(data,feed,issue){
    if(feed?.date!==data.date||feed.schema_version!=='1.0'||!Array.isArray(feed.races))return null;
    const cutoff=referenceCutoff(data,issue);
    const checkedAt=readTime(feed.checked_at_jst);
    if(!Number.isFinite(checkedAt))return null;
    const lateRaces=new Set(issue?.post_deadline_reference_races||[]);
    const results=new Map();
    for(const row of feed.races){
      if(!Number.isInteger(row?.venue_code)||!Number.isInteger(row.race_no)||
        !Array.isArray(row.order)||row.order.length!==3||!row.order.every(boat)||new Set(row.order).size!==3)continue;
      const key=raceKey(row);
      // A duplicate result key is ambiguous, even if either row looks usable.
      results.set(key,results.has(key)?null:row);
    }
    return data.races.map(r=>{
      if(r.result)return r;
      const deadline=readTime(r.deadline);
      const eligible=!r.input_versions_differ&&cutoff<deadline;
      const result=results.get(raceKey(r));
      if(!result||lateRaces.has(r.race_id)||!(deadline<checkedAt)||(!r.pair_timing_eligible&&!eligible))return r;
      const refunds=result.refund_boats;
      const refundKnown=Array.isArray(refunds)&&refunds.every(boat);
      return {...r,reference_timing_eligible:eligible,result:{
        ...result,refund_known:refundKnown,refunded_boats:refundKnown?refunds:[]
      }};
    });
  }
  function liveMetrics(races,kind){
    let n=0,hits=0,stake=0,payout=0,points=0,financeRaces=0,missingPayout=0,refundUnknown=0;
    for(const race of races){
      const result=race.result,tickets=[...new Set(race[ticketKey(kind)])];
      if(!tickets.length||!result||result.excluded_reason||
        (!race.pair_timing_eligible&&!race.reference_timing_eligible))continue;
      const refunds=result.refunded_boats;
      if(result.order.some(n=>refunds.includes(n))){missingPayout++;continue;}
      const hit=tickets.includes(result.order.slice(0,kind).join('-'));
      if(!refunds.length){n++;if(hit)hits++;}
      const amount=result[ticketKey(kind)+'_payout_yen'];
      if(hit&&(!Number.isInteger(amount)||amount<100)){missingPayout++;continue;}
      const refunded=tickets.filter(t=>t.split('-').some(n=>refunds.includes(Number(n)))).length;
      if(!result.refund_known)refundUnknown++;
      financeRaces++;
      points+=tickets.length;
      stake+=tickets.length*100;
      payout+=(hit?amount:0)+refunded*100;
    }
    const settled=stake>0&&missingPayout===0;
    return {n,hits,hit_rate_pct:n?100*hits/n:null,finance_races:financeRaces,ticket_points:points,
      return_rate_pct:settled?100*payout/stake:null,profit_yen:settled?payout-stake:null,missingPayout,refundUnknown};
  }
  function table(headers,rows){
    const wrap=element('div',undefined,'public-table-wrap'),t=element('table'),head=element('thead'),tr=element('tr');
    headers.forEach(h=>tr.append(element('th',h)));head.append(tr);t.append(head);
    const body=element('tbody');
    rows.forEach(row=>{const tr=element('tr');row.forEach(v=>{const td=element('td');td.append(v instanceof Node?v:document.createTextNode(String(v)));tr.append(td);});body.append(tr);});
    t.append(body);wrap.append(t);return wrap;
  }
  const cache=new Map();
  const mounted=new WeakMap();
  const getJSON=path=>fetch(path,{cache:'no-store'}).then(r=>r.ok?r.json():null);
  const tokyoDate=()=>new Date(Date.now()+9*60*60*1000).toISOString().slice(0,10);
  async function mount(root,date){
    const previous=mounted.get(root);
    if(previous?.date===date){
      await previous.refresh?.();
      return;
    }
    if(previous?.timer)clearInterval(previous.timer);
    const state={date};
    mounted.set(root,state);
    await renderDate(root,date,state);
  }
  async function renderDate(root,date,state){
    root.replaceChildren(element('h2','お茶P Gemi兄　予想一致レース'),element('p','読み込み中…'));
    let data;
    try{
      if(!cache.has(date))cache.set(date,getJSON('./data/consensus/'+date+'.json'));
      data=await cache.get(date);
      if(!data||data.schema_version!=='ochap.public.consensus.v1'||data.date!==date||!Array.isArray(data.races))throw Error();
    }catch(_){
      cache.delete(date);
      if(mounted.get(root)===state){
        mounted.delete(root);
        root.replaceChildren(element('h2','お茶P Gemi兄　予想一致レース'),element('p','この日の一致予想は未集計です。'));
      }
      return;
    }
    const emptySnapshot=data.reference_only&&data.metrics['2'].n===0&&data.metrics['3'].n===0&&
      data.races.every(r=>!r.result);
    const [forecasts,manifest]=await Promise.all([
      Promise.resolve().then(()=>window.OchaPHitReporters?.load(date)).catch(()=>null),
      emptySnapshot?getJSON('./data/issue-index.json').catch(()=>null):null
    ]);
    if(mounted.get(root)!==state)return;
    let issue=manifest?.issues?.find(x=>x.date===date);
    let live=null,latestCheck=-Infinity,latestResults,fetching=false;
    let kind=new URL(location.href).searchParams.get('bet')==='2'?2:3,venue='',status='',page=0;
    function render(){
      const races=live||data.races;
      const m=live?liveMetrics(races,kind):data.metrics[String(kind)],key=ticketKey(kind),available=races.filter(r=>r[key].length);
      root.replaceChildren(element('h2','お茶P Gemi兄　予想一致レース'));
      const tabs=element('div',undefined,'public-controls consensus-kind');
      [2,3].forEach(k=>{const b=element('button',label[k]);b.type='button';b.setAttribute('aria-pressed',String(kind===k));b.onclick=()=>{kind=k;page=0;const u=new URL(location.href);u.searchParams.set('bet',String(k));history.replaceState(null,'',u.pathname+u.search+u.hash);render();};tabs.append(b);});root.append(tabs);
      root.append(element('p',kind===2?'両記者の本線3連単を1・2着に置き換え、重複を除いた共通券。':'本線・逆張り・舟券ナビの全区分で、両記者が共通して挙げた3連単。','public-note'));
      const summary=element('div',undefined,'public-grid');
      [['一致レース',available.length+'R'],['共通券的中',m.hits+'/'+m.n+'R（'+pct(m.hit_rate_pct)+'）'],['100円平買い回収率',pct(m.return_rate_pct)],['平買い収支',(m.profit_yen>0?'+':'')+yen(m.profit_yen)]].forEach(([title,value])=>{const c=element('div',undefined,'public-card');c.append(element('span',title),element('strong',value,'public-number'));summary.append(c);});root.append(summary);
      const snapshot=new Intl.DateTimeFormat('ja-JP',{timeZone:'Asia/Tokyo',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(data.snapshot_at_jst));
      const liveNote=m.finance_races||m.missingPayout?'結果速報の参考集計。収支の確認済み分は'+m.finance_races+'R・'+m.ticket_points+'点。'+
        (m.missingPayout?'払戻確認待ち '+m.missingPayout+'R。':'')+
        (m.refundUnknown?'返還未確認 '+m.refundUnknown+'Rは返還額を含みません。':''):'照合できた結果を受信すると、速報収支を表示します。';
      root.append(element('p',live?liveNote:m.n===0?'成績は結果確定後に集計します。':'成績は'+snapshot+'時点の参考集計。的中率は通常レース、収支は事故・返還分を含む'+m.finance_races+'R・'+m.ticket_points+'点。一致して外れたRも含みます。','public-note'));
      if(!live&&m.n>0){const evaluation=element('div',undefined,'public-card');evaluation.append(element('h3','一致予想は有効か'));
      const g=m.agreement_selection_test.gemi;
      const selectionSignal=g.holm_adjusted_p_four_tests<.05 && g.with_common_hits/g.with_common_n>g.without_common_hits/g.without_common_n;
      evaluation.append(element('p',selectionSignal?'レースを絞る手掛かりはありますが、共通券購入の優位性は未確認です。':'共通券購入の優位性は未確認です。共通券なしの比較群は'+g.without_common_n+'R。継続して検証します。'));
      if(selectionSignal)evaluation.append(element('p','共通券があるRでGemi兄の'+(kind===2?'本線2連単':'全区分3連単')+'は'+g.with_common_hits+'/'+g.with_common_n+'R、ないRでは'+g.without_common_hits+'/'+g.without_common_n+'R的中。場別に調整した検定でも差が出ましたが、共通券だけを買う効果とは別です。','public-note'));
      const details=element('details');details.append(element('summary','同じレース・点数・検証の内訳'));
      details.append(table(['予想','的中 / 同じ通常R','点数','回収率（同じ金融R）'],[
        ['共通券',m.hits+'/'+m.n+'R',m.normal_ticket_points+'点',pct(m.return_rate_pct)],
        ...[['ocha','お茶P'],['gemi','Gemi兄']].map(([a,n])=>{const s=m.same_cohort_reporters[a];return [n,s.hits+'/'+s.n+'R',s.ticket_points+'点',pct(m.same_financial_cohort[a].return_rate_pct)];})]));
      details.append(element('p','上の点数は通常Rでの比較。回収率は共通券がある同一の'+m.finance_races+'Rで比較しています。購入点数が異なるため、的中率だけでは優劣を判定できません。','public-note'));
      details.append(element('p','共通券回収率の95%推定区間：'+m.roi_cluster_bootstrap95_pct.map(pct).join('〜')+'。場ごとに再抽出した参考値です。1日分の途中結果であり、翌日以降の再現確認が必要です。','public-note'));
      details.append(element('p','的中率の95%区間：'+m.wilson95_hit_pct.map(pct).join('〜')+'。レース選別の検定は各記者の全本線（3連単は全区分）を共通券あり／なしの別R群で比較し、場別条件付き検定・4比較のHolm補正を使用。お茶P p='+m.agreement_selection_test.ocha.holm_adjusted_p_four_tests.toFixed(3)+'、Gemi兄 p='+m.agreement_selection_test.gemi.holm_adjusted_p_four_tests.toFixed(3)+'。探索的な関連の検証で、収益改善の証明ではありません。','public-note'));
      evaluation.append(details);root.append(evaluation);}
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
        c.append(element('p','共通 '+r[key].length+'点','public-note'),commonTickets(r,kind,forecasts));
        if(r.result)c.append(element('p','結果 '+r.result.order.slice(0,kind).join('-')+' ／ '+yen(r.result[kind===2?'exacta_payout_yen':'trifecta_payout_yen'])));
        const d=element('details');d.append(element('summary','両記者の掲載券'));
        [['ocha','お茶P'],['gemi','Gemi兄']].forEach(([a,n])=>{d.append(element('h4',n),ticketList(r.reporters[a][String(kind)]));});c.append(d);list.append(c);
      });root.append(list);
      if(!rows.length)root.append(element('p','該当する一致レースはありません。'));
      const pagination=element('div',undefined,'public-controls');
      [['前へ',-1,page===0],['次へ',1,(page+1)*12>=rows.length]].forEach(([n,delta,disabled])=>{const b=element('button',n);b.type='button';b.disabled=disabled;b.onclick=()=>{page+=delta;render();root.querySelector('.consensus-races')?.scrollIntoView({block:'start'});};pagination.append(b);});root.append(pagination);
    }
    render();
    if(!emptySnapshot)return;
    state.refresh=async()=>{
      if(fetching)return;
      fetching=true;
      try{
        const [feed,index]=await Promise.all([
          getJSON('./data/public-results/'+date+'.json'),
          issue||manifest?null:getJSON('./data/issue-index.json').catch(()=>null)
        ]);
        if(mounted.get(root)!==state||!feed)return;
        issue??=index?.issues?.find(x=>x.date===date);
        const checkedAt=readTime(feed.checked_at_jst);
        if(checkedAt<latestCheck)return;
        const updated=attachLiveResults(data,feed,issue);
        if(!updated)return;
        const results=JSON.stringify([checkedAt,referenceCutoff(data,issue),feed.races]);
        latestCheck=checkedAt;
        if(results===latestResults)return;
        latestResults=results;
        live=updated;
        render();
      }catch(_){/* Keep the last display until the bulletin responds again. */}
      finally{fetching=false;}
    };
    if(date===tokyoDate()){
      state.timer=setInterval(()=>{
        if(date!==tokyoDate()||!root.isConnected)clearInterval(state.timer);
        else if(!root.hidden&&document.visibilityState==='visible')state.refresh();
      },90000);
    }
    await state.refresh();
  }
  window.OchaPConsensus={mount,ticketRoles,attachLiveResults,liveMetrics};
})();

