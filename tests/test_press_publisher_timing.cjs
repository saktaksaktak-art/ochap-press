'use strict';
const { test }=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const runtime=vm.createContext({});
vm.runInContext(fs.readFileSync('gas/PressPublisher.gs','utf8'),runtime);
const first='2026-11-16T06:15:21+09:00';
const late='2026-11-16T22:03:23+09:00';
const path='data/gemi/2026-11-16.json.gz.b64.txt';
const matched='842550bd13d2819d89d226ecfbd7347b1a1a0626';
const evidence={gemi_gzip_base64_blob_sha:matched};
const issue=()=>({gemi_json:path,gemi_first_publication_confirmed_at_jst:first,gemi_first_publication_evidence:evidence});
const update=runtime.OCHAP_PRESS_RECORD_GEMI_SYNC_;
const compare=runtime.OCHAP_PRESS_GEMI_ARTIFACT_MATCHES_;
test('same compressed forecast at the pinned branch preserves the earlier verified Pages timestamp',()=>{
  runtime.OCHAP_PRESS_GH_REQ_=(url,method)=>{
    assert.equal(url,'https://git.example/contents/'+path+'?ref=parent'); assert.equal(method,'get');
    return {sha:matched};
  };
  const i=issue(); assert.equal(compare('https://git.example','parent',i,path,matched,'token'),true);
  update(i,true,late); assert.equal(i.gemi_first_publication_confirmed_at_jst,first);
  assert.equal(i.gemi_first_publication_evidence,evidence);
  assert.equal(i.gemi_last_synced_at_jst,late);
  assert.equal(i.gemi_publication_timing_checked_at,undefined);
});
test('a different file or first sync has no confirmed publication and cannot inherit old timing',()=>{
  runtime.OCHAP_PRESS_GH_REQ_=()=>({sha:'other'});
  for(const i of [issue(),{}]){
    assert.equal(compare('https://git.example','parent',i,path,matched,'token'),false);
    update(i,false,late);
    assert.equal(i.gemi_first_publication_confirmed_at_jst,undefined);
    assert.equal(i.gemi_first_publication_evidence,undefined);
    assert.equal(i.gemi_publication_timing_checked_at,late);
    assert.equal(i.gemi_last_synced_at_jst,late);
  }
});
test('legacy artifact without timing gets only an observation, which a later sync preserves',()=>{
  const i={gemi_json:path}; update(i,true,first); update(i,true,late);
  assert.equal(i.gemi_first_publication_confirmed_at_jst,undefined);
  assert.equal(i.gemi_publication_timing_checked_at,first);
  assert.equal(i.gemi_last_synced_at_jst,late);
});
test('an absent artifact can be published; a transient API error cannot erase evidence',()=>{
  runtime.OCHAP_PRESS_GH_REQ_=()=>{throw new Error('GitHub API HTTP 404 on GET /contents');};
  assert.equal(compare('https://git.example','parent',issue(),path,matched,'token'),false);
  runtime.OCHAP_PRESS_GH_REQ_=()=>{throw new Error('GitHub API HTTP 503 on GET /contents');};
  assert.throws(()=>compare('https://git.example','parent',issue(),path,matched,'token'),/503/);
});
