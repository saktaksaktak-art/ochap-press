'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const ctx={window:{}};
vm.runInNewContext(fs.readFileSync('assets/consensus.js','utf8'),ctx);
const roles=ctx.window.OchaPConsensus.ticketRoles;
const race=JSON.parse(fs.readFileSync('data/consensus/2026-11-07.json','utf8')).races.find(r=>r.race_id==='v12-r2');
assert.deepEqual(Array.from(roles(race,'1-2-5',3,'ocha')),['本線']);
assert.deepEqual(Array.from(roles(race,'1-2-5',3,'gemi')),['舟券ナビ']);
assert.deepEqual(Array.from(roles(race,'1-2-3',3,'gemi')),['本線','舟券ナビ']);
assert.deepEqual(Array.from(roles(race,'2-1-4',3,'ocha')),['逆張り']);
assert.deepEqual(Array.from(roles(race,'1-2',2,'gemi')),['本線']);
assert.deepEqual(Array.from(roles(race,'2-1',2,'gemi')),[]);
assert.deepEqual(Array.from(roles({race_id:'v12-r2',reporters:{}},'1-2-5',3,'gemi')),[]);
const fallback={race_id:'v12-r2',reporters:{}};
assert.deepEqual(Array.from(roles(fallback,'1-5-6',3,'ocha',{'v12-r2':{ocha:{main:[],reverse:[],navi:['1-5-6']}}})),['舟券ナビ']);
for(const date of ['2026-11-05','2026-11-06','2026-11-07']){
  const data=JSON.parse(fs.readFileSync('data/consensus/'+date+'.json','utf8'));
  for(const r of data.races)for(const a of ['ocha','gemi']){
    assert.ok(r.reporters[a].categories,date+' '+r.race_id+' '+a);
    for(const t of r.trifecta)assert.ok(roles(r,t,3,a).length,date+' '+r.race_id+' '+a+' '+t);
  }
}
console.log('PASS: dated frozen membership, both reporters, overlapping categories, main-only exacta and unknown-source handling');

const {attachLiveResults,liveMetrics}=ctx.window.OchaPConsensus;
const date='2026-11-16',sha='f'.repeat(64);
const time=hhmm=>date+'T'+hhmm+':00+09:00';
const data={date,edition:'M0',snapshot_at_jst:time('06:13'),shared_candidate_sha256:sha,
  schema_version:'ochap.public.consensus.v1',reference_only:true,metrics:{'2':{n:0,hits:0},'3':{n:0,hits:0}},
  source_hashes:{ocha:sha,gemi:sha},races:[1,2,3].map(race_no=>({
    race_id:'v18-r'+race_no,venue:'徳山',venue_code:18,race_no,
    deadline:time(race_no===2?'06:10':'08:35'),pair_timing_eligible:false,
    exacta:['1-3','1-4'],trifecta:['1-3-2','1-4-5','1-4-5'],result:null,
    reporters:{ocha:{'2':[],'3':[]},gemi:{'2':[],'3':[]}}
  }))};
const issue={date,forecast_sha256:sha,gemi_original_sha256:sha,publication_timing_checked_at:time('06:12'),
  reporters:{ocha:{input_sha256:sha,frozen_at_jst:time('06:11')},gemi:{input_sha256:sha,recorded_freeze_at_jst:time('05:35')}}};
const results={date,schema_version:'1.0',checked_at_jst:time('10:00'),races:[1,2,3].map(race_no=>({
  venue_code:18,race_no,order:[1,3,2],trifecta_payout_yen:900,
  ...(race_no===1?{exacta_payout_yen:400,refund_boats:[4]}:{})
}))};
const live=attachLiveResults(data,results,issue);
assert.equal(live[0].pair_timing_eligible,false);
assert.equal(live[0].reference_timing_eligible,true);
assert.equal(data.races[0].result,null);
assert.equal(live[1].result,null);
assert.equal(attachLiveResults(data,results,{...issue,forecast_sha256:'bad'})[0].result,null);
assert.equal(attachLiveResults(data,{...results,date:'2026-11-15'},issue),null);
assert.equal(attachLiveResults(data,{...results,checked_at_jst:time('08:30')},issue)[0].result,null);
assert.equal(attachLiveResults(data,results,{...issue,post_deadline_reference_races:['v18-r1']})[0].result,null);
assert.equal(attachLiveResults(data,results,{...issue,gemi_first_publication_confirmed_at_jst:time('08:36')})[0].result,null);
assert.equal(liveMetrics(live,2).profit_yen,null);
assert.equal(liveMetrics(live,2).return_rate_pct,null);
assert.equal(liveMetrics([live[0]],2).profit_yen,300);
assert.equal(liveMetrics(live,2).missingPayout,1);
assert.equal(liveMetrics(live,3).profit_yen,1500);
assert.equal(liveMetrics(live,3).refundUnknown,1);
console.log('PASS: reference race timing, frozen originals, refund, missing payout and unique tickets');

async function testRefresh(){
  class Element {
    constructor(tag){this.tag=tag;this.children=[];this.textContent='';this.hidden=false;this.isConnected=true;}
    append(...nodes){this.children.push(...nodes);}
    replaceChildren(...nodes){this.children=nodes;}
    setAttribute(){}
    get text(){return this.textContent+this.children.map(node=>node.text).join('');}
    find(predicate){return predicate(this)?this:this.children.map(node=>node.find(predicate)).find(Boolean);}
  }
  const document={
    visibilityState:'visible',createElement:tag=>new Element(tag),
    createTextNode(value){const node=new Element('#text');node.textContent=value;return node;}
  };
  let tick,feed=null,requests=0;
  const testContext={
    window:{},document,URL,location:{href:'https://example.test/?bet=2'},history:{replaceState(){}},
    Date:class extends Date{static now(){return Date.parse(time('10:00'));}},
    setInterval(callback,ms){assert.equal(ms,90000);tick=callback;return 1;},clearInterval(){},
    async fetch(path){
      if(path.includes('/consensus/'))return {ok:true,json:()=>data};
      if(path.includes('issue-index'))return {ok:true,json:()=>({issues:[issue]})};
      requests++;
      if(feed instanceof Error)throw feed;
      return {ok:!!feed,json:()=>feed};
    }
  };
  vm.runInNewContext(fs.readFileSync('assets/consensus.js','utf8'),testContext);
  const root=new Element('section');
  const flush=()=>new Promise(resolve=>setImmediate(resolve));
  await testContext.window.OchaPConsensus.mount(root,date);
  assert.match(root.text,/平買い収支保留/);
  root.hidden=true;
  tick();
  assert.equal(requests,1);
  root.hidden=false;
  root.find(node=>node.tag==='button'&&node.textContent==='3連単').onclick();
  feed=results;
  tick();
  await flush();
  assert.match(root.text,/平買い収支\+1,500円/);
  const displayed=root.children;
  tick();
  await flush();
  assert.equal(root.children,displayed);
  feed=new Error('network');
  tick();
  await flush();
  assert.equal(root.children,displayed);
  feed={...results,checked_at_jst:time('09:00'),races:[]};
  tick();
  await flush();
  assert.equal(root.children,displayed);
  console.log('PASS: visible tab refreshes, preserves bet selection and retains the latest successful view');
}
testRefresh().catch(error=>{console.error(error);process.exitCode=1;});
