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
