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
  source_hashes:{ocha:sha,gemi:sha},races:[1,2,3].map(race_no=>({
    venue_code:18,race_no,deadline:time(race_no===2?'06:10':'08:35'),pair_timing_eligible:false,
    exacta:['1-3','1-4'],trifecta:['1-3-2','1-4-5','1-4-5'],result:null
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
assert.equal(liveMetrics(live,2).profit_yen,300);
assert.equal(liveMetrics(live,2).missingPayout,1);
assert.equal(liveMetrics(live,3).profit_yen,1500);
assert.equal(liveMetrics(live,3).refundUnknown,1);
console.log('PASS: reference race timing, frozen originals, refund, missing payout and unique tickets');
