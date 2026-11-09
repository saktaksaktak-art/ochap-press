'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const zlib=require('node:zlib');
const policy=require('../assets/reader-presentation.js');
const clean=policy.cleanMarkup;
const paragraphs='<p>◎①逃げ。③の攻めで⑤が受益。</p><p>母数8走・当地未取得。0走</p><p>締切後の参考予想</p>';
assert.equal(clean(paragraphs),paragraphs,'forecast reasoning, sample limits, missing values and late status stay visible');
const source='<header id="top"><h1>お茶P新聞 2026年11月9日</h1><p>全国11場・132R｜おちゃっぴー記者</p><p>正式BC未認定・Gate0検収未了</p><p><a href="audit">入力原本</a></p><p>原本凍結06:05:37</p></header>';
assert.equal(clean(source),'<header id="top"><h1>お茶P新聞 2026年11月9日</h1><p>全国11場・132R｜おちゃっぴー記者</p></header>');
assert.equal(clean('<details><summary>05 データの母数・期間・取得日</summary><table><tr><td>取得日時</td></tr></table></details>'),'');
assert.equal(clean('<p class="small">朝刊の凍結原本と保存入力にある役割。再予想や順位変更は行っていません。</p>'),'');
assert.match(clean('<p>Gemi兄入力ハッシュ不一致のため表示を停止しました。</p>'),/予想を表示できません/,'integrity failure is not changed into an empty or successful forecast');
assert.equal(clean('<p>2連対率・3連対率（直近6か月）</p>'),'<p>2連対率・3連対率（直近6か月）</p>');
assert.equal(clean('<span class="note">【当日締切前M0凍結】</span>'),'','no repeated freeze badge after reporter switching');
assert.equal(clean('<span class="note">見送り</span>'),'<span class="note">見送り</span>');
assert.equal(clean('<span class="note">【締切後・参考】</span>'),'<span class="note">【締切後・参考】</span>');
assert.equal(clean('<span class="note">【締切後・緊急復旧参照検証：正式M0対象外】</span>'),'<span class="note">締切後の参考予想</span>');
const scripts=s=>s.match(/<(?:script|style)\b[^>]*>[\s\S]*?<\/(?:script|style)>/gi)||[];
function tickets(s){
  const out=[],stack=[];
  for(const m of s.matchAll(/<\/?span\b[^>]*>/gi)){
    if(/^<\/span/i.test(m[0])){
      const open=stack.pop();
      if(open?.ticket)out.push(s.slice(open.start,m.index+m[0].length));
    }else stack.push({start:m.index,ticket:/\bclass="ticket"/.test(m[0])});
  }
  return out;
}
let races=0,fragments=0;
for(const issue of JSON.parse(fs.readFileSync('data/issue-index.json')).issues.slice(0,3)){
  const file=fs.readFileSync(issue.path);
  const html=issue.compression==='base64gzip'?zlib.gunzipSync(Buffer.from(file.toString().trim(),'base64')).toString():file.toString();
  const result=clean(html);
  assert.deepEqual(scripts(result),scripts(html),issue.date+': scripts, embedded payloads, integrity checks and handlers are byte-identical');
  assert.deepEqual(tickets(result),tickets(html),issue.date+': coloured tickets/support order/reasons are untouched');
  assert.equal((result.match(/<article\b/g)||[]).length,(html.match(/<article\b/g)||[]).length,'no races lost');
  assert.equal(clean(result),result,'idempotent projection');
  const header=result.match(/<header\b[^>]*id="top"[^>]*>[\s\S]*?<\/header>/)?.[0];
  if(header)assert.doesNotMatch(header,/Gate0|正式BC|凍結|原本|検収/,'no administrative header copy');
  const payload=html.match(/<script id="ochap-rich-payload"[^>]*>([^<]+)<\/script>/)?.[1];
  if(payload){
    const data=JSON.parse(zlib.gunzipSync(Buffer.from(payload.trim(),'base64')));
    for(const [key,fragment] of Object.entries(data.fragments)){
      const projected=clean(fragment);
      assert.doesNotMatch(projected,/朝刊の凍結原本と保存入力|再予想や順位変更/,'lazy-loaded audit text is removed');
      assert.deepEqual(tickets(projected),tickets(fragment),'lazy ticket markup unchanged');
      fragments++;
    }
  }
  races+=(html.match(/<article\b/g)||[]).length;
}
const index=fs.readFileSync('index.html','utf8');
assert.match(index,/reader-presentation\.js/);assert.match(index,/OchaPReaderPresentation\.cleanMarkup\(source\)/);assert.match(index,/OchaPReaderPresentation\.install\(document\)/);
const generator=fs.readFileSync('scripts/render_ochap_frozen.mjs','utf8');
assert.match(generator,/readerPresentation\.cleanMarkup\(html\)/);assert.doesNotMatch(generator,/function richSources/);
console.log(`PASS: reader projection, ${races} published races, ${fragments} lazy fragments, preserved tickets/scripts, missing-data and late-prediction labels`);
