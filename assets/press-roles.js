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
  // Results are independently dated from the latest published forecast edition.
  // This permits today's official bulletin even if today's newspaper has not
  // yet been published. Archived non-default dates retain their own results.
  function resultsDate() {
    const parts = new Intl.DateTimeFormat('en-US', {timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
    const get = (type) => parts.find(p => p.type === type)?.value;
    const today = get('year')+'-'+get('month')+'-'+get('day');
    const requested = new URL(location.href).searchParams.get('date');
    const isValid = (x) => /^\d{4}-\d{2}-\d{2}$/.test(x || '');
    const currentDefault = window.__OCHAP_ISSUE_INDEX__?.default_date;
    if (isValid(requested) && requested > currentDefault && requested <= today) return requested;
    return (issueDate === currentDefault && today >= issueDate) ? today : issueDate;
  }
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
  let resultsFetchSerial = 0;
  function validBulletinRow(x) {
    if (!x || !Array.isArray(x.order) || x.order.length !== 3 ||
        new Set(x.order).size !== 3 ||
        !x.order.every(n => Number.isInteger(n) && n >= 1 && n <= 6) ||
        !Number.isInteger(x.trifecta_payout_yen) || x.trifecta_payout_yen < 100) return false;
    const isOfficialLegacy = x.official_confirmed === true;
    const isApi = x.official_confirmed === false && x.result_status === 'API_REPORTED';
    if (!isOfficialLegacy && !isApi) return false;
    const address = isOfficialLegacy ? x.official_result_source_ref : x.result_source_ref;
    try {
      const url = new URL(address);
      if (url.protocol !== 'https:') return false;
      return isOfficialLegacy
        ? url.hostname === 'www.boatrace.jp' && url.pathname === '/owpc/pc/race/raceresult'
        : url.hostname === 'boatraceopenapi.github.io' && /^\/api\/v1\/\d{4}\/\d{8}\.json$/.test(url.pathname);
    } catch (_) { return false; }
  }
  async function showResults() {
    const date = resultsDate();
    const serial = ++resultsFetchSerial;
    results.replaceChildren(h2('結果速報'),
      p('更新されたレース結果を順次掲載します。', 'public-note'),
      p('結果を読み込み中…', 'public-status'));
    const data = await fetchJson('./data/public-results/' + date + '.json').catch(() => null);
    if (serial !== resultsFetchSerial || results.hidden) return;
    const entries = data && data.schema_version === '1.0' && data.date === date && Array.isArray(data.races)
      ? data.races.filter(validBulletinRow) : [];
    const panel = card();
    if (entries.length) {
      panel.append(p('掲載中：' + entries.length + 'レース', 'public-note'));
      if (data.checked_at_jst) {
        const updated = new Date(data.checked_at_jst);
        if (!Number.isNaN(updated.getTime())) {
          panel.append(p('更新：' + new Intl.DateTimeFormat('ja-JP', {
            timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric',
            hour: '2-digit', minute: '2-digit'
          }).format(updated), 'public-note'));
        }
      }
      panel.append(makeTable(['場','R','着順','決まり手','3連単払戻'], entries.map(x => [
        x.venue, x.race_no + 'R', x.order.join('-'), x.method || '—',
        x.trifecta_payout_yen.toLocaleString('ja-JP') + '円'
      ])));
    } else {
      panel.append(p(date === '2026-10-30'
        ? 'この日の全レース結果・的中一覧は上のダイジェストをご覧ください。'
        : 'まだ結果は届いていません。レース終了後に順次更新します。', 'public-status'));
    }
    const scorecard = document.createElement('div');
    scorecard.className = 'ochap-scorecard-mount';
    results.replaceChildren(h2('結果速報'), p('対象日：' + date.replaceAll('-', '/'), 'public-note'), scorecard, panel);
    if (window.OchaPScorecard?.mount) window.OchaPScorecard.mount(scorecard, date);
  }
  // Check on returning to the tab and while the bulletin is open.
  setInterval(() => {
    if (!results.hidden && document.visibilityState === 'visible') showResults();
  }, 90000);

  const periods = {yesterday:1,week:7,month:30,year:365};
  const periodNames = {yesterday:'前日',week:'週間（過去7日）',month:'月間（過去30日）',year:'年間（過去365日）'};
  const conditions = {
    all:'全レース',escape:'①号艇1着',upset:'非①号艇1着',
    'course:1':'1コースからの1着','course:2':'2コースからの1着',
    'course:3':'3コースからの1着','course:4':'4コースからの1着',
    'course:5':'5コースからの1着','course:6':'6コースからの1着',
    sashi:'差し決着',makuri:'まくり決着',makurizashi:'まくり差し決着',nuki:'抜き決着',megumare:'恵まれ決着',sg:'SG',g1:'G1',g2:'G2',g3:'G3',general:'一般戦',morning:'モーニング',day:'デイ',night:'ナイター',agree:'両者◎一致',disagree:'両者◎対立',bothEscape:'両者とも①頭',bothUpset:'両者とも非①頭',...Object.fromEntries([1,2,3,4,5,6].map(n=>['boat:'+n,n+'号艇1着']))
  };
  const metrics = {
    head:'◎1着的中',headPlace2:'◎2着以内',headPlace3:'◎3着以内',
    winTop2:'勝艇を◎○で捕捉',winTop3:'勝艇を◎○▲で捕捉',
    second:'○2着的中',third:'▲3着的中',
    two:'◎→○ 2連単一致',exact3:'◎○▲ 3連単一致',
    trio3:'◎○▲ 3連複一致',main:'本線3連単的中',
    reverse:'逆張り的中',navi:'舟券ナビ的中',any:'3区分いずれか的中',
    method:'◎＋決まり手一致',methodOnly:'決まり手一致',
    escapeCall:'①頭／非①頭の判定一致',A:'A評価（展開完全一致）'
  };
  const metricGroups = {
    '着順・印':['head','headPlace2','headPlace3','winTop2','winTop3','second','third','two','exact3','trio3'],
    '舟券':['main','reverse','navi','any'],
    '展開・決まり手':['method','methodOnly','escapeCall','A']
  };
  const allVenues=['桐生','戸田','江戸川','平和島','多摩川','浜名湖','蒲郡','常滑','津','三国','びわこ','住之江','尼崎','鳴門','丸亀','児島','宮島','徳山','下関','若松','芦屋','福岡','唐津','大村'];
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
    if(!r || r.mode!=='M0' || r.official_confirmed!==true || r.paired_verified!==true || !r.official_result_source_ref ||
      !r.shared_input_sha256 || !Array.isArray(r.actual_order) || r.actual_order.length!==3 ||
      !r.reporters || !r.reporters.ocha || !r.reporters.gemi || !r.closing_at) return false;
    const cutoff=Date.parse(r.closing_at);if(!Number.isFinite(cutoff))return false;
    for(const k of ['ocha','gemi']){
      const f=r.reporters[k];
      if(f.input_sha256!==r.shared_input_sha256 || !f.forecast_source_ref || !f.freeze_at ||
        !Number.isFinite(Date.parse(f.freeze_at)) || Date.parse(f.freeze_at)>=cutoff ||
        f.retrospective===true || f.published_before_cutoff!==true) return false;
    }
    return true;
  }
  // Actual course (1C..6C) is not interchangeable with the winning boat number.
  // actual_entry_order is the official list of boat numbers by course, 1C first.
  // Exclude any missing/partial/unverified entry from course-specific statistics.
  function actualWinningCourse(r) {
    if (r.official_entry_verified !== true || !r.official_entry_source_ref) return null;
    const order = r.actual_entry_order;
    if (!Array.isArray(order) || order.length !== 6 ||
        new Set(order.map(String)).size !== 6 ||
        !order.every(boat => /^[1-6]$/.test(String(boat)))) return null;
    const winner = String(r.actual_order?.[0] ?? '');
    const idx = order.map(String).indexOf(winner);
    return idx < 0 ? null : idx + 1;
  }
  function conditionMatches(r,condition) {
    if(condition==='all')return true;
    if(condition.startsWith('course:'))return actualWinningCourse(r)===Number(condition.slice(7));
    if(condition.startsWith('venue:'))return r.venue===condition.slice('venue:'.length);
    if(condition.startsWith('boat:'))return String(r.actual_order[0])===condition.slice(5);
    if(condition==='agree')return getPick(r.reporters.ocha,'main')!==null && getPick(r.reporters.ocha,'main')===getPick(r.reporters.gemi,'main');
    if(condition==='disagree')return getPick(r.reporters.ocha,'main')!==null && getPick(r.reporters.gemi,'main')!==null && getPick(r.reporters.ocha,'main')!==getPick(r.reporters.gemi,'main');
    if(condition==='bothEscape')return ['ocha','gemi'].every(k=>getPick(r.reporters[k],'main')==='1');
    if(condition==='bothUpset')return ['ocha','gemi'].every(k=>getPick(r.reporters[k],'main')!==null && getPick(r.reporters[k],'main')!=='1');
    if(condition==='escape')return String(r.actual_order[0])==='1';
    if(condition==='upset')return String(r.actual_order[0])!=='1';
    if(['sashi','makuri','makurizashi','nuki','megumare'].includes(condition))return ({sashi:'差し',makuri:'まくり',makurizashi:'まくり差し',nuki:'抜き',megumare:'恵まれ'})[condition]===r.actual_method;
    if(['sg','g1','g2','g3','general'].includes(condition)){const g=String(r.grade||'').trim().toLowerCase();return condition==='general'?['一般','一般戦','general','ippan'].includes(g):g===condition;}
    return r.session===condition;
  }
  function getPick(f,which){
    const v = which==='main'?(f.main_pick ?? f.marks?.main):which==='second'?(f.second_pick ?? f.marks?.second):(f.third_pick ?? f.marks?.third);
    return /^[1-6]$/.test(String(v??''))?String(v):null;
  }
  function getBets(f,which) {
    const value=f[which+'_bets'] ?? f.bets?.[which];
    return Array.isArray(value)?value:null;
  }
  function canScore(r,metric){
    return ['ocha','gemi'].every(key=>{
      const f=r.reporters[key],a=getPick(f,'main'),b=getPick(f,'second'),c=getPick(f,'third');
      if(['head','headPlace2','headPlace3','escapeCall'].includes(metric))return !!a;
      if(['winTop2','second','two'].includes(metric))return !!a&&!!b;
      if(['winTop3','third','exact3','trio3'].includes(metric))return !!a&&!!b&&!!c;
      if(['main','reverse','navi'].includes(metric))return getBets(f,metric)!==null && (metric==='main'||getBets(f,metric).length>0);
      if(metric==='any')return ['main','reverse','navi'].every(k=>getBets(f,k)!==null);
      if(metric==='methodOnly')return Boolean(f.predicted_method && r.actual_method);
      if(metric==='method')return Boolean(a&&f.predicted_method&&r.actual_method);
      if(metric==='A')return f.scenario_review_verified===true && Boolean(f.scenario_evidence_ref) && ['A','B','C','D'].includes(f.scenario_grade);
      return false;
    });
  }
  function hit(r,key,metric){
    const f=r.reporters[key],o=r.actual_order.map(String),a=getPick(f,'main'),b=getPick(f,'second'),c=getPick(f,'third');
    if(metric==='head')return a===o[0];
    if(metric==='headPlace2')return o.slice(0,2).includes(a);
    if(metric==='headPlace3')return o.includes(a);
    if(metric==='winTop2')return [a,b].includes(o[0]);
    if(metric==='winTop3')return [a,b,c].includes(o[0]);
    if(metric==='second')return b===o[1];
    if(metric==='third')return c===o[2];
    if(metric==='two')return a===o[0]&&b===o[1];
    if(metric==='exact3')return a===o[0]&&b===o[1]&&c===o[2];
    if(metric==='trio3')return new Set([a,b,c]).size===3 && [a,b,c].every(x=>o.includes(x));
    if(['main','reverse','navi'].includes(metric))return getBets(f,metric)?.includes(o.join('-'))??false;
    if(metric==='any')return ['main','reverse','navi'].some(k=>getBets(f,k)?.includes(o.join('-')));
    if(metric==='methodOnly')return f.predicted_method===r.actual_method;
    if(metric==='method')return a===o[0]&&f.predicted_method===r.actual_method;
    if(metric==='escapeCall')return (a==='1')===(o[0]==='1');
    if(metric==='A')return f.scenario_grade==='A'&&f.scenario_review_verified===true;
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
  function conditionOptions(){
    const opts={...conditions};
    const places=[...new Set([...allVenues,...(performance?.records||[]).map(r=>r.venue).filter(Boolean)])].sort((a,b)=>String(a).localeCompare(String(b),'ja'));
    for(const name of places)opts['venue:'+name]='会場：'+name;
    return opts;
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
      makeSelect(conditionOptions(),chosenCondition,v=>{chosenCondition=v;renderComparison()},'得意条件'),
      makeSelect(metrics,chosenMetric,v=>{chosenMetric=v;renderComparison()},'評価指標')
    );versus.append(control);
    const yesterday=jstYesterday(),start=dateISO(rangeStart(yesterday,periods[chosenPeriod])),end=dateISO(yesterday);
    const baseEntries=(performance?.records||[]).filter(r=>
      eligible(r) && r.date>=start && r.date<=end && conditionMatches(r,chosenCondition));
    const entries=baseEntries.filter(r=>canScore(r,chosenMetric));
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


    const rate=(v,n)=>n?`${(100*v/n).toFixed(1)}%（${v}/${n}R）`:'—';
    const stats=(races,metric)=>{
      const sample=races.filter(r=>canScore(r,metric));
      return {n:sample.length,a:sample.filter(r=>hit(r,'ocha',metric)).length,b:sample.filter(r=>hit(r,'gemi',metric)).length};
    };
    const statLine=(name,races,metric)=>{
      const st=stats(races,metric),delta=st.n?(100*(st.a-st.b)/st.n):null;
      return [name,st.n+'R',rate(st.a,st.n),rate(st.b,st.n),
        delta===null?'—':(delta>0?'+':'')+delta.toFixed(1)+'pt'];
    };
    const tableHead=['比較項目','共通対象','おちゃっぴー','Gemi兄','差'];
    const board=card();board.append(h2('全18項目・比較スコアボード'));
    board.append(p('各指標の集計対象は両記者の予想・公式結果を照合できる共通レースのみ。「—」は未集計で、0%ではありません。','public-note'));
    for(const [group,names] of Object.entries(metricGroups)){
      const h=document.createElement('h3');h.textContent=group;board.append(h);
      board.append(makeTable(tableHead,names.map(metric=>statLine(metrics[metric],baseEntries,metric))));
    }
    versus.append(board);
    if(baseEntries.length){
      const breakdown=card();breakdown.append(h2('記者対決：どちらが当てた？'));
      const both=entries.filter(r=>hit(r,'ocha',chosenMetric)&&hit(r,'gemi',chosenMetric)).length;
      const onlyO=entries.filter(r=>hit(r,'ocha',chosenMetric)&&!hit(r,'gemi',chosenMetric)).length;
      const onlyG=entries.filter(r=>!hit(r,'ocha',chosenMetric)&&hit(r,'gemi',chosenMetric)).length;
      breakdown.append(makeTable(['両者的中','お茶Pのみ','Gemi兄のみ','両者不的中'],
        [[both+'R',onlyO+'R',onlyG+'R',(entries.length-both-onlyO-onlyG)+'R']]));
      const conflicts=baseEntries.filter(r=>getPick(r.reporters.ocha,'main') && getPick(r.reporters.gemi,'main') && getPick(r.reporters.ocha,'main')!==getPick(r.reporters.gemi,'main'));
      breakdown.append(h2('◎本命が割れたレース'),makeTable(tableHead,[statLine('本命対立',conflicts,chosenMetric)]));
      versus.append(breakdown);
      const daterows=[...new Set(baseEntries.map(r=>r.date))].sort().reverse().slice(0,31);
      const dateCard=card();dateCard.append(h2('日別推移'),makeTable(tableHead,daterows.map(day=>statLine(day,baseEntries.filter(r=>r.date===day),chosenMetric))));
      versus.append(dateCard);
    }
    const conditionCard=card();conditionCard.append(h2('どの条件に強い？'));
    conditionCard.append(p('選択した評価指標で、期間・条件を統一して比較。条件が重なるレースは各区分に計上されます。','public-note'));
    const allPeriod=(performance?.records||[]).filter(r=>eligible(r)&&r.date>=start&&r.date<=end);
    const filterGroups={
      '決着傾向':['escape','upset','sashi','makuri','makurizashi','nuki','megumare'],
      '両記者の本命判断':['agree','disagree','bothEscape','bothUpset'],
      '勝艇の号艇':['boat:1','boat:2','boat:3','boat:4','boat:5','boat:6'],
      '実進入コース':['course:1','course:2','course:3','course:4','course:5','course:6'],
      '競走グレード':['sg','g1','g2','g3','general'],
      '時間帯':['morning','day','night']
    };
    for(const [group,keys] of Object.entries(filterGroups)){
      const detail=document.createElement('details');detail.className='public-drilldown';detail.open=group==='決着傾向';
      const summary=document.createElement('summary');summary.textContent=group;detail.append(summary);
      detail.append(makeTable(tableHead,keys.map(key=>statLine(conditions[key],allPeriod.filter(r=>conditionMatches(r,key)),chosenMetric))));
      conditionCard.append(detail);
    }
    const venueDetail=document.createElement('details');venueDetail.className='public-drilldown';
    const venueSummary=document.createElement('summary');venueSummary.textContent='全国24場別の比較を開く';
    venueDetail.append(venueSummary,makeTable(tableHead,allVenues.map(v=>statLine(v,allPeriod.filter(r=>r.venue===v),chosenMetric))));
    conditionCard.append(venueDetail);versus.append(conditionCard);

    // Same verified, paired M0 denominator for both reporters in each winning course.
    // Do not use the selected metric's optional data filter for these head-hit rates.
    const courseCard=card();
    courseCard.append(h2('1〜6コース別・◎1着的中率'));
    const courseRows=[];
    const courseIndexes=chosenCondition.startsWith('course:')
      ? [Number(chosenCondition.slice(7))] : [1,2,3,4,5,6];
    let officialCourseCount=0;
    for (const k of courseIndexes) {
      const races=baseEntries.filter(r=>actualWinningCourse(r)===k);
      const n=races.length;
      officialCourseCount+=n;
      const hitCounts=['ocha','gemi'].map(author=>
        races.filter(r=>String(r.reporters[author].main_pick)===String(r.actual_order[0])).length);
      const cell=(hits)=> n ? `${(100*hits/n).toFixed(1)}%（${hits}/${n}R）` : '—（0R）';
      courseRows.push([`${k}コース`,`${n}R`,cell(hitCounts[0]),cell(hitCounts[1])]);
    }
    courseCard.append(p('実際にそのコースから勝ったレースを分母に、予想◎が勝艇と一致した割合。艇番ではなく公式確認済みの実進入で判定します。','public-note'));
    courseCard.append(makeTable(['1着の実コース','対象数','お茶P記者 ◎的中','Gemi兄記者 ◎的中'],courseRows));
    if (!officialCourseCount) courseCard.append(p(
      '対象期間に公式実進入まで照合できた共通レースはありません。実進入が未取得のレースは0％扱いにせず、集計から除外します。','public-status'));
    else courseCard.append(p(
      `実進入確認済み：${officialCourseCount}R。0Rのコースは未集計であり、的中率0%を意味しません。`,'public-note'));
    versus.append(courseCard);

    const judged=entries.filter(r=>['ocha','gemi'].every(k=>r.reporters[k].scenario_review_verified===true && r.reporters[k].scenario_evidence_ref && ['A','B','C','D'].includes(r.reporters[k].scenario_grade)));
    const story=card();story.append(h2('展開評価 A〜D の内訳'));
    if(!judged.length)story.append(p('両記者の展開を検証できたレースは、まだありません。','public-status'));
    else {
      const rows=['A','B','C','D'].map(g=>[g, ...['ocha','gemi'].map(k=>{
        const n=judged.filter(r=>r.reporters[k].scenario_grade===g).length;
        return `${n}/${judged.length}R（${(100*n/judged.length).toFixed(1)}%）`;
      })]);
      story.append(p(`展開評価の共通分母：${judged.length}R`, 'public-note'));
      story.append(makeTable(['評価','お茶P記者','Gemi兄記者'],rows));
    }
    versus.append(story);
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
    if (!performance.records.length && window.OchaPScorecard?.mount) {
      const scorecard = document.createElement('div');
      scorecard.className = 'ochap-scorecard-mount';
      versus.replaceChildren(h2('記者別成績・比較'), scorecard);
      window.OchaPScorecard.mount(scorecard, resultsDate());
      return;
    }
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
