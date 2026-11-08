'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync('assets/hit-reporters.js','utf8');
const element=(raw,boats=[],plain=raw,declared=null)=>({
  textContent:raw,getAttribute:()=>declared,
  querySelectorAll:()=>boats.map(textContent=>({textContent})),
  cloneNode:()=>({textContent:plain,querySelectorAll:()=>[]})
});
function context(articles=[],issue={},doc={}){
  const date='2026-11-08';
  const c={window:{__OCHAP_SELECTED_DATE__:date,__OCHAP_ISSUE_INDEX__:{issues:[{date,gemi_json:'data/gemi/'+date+'.json',...issue}]}},
    document:{querySelectorAll:()=>articles},console,
    fetch:async()=>({ok:true,text:async()=>JSON.stringify(doc)})};
  vm.runInNewContext(source,c);return c.window.OchaPHitReporters;
}
function article(id,tickets,late=false){
  const list={classList:{contains:x=>x==='tickets'},querySelectorAll:()=>tickets};
  const copy={children:[{tagName:'H3',textContent:'本線4点',nextElementSibling:list}],querySelector:()=>({textContent:'◎2'})};
  return{id,dataset:{postdeadlineReference:String(late)},querySelector:s=>s===':scope > .copy'?copy:null};
}
async function main(){
  const {readTicket}=context();
  assert.equal(readTicket(element('1-2-3')),'1-2-3','legacy uncoloured ticket');
  assert.equal(readTicket(element('1位2-4-1中心枝。4の2着を先',['2','4','1'])),'2-4-1','ranked four-point copy');
  assert.equal(readTicket(element('2-1-4',['2','1','4'])),'2-1-4','legacy coloured ticket');
  assert.equal(readTicket(element('rank:1 2-4-1',['2','4','1'],'','2-4-1')),'2-4-1');
  assert.equal(readTicket(element('bad',['2','4','1'],'','2-4-3')),null,'conflicting numeric fields fail closed');
  for(const x of [element('1-1-3'),element('1-2-7'),element('説明1-2-3'),element('x',['1','2']),element('x',['1','2','3','4'])])assert.equal(readTicket(x),null);
  const tickets=['2-4-1','2-1-4','2-4-3','2-4-5'];
  const api=context([article('v1-r1',tickets.map((t,i)=>element(`${i+1}位${t}理由`,t.split('-')))),article('v1-r2',[element('1-2-3')],true)]);
  const loaded=await api.load('2026-11-08');
  assert.deepEqual(Array.from(loaded['v1-r1'].ocha.main),tickets,'AI array/support order retained');
  assert.equal(loaded['v1-r2'].ocha,null,'late reference remains excluded');
  assert.equal(await api.load('2026-11-07'),null,'date isolation');
  const record={status:'published',closing_at:'2026-11-08T12:00:00+09:00',frozen_before_race_closing:true,marks:{main:1},bets:{main:['1-2-3'],reverse:[],navi:[]}};
  const gemi={date:'2026-11-08',reporter:'gemi',races:{'v1-r1':record}};
  let result=await context([],{gemi_publication_pending:true,gemi_first_publication_confirmed_at_jst:'2026-11-08T07:02:11+09:00'},gemi).load('2026-11-08');
  assert.ok(result['v1-r1'].gemi,'observed publication receipt supersedes stale pending');
  result=await context([],{gemi_publication_pending:true,gemi_first_publication_confirmed_at_jst:'2026-11-07T22:02:11Z'},gemi).load('2026-11-08');
  assert.ok(result['v1-r1'].gemi,'UTC receipt date is checked in JST');
  for(const issue of [{gemi_publication_pending:true},{gemi_publication_pending:true,gemi_first_publication_confirmed_at_jst:'garbage'},{gemi_publication_pending:true,gemi_first_publication_confirmed_at_jst:'2026-11-07T07:02:11+09:00'}]){
    result=await context([],issue,gemi).load('2026-11-08');assert.equal(result['v1-r1'],undefined,'unconfirmed/date-mismatched publication stays pending');
  }
  for(const changed of [{retrospective:true},{frozen_before_race_closing:false},{m0_status:'POST_DEADLINE_REFERENCE'},{closing_at:'2026-11-08T06:30:00+09:00'}]){
    result=await context([],{gemi_first_publication_confirmed_at_jst:'2026-11-08T07:02:11+09:00'},{...gemi,races:{'v1-r1':{...record,...changed}}}).load('2026-11-08');assert.equal(result['v1-r1'],undefined);
  }
  console.log('PASS: ranked and legacy tickets, malformed numeric fields, unchanged order, publication receipts and deadline/date exclusions');
}
if(process.argv.includes('--contract')){
  const rows=JSON.parse(fs.readFileSync(0,'utf8'));const {readTicket}=context();
  console.log(JSON.stringify(rows.map(x=>readTicket(element(x.raw,x.boats,x.plain,x.declared)))));
}else main().catch(e=>{console.error(e);process.exitCode=1;});
