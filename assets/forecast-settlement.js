/* Additive prediction/result overlay: no changes to frozen HTML, tickets or official BC. */
(() => {
  'use strict';
  if (window.__OCHAP_SETTLEMENT_READER__) return;
  window.__OCHAP_SETTLEMENT_READER__ = true;
  const board = document.body.matches('.press-board');
  const dateSelector = document.getElementById('board-date');
  const forecastSource = board ? document.getElementById('board-list') :
    (document.getElementById('cards') || document.querySelector('main'));
  if (!forecastSource) return;
  const SETTINGS_KEY='ochap.reader.settlement.v1';
  const defaults={filter:'all',density:'normal',finance:false};
  const allowedFilter=new Set(['all','open','official','hits']);
  const allowedDensity=new Set(['normal','simple','detail']);
  const boats=['桐生','戸田','江戸川','平和島','多摩川','浜名湖','蒲郡','常滑','津','三国','びわこ','住之江','尼崎','鳴門','丸亀','児島','宮島','徳山','下関','若松','芦屋','福岡','唐津','大村'];
  const nowJst=()=>{
    const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
    const x=Object.fromEntries(parts.map(p=>[p.type,p.value]));
    return x.year+'-'+x.month+'-'+x.day;
  };
  const readSettings=()=>{
    try {
      const o=JSON.parse(localStorage.getItem(SETTINGS_KEY)||'{}');
      return {filter:allowedFilter.has(o.filter)?o.filter:'all',
        density:allowedDensity.has(o.density)?o.density:'normal',finance:o.finance===true};
    } catch (_) {return {...defaults};}
  };
  let settings=readSettings(),activeDate='',rows=new Map(),forecasts={},serial=0;
  const detailInitial=new WeakMap();
  const oneYen=x=>Number.isFinite(x)?x.toLocaleString('ja-JP')+'円':'未取得';
  const resultId=r=>'v'+r.venue_code+'-r'+r.race_no;
  const create=(tag,cls,value)=>{
    const node=document.createElement(tag);
    if(cls)node.className=cls;
    if(value!==undefined)node.textContent=value;
    return node;
  };
  const validTicket=x=>typeof x==='string'&&/^[1-6]-[1-6]-[1-6]$/.test(x)&&new Set(x.split('-')).size===3;
  const strictDate=x=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(x);
  const finiteDeadline=(x,date)=>{
    if(typeof x!=='string'||!/(?:Z|[+-]\d{2}:\d{2})$/.test(x))return null;
    const ms=Date.parse(x);
    if(!Number.isFinite(ms))return null;
    return new Date(ms+9*3600000).toISOString().slice(0,10)===date?ms:null;
  };
  // Data is an API bulletin unless official confirmation and an official source are BOTH present.
  function classify(r,date){
    if(!r||!Number.isInteger(r.venue_code)||r.venue_code<1||r.venue_code>24||
       !Number.isInteger(r.race_no)||r.race_no<1||r.race_no>12||
       !Array.isArray(r.order)||r.order.length!==3||
       !r.order.every(x=>Number.isInteger(x)&&x>=1&&x<=6)||new Set(r.order).size!==3)return null;
    const official=r.official_confirmed===true;
    if(!official && !(r.official_confirmed===false&&r.result_status==='API_REPORTED'))return null;
    try{
      const u=new URL(official?r.official_result_source_ref:r.result_source_ref);
      if(u.protocol!=='https:')return null;
      if(official && (u.hostname!=='www.boatrace.jp'||u.pathname!=='/owpc/pc/race/raceresult'))return null;
      if(!official && (u.hostname!=='boatraceopenapi.github.io' ||
        u.pathname!=='/api/v1/'+date.slice(0,4)+'/'+date.replaceAll('-','')+'.json'))return null;
    }catch(_){return null;}
    return {...r,official,validPayout:Number.isInteger(r.trifecta_payout_yen)&&r.trifecta_payout_yen>=100};
  }
  function allCards(){
    if(board)return [...forecastSource.querySelectorAll(':scope > .board-card')];
    return [...forecastSource.querySelectorAll('article[id^="v"]')].filter(x=>/^v\d+-r\d+$/.test(x.id));
  }
  function cardId(card){
    if(!board)return card.id;
    const title=card.querySelector('.board-head h2')?.textContent?.trim()||'';
    const m=title.match(/^(.+?)\s+(\d{1,2})R$/);
    if(!m)return null;
    const venue=boats.indexOf(m[1])+1;
    return venue>0?'v'+venue+'-r'+Number(m[2]):null;
  }
  function parsedBoard(card){
    const rec={main:[],reverse:[],navi:[]};
    for(const row of card.querySelectorAll('.board-line')){
      const name=row.querySelector('b')?.textContent?.trim()||'';
      const key=name.startsWith('本線')?'main':name.startsWith('逆張り')?'reverse':name.startsWith('舟券ナビ')?'navi':null;
      if(!key)continue;
      const values=[...row.querySelectorAll('.board-ticket')].map(x=>x.textContent.trim());
      if(!values.every(validTicket))return null;
      rec[key]=[...new Set(values)];
    }
    return rec.main.length?rec:null;
  }
  function picksFor(card,id){
    if(board)return {ocha:parsedBoard(card)};
    return forecasts[id]||{};
  }
  const cleanPicks=r=>{
    if(!r || !Array.isArray(r.main)||!r.main.length)return null;
    const out={};
    for(const k of ['main','reverse','navi']){
      const arr=r[k]??[];
      if(!Array.isArray(arr)||!arr.every(validTicket))return null;
      out[k]=[...new Set(arr)];
    }
    return out;
  };
  function groupHit(row,rec){
    const ticket=row.order.join('-'),out=[];
    for(const [key,label] of [['main','本線'],['reverse','逆張り'],['navi','舟券ナビ']]){
      const idx=rec[key].indexOf(ticket);
      if(idx>=0)out.push(label+(key==='main'?' '+(idx+1)+'位':''));
    }
    return out;
  }
  function deadlineFor(card,id){
    if(board){
      const item=card.querySelector('.board-time');
      if(!item)return null;
      const m=(item.textContent||'').match(/([01]?\d|2[0-3]):([0-5]\d)/);
      return m?finiteDeadline(activeDate+'T'+m[1].padStart(2,'0')+':'+m[2]+':00+09:00',activeDate):null;
    }
    return finiteDeadline(card.dataset.deadline,activeDate);
  }
  function statusFor(card,id){
    const row=rows.get(id);
    if(row)return row.official?'official':'api';
    const deadline=deadlineFor(card,id);
    return deadline!==null&&deadline>Date.now()?'open':'unknown';
  }
  function financial(row,id,author,picks){
    const engine=window.OchaPHitReporters;
    const rec=cleanPicks(picks);
    if(!rec||!engine?.score)return '収支を計算できません（買い目情報不足）';
    // The same 100-yen/category policy as the existing results dashboard.
    const s=engine.score([row],{[id]:{[author]:rec}},author,'all','three');
    if(!s.n)return '集計対象外';
    if(s.missingPayout||s.refundUnknown||!s.financeN)
      return '投資 '+oneYen(s.totalStake)+'／収支保留（'+
        (s.missingPayout?'払戻確認待ち':'返還情報未確認')+'）';
    const profit=s.payout-s.stake;
    return '投資 '+oneYen(s.stake)+' ／ 払戻＋返還 '+oneYen(s.payout)+
      ' ／ 収支 '+(profit>0?'+':'')+oneYen(profit)+
      (row.official?'（公式確認済み）':'（速報値・正式BCではありません）');
  }
  function createSettlement(card,id){
    const row=rows.get(id),parent=card.querySelector(board?'.board-head':'.race-head');
    if(!parent)return;
    const current=card.querySelector('.ochap-settle-bulletin');
    if(!row){
      current?.remove();
      return;
    }
    const predicted=picksFor(card,id);
    const box=current||create('section','ochap-settle-bulletin');
    box.setAttribute('aria-label','このレースの結果と予想的中');
    box.replaceChildren();
    const head=create('div','ochap-settle-head');
    const raw=row.order.join('-');
    const status=create('strong','ochap-settle-kind',row.official?'公式確定':'API速報・未確定');
    status.title=row.official?'公式の確定結果':'API速報。公式結果は未確認です';
    const outcome=create('span','ochap-settle-outcome','3連単 '+raw+'｜'+oneYen(row.validPayout?row.trifecta_payout_yen:null));
    outcome.append(create('small','ochap-settle-unit',' /100円'));
    head.append(status,outcome);
    box.append(head);
    const authors=board?[['ocha',document.body.dataset.boardMode==='m1'?'お茶P M1':'お茶P']]:
      [['ocha','お茶P'],['gemi','Gemi兄']];
    for(const [author,label] of authors){
      const picks=cleanPicks(predicted[author]);
      if(!picks)continue;
      const hit=groupHit(row,picks);
      const brief=hit.map(value=>value.replace(/^本線 ([1-8])位$/,(_,n)=>
        '本線'+['①','②','③','④','⑤','⑥','⑦','⑧'][Number(n)-1]).replace('舟券ナビ','ナビ')).join('・');
      const line=create('p','ochap-settle-line');
      line.append(create('span','ochap-settle-author',label));
      if(hit.length){
        const indicator=create('span','ochap-settle-judgment','🎯的中 '+brief);
        indicator.title=row.official?'公式確認済みの的中':'API速報の的中（公式未確認）';
        line.append(indicator,create('strong','ochap-settle-amount',
          row.validPayout?(hit.length>1?'計':'')+oneYen(row.trifecta_payout_yen*hit.length):'金額未取得'));
        line.classList.add('ochap-settle-hit');
      }else line.append(create('span','ochap-settle-judgment','不的中'));
      box.append(line);
      if(settings.finance)
        box.append(create('p','ochap-settle-finance',label+'｜'+financial(row,id,author,picks)));
    }
    if(!current)parent.after(box);
  }
  function decorateExtra(){
    if(board)return;
    for(const card of document.querySelectorAll('.favorite-race[data-race-id],.special-card[data-race-id]')){
      const id=card.dataset.raceId;
      if(!/^v\d+-r\d+$/.test(id))continue;
      const row=rows.get(id);
      const existing=card.querySelector(':scope > .ochap-settle-extra');
      if(!row){existing?.remove();continue;}
      const host=existing||create('p','ochap-settle-extra');
      const p=cleanPicks(forecasts[id]?.ocha);
      const hit=p?groupHit(row,p):[];
      const prefix=row.official?'公式確認済み':'API速報';
      const label=prefix+'｜3連単 '+row.order.join('-')+' ／ '+oneYen(row.validPayout?row.trifecta_payout_yen:null)+
        (hit.length?' ／ お茶P '+(row.official?'🎯的中':'🎯速報的中')+'（'+hit.join('・')+'）':'');
      if(host.textContent!==label)host.textContent=label;
      if(!existing)(card.querySelector('.favorite-race-head,.special-card-head')||card.firstElementChild).after(host);
    }
  }
  function setDensity(cards){
    for(const card of cards){
      for(const detail of card.querySelectorAll(board ? ':scope > details,.board-details details' : '.copy details,.ochap-gemi-pane details')){
        if(settings.density==='normal'){
          if(detailInitial.has(detail)){detail.open=detailInitial.get(detail);detailInitial.delete(detail);}
        }else{
          if(!detailInitial.has(detail))detailInitial.set(detail,detail.open);
          detail.open=settings.density==='detail';
        }
      }
    }
  }
  let elements=null;
  function render(){
    const cards=allCards();
    for(const card of cards){
      const id=cardId(card);
      if(!id)continue;
      const state=statusFor(card,id);
      const picks=picksFor(card,id);
      const hit=rows.has(id)&&Object.values(picks).some(x=>{
        const rec=cleanPicks(x);return rec&&groupHit(rows.get(id),rec).length>0;
      });
      const shown=settings.filter==='all'||(settings.filter==='open'&&state==='open')||
        (settings.filter==='official'&&state==='official')||
        (settings.filter==='hits'&&hit);
      card.classList.toggle('ochap-settle-filtered',!shown);
      createSettlement(card,id);
    }
    setDensity(cards);
    decorateExtra();
    if(elements){
      elements.filter.value=settings.filter;
      elements.density.value=settings.density;
      elements.finance.checked=settings.finance;
      const total=[...rows.values()].filter(x=>x.official).length;
      const api=rows.size-total;
      elements.status.textContent='掲載結果 '+rows.size+'R（公式確認 '+total+'R／API速報 '+api+'R）・3連単100円単位';
    }
  }
  function store(){
    try{localStorage.setItem(SETTINGS_KEY,JSON.stringify(settings));}catch(_){}
  }
  function selector(label,options,value){
    const el=create('label','ochap-settle-control');
    el.append(create('span','',label));
    const input=document.createElement('select');input.setAttribute('aria-label',label);
    for(const [v,t] of options){const op=create('option','',t);op.value=v;input.append(op);}
    input.value=value;el.append(input);
    return {label:el,input};
  }
  function toggler(label,checked){
    const el=create('label','ochap-settle-check');
    const input=document.createElement('input');input.type='checkbox';input.checked=checked;
    input.setAttribute('aria-label',label);
    el.append(input,document.createTextNode(' '+label));
    return {label:el,input};
  }
  function mountControls(){
    const host=create('section','ochap-settle-controls');
    host.id='ochap-settle-controls';host.setAttribute('aria-label','予想と結果の表示設定');
    const filter=selector('結果で絞り込み',[['all','全レース'],['open','未締切'],['official','結果確定'],['hits','的中のみ']],settings.filter);
    const density=selector('表示の詳しさ',[['normal','従来表示'],['simple','簡易'],['detail','詳細']],settings.density);
    const finance=toggler('平買い収支を表示',settings.finance);
    const refresh=create('button','ochap-settle-refresh','結果更新');refresh.type='button';refresh.id='ochap-settle-refresh';
    const status=create('p','ochap-settle-status','結果データを確認しています。');
    status.setAttribute('role','status');
    for(const x of [filter,density,finance])host.append(x.label);
    host.append(refresh,status);
    if(board){
      const toolbar=document.querySelector('.board-controls');
      if(toolbar)toolbar.after(host);else forecastSource.before(host);
    }else{
      const first=forecastSource.querySelector('article[id]');
      if(first)first.before(host);else forecastSource.prepend(host);
    }
    elements={filter:filter.input,density:density.input,finance:finance.input,status};
    filter.input.addEventListener('change',()=>{settings.filter=filter.input.value;store();render();});
    density.input.addEventListener('change',()=>{settings.density=density.input.value;store();render();});
    finance.input.addEventListener('change',()=>{settings.finance=finance.input.checked;store();render();});
    refresh.addEventListener('click',()=>loadResults());
  }
  async function loadResults(){
    const date=board?dateSelector?.value:window.__OCHAP_SELECTED_DATE__;
    if(!strictDate(date))return;
    const request=++serial;activeDate=date;
    if(elements)elements.status.textContent='結果データを確認しています。';
    const [data,loaded]=await Promise.all([
      fetch('./data/public-results/'+date+'.json',{cache:'no-store'})
        .then(r=>r.ok?r.json():null).catch(()=>null),
      !board&&window.OchaPHitReporters?.load?window.OchaPHitReporters.load(date).catch(()=>null):Promise.resolve(null)
    ]);
    if(request!==serial)return;
    forecasts=loaded||{};
    rows=new Map();
    if(data?.schema_version==='1.0'&&data.date===date&&Array.isArray(data.races)){
      for(const rec of data.races){
        const row=classify(rec,date);
        if(row)rows.set(resultId(row),row);
      }
    }
    render();
  }
  const style=document.createElement('link');
  style.rel='stylesheet';style.href='./assets/forecast-settlement.css?v=20261121-inline3';
  document.head.append(style);
  mountControls();
  if(board){
    const observer=new MutationObserver(()=>render());
    observer.observe(forecastSource,{childList:true});
    dateSelector?.addEventListener('change',()=>loadResults());
  }else{
    for(const id of ['ochap-favorites-view','ochap-special-view']){
      const root=document.getElementById(id);
      if(root)new MutationObserver(()=>decorateExtra()).observe(root,{childList:true,subtree:true});
    }
  }
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)loadResults();});
  document.addEventListener('hashchange',()=>{
    if(settings.filter!=='all'&&location.hash){
      settings.filter='all';store();render();
    }
  });
  loadResults();
  // Restrict periodic network access to today's active edition, with results requested only while visible.
  setInterval(()=>{if(!document.hidden&&activeDate===nowJst())loadResults();},120000);
})();
