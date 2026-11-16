/* Reader-only annotation. It never changes the saved forecast or original editorial fragment. */
(() => {
  'use strict';
  const day=window.__OCHAP_SELECTED_DATE__;
  const root=document.getElementById('cards')||document.querySelector('main');
  if(!root||!/^\d{4}-\d\d-\d\d$/.test(day??''))return;
  const labels=['艇','ST安定%','抜出%','出遅%'];
  const missing=new Set(['未取得','未表示','—','-','']);
  const pct=x=>typeof x==='number'&&Number.isFinite(x)&&x>=0&&x<=100;
  const stamp=x=>typeof x==='string'&&x.startsWith(day+'T')&&/\+09:00$/.test(x)?Date.parse(x):NaN;
  const text=n=>n?.textContent.trim()??'';
  let current=null;

  function annotate(article){
    const v=Number(article.dataset.venue),r=Number(article.dataset.race);
    if(!(v>=1&&v<=24&&r>=1&&r<=12&&Number.isInteger(v)&&Number.isInteger(r)))return;
    const key=String(v).padStart(2,'0')+':'+String(r).padStart(2,'0');
    const obs=current?.[key], start=stamp(obs?.acquired_at_jst), end=stamp(article.dataset.deadline);
    if(!obs||obs.deadline_jst!==article.dataset.deadline||!(start<end&&start<=Date.now()))return;
    const details=[...article.querySelectorAll('.copy details')];
    const entry=details.find(d=>text(d.querySelector(':scope > summary')).startsWith('01 出走表'));
    const st=details.find(d=>d.dataset.richKey===article.id+':st'||
      /^03\s+ST詳細/.test(text(d.querySelector(':scope > summary')))||
      text(d.querySelector(':scope > summary'))==='ST・スリット');
    if(!entry||!st||!Array.isArray(obs.racers)||obs.racers.length!==6||
       !Array.isArray(obs.metrics)||obs.metrics.length!==3||
       !obs.metrics.every(col=>Array.isArray(col)&&col.length===6&&col.every(x=>x===null||pct(x))))return;
    const roster=[...(entry.querySelector('table')?.tBodies[0]?.rows??[])];
    if(roster.length!==6||roster.some((row,i)=>text(row.cells[0])!==String(i+1)||
       text(row.cells[1]?.querySelector('small')).match(/^\d{4}(?!\d)/)?.[0]!==obs.racers[i]))return;
    const table=[...st.querySelectorAll('table')].find(t=>t.tHead?.rows[0]?.cells.length===4&&
      [...t.tHead.rows[0].cells].every((c,i)=>text(c)===labels[i]));
    const rows=[...(table?.tBodies[0]?.rows??[])];
    if(rows.length!==6||rows.some((row,i)=>row.cells.length!==4||text(row.cells[0])!==String(i+1)))return;
    const version=JSON.stringify(obs);
    if(table.dataset.ochapStSupplement===version)return;
    let used=0;
    rows.forEach((row,i)=>obs.metrics.forEach((col,j)=>{
      const td=row.cells[j+1], value=col[i];
      if(!missing.has(text(td))&&!td.hasAttribute('data-ochap-st-added'))return;
      if(value===null)return;
      td.setAttribute('data-ochap-st-added','');
      td.textContent=value.toFixed(1);
      used++;
    }));
    if(!used)return;
    table.dataset.ochapStSupplement=version;
    const wrapper=table.closest('.table-scroll')||table;
    let note=wrapper.previousElementSibling;
    if(!note?.matches('.ochap-st-supplement-note')){
      note=document.createElement('p');note.className='small ochap-st-supplement-note';
      wrapper.before(note);
    }
    note.textContent='詳細ST 追記（ボートレース日和・'+obs.acquired_at_jst.slice(11,19)+
      '取得）｜締切前に取得した参考データ。朝刊予想・買い目は変更していません。';
  }
  const refresh=async()=>{
    try{
      const r=await fetch('./data/st-supplements/'+day+'.json',{cache:'no-store'});
      if(!r.ok)return;
      const data=await r.json();
      if(data?.schema!=='ochap.public-st-supplement.v1'||data.date!==day||
         data.source!=='boatrace_hiyori'||!data.races||Array.isArray(data.races)||typeof data.races!=='object')return;
      current=data.races;
      root.querySelectorAll('article[data-venue][data-race]').forEach(annotate);
    }catch{} // Original reader remains usable when no supplement has been published.
  };
  new MutationObserver(records=>{
    if(!current)return;
    const touched=new Set();
    for(const {target} of records){
      const article=target.closest?.('article[data-venue][data-race]');
      if(article)touched.add(article);
    }
    touched.forEach(annotate);
  }).observe(root,{childList:true,subtree:true});
  refresh();
  // Today's page can remain open through the day; older editions require no polling.
  const today=()=>new Date(Date.now()+9*3600000).toISOString().slice(0,10);
  if(day===today()){
    const timer=setInterval(()=>{
      if(day!==today()){clearInterval(timer);return;}
      if(!document.hidden)refresh();
    },5*60000);
    document.addEventListener('visibilitychange',()=>{if(!document.hidden&&day===today())refresh();});
  }
})();
