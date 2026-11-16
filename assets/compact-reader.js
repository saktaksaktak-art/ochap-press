/* Layout only. Move existing nodes so forecasts, provenance and listeners survive. */
(() => {
  'use strict';
  const title=n=>n?.textContent.trim()||'';
  function ocha(article){
    const copy=article.querySelector(':scope > .copy');
    if(!copy||copy.dataset.compact)return;
    const nodes=[...copy.children];
    const head=pattern=>nodes.find(n=>n.tagName==='H3'&&pattern.test(title(n)));
    const main=head(/^本線/),nav=head(/^舟券ナビ/),reverse=head(/^逆張り/);
    if(![main,nav,reverse].every(h=>h?.nextElementSibling?.classList.contains('tickets')))return;
    const details=prefix=>nodes.find(n=>n.tagName==='DETAILS'&&title(n.querySelector(':scope > summary')).startsWith(prefix));
    const entry=details('01'),course=details('02'),st=details('03'),scenario=details('04');
    if(!entry||!course||!st||(!scenario&&!nodes.some(n=>n.classList.contains('branches'))))return;
    const navTickets=nav.nextElementSibling,navReason=navTickets.nextElementSibling;
    main.nextElementSibling.after(nav,navTickets,...(navReason?.tagName==='P'?[navReason]:[]));
    const lead=nodes.find(n=>n.classList.contains('lead'));
    // Keep marks and the short editorial comment, but never put them between ticket groups.
    const prose=nodes.slice(nodes.indexOf(lead)+1,nodes.indexOf(main)).filter(n=>n.tagName==='P');
    const reverseTickets=reverse.nextElementSibling,reverseReason=reverseTickets.nextElementSibling;
    (reverseReason?.tagName==='P'?reverseReason:reverseTickets).after(...prose);
    const docket=document.createElement('details');
    const summary=document.createElement('summary');summary.textContent='出走表・コース成績';
    entry.before(docket);docket.className='compact-docket';docket.append(summary);
    for(const node of [entry,course]){node.open=true;docket.append(node);}
    const ranking=[...main.nextElementSibling.querySelectorAll('.ticket-reason')];
    const reasons=document.createElement('div');reasons.className='compact-rank-reasons';
    if(ranking.length){
      const heading=document.createElement('h4'),list=document.createElement('ol');
      heading.textContent='本線の支持理由';
      for(const reason of ranking){const item=document.createElement('li');item.append(reason);list.append(item);}
      reasons.append(heading,list);
    }
    const branches=nodes.find(n=>n.classList.contains('branches'));
    if(scenario){
      scenario.querySelector(':scope > summary').textContent='展開解説';
      scenario.open=false;
      docket.after(scenario);
      if(branches) {
        // Keep the original branch content out of the rich-fragment loader's replacement node.
        scenario.querySelector(':scope > summary').after(branches,...(ranking.length?[reasons]:[]));
      }
      scenario.after(st);
    }else if(branches){
      const fold=document.createElement('details'),heading=document.createElement('summary');
      heading.textContent='展開解説';
      fold.append(heading,branches,...(ranking.length?[reasons]:[]));
      docket.after(fold,st);
    }else docket.after(st);
    st.querySelector(':scope > summary').textContent='ST・スリット';
    st.open=false;
    copy.dataset.compact='';
    copy.classList.add('compact-forecast');
  }
  function gemi(pane){
    const sections=[...pane.querySelectorAll(':scope > section')];
    const byPrefix=p=>sections.find(n=>title(n.querySelector(':scope > h3')).startsWith(p));
    const st=byPrefix('03'),scenario=byPrefix('04'),picks=byPrefix('05');
    const bar=pane.previousElementSibling?.querySelector('.ochap-gemi-quickrow');
    if(bar){
      const rows=[...bar.children],nav=rows.find(n=>title(n).startsWith('舟券ナビ'));
      const reverse=rows.find(n=>title(n).startsWith('逆張り'));
      if(nav&&reverse)reverse.before(nav);
    }
    if(!picks||!scenario||!st)return;
    const grid=picks.querySelector('.picks');
    const nav=grid?.querySelector(':scope > .nav'),reverse=grid?.querySelector(':scope > .reverse');
    if(nav&&reverse)reverse.before(nav);
    const fold=(node,label)=>{
      const detail=document.createElement('details'),summary=document.createElement('summary');
      summary.textContent=label;
      detail.className='compact-gemi-detail';
      detail.append(summary,node);
      return detail;
    };
    picks.after(fold(scenario,'展開解説'),fold(st,'ST・スリット'));
  }
  for(const race of document.querySelectorAll('article[id^="v"]'))ocha(race);
  const forecast=document.getElementById('cards')||document.querySelector('main');
  if(!forecast)return;
  forecast.querySelectorAll('.ochap-gemi-pane').forEach(gemi);
  if(!window.MutationObserver)return;
  new MutationObserver(records=>{
    const panes=new Set();
    for(const event of records){
      if(event.target.matches?.('.ochap-gemi-pane'))panes.add(event.target);
      for(const node of event.addedNodes)if(node.matches?.('.ochap-gemi-pane'))panes.add(node);
    }
    panes.forEach(gemi);
  }).observe(forecast,{childList:true,subtree:true});
})();
