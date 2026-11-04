/* Presentation only: textContent stays identical to each published ticket. */
(() => {
  'use strict';
  const selector='.ticket,.combo,.ochap-gemi-combos,.lr-bets>span>span,#digest td:nth-child(5)';
  const pattern=/(?<![0-9])[1-6](?:\s*-\s*[1-6]){2}(?![0-9])/g;
  function paint(root){
    if(root.nodeType!==1&&root.nodeType!==9)return;
    const targets=[...(root.matches?.(selector)?[root]:[]),...root.querySelectorAll(selector)];
    for(const target of targets){
      const walker=document.createTreeWalker(target,NodeFilter.SHOW_TEXT);
      const nodes=[];let node;
      while((node=walker.nextNode())){
        if(!node.parentElement.closest('.ochap-ticket-color')&&node.textContent.match(pattern))nodes.push(node);
      }
      for(const text of nodes){
        const raw=text.textContent,fragment=document.createDocumentFragment();let start=0;
        for(const match of raw.matchAll(pattern)){
          fragment.append(document.createTextNode(raw.slice(start,match.index)));
          const ticket=document.createElement('span');ticket.className='ochap-ticket-color';
          for(const part of match[0].split(/([1-6])/)){
            if(!part)continue;
            if(/^[1-6]$/.test(part)){
              const badge=document.createElement('span');badge.className='ochap-ticket-boat oc-b'+part;badge.textContent=part;ticket.append(badge);
            }else ticket.append(document.createTextNode(part));
          }
          fragment.append(ticket);start=match.index+match[0].length;
        }
        fragment.append(document.createTextNode(raw.slice(start)));text.replaceWith(fragment);
      }
    }
  }
  paint(document);
  const roots=new Set();let queued=false;
  new MutationObserver(changes=>{
    for(const change of changes)for(const node of change.addedNodes){
      const root=node.nodeType===1?node:node.parentElement;
      if(root&&!root.closest?.('.ochap-ticket-color'))roots.add(root);
    }
    if(!roots.size||queued)return;
    queued=true;queueMicrotask(()=>{queued=false;for(const root of roots)paint(root);roots.clear();});
  }).observe(document.body,{childList:true,subtree:true});
})();
