// Run with node scripts/test_public_scorecard.js.
// Compare old paper numbers exactly; never count absent or late predictions as zero.
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const js=fs.readFileSync('assets/public-scorecard.js','utf8');
const context={window:{},console};
vm.runInNewContext(js,context);
const score=context.window.OchaPScorecard.score;
const old=JSON.parse(fs.readFileSync('data/public-scorecards/2026-10-30.json','utf8'));
const nov=JSON.parse(fs.readFileSync('data/public-scorecards/2026-11-01.json','utf8'));
assert.equal(old.records.length,144);
assert.equal(nov.records.length,166);
const actual={
 all:{n:144,win:103,exacta:73,three:56,stake:156800,gross:120660,refund:3300,profit:-36140},
 main:{n:144,win:80,exacta:54,three:35,stake:43200,gross:34920,refund:1300,profit:-8280},
 reverse:{n:144,win:23,exacta:8,three:8,stake:57600,gross:36560,refund:1200,profit:-21040},
 nav:{n:140,win:77,exacta:14,three:14,stake:56000,gross:49180,refund:800,profit:-6820}
};
for (const [group,expected] of Object.entries(actual)) {
 const stats=score(old.records,'ocha',group);
 for (const [key,val] of Object.entries(expected))assert.equal(stats[key],val,group+' '+key);
}
const dayStats={
 'モーニング':[-17910,54.8,36],
 'デイ':[9880,115.1,60],
 'ナイター':[-28110,45.5,48]
};
for(const [day,[profit,roi,n]] of Object.entries(dayStats)){
 const x=score(old.records.filter(r=>r.daypart===day),'ocha','all');
 assert.equal(x.n,n);
 assert.equal(x.profit,profit);
 assert.equal(Number(x.roi.toFixed(1)),roi);
}
assert.equal(score(nov.records,'ocha','all').n,0,'Nov 1 Ocha forecasts missing; never manufacture hits');
assert.equal(score(nov.records,'gemi','all').n,158,'Late Gemi 8 after-close and 2 missing results excluded');
assert.equal(nov.not_formal_m0,true);
assert.equal(old.not_formal_bc,true);
console.log('PASS: old paper all/main/reverse/nav 100-yen math, dayparts, exclusions and reporter eligibility');

// The production 11/16 bulletin and immutable shared-ticket snapshot also
// exercise the current reader without requiring a separate scorecard JSON.
context.URL=URL;
for(const file of ['hit-reporters','consensus']){
 vm.runInNewContext(fs.readFileSync('assets/'+file+'.js','utf8'),context);
}
const {readBulletin,attachLiveResults,liveMetrics}=context.window.OchaPConsensus;
const {liveRecords,liveScore}=context.window.OchaPScorecard;
const date='2026-11-16';
const feed=JSON.parse(fs.readFileSync('data/public-results/'+date+'.json'));
const common=JSON.parse(fs.readFileSync('data/consensus/'+date+'.json'));
const manifest=JSON.parse(fs.readFileSync('data/issue-index.json'));
const issue=manifest.issues.find(x=>x.date===date);
const gemi=JSON.parse(fs.readFileSync('data/gemi/'+date+'.json'));
const forecasts=Object.fromEntries(common.races.map(r=>[r.race_id,{
 ocha:r.reporters.ocha.categories,gemi:r.reporters.gemi.categories,
 gemiTiming:{freeze_at:gemi.races[r.race_id].freeze_at,closing_at:gemi.races[r.race_id].closing_at},
 meta:{closing_at:r.deadline,venue:r.venue,race_no:r.race_no}
}]));
const bulletin=readBulletin(feed,date),rows=liveRecords(bulletin,forecasts,issue,date);
const evidence=issue.gemi_first_publication_evidence;
const {createHash}=require('node:crypto');
const packed=fs.readFileSync(issue.gemi_json);
assert.equal(createHash('sha1').update('blob '+packed.length+'\0').update(packed).digest('hex'),evidence.gemi_gzip_base64_blob_sha);
assert.equal(issue.gemi_first_publication_confirmed_at_jst,'2026-11-16T06:15:21+09:00');
assert.ok(Date.parse(issue.gemi_last_synced_at_jst)>Date.parse(issue.gemi_first_publication_confirmed_at_jst));
assert.equal(rows.filter(r=>r.reporters.gemi).length,120,'real index must not erase the 120 reference Gemi results');
assert.equal(issue.formal_bc_eligible,false);
vm.runInNewContext(fs.readFileSync('assets/special-races.js','utf8'),context);
const specials=[...context.window.OchaPSpecial.select(common,issue,forecasts).values()];
assert.equal(specials.length,12);
assert.equal(specials.filter(x=>x.special_teppan.length).length,6);
assert.equal(specials.filter(x=>x.special_myoumi.length).length,6);
const resultRaces=attachLiveResults(common,feed,issue);
// A later publication receipt can legitimately exclude Gemi without changing any frozen tickets.
const gemiObserved=Date.parse(issue.gemi_first_publication_confirmed_at_jst||issue.gemi_publication_timing_checked_at||issue.publication_timing_checked_at);
assert.ok(Number.isFinite(gemiObserved));
assert.ok(rows.length>=102);
for(const author of ['ocha','gemi']){
 const s=liveScore(rows,author,'all');
 const eligible=rows.filter(r=>author==='ocha'||gemiObserved<Date.parse(forecasts['v'+r.venue_code+'-r'+r.race_no].meta.closing_at));
 assert.equal(s.n,eligible.length);
 const manual={stake:0,payout:0,hits:0};
 for(const r of eligible){
  const tickets=Object.values(r.reporters[author]).flat();
  const hits=tickets.filter(t=>t===r.order.join('-')).length;
  const refunds=tickets.filter(t=>t.split('-').some(n=>r.refund_boats?.includes(Number(n)))).length;
  manual.stake+=100*tickets.length;
  manual.payout+=(hits?r.trifecta_payout_yen*hits:0)+100*refunds;
  manual.hits+=Number(hits>0);
 }
 assert.equal(s.stake,manual.stake);
 assert.equal(s.gross,eligible.length?manual.payout:null);
 assert.equal(s.three,manual.hits);
 assert.equal(s.profit,eligible.length?manual.payout-manual.stake:null);
}
for(const k of [2,3]){
 const actual=liveMetrics(resultRaces,k).profit_yen;
 if(common.races.every(r=>!r.pair_timing_eligible&&gemiObserved>=Date.parse(r.deadline)))assert.equal(actual,null);
 else assert.ok(Number.isInteger(actual));
}
const late={...issue,gemi_first_publication_confirmed_at_jst:'2026-11-16T23:59:00+09:00'};
assert.ok(liveRecords(bulletin,forecasts,late,date).every(r=>!r.reporters.gemi&&r.reporters.ocha));
const postDeadlineIds=common.races.map(r=>r.race_id);
assert.equal(liveRecords(bulletin,forecasts,{...issue,post_deadline_reference_races:postDeadlineIds},date).length,0);
assert.equal(liveRecords(bulletin,forecasts,{...issue,date:'2026-11-15'},date).length,0);
const hit=rows.find(r=>r.reporters.ocha.main.includes(r.order.join('-')));
const unsettled=liveScore([{...hit,trifecta_payout_yen:null}],'ocha','main');
assert.equal(unsettled.three,1);assert.equal(unsettled.profit,null);
console.log('PASS: production 11/16 reference scorecards and agreement, both journalists, deadlines, missing payouts and excluded races');
