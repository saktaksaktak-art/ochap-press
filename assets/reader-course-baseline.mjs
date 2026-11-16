import {renderReaderMethods} from '../scripts/reader_methods.mjs?v=2';

const day=window.__OCHAP_SELECTED_DATE__;
const archive=document.getElementById('cards') || document.querySelector('main');
const missing='未取得';
const badge=n=>'<span class="bnum b'+n+'">'+n+'</span>';
const clean=s=>s?.textContent.trim()??'';
const num=s=>/^\d+(?:\.\d+)?%?$/.test(s)?Number.parseFloat(s):null;
const percentage=s=>num(s.replace(/^(?:差され|まくられ|まくり差され)\s*/,''));
const disabled=['—','-','対象外'];

function gradeRow(boat, registration, payload) {
  const row=payload?.sg_g1_players_6m?.[registration]?.find(x=>x.course===boat);
  const verified={status:'verified',scope:'national',race_class:'sg_g1',grades:['SG','G1'],period_months:6};
  if(row) {
    verified.expected_method_stats=row;
    verified.expected_course_stats={course:boat,starts:row.sample_count,first_rate_pct:row.first,
      second_rate_pct_estimated:row.second,third_rate_pct_estimated:row.third,average_st:row.average_st};
  }
  return {boat,course_stats_by_scope:{sg_g1_course:verified}};
}

function oldData(table) {
  const mapped=[...table.tBodies[0].rows].map(tr=>{
    const a=[...tr.cells].map(clean);
    const boat=Number(clean(tr.cells[0].querySelector('.bnum,.boat')));
    if(![1,2,3,4,5,6].includes(boat))return null;
    const m={sample_count:num(a[1]),win_rates_pct:{},loss_rates_pct:{}};
    if(boat===1){
      m.win_rates_pct.nige=percentage(a[2]);
      ['sasare','makurare','makuraresashi'].forEach((key,i)=>m.loss_rates_pct[key]=percentage(a[i+3]));
    } else {
      ['sashi','makuri','makurisashi'].forEach((key,i)=>m.win_rates_pct[key]=percentage(a[i+3]));
      if(boat===2)m.nigashi_rate_pct=disabled.includes(a[6])?null:percentage(a[6]);
    }
    return {boat,method:m};
  });
  return mapped.length===6&&mapped.every(b=>b)&&new Set(mapped.map(b=>b.boat)).size===6?mapped:null;
}

function gradeTable(original, boats) {
  const table=document.createElement('table');
  table.className='ochap-grade-course';
  const head=table.createTHead().insertRow();
  ['艇/C','母数','1着%','2着%','3着%','C平均ST'].forEach(s=>{
    const th=document.createElement('th');th.scope='col';th.textContent=s;head.append(th);
  });
  const body=table.createTBody();
  for(const b of boats){
    const t=body.insertRow(),key=document.createElement('th');
    key.scope='row';key.innerHTML=badge(b.boat)+'<small>'+b.boat+'C</small>';t.append(key);
    const row=b.course_stats_by_scope.sg_g1_course.expected_course_stats;
    const keys=['starts','first_rate_pct','second_rate_pct_estimated','third_rate_pct_estimated','average_st'];
    for(const keyName of keys){
      const x=row?.[keyName],td=t.insertCell();
      td.textContent=x==null?missing:keyName==='average_st'?x.toFixed(2):String(x);
      if(x==null||keyName==='starts')continue;
      const values=boats.map(z=>z.course_stats_by_scope.sg_g1_course.expected_course_stats?.[keyName]).filter(Number.isFinite);
      const rank=1+values.filter(y=>keyName==='average_st'?y<x:y>x).length;
      if(rank>2)continue;
      td.className='method-'+rank;
      const label=document.createElement('small');
      label.textContent=(values.filter(y=>y===x).length>1?'同率':'')+rank+'位';
      td.append(label);
    }
  }
  if(original)original.replaceWith(table);
  return table;
}

function mount(payload) {
  for(const article of archive.querySelectorAll('article[data-venue]')){
    const section=[...article.querySelectorAll('details')].find(n=>/^02\s.*決まり手/.test(clean(n.querySelector(':scope > summary'))));
    if(!section)continue;
    const tables=[...section.querySelectorAll('table')];
    const methods=tables.find(t=>t.classList.contains('ochap-method-table') ||
      [...(t.tHead?.rows[0]?.cells??[])].some(h=>clean(h)==='2C逃し'));
    if(!methods)continue;
    const fromArchive=methods.classList.contains('ochap-method-table')?null:oldData(methods);
    const gradeHead=[...section.querySelectorAll('h3')].find(h=>clean(h)==='SG/G1コース成績');
    const grade=payload?.sg_g1_venues?.includes(Number(article.dataset.venue))||
      (!payload&&!!gradeHead);
    if(!grade && !fromArchive)continue; // newer editions already render the matching aggregate
    const entry=[...article.querySelectorAll('details')].find(n=>/^01\s.*出走表/.test(clean(n.querySelector(':scope > summary'))));
    const registry=[...(entry?.querySelector('table')?.tBodies[0]?.rows??[])].map(tr=>[
      Number(clean(tr.cells[0].querySelector('.bnum,.boat'))),
      clean(tr.cells[1]?.querySelector('small')).match(/^\d{4}/)?.[0]
    ]);
    const boats=grade ? [1,2,3,4,5,6].map(n=>gradeRow(n,registry.find(r=>r[0]===n)?.[1],payload)) : fromArchive;
    if(grade){
      gradeTable(section.querySelector('.rich-course'),boats);
      for(const title of section.querySelectorAll('h3')){
        if(!['SG/G1コース成績','当地コース成績'].includes(clean(title)))continue;
        if(title.nextElementSibling?.matches('.table-scroll,p.small'))title.nextElementSibling.remove();
        title.remove();
      }
      for(const note of section.querySelectorAll(':scope > p.small')) {
        if(clean(note).startsWith('全国直近6か月'))note.remove();
      }
    }
    const wrapper=methods.closest('.ochap-method-section,.table-scroll')||methods;
    wrapper.insertAdjacentHTML('beforebegin',renderReaderMethods({
      is_sg_g1_venue:grade,boats},day,payload,badge,6));
    wrapper.remove();
  }
}
if(archive && /^\d{4}-\d{2}-\d{2}$/.test(day??'')) {
  try {
    const response=await fetch(new URL('../data/course-national/'+day+'.json',import.meta.url));
    if(!response.ok)throw new Error('benchmark unavailable');
    const payload=await response.json();
    if(payload.schema!=='ochap.course-national-benchmark.v1'||payload.as_of_date!==day)throw new Error('wrong benchmark date');
    mount(payload);
  } catch(error) {
    console.warn('Course benchmark unavailable:',error.message);
    mount(null);
  }
}
