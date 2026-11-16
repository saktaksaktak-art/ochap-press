'use strict';
const fs=require('node:fs');
const vm=require('node:vm');
const assert=require('node:assert/strict');

const read=path=>JSON.parse(fs.readFileSync(path,'utf8'));
const repoDate='2026-11-15';
const data=read('data/consensus/'+repoDate+'.json');
const issue=read('data/issue-index.json').issues.find(x=>x.date===repoDate);
const official=process.argv[2]?read(process.argv[2]):null;
if(official)assert.equal(official.target_date,repoDate);
const rows=official?official.results.map(r=>({
  venue_code:r.race_stadium_number,race_no:r.race_number,order:r.trifecta.split('-').map(Number),
  trifecta_payout_yen:r.trifecta_payout_yen,refund_boats:r.refund_boats,official_confirmed:r.result_status==='CONFIRMED'
})):read('data/public-results/'+repoDate+'.json').races;
const context={window:{},async fetch(){return {ok:false};}};
for(const name of ['consensus','hit-reporters','special-races']){
  vm.runInNewContext(fs.readFileSync('assets/'+name+'.js','utf8'),context);
}
const {select,score,load}=context.window.OchaPSpecial;
const picks=select(data,issue);
assert.equal(data.races.length,156);
assert.equal(rows.length,156);

function metric(group){
  const s=score(rows,picks,group);
  return [s.target,s.n,s.three,s.totalStake/100,s.totalStake,s.payout,s.roi.toFixed(2)];
}
assert.deepEqual(metric('main_x_reverse'),[13,13,3,34,3400,12610,'370.88']);
assert.deepEqual(metric('reverse_x_main'),[11,11,3,31,3100,6640,'214.19']);
assert.deepEqual(metric('special_myoumi'),[13,13,6,65,6500,19250,'296.15']);
assert.equal(metric('special_teppan')[0],15);
assert.deepEqual(Array.from(select({...data,races:data.races.map(r=>({...r,result:{anything:true}}))},issue).keys()),Array.from(picks.keys()));

const race=data.races.find(r=>picks.get(r.race_id)?.main_x_reverse.length);
const selection=r=>select({...data,races:[r]},issue);
const selected=picks.get(race.race_id);
assert.equal(selection({...race,gemi_marks:race.ocha_marks}).size,0);
assert.equal(selection({...race,deadline:'2026-11-14T10:00:00+09:00'}).size,0);
assert.equal(select({...data,races:[race]},{...issue,post_deadline_reference_races:[race.race_id]}).size,0);
const ticket=selected.main_x_reverse[0];
const win=ticket.split('-').map(Number);
const refunded=[1,2,3,4,5,6].find(n=>!win.includes(n));
const [a,b]=win;
const refundTicket=[a,b,refunded].join('-');
const fixturePicks=new Map([[race.race_id,{special_myoumi:[ticket,refundTicket]}]]);
const base={venue_code:race.venue_code,race_no:race.race_no,order:win,refund_boats:[refunded]};
assert.equal(score([{...base,trifecta_payout_yen:420}],fixturePicks,'special_myoumi').payout,520);
assert.equal(score([base],fixturePicks,'special_myoumi').missingPayout,1);
assert.equal(score([{...base,order:null}],fixturePicks,'special_myoumi').n,0);

async function fallback(){
  function reporter(name){
    return {...race.reporters[name].categories,published_main_mark:race[name+'_marks'][0]};
  }
  const forecasts={[race.race_id]:{ocha:reporter('ocha'),gemi:reporter('gemi'),
    meta:{closing_at:race.deadline,venue:race.venue},gemiTiming:{closing_at:race.deadline,freeze_at:issue.reporters.gemi.recorded_freeze_at_jst}}};
  assert.equal((await load(repoDate,issue,forecasts))?.get(race.race_id).main_x_reverse.length,selected.main_x_reverse.length);
  const unknown={...issue,gemi_first_publication_confirmed_at_jst:null,gemi_publication_timing_checked_at:null};
  assert.equal(await load(repoDate,unknown,forecasts),null);
  console.log('PASS: 156R benchmarks, both cross directions, payout/refund, pre-deadline source and missing results');
}
fallback().catch(error=>{console.error(error);process.exitCode=1;});
