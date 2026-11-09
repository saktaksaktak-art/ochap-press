/* Run the actual GAS code under service doubles; no real HTTP or GAS mutations. */
const fs = require('fs');
const vm = require('vm');
const assert = require('node:assert/strict');
const store = {};
let code = 204, calls = 0, largest = 0;
let clock = '2026-11-09T09:00:04+09:00';
class ClockDate extends Date { constructor(...args) { super(...(args.length ? args : [clock])); } }
const props = {
  getProperty:k => store[k] || null,
  setProperty(k,v) { assert.ok(Buffer.byteLength(v) < 9000); largest=Math.max(largest,Buffer.byteLength(v));store[k]=v; },
  setProperties(o) { for (const [k,v] of Object.entries(o)) this.setProperty(k,v); }
};
store.OCHAP_PRESS_GITHUB_TOKEN='TEST_ONLY';
const c = {Date:ClockDate, console:{log(){}},
  PropertiesService:{getScriptProperties:()=>props},
  LockService:{getScriptLock:()=>({tryLock:()=>true, releaseLock(){}})},
  UrlFetchApp:{fetch:()=>{calls++;return {getResponseCode:()=>code};}},
  Utilities:{formatDate(d, tz, fmt) {
    assert.ok(d instanceof Date);
    const iso = new Date(d.getTime()+9*3600*1000).toISOString();
    if(fmt==='yyyy-MM-dd') return iso.slice(0,10);
    if(fmt==='H') return String(Number(iso.slice(11,13)));
    if(fmt==='m') return String(Number(iso.slice(14,16)));
    return iso.slice(0,19)+'+09:00';
  }}
};
vm.createContext(c);
vm.runInContext(fs.readFileSync('gas/OchaP_ResultsFlash_80Slots_Dispatcher.gs','utf8'),c);
const slots = c.OCHAP_RESULTS_FLASH_BUILD_80_SLOTS_();
assert.equal(slots.length,80);assert.equal(slots[0],'09:00');assert.equal(slots[79],'23:20');
clock='2026-11-09T08:50:01+09:00';assert.match(c.OCHAP_RESULTS_FLASH_TICK().status,/BEFORE/);
// Pass the same event object GAS gives a clock handler: it must not be a Date override.
for(const slot of slots) {
  clock='2026-11-09T'+slot+':04+09:00';
  assert.equal(c.OCHAP_RESULTS_FLASH_TICK({triggerUid:'event'}).status,'DISPATCH_ACCEPTED_NOT_COMPLETION');
  const before=calls;
  assert.match(c.OCHAP_RESULTS_FLASH_TICK().status,/SKIP/);
  assert.equal(calls,before);
}
assert.equal(calls,80);
assert.equal(Object.keys(JSON.parse(store.OCHAP_RESULTS_FLASH_FIRED_SLOTS_JSON)).length,80);
assert.ok(largest<9000);
clock='2026-11-09T23:30:00+09:00';assert.match(c.OCHAP_RESULTS_FLASH_TICK().status,/AFTER/);
clock='2026-11-10T00:00:01+09:00';assert.match(c.OCHAP_RESULTS_FLASH_TICK().status,/BEFORE/);
clock='2026-11-10T09:00:04+09:00';code=403;
assert.equal(c.OCHAP_RESULTS_FLASH_TICK().status,'DISPATCH_FAILED_RETRYABLE');
assert.equal(store.OCHAP_RESULTS_FLASH_FIRED_SLOTS_JSON,'{}');
code=204;assert.equal(c.OCHAP_RESULTS_FLASH_TICK().dispatch_accepted,true);
assert.equal(c.OCHAP_RESULTS_FLASH_RESOLVE_SLOT_JST_(new Date('2026-11-10T21:12:00+09:00'),{},true).slotHhmm,'21:00');
assert.equal(c.OCHAP_RESULTS_FLASH_RESOLVE_SLOT_JST_(new Date('2026-11-10T23:33:00+09:00'),{},true).slotHhmm,'23:20');
console.log('PASS actual GAS: 80 slots, event object, duplicate/day rollover, 403 retry, delayed final; max property bytes='+largest);
