'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const ctx={window:{},console};
vm.runInNewContext(fs.readFileSync('assets/hit-reporters.js','utf8'),ctx);
const {match,load}=ctx.window.OchaPHitReporters;
const actual={order:[1,2,3]};
const forecast={
  ocha:{main:['1-2-3'],reverse:['2-1-3'],navi:['1-2-3','1-2-4']},
  gemi:{main:['1-3-2'],reverse:['3-1-2'],navi:['1-2-3']}
};
let hit=match(actual,forecast);
assert.deepEqual(Array.from(hit[0].groups),['本線','舟券ナビ']);
assert.deepEqual(Array.from(hit[1].groups),['舟券ナビ']);
hit=match({order:[2,1,3]},forecast);
assert.equal(hit[0].groups[0],'逆張り');
assert.equal(hit[1].known,true);assert.equal(hit[1].groups.length,0);
hit=match(actual,{gemi:forecast.gemi});
assert.equal(hit[0].known,false);assert.equal(hit[0].groups.length,0);
assert.equal(hit[1].groups[0],'舟券ナビ');
assert.equal(match({order:[1,1,3]},forecast).length,0);
assert.equal(match({order:[1,2,7]},forecast).length,0);
assert.equal(match(actual,{ocha:{main:['1-1-3']}})[0].known,false);
ctx.window.__OCHAP_SELECTED_DATE__='2026-11-04';
load('2026-11-03').then(x=>assert.equal(x,null));
console.log('PASS: reporter-specific hits, both reporters, overlapping categories, misses, unknown inputs and date isolation');
