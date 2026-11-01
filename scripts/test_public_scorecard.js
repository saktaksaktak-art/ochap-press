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
