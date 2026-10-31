#!/usr/bin/env node
'use strict';
// Tests the actual frontend function directly (not a copy of the algorithm).
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const source = fs.readFileSync('assets/press-roles.js','utf8');
const functionMatch = source.match(/  function actualWinningCourse\(r\) \{[\s\S]*?\n  \}/);
assert.ok(functionMatch,'frontend actualWinningCourse() must exist');
const course = vm.runInNewContext(functionMatch[0]+'\nactualWinningCourse;');
const official = 'https://example.org/official-result-proof';
// Real entry means boat numbers indexed by course, not number=course.
const order = [3,5,1,2,4,6];
for(let c=1;c<=6;c++){
  const winner=order[c-1];
  const r={official_entry_verified:true,official_entry_source_ref:official,
    actual_entry_order:order,actual_order:[winner]};
  assert.equal(course(r),c,'winner from actual '+c+'C');
}
assert.equal(course({official_entry_verified:true,official_entry_source_ref:official,
  actual_entry_order:order,actual_order:[1]}),3,'boat 1 can be in 3C');
// Missing or invalid evidence must never be treated as course 1 by default.
const base={official_entry_verified:true,official_entry_source_ref:official,
  actual_entry_order:order,actual_order:[5]};
assert.equal(course({...base,actual_entry_order:undefined}),null,'missing actual entry');
assert.equal(course({...base,official_entry_verified:false}),null,'unverified entry');
assert.equal(course({...base,official_entry_source_ref:''}),null,'missing official source');
assert.equal(course({...base,actual_entry_order:[1,1,2,3,4,5]}),null,'duplicate boats');
assert.equal(course({...base,actual_entry_order:[1,2,3,4,5]}),null,'incomplete entry');
// Two reporters' predictions must remain independently scoreable per course.
const r={...base,reporters:{ocha:{main_pick:5},gemi:{main_pick:1}}};
assert.equal(course(r),2);
assert.equal(String(r.reporters.ocha.main_pick)===String(r.actual_order[0]),true);
assert.equal(String(r.reporters.gemi.main_pick)===String(r.actual_order[0]),false);
console.log('COURSE_HEAD_HIT_TEST_PASS: six courses, moved entry and missing-data guards.');
