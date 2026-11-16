/* Navigate only to content already present in the selected newspaper view. */
(() => {
  'use strict';
  const datebar=document.getElementById('ochap-issue-datebar');
  const tabs=document.getElementById('ochap-public-roles');
  if(!datebar||!tabs)return;
  const body=document.body;
  body.classList.add('ochap-navy-reader');
  const make=(tag,text)=>{
    const el=document.createElement(tag);
    if(text)el.textContent=text;
    return el;
  };
  const button=(text,action)=>{
    const el=make('button',text);
    el.type='button';
    el.addEventListener('click',action);
    return el;
  };
  const visible=el=>!!el&&el.getClientRects().length>0;
  const first=(root,selector)=>[...root.querySelectorAll(selector)].find(visible);
  const items=[
    ['予想','forecast'],['特選レース','special'],['予想一致レース','consensus'],
    ['結果速報','results'],['記者別成績・比較','versus']
  ];
  const open=button('ページ内移動 ▾',show);
  open.id='ochap-jump-open';
  open.setAttribute('aria-haspopup','dialog');
  open.setAttribute('aria-controls','ochap-jump-dialog');
  const dialog=make('dialog');
  dialog.id='ochap-jump-dialog';
  dialog.setAttribute('aria-labelledby','ochap-jump-title');
  datebar.append(open);
  if(typeof dialog.showModal!=='function'){open.remove();return;}
  body.append(dialog);
  dialog.addEventListener('click',ev=>{
    if(ev.target!==dialog)return;
    const b=dialog.getBoundingClientRect();
    if(ev.clientX<b.left||ev.clientX>b.right||ev.clientY<b.top||ev.clientY>b.bottom)dialog.close();
  });
  const offsets=()=>{
    const dateHeight=datebar.getBoundingClientRect().height;
    body.style.setProperty('--ochap-date-height',Math.ceil(dateHeight)+'px');
    body.style.setProperty('--ochap-sticky-height',Math.ceil(dateHeight+tabs.getBoundingClientRect().height)+'px');
  };
  offsets();
  if(window.ResizeObserver){
    const observer=new ResizeObserver(offsets);
    observer.observe(datebar);
    observer.observe(tabs);
  }else window.addEventListener('resize',offsets,{passive:true});

  function to(target){
    if(!visible(target))return;
    if(target.tagName==='SUMMARY'&&target.parentElement.tagName==='DETAILS')target.parentElement.open=true;
    target.dataset.ochapJumpTarget='';
    if(!target.matches('button,select,summary,a[href],[tabindex]'))target.tabIndex=-1;
    target.focus({preventScroll:true});
    target.scrollIntoView({block:'start'});
  }
  function categoryButtons(title,entries){
    if(!entries.length)return;
    const row=make('div');
    row.className='ochap-jump-buttons';
    for(const [label,action] of entries)row.append(button(label,()=>{
      dialog.close();
      requestAnimationFrame(action);
    }));
    dialog.append(make('h3',title),row);
  }
  function viewAnchors(view){
    const root=document.getElementById('ochap-'+view+'-view');
    if(view==='forecast'){
      const filter=first(document,'.toolbar,#venue,.venue-links,.venue-nav');
      const digest=first(document,'#digestBtn');
      const cards=first(document,'#cardsBtn');
      return [
        ...(filter?[['開催場・レース選択',()=>to(filter)]]:[]),
        ...(digest?[['全体ダイジェスト',()=>{digest.click();requestAnimationFrame(()=>to(document.getElementById('digest')));}]]:[]),
        ...(cards?[['レース詳報',()=>{cards.click();requestAnimationFrame(()=>to(first(document,'main article[id]')));}]]:[])
      ];
    }
    if(!root)return [];
    const anchors={
      special:[['開催場・特選区分','.public-controls'],['特選レース一覧','.special-cards']],
      consensus:[['一致成績','.public-grid'],['開催場・結果の絞り込み','.public-controls:has(select)'],['一致レース一覧','.consensus-races']],
      results:[['速報の集計','.lr-summary'],['100円平買い収支','.lr-finance-overview'],
        ['特選レースの成績','.lr-section:has(.lr-special-grid)'],['高配当的中','#lr-high'],
        ['レース結果一覧','#lr-list'],['区分別成績','#lr-performance'],['集計の見方','.lr-howto>summary']],
      versus:[['記者別成績','.ochap-score-grid'],['予想区分別 成績比較','.ochap-score-categories'],
        ['高配当的中','.ochap-score-high'],['全レース的中一覧','.ochap-score-by-race'],
        ['比較スコアボード','.public-card:has(>h2)']]
    };
    return (anchors[view]||[]).flatMap(([label,selector])=>{
      const target=first(root,selector);
      return target?[[label,()=>to(first(root,selector))]]:[];
    });
  }
  function raceAnchors(){
    const candidates=[...document.querySelectorAll('main article[id]')].filter(visible);
    if(!candidates.length)return null;
    const bar=tabs.getBoundingClientRect().bottom+9;
    const article=candidates.filter(el=>el.getBoundingClientRect().bottom>bar)
      .reduce((best,el)=>!best||el.getBoundingClientRect().top<best.getBoundingClientRect().top?el:best,null);
    if(!article)return null;
    const headings=[...article.querySelectorAll('h3,summary')].filter(visible);
    const labels=[
      ['出走表',/^(?:01\s*)?出走表/],['コースデータ',/^(?:02\s*)?.*コースデータ/],
      ['ST・スリット',/^(?:03\s*)?.*(?:ST詳細|スリット隊形)/],['展開・解説',/^(?:04\s*)?(?:展開予想|解説詳報)/],
      ['本線',/^本線/],['逆張り',/^逆張り/],['舟券ナビ',/^舟券ナビ/]
    ];
    const entries=labels.flatMap(([label,pattern])=>{
      const h=headings.find(el=>pattern.test(el.textContent.trim()));
      return h?[[label,()=>to(h)]]:[];
    });
    if(!entries.length)return null;
    const title=(article.querySelector('h2')?.textContent||'レース詳報').match(/^.*?\d+R/)?.[0]||'レース詳報';
    return {title,entries};
  }
  function show(){
    const view=tabs.querySelector('[aria-pressed=true]')?.dataset.view||'forecast';
    const header=make('header');
    const title=make('h2','ページ内移動');
    title.id='ochap-jump-title';
    header.append(title,button('閉じる',()=>dialog.close()));
    dialog.replaceChildren(header);
    categoryButtons('このタブ', [['ページの先頭',()=>window.scrollTo(0,0)],...viewAnchors(view)]);
    const race=view==='forecast'?raceAnchors():null;
    if(race)categoryButtons(race.title+' の詳報',race.entries);
    categoryButtons('別のタブ',items.filter(([,key])=>key!==view).map(([label,key])=>[
      label,()=>tabs.querySelector('button[data-view="'+key+'"]')?.click()
    ]));
    dialog.showModal();
  }
})();
