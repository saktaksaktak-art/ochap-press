/* Standalone additional reader. Does not modify the original newspaper DOM or datasets. */
(() => {
  'use strict';
  const mode=document.body.dataset.boardMode==='m1'?'m1':'m0';
  const byId=id=>document.getElementById(id);
  const dateInput=byId('board-date'),venueInput=byId('board-venue'),closedInput=byId('board-closed');
  const list=byId('board-list'),status=byId('board-status');
  const dayFormatter=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit'});
  const timeFormatter=new Intl.DateTimeFormat('ja-JP',{timeZone:'Asia/Tokyo',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
  const day=value=>{
    const p=Object.fromEntries(dayFormatter.formatToParts(value).map(x=>[x.type,x.value]));
    return p.year+'-'+p.month+'-'+p.day;
  };
  const today=()=>day(new Date());
  const text=(tag,content,className)=>{
    const x=document.createElement(tag);
    x.textContent=String(content??'');
    if(className)x.className=className;
    return x;
  };
  const isTicket=s=>typeof s==='string'&&/^[1-6]-[1-6]-[1-6]$/.test(s)&&new Set(s.split('-')).size===3;
  const tickets=arr=>Array.isArray(arr)?arr.filter(isTicket).slice(0,30):[];
  const validMark=n=>/^[1-6]$/.test(String(n));
  const validDate=s=>/^\d{4}-\d{2}-\d{2}$/.test(String(s||''));
  const validDeadline=(value,date)=>{
    if(typeof value!=='string'||!/(?:Z|[+-]\d{2}:\d{2})$/.test(value))return false;
    const n=Date.parse(value);
    return Number.isFinite(n)&&day(new Date(n))===date;
  };
  const dataCache=new Map();
  let activeDate='',rows=[],readError='',loadingSerial=0;
  async function fetchJson(url){
    const result=await fetch(url,{cache:'no-store'});
    if(!result.ok)return null;
    return result.json();
  }
  function normalized(data,date){
    const isM1=mode==='m1';
    if(!data||data.date!==date||!Array.isArray(data.races))return [];
    if(isM1 && data.schema_version!=='ochap.public.m1.v1')return [];
    if(!isM1 && (data.schema_version!=='ochap.public.consensus.v1'||data.edition!=='M0'))return [];
    const clean=[];
    for(const r of data.races){
      if(!Number.isInteger(r.venue_code)||r.venue_code<1||r.venue_code>24||
         !Number.isInteger(r.race_no)||r.race_no<1||r.race_no>12||
         r.race_id!=='v'+r.venue_code+'-r'+r.race_no||
         typeof r.venue!=='string'||!r.venue.trim()||
         !validDeadline(r.deadline,date))continue;
      if(isM1 && (!validDeadline(r.frozen_at_jst,date) ||
          Date.parse(r.frozen_at_jst)>=Date.parse(r.deadline)||
          !/^[0-9a-f]{64}$/i.test(String(r.source_sha256||''))))continue;
      const cat=r.reporters?.ocha?.categories||{};
      const marks=isM1?r.marks:r.ocha_marks;
      clean.push({
        id:r.race_id,code:String(r.venue_code),venue:r.venue,race:r.race_no,
        deadline:Date.parse(r.deadline),
        marks:Array.isArray(marks)&&marks.every(validMark)?marks:[],
        method:isM1?r.method:r.ocha_method,
        main:tickets(isM1?r.main:cat.main),
        reverse:tickets(isM1?r.reverse:cat.reverse),
        navi:tickets(isM1?r.navi:cat.navi),
        commentary:isM1?r.commentary:null,
        course:isM1?r.course_data:null,
        methodRows:isM1?r.method_data:null,
        localCourse:isM1?r.local_course:null,
        exhibition:isM1?r.exhibition:null,
        branches:isM1?r.branches:null,
        changes:isM1?r.m0_changes:null
      });
    }
    return clean.sort((a,b)=>a.deadline-b.deadline||Number(a.code)-Number(b.code)||a.race-b.race);
  }
  function rowTickets(card,label,items,highlight){
    if(!items.length)return;
    const line=text('div','','board-line');
    line.append(text('b',label));
    items.forEach((item,i)=>line.append(text('span',item,'board-ticket'+(highlight&&i===0?' first':''))));
    card.append(line);
  }
  function addTable(parent,title,rows,columns){
    if(!Array.isArray(rows)||!rows.length)return false;
    parent.append(text('h3',title));
    const wrap=text('div','','board-table-scroll'),table=text('table','','board-table');
    const head=document.createElement('thead'),tr=document.createElement('tr');
    for(const [key,label] of columns)tr.append(text('th',label));
    head.append(tr);table.append(head);
    const body=document.createElement('tbody');
    for(const item of rows){
      if(!item||typeof item!=='object')continue;
      const tr=document.createElement('tr');
      for(const [key] of columns)tr.append(text('td',item[key]===null||item[key]===undefined?'未取得':item[key]));
      body.append(tr);
    }
    table.append(body);wrap.append(table);parent.append(wrap);
    return true;
  }
  function details(card,r){
    if(mode!=='m1')return;
    const exp=document.createElement('details');
    exp.className='board-detail';
    exp.append(text('summary','コース・決まり手・展示・展開詳報'));
    if(typeof r.commentary==='string'&&r.commentary)exp.append(text('p',r.commentary));
    const course=addTable(exp,'コース別着順・ST',r.course,[
      ['boat','艇/C'],['sample_count','母数'],['first','1着%'],
      ['second','2着%'],['third','3着%'],['double','2連対%'],
      ['triple','3連対%'],['average_st','C平均ST'],['st_rank','ST順位']]);
    const methods=addTable(exp,'決まり手別',r.methodRows,[
      ['boat','艇/C'],['sample_count','母数'],['escape','逃げ/逃し%'],
      ['sashi','差し/差され%'],['makuri','まくり/まくられ%'],
      ['makurisashi','まくり差し/差され%']]);
    addTable(exp,'当地コース成績',r.localCourse,[
      ['boat','艇/C'],['sample_count','出走'],['first','1着%'],
      ['second','2着%'],['third','3着%'],['average_st','ST']]);
    addTable(exp,'直前展示',r.exhibition,[
      ['boat','艇'],['st','展示ST'],['display','展示'],
      ['lap','一周'],['turn','まわり足']]);
    if(r.branches){
      if(r.branches.escape)exp.append(text('p','①逃げ成立：'+r.branches.escape));
      if(r.branches.collapse)exp.append(text('p','①逃げ崩壊：'+r.branches.collapse));
    }
    if(r.changes)exp.append(text('p','M0→M1：'+String(r.changes)));
    if(!course||!methods)exp.append(text('p','朝刊コース・決まり手の一部が未掲載です。M0原本のレース詳報を確認してください。','board-note'));
    card.append(exp);
  }
  function render(){
    const now=Date.now();
    const isToday=activeDate===today();
    const all=rows.filter(r=>!venueInput.value||venueInput.value===r.code);
    const open=isToday?all.filter(r=>r.deadline>now):all;
    const past=isToday?all.filter(r=>r.deadline<=now):[];
    const shown=isToday?(closedInput.checked?[...open,...past]:open):all;
    status.textContent=readError||activeDate.replaceAll('-','/')+' ｜ '+(mode==='m1'?'M1直前予想':'M0朝刊')+
      ' ｜ 未締切 '+open.length+'R'+(isToday?'／締切済 '+past.length+'R':'')+
      '（締切順・日本時間）';
    list.replaceChildren();
    if(!shown.length){
      const note=readError||(!rows.length?
        (mode==='m1'?'公開済みのM1原本はありません。締切前の凍結と出典を確認できた予想のみ掲載します。':'この号の予想一覧は未取得です。'):
        '未締切の対象レースはありません。必要なら「締切済みも表示」を選んでください。');
      const empty=text('div',note,'board-empty');
      if(mode==='m1'){
        const a=text('a','M0朝刊の締切順を見る');a.href='./deadline.html?date='+encodeURIComponent(activeDate);
        empty.append(document.createTextNode(' '),a);
      }
      list.append(empty);return;
    }
    const fragment=document.createDocumentFragment();
    for(const r of shown){
      const card=text('article','','board-card');
      const head=text('div','','board-head');
      head.append(text('h2',r.venue+' '+r.race+'R'));
      head.append(text('span',(isToday&&r.deadline<=now?'締切済 ':'締切 ')+timeFormatter.format(new Date(r.deadline)),
        'board-time'+(isToday&&r.deadline<=now?' closed':'')));
      card.append(head);
      const marks=r.marks.length?'◎'+r.marks[0]+' ○'+r.marks[1]+' ▲'+r.marks[2]+' △'+r.marks[3]:'印未取得';
      card.append(text('p',marks+' ｜ 決まり手：'+(r.method||'未取得'),'board-quote'));
      rowTickets(card,'本線4点',r.main,true);
      rowTickets(card,'逆張り',r.reverse,false);
      rowTickets(card,'舟券ナビ',r.navi,false);
      details(card,r);
      const footer=text('div','','board-foot');
      const a=text('a','M0朝刊の詳細');
      a.href='./index.html?date='+encodeURIComponent(activeDate)+'#'+encodeURIComponent(r.id);
      footer.append(a);
      card.append(footer);
      fragment.append(card);
    }
    list.append(fragment);
  }
  function updateVenues(){
    const previous=venueInput.value;
    venueInput.replaceChildren(text('option','全場'));
    for(const [code,name] of [...new Map(rows.map(r=>[r.code,r.venue]))].sort((a,b)=>Number(a[0])-Number(b[0]))){
      const opt=text('option',name);opt.value=code;venueInput.append(opt);
    }
    if([...venueInput.options].some(opt=>opt.value===previous))venueInput.value=previous;
  }
  async function load(){
    const serial=++loadingSerial,date=dateInput.value;
    activeDate=date;readError='';status.textContent='データを確認しています。';
    try{
      let dataset=dataCache.get(mode+':'+date);
      if(!dataset){
        dataset=await fetchJson('./data/'+(mode==='m1'?'m1':'consensus')+'/'+encodeURIComponent(date)+'.json');
        if(dataset)dataCache.set(mode+':'+date,dataset);
      }
      if(serial!==loadingSerial)return;
      rows=normalized(dataset,date);updateVenues();
      if(!dataset)readError=mode==='m1'?'M1公開データは未掲載です。':'この日のM0データは未掲載です。';
    }catch(e){if(serial!==loadingSerial)return;rows=[];readError='公開データの取得に失敗しました。';}
    if(serial===loadingSerial)render();
  }
  async function start(){
    try{
      const index=await fetchJson('./data/issue-index.json');
      const issues=Array.isArray(index?.issues)?index.issues.filter(x=>validDate(x.date)):[];
      const dates=[...new Set(issues.map(x=>x.date))].sort().reverse();
      if(!dates.length)throw Error('issue index unavailable');
      dateInput.replaceChildren();
      for(const date of dates){
        const option=text('option',date.replaceAll('-','/'));option.value=date;dateInput.append(option);
      }
      const requested=new URL(location.href).searchParams.get('date');
      dateInput.value=dates.includes(requested)?requested:dates.includes(today())?today():index.default_date;
      if(!dateInput.value||!dates.includes(dateInput.value))dateInput.value=dates[0];
      activeDate=dateInput.value;
      dateInput.addEventListener('change',()=>{
        const url=new URL(location.href);url.searchParams.set('date',dateInput.value);
        history.replaceState(null,'',url.pathname+url.search);
        venueInput.value='';load();
      });
      venueInput.addEventListener('change',render);
      closedInput.addEventListener('change',render);
      byId('board-refresh').addEventListener('click',()=>{dataCache.delete(mode+':'+dateInput.value);load();});
      setInterval(()=>{if(document.visibilityState==='visible')render();},30000);
      document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')render();});
      await load();
    }catch(e){status.textContent='発行日一覧を取得できません。';list.append(text('p','既存のM0新聞からお試しください。','board-empty'));}
  }
  start();
})();