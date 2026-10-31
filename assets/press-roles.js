/* Public press navigation v1. Public editorial stats only; never fetch internal BC. */
(() => {
  'use strict';
  const issueDate = window.__OCHAP_SELECTED_DATE__;
  const datebar = document.getElementById('ochap-issue-datebar');
  const body = document.body;
  if (!issueDate || !datebar || document.getElementById('ochap-public-roles')) return;

  const nav = document.createElement('nav');
  nav.id = 'ochap-public-roles';
  nav.setAttribute('aria-label', 'お茶P新聞の表示切り替え');
  const choices = [
    ['forecast', '予想'],
    ['results', '結果速報'],
    ['versus', 'おちゃっぴー vs Gemini']
  ];
  const controls = {};
  for (const [key, text] of choices) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = text;
    btn.setAttribute('aria-pressed', 'false');
    btn.addEventListener('click', () => switchView(key));
    controls[key] = btn;
    nav.append(btn);
  }
  datebar.insertAdjacentElement('afterend', nav);
  const panels = document.createElement('div');
  panels.id = 'ochap-public-panels';
  panels.hidden = true;
  nav.insertAdjacentElement('afterend', panels);

  const originals = Array.from(body.children).filter(node =>
    node !== datebar && node !== nav && node !== panels &&
    !['SCRIPT', 'STYLE', 'LINK'].includes(node.tagName));

  const results = document.createElement('section');
  results.id = 'ochap-results-view';
  results.hidden = true;
  const versus = document.createElement('section');
  versus.id = 'ochap-versus-view';
  versus.hidden = true;
  panels.append(results, versus);

  const h2 = (label) => {const x = document.createElement('h2');x.textContent = label;return x;};
  const p = (label, className = '') => {const x = document.createElement('p');x.textContent = label;if(className)x.className=className;return x;};
  const card = () => {const x = document.createElement('div');x.className='public-card';return x;};

  const legacy = document.querySelector('.export-switch a[href*="/results"]');
  const originalResultsUrl = legacy ? legacy.href : null;
  let cachedResults = null;
  let resultLoaded = false;
  let performance = null;
  let performanceLoaded = false;

  async function fetchJson(url) {
    const r = await fetch(url, {cache: 'no-store'});
    if (!r.ok) return null;
    return r.json();
  }
  function externalResultsLink() {
    if (!originalResultsUrl) return null;
    try {
      const u = new URL(originalResultsUrl);
      u.searchParams.set('date', issueDate);
      if (!['https:'].includes(u.protocol)) return null;
      const a = document.createElement('a');
      a.className = 'public-action';
      a.href = u.toString();
      a.target = '_blank';
      a.rel = 'noopener';
      a.textContent = '従来の結果速報ページを開く';
      return a;
    } catch (_) {return null;}
  }
  function makeTable(headers, rows) {
    const wrap = document.createElement('div'); wrap.className = 'public-table-wrap';
    const table = document.createElement('table');
    const thead = document.createElement('thead');const tr = document.createElement('tr');
    for (const h of headers) {const th=document.createElement('th');th.textContent=h;tr.append(th);}
    thead.append(tr);table.append(thead);
    const tbody = document.createElement('tbody');
    for (const r of rows) {
      const tr = document.createElement('tr');
      for (const value of r) {const td=document.createElement('td');td.textContent=String(value ?? '—');tr.append(td);}
      tbody.append(tr);
    }
    table.append(tbody);wrap.append(table);return wrap;
  }
  async function showResults() {
    results.replaceChildren(h2('結果速報'), p(`選択中：${issueDate.replaceAll('-', '/')}　｜　確定した結果のみ表示します。`, 'public-note'));
    if (!resultLoaded) {
      cachedResults = await fetchJson(`./data/public-results/${issueDate}.json`).catch(() => null);
      resultLoaded = true;
    }
    const entries = cachedResults && cachedResults.schema_version === '1.0' && cachedResults.date === issueDate && Array.isArray(cachedResults.races) ? cachedResults.races.filter(x=>x.official_confirmed===true) : [];
    const panel = card();
    if (entries.length) {
      panel.append(p(`公式確認済み ${entries.length}レース。未確定・未取得レースは集計に含めません。`));
      panel.append(makeTable(['場','R','着順','決まり手','3連単払戻'],entries.map(x=>[x.venue,`${x.race_no}R`,Array.isArray(x.order)?x.order.join('-'):'—',x.method||'—',x.trifecta_payout_yen!=null?`${x.trifecta_payout_yen}円`:'—'])));
    } else {
      panel.append(p('この日の確認済み結果データは、現在のHPには登録されていません。', 'public-status'));
      const link = externalResultsLink();if(link)panel.append(link);
    }
    results.append(panel);
  }

  const periods = {yesterday:1,week:7,month:30,year:365};
  const periodNames = {yesterday:'前日',week:'週間（過去7日）',month:'月間（過去30日）',year:'年間（過去365日）'};
  const conditions = {
    all:'全レース',escape:'①逃げ成立',upset:'非①頭',sashi:'差し決着',makuri:'まくり決着',makurizashi:'まくり差し決着',sg:'SG',g1:'G1',morning:'モーニング',day:'デイ',night:'ナイター'
  };
  const metrics = {
    head:'◎1着的中',two:'2連単一致',main:'本線3連単的中',method:'頭＋決まり手一致',A:'A評価（完全一致）'
  };
  let chosenPeriod='week',chosenCondition='all',chosenMetric='head';
  function jstYesterday() {
    const parts = new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
    const v = Object.fromEntries(parts.map(x=>[x.type,x.value]));
    const jst = `${v.year}-${v.month}-${v.day}`;
    const day = new Date(`${jst}T00:00:00Z`);
    day.setUTCDate(day.getUTCDate()-1);
    return day;
  }
  function rangeStart(earliest, n) {const d=new Date(earliest);d.setUTCDate(d.getUTCDate()-n+1);return d;}
  function dateISO(d){return d.toISOString().slice(0,10);}
  function eligible(r) {
    if(!r || r.mode!=='M0' || r.official_confirmed!==true || r.paired_verified!==true ||
      !r.shared_input_sha256 || !Array.isArray(r.actual_order) || r.actual_order.length!==3 ||
      !r.reporters || !r.reporters.ocha || !r.reporters.gemi || !r.closing_at) return false;
    const cutoff=Date.parse(r.closing_at);if(!Number.isFinite(cutoff))return false;
    for(const k of ['ocha','gemi']){
      const f=r.reporters[k];
      if(f.input_sha256!==r.shared_input_sha256 || !f.freeze_at ||
        !Number.isFinite(Date.parse(f.freeze_at)) || Date.parse(f.freeze_at)>=cutoff ||
        f.retrospective===true || f.published_before_cutoff!==true) return false;
    }
    return true;
  }
  function conditionMatches(r,condition) {
    if(condition==='all')return true;
    if(condition==='escape')return String(r.actual_order[0])==='1';
    if(condition==='upset')return String(r.actual_order[0])!=='1';
    if(['sashi','makuri','makurizashi'].includes(condition))return ({sashi:'差し',makuri:'まくり',makurizashi:'まくり差し'})[condition]===r.actual_method;
    if(['sg','g1'].includes(condition))return String(r.grade||'').toLowerCase()===condition;
    return r.session===condition;
  }
  function hit(r,key,metric){
    const f=r.reporters[key],first=String(r.actual_order[0]);
    if(metric==='head')return String(f.main_pick)===first;
    if(metric==='two')return String(f.main_pick)===first && String(f.second_pick)===String(r.actual_order[1]);
    if(metric==='main')return Array.isArray(f.main_bets) && f.main_bets.includes(r.actual_order.map(String).join('-'));
    if(metric==='method')return String(f.main_pick)===first && f.predicted_method===r.actual_method;
    if(metric==='A')return f.scenario_grade==='A' && f.scenario_review_verified===true;
    return false;
  }
  function exactP(a,b) { // paired two-sided McNemar, exact binomial for moderate n
    const n=a+b,m=Math.min(a,b);if(n===0)return 1;
    if(n>1000){const z=(Math.abs(a-b)-1)/Math.sqrt(n);return 2*(1/(1+Math.exp(1.702*Math.max(0,z))))}
    let term=Math.pow(.5,n),sum=term;
    for(let i=1;i<=m;i++){term*=((n-i+1)/i);sum+=term;}
    return Math.min(1,2*sum);
  }
  function statusFor(records,metric){
    const n=records.length;if(!n)return {label:'比較対象なし',lead:null};
    let a=0,b=0,onlyA=0,onlyB=0;
    for(const r of records){const x=hit(r,'ocha',metric),y=hit(r,'gemi',metric);if(x)a++;if(y)b++;if(x&&!y)onlyA++;if(y&&!x)onlyB++;}
    const d=(a-b)/n*100;
    const strong=n>=100 && Math.abs(d)>=5 && exactP(onlyA,onlyB)<.05;
    const lead=strong?(d>0?'ocha':'gemi'):null;
    return {n,a,b,d,lead,label:lead ? `${lead==='ocha'?'お茶P':'Gemi兄'}が優勢` : n<30?'標本不足': '明確な優劣は未確定'};
  }
  function makeSelect(options,value,callback,label){
    const s=document.createElement('select');s.setAttribute('aria-label',label);
    for(const [key,text] of Object.entries(options)){const o=document.createElement('option');o.value=key;o.textContent=text;s.append(o);}
    s.value=value;s.addEventListener('change',()=>callback(s.value));return s;
  }
  function renderComparison(){
    versus.replaceChildren(h2('お茶P記者 vs Gemi兄記者'),p('同一M0入力・同一レース・締切前凍結の両記者予想だけを比較。事後検証は対象外。','public-note'));
    const control=document.createElement('div');control.className='public-controls';
    control.append(
      makeSelect(periodNames,chosenPeriod,v=>{chosenPeriod=v;renderComparison()},'集計期間'),
      makeSelect(conditions,chosenCondition,v=>{chosenCondition=v;renderComparison()},'得意条件'),
      makeSelect(metrics,chosenMetric,v=>{chosenMetric=v;renderComparison()},'評価指標')
    );versus.append(control);
    const yesterday=jstYesterday(),start=dateISO(rangeStart(yesterday,periods[chosenPeriod])),end=dateISO(yesterday);
    const entries=(performance?.records||[]).filter(r=>{
      if(!eligible(r) || r.date<start || r.date>end || !conditionMatches(r,chosenCondition))return false;
      const a=r.reporters.ocha,b=r.reporters.gemi;
      if(chosenMetric==='A')return a.scenario_review_verified===true && b.scenario_review_verified===true &&
        ['A','B','C','D'].includes(a.scenario_grade) && ['A','B','C','D'].includes(b.scenario_grade);
      if(chosenMetric==='method')return Boolean(r.actual_method && a.predicted_method && b.predicted_method);
      if(chosenMetric==='two')return a.second_pick!=null && b.second_pick!=null;
      if(chosenMetric==='main')return Array.isArray(a.main_bets) && Array.isArray(b.main_bets);
      return true;
    });
    const score=statusFor(entries,chosenMetric);
    const panel=card();
    panel.append(p(`${start} ～ ${end} ｜ 比較可能なレース：${entries.length}R`, 'public-note'));
    if(!entries.length){panel.append(p('この期間・条件では、検証済みの両記者比較データがありません。','public-status'));}
    else{
      const grid=document.createElement('div');grid.className='public-grid';
      for(const [key,name,count] of [['ocha','お茶P記者',score.a],['gemi','Gemi兄記者',score.b]]){
        const c=card();c.append(p(name));const num=document.createElement('span');num.className='public-number';num.textContent=`${(100*count/score.n).toFixed(1)}%`;c.append(num,p(`${count}/${score.n}R`,'public-note'));grid.append(c);
      }
      panel.append(grid);
      panel.append(p(`${score.label}。条件別の「強い」判定は、共通対象100R以上・差5ポイント以上・対応のある比較検定で有意な場合のみ表示します。`,'public-note'));
    }
    versus.append(panel);
    const definitions=card();
    definitions.append(h2('昨晩の新しい観点：展開の再現性'));
    definitions.append(makeTable(['評価','基準'],[
      ['A 完全一致','的中＋展開・決まり手が一致（根拠を検証）'],
      ['B 結果オーライ','的中したが展開の想定が違う'],
      ['C 展開惜敗','展開は近いが着順・買い目は不的中'],
      ['D 予想不成立','想定した攻め筋・展開が成立しない'],
      ['未判定','映像・展開資料等が不足している']
    ]));
    definitions.append(p('着順だけからA〜Dを決めません。記者の得意不得意は公開可能な検証済み集計だけで示します。','public-note'));
    versus.append(definitions);
  }
  async function showComparison(){
    if(!performanceLoaded){performance=await fetchJson('./data/public-performance.json').catch(()=>null);performanceLoaded=true;}
    if(!performance || performance.schema_version!=='1.0'||!Array.isArray(performance.records))performance={records:[]};
    renderComparison();
  }
  function switchView(which){
    for(const [key,button] of Object.entries(controls))button.setAttribute('aria-pressed',String(key===which));
    for(const node of originals)node.classList.toggle('ochap-public-original-hidden',which!=='forecast');
    panels.hidden=which==='forecast';results.hidden=which!=='results';versus.hidden=which!=='versus';
    if(which==='results')showResults();if(which==='versus')showComparison();
    const current=new URL(location.href);if(which==='forecast')current.searchParams.delete('view');else current.searchParams.set('view',which);
    if(location.protocol==='http:' || location.protocol==='https:') history.replaceState(null,'',current.pathname+current.search+current.hash);
  }
  const requested=new URL(location.href).searchParams.get('view');
  switchView(requested==='versus'||requested==='results'?requested:'forecast');
})();
