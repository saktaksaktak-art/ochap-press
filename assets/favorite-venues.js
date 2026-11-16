/* A per-edition reading list built from already published newspaper articles. */
(() => {
  'use strict';
  const storePrefix='ochap.favorite-venues.v1:';
  const dayFormat=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit'});
  const timeFormat=new Intl.DateTimeFormat('ja-JP',{timeZone:'Asia/Tokyo',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
  const stateByHost=new WeakSet();
  const dayKey=date=>{const parts=Object.fromEntries(dayFormat.formatToParts(date).map(p=>[p.type,p.value]));return parts.year+'-'+parts.month+'-'+parts.day;};
  const text=(node)=>node?.textContent.trim()||'';
  function element(tag,label,className){
    const node=document.createElement(tag);
    if(label)node.textContent=label;
    if(className)node.className=className;
    return node;
  }
  function archiveRaces(){
    const source=document.getElementById('cards')||document.querySelector('main');
    if(!source)return [];
    return [...source.querySelectorAll('article[id]')].flatMap(node=>{
      const match=node.id.match(/^v(\d+)-r(\d+)$/);
      const head=node.querySelector('.race-head h2,.race-head h3');
      if(!match||!head)return [];
      const heading=head.cloneNode(true);
      heading.querySelectorAll('.special-badges,.spot-badge,.g1-tag').forEach(x=>x.remove());
      const name=text(heading).match(/^(.+?)\s*(\d{1,2})R/);
      if(!name||Number(name[2])!==Number(match[2]))return [];
      const venue=name[1].trim().replace(/^注目\s*/,'');
      if(!venue||!node.dataset.venue)return [];
      return [{node,venue,code:match[1],race:Number(match[2]),heading:text(heading)}];
    });
  }
  function deadline(row,date){
    const raw=row.node.dataset.deadline;
    if(raw&&/(?:Z|[+-]\d{2}:\d{2})$/.test(raw)){
      const time=Date.parse(raw);
      if(Number.isFinite(time)&&dayKey(new Date(time))===date)return time;
    }
    const match=row.heading.match(/締切\s*(\d{1,2}):([0-5]\d)(?!\d)/);
    return match&&Number(match[1])<24?Date.parse(date+'T'+match[1].padStart(2,'0')+':'+match[2]+':00+09:00'):Infinity;
  }
  function read(key,available){
    try {
      const parsed=JSON.parse(localStorage.getItem(key)||'[]');
      return new Set(Array.isArray(parsed)?parsed.filter(code=>available.has(code)):[]);
    } catch (_) {return new Set();}
  }
  function pickGroup(copy,pattern){
    const direct=copy&&[...copy.children].find(n=>n.tagName==='H3'&&pattern.test(text(n)));
    const tickets=direct?.nextElementSibling;
    if(!tickets?.classList.contains('tickets'))return [];
    return [...tickets.querySelectorAll('.ticket')].map(ticket=>window.OchaPHitReporters?.readTicket(ticket)).filter(Boolean);
  }
  function ticket(value){
    const chip=element('span',null,'ochap-ticket-color favorite-ticket');
    for(const [index,boat] of value.split('-').entries()){
      if(index)chip.append(document.createTextNode('-'));
      chip.append(element('span',boat,'ochap-ticket-boat oc-b'+boat));
    }
    return chip;
  }
  function mount(host,{date,jumpToForecast}){
    if(stateByHost.has(host))return;
    if(!/^\d{4}-\d{2}-\d{2}$/.test(date))return;
    const races=archiveRaces().map(r=>({...r,deadline:deadline(r,date)})).sort((a,b)=>
      a.deadline-b.deadline||Number(a.code)-Number(b.code)||a.race-b.race);
    const venues=new Map([...races].sort((a,b)=>Number(a.code)-Number(b.code)).map(r=>[r.code,r.venue]));
    const today=dayKey(new Date())===date;
    const heading=element('h2',today?'本日のお気に入り場':'お気に入り場');
    const dateLabel=element('p',date.replaceAll('-','/')+'号','public-note');
    host.replaceChildren(heading,dateLabel);
    if(!venues.size){
      host.append(element('p','この号にはお気に入りに登録できる開催場がありません。','public-status'));
      return;
    }
    const key=storePrefix+date,selected=read(key,venues);
    const picker=element('fieldset',null,'favorite-venue-picker');
    picker.append(element('legend','開催場を選ぶ'));
    const buttons=element('div',null,'favorite-venue-buttons');
    const hint=element('p','選択はこの日付・この端末に保存します。','public-note');
    const count=element('p',null,'favorite-venue-count');
    count.setAttribute('role','status');
    const list=element('div',null,'favorite-race-list');
    picker.append(buttons,hint);
    host.append(picker,count,list);
    const controls=new Map();
    for(const [code,venue] of venues){
      const button=element('button',venue);
      button.type='button';
      button.setAttribute('aria-label',venue);
      button.addEventListener('click',()=>{
        if(selected.has(code))selected.delete(code);else selected.add(code);
        try {localStorage.setItem(key,JSON.stringify([...selected]));}
        catch (_) {hint.textContent='端末に保存できないため、この画面を開いている間だけ保持します。';}
        render();
      });
      controls.set(code,button);
      buttons.append(button);
    }
    function render(){
      const expanded=new Set([...list.querySelectorAll('article:has(details[open])')].map(card=>card.dataset.raceId));
      for(const [code,button] of controls)button.setAttribute('aria-pressed',String(selected.has(code)));
      const filtered=races.filter(r=>selected.has(r.code));
      count.textContent=selected.size?'登録 '+selected.size+'場・'+filtered.length+'R ｜ 締切順':'開催場を選ぶと、この記事一覧にレースが並びます。';
      const fragment=document.createDocumentFragment();
      for(const row of filtered){
        const card=element('article',null,'public-card favorite-race');
        card.dataset.raceId=row.node.id;
        const header=element('div',null,'favorite-race-head');
        const close=Number.isFinite(row.deadline)?'締切 '+timeFormat.format(new Date(row.deadline)):'締切未掲載';
        header.append(element('h3',row.venue+' '+row.race+'R'),element('span',close,'public-note'));
        card.append(header);
        const copy=row.node.querySelector(':scope > .copy');
        const lead=text(copy?.querySelector(':scope > .lead'));
        const picks=pickGroup(copy,/^本線/);
        if(lead)card.append(element('p',lead,'favorite-marks'));
        if(picks.length){
          const line=element('div',null,'favorite-tickets');
          line.append(element('b','本線（お茶P）'),...picks.map(ticket));
          card.append(line);
        }
        if(copy){
          const details=element('details',null,'favorite-preview');
          details.open=expanded.has(row.node.id);
          details.append(element('summary','買い目・短評'));
          const lines=[...copy.children];
          const methodIndex=lines.findIndex(n=>n.tagName==='P'&&/^予想決まり手[：:]/.test(text(n)));
          const comment=methodIndex>=0&&lines[methodIndex+1]?.tagName==='P'?text(lines[methodIndex+1]):'';
          if(methodIndex>=0)details.append(element('p',text(lines[methodIndex]),'public-note'));
          if(comment)details.append(element('p',comment,'favorite-comment'));
          for(const [label,pattern] of [['舟券ナビ',/^舟券ナビ/],['逆張り',/^逆張り/]]){
            const group=pickGroup(copy,pattern);
            if(!group.length)continue;
            const line=element('div',null,'favorite-tickets');
            line.append(element('b',label),...group.map(ticket));
            details.append(line);
          }
          card.append(details);
        }
        const link=element('a','レース詳報');
        const url=new URL(location.href);
        url.searchParams.delete('view');
        url.searchParams.set('date',date);
        url.hash=row.node.id;
        link.href=url.href;
        link.addEventListener('click',event=>{
          if(event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
          if(jumpToForecast(row.node.id))event.preventDefault();
        });
        card.append(link);
        fragment.append(card);
      }
      list.replaceChildren(fragment);
    }
    stateByHost.add(host);
    render();
  }
  window.OchaPFavoriteVenues=Object.freeze({mount});
})();
