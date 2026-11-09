/* Reader copy policy. Audit data stays in the source JSON and ledger. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.OchaPReaderPresentation=api;
})(typeof window==='object'?window:globalThis,function(){
  'use strict';
  const text=html=>html.replace(/<[^>]*>/g,'').replace(/&nbsp;/g,' ').trim();
  const audit=/(?:SHA-?256|入力ハッシュ|Gate\s*\d|正式\s*(?:BC|バックチェック|M0)|検収|凍結予想原本|入力原本|原本凍結|共通入力[：:]|再予想や順位変更|朝刊の凍結原本と保存入力|解説・データ表示充実版)/i;
  const sourceTitle=/^(?:05\s+データの母数・期間・取得日|根拠と資料条件)/;
  function cleanPart(html){
    html=html.replace(/<span\b[^>]*class=["']note["'][^>]*>([^<]*)<\/span>/gi,(all,label)=>{
      if(!/凍結|正式|事後検証|M0予想原稿/.test(label))return all;
      if(/締切後/.test(label))return '<span class="note">締切後の参考予想</span>';
      if(/事後検証/.test(label))return '<span class="note">事後検証</span>';
      return '';
    });
    // Keep the masthead/date and reader-facing coverage, dropping audit paragraphs.
    html=html.replace(/<header\b([^>]*\bid=["']top["'][^>]*)>([\s\S]*?)<\/header>/gi,(all,attrs,body)=>{
      let coverage=false;
      return '<header'+attrs+'>'+body.replace(/<p\b[^>]*>[\s\S]*?<\/p>/gi,p=>{
        if(!coverage&&/^全国\s*\d+場[・･]\s*\d+R[｜|]/.test(text(p))&&!audit.test(text(p))){coverage=true;return p;}
        return '';
      })+'</header>';
    });
    // These drawers duplicate the data tables with acquisition/validation bookkeeping.
    html=html.replace(/<details\b[^>]*>\s*<summary[^>]*>([\s\S]*?)<\/summary>[\s\S]*?<\/details>/gi,(all,title)=>sourceTitle.test(text(title))?'':all);
    html=html.replace(/<p\b[^>]*>[\s\S]*?<\/p>/gi,p=>{
      if(!audit.test(text(p)))return p;
      // Keep an honest reader-facing failure state; the technical cause stays internal.
      if(/(?:不一致|表示を停止)/.test(text(p)))return p.replace(/>[^<]*(?:SHA|ハッシュ)[\s\S]*<\/p>$/i,'>予想を表示できません。時間をおいて再読み込みしてください。</p>');
      return '';
    });
    return html.replace(/原本の受益候補/g,'受益候補').replace(/原本の2着候補順/g,'2着候補順').replace(/原本の役割/g,'役割').replace(/実際の踏込みを確定する値ではありません。/g,'');
  }
  function cleanMarkup(html){
    // Opaque scripts include frozen inputs, lazy fragments and integrity checks.
    // Never rewrite their bytes, handlers, forecast values or calculation rules.
    return String(html).split(/(<(?:script|style)\b[^>]*>[\s\S]*?<\/(?:script|style)>)/gi)
      .map((s,i)=>i%2?s:cleanPart(s)).join('');
  }
  function install(doc){
    const selectors='p,details,.ochap-gemi-details,.ochap-gemi-quickrow > .note,.rich-fragment th,[data-public-audit]';
    function cleanElement(el){
      if(el.matches('[data-public-audit]')){el.remove();return;}
      if(el.matches('.ochap-gemi-details')){el.remove();return;}
      if(el.matches('header#top > p')&&!/^全国\s*\d+場[・･]\s*\d+R[｜|]/.test(el.textContent.trim())){el.remove();return;}
      if(el.matches('details')&&sourceTitle.test(el.querySelector(':scope > summary')?.textContent.trim()||'')){el.remove();return;}
      if(!el.matches('p,.ochap-gemi-quickrow > .note,.rich-fragment th'))return;
      const before=el.outerHTML,after=cleanMarkup(before);
      if(after===before)return;
      if(!after){el.remove();return;}
      const template=doc.createElement('template');template.innerHTML=after;
      el.replaceWith(template.content);
    }
    function cleanTree(node){
      if(node.nodeType!==1)return;
      if(node.matches('script,style'))return;
      if(node.matches(selectors))cleanElement(node);
      node.querySelectorAll(selectors).forEach(cleanElement);
    }
    cleanTree(doc.documentElement);
    const observer=new MutationObserver(records=>{
      for(const record of records){
        if(record.target.nodeType===1&&record.target.matches(selectors))cleanElement(record.target);
        for(const node of record.addedNodes)cleanTree(node);
      }
    });
    observer.observe(doc.documentElement,{childList:true,subtree:true});
    return observer;
  }
  return Object.freeze({cleanMarkup,install});
});
