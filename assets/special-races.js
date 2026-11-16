/* Select from the published M0 consensus; settle through the existing result scorer. */
(() => {
  'use strict';

  const labels = {
    special_teppan:'🎯 鉄板特選',
    special_myoumi:'🔥 妙味特選',
    main_x_reverse:'お茶P本線 × Gemi兄逆張り',
    reverse_x_main:'Gemi兄本線 × お茶P逆張り'
  };
  const types = ['special_teppan','special_myoumi'];
  const directions = ['main_x_reverse','reverse_x_main'];
  const validBoat = boat => /^[1-6]$/.test(String(boat));
  const validTicket = ticket => typeof ticket==='string' && /^[1-6](?:-[1-6]){2}$/.test(ticket) &&
    new Set(ticket.split('-')).size===3;
  const intersection = (a,b) => [...new Set(a)].filter(ticket=>b.includes(ticket));
  const tickets = (race,author,category) => {
    const entries=race.reporters?.[author]?.categories?.[category];
    return Array.isArray(entries)&&entries.every(validTicket)?entries:[];
  };
  const closedAt = new Intl.DateTimeFormat('ja-JP',{timeZone:'Asia/Tokyo',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
  const cache = new Map();

  function select(data,issue,forecasts={}){
    if(data?.schema_version!=='ochap.public.consensus.v1'||data.edition!=='M0'||data.date!==issue?.date||
      !Array.isArray(data.races))return new Map();
    const eligible=window.OchaPConsensus.eligibleRaces(data,issue);
    const picks=new Map();
    for(const race of data.races){
      const {venue_code,race_no,race_id,deadline}=race;
      if(!Number.isInteger(venue_code)||venue_code<1||venue_code>24||!Number.isInteger(race_no)||race_no<1||
        race_no>12||typeof race.venue!=='string'||race_id!=='v'+venue_code+'-r'+race_no||!eligible(race)||
        new Date(Date.parse(deadline)+9*3600000).toISOString().slice(0,10)!==data.date)continue;
      const ocha=tickets(race,'ocha','main'),gemi=tickets(race,'gemi','main');
      const main=intersection(ocha,gemi);
      const forecast=forecasts?.[race_id];
      const ochaMark=race.ocha_marks?.[0]??forecast?.ocha?.published_main_mark;
      const gemiMark=race.gemi_marks?.[0]??forecast?.gemi?.published_main_mark;
      const different=validBoat(ochaMark)&&validBoat(gemiMark)&&String(ochaMark)!==String(gemiMark);
      const crossForward=different?intersection(ocha,tickets(race,'gemi','reverse')):[];
      const crossReverse=different?intersection(gemi,tickets(race,'ocha','reverse')):[];
      const teppan=ocha.length===4&&gemi.length===4&&main.length===4?main:[];
      const myoumi=[...new Set([...crossForward,...crossReverse])];
      if(!teppan.length&&!myoumi.length)continue;
      picks.set(race_id,{
        race_id,venue_code,race_no,venue:race.venue,deadline,closing_time:closedAt.format(new Date(deadline)),
        ochaMark:validBoat(ochaMark)?String(ochaMark):null,gemiMark:validBoat(gemiMark)?String(gemiMark):null,
        ochaMethod:race.ocha_method||forecast?.ocha?.predicted_method,
        gemiMethod:race.gemi_method||forecast?.gemi?.predicted_method,
        special_teppan:teppan,special_myoumi:myoumi,main_x_reverse:crossForward,reverse_x_main:crossReverse
      });
    }
    return picks;
  }

  function fromPublishedForecasts(date,issue,forecasts){
    const timestamps=[issue.reporters?.ocha?.frozen_at_jst,issue.publication_timing_checked_at,
      issue.reporters?.gemi?.recorded_freeze_at_jst,
      issue.gemi_first_publication_confirmed_at_jst||issue.gemi_publication_timing_checked_at];
    const cutoff=Math.max(...timestamps.map(value=>
      typeof value==='string'&&/(Z|[+-]\d{2}:\d{2})$/.test(value)?Date.parse(value):NaN));
    if(!Number.isFinite(cutoff)||new Date(cutoff+9*3600000).toISOString().slice(0,10)!==date)return null;
    const races=[];
    for(const [id,record] of Object.entries(forecasts||{})){
      const parts=id.match(/^v(\d+)-r(\d+)$/),deadline=record.meta?.closing_at;
      if(!parts||!record.ocha||!record.gemi||!Number.isFinite(Date.parse(deadline))||Date.parse(deadline)<=cutoff||
        Date.parse(record.gemiTiming?.closing_at)!==Date.parse(deadline)||
        !(Date.parse(record.gemiTiming?.freeze_at)<Date.parse(deadline)))continue;
      races.push({
        race_id:id,venue_code:Number(parts[1]),race_no:Number(parts[2]),venue:record.meta.venue,
        deadline,pair_timing_eligible:true,reporters:{ocha:{categories:record.ocha},gemi:{categories:record.gemi}}
      });
    }
    return races.length?{schema_version:'ochap.public.consensus.v1',edition:'M0',date,races}:null;
  }

  function load(date,issue,forecasts){
    if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||issue?.date!==date||!window.OchaPConsensus?.eligibleRaces)
      return Promise.resolve(null);
    if(!cache.has(date)){
      const request=fetch('./data/consensus/'+date+'.json',{cache:'no-store'}).then(response=>{
        if(!response.ok)throw Error('一致予想を取得できません');
        return response.json();
      }).catch(()=>{
        cache.delete(date);
        return null;
      });
      cache.set(date,request);
    }
    return cache.get(date).then(data=>{
      const source=data?.schema_version==='ochap.public.consensus.v1'&&data.date===date&&data.edition==='M0'&&Array.isArray(data.races)
        ?data:fromPublishedForecasts(date,issue,forecasts);
      return source?select(source,issue,forecasts):null;
    });
  }

  function score(rows,picks,group){
    const eligible=rows.filter(row=>picks.get(key(row))?.[group].length);
    const forecasts=Object.fromEntries(eligible.map(row=>[key(row),{special:{main:picks.get(key(row))[group]}}]));
    const result=window.OchaPHitReporters.score(eligible,forecasts,'special','main','three');
    return {...result,target:eligible.length,
      confirmed:eligible.filter(row=>row.official_confirmed===true&&row.order).length};
  }

  const key=row=>'v'+row.venue_code+'-r'+row.race_no;
  const activeTypes=pick=>types.filter(type=>pick?.[type].length);
  const element=(tag,text,cls)=>{
    const node=document.createElement(tag);
    if(text!==undefined)node.textContent=text;
    if(cls)node.className=cls;
    return node;
  };
  const badge=(type,text=labels[type])=>element('span',text,'special-badge '+type);

  function tagForecastCards(picks){
    for(const [id,pick] of picks){
      const article=document.getElementById(id);
      const header=article?.querySelector('.race-head h2, header h2, h2');
      if(!header||header.querySelector('.special-badges'))continue;
      const badges=element('span',undefined,'special-badges');
      badges.append(...activeTypes(pick).map(type=>badge(type)));
      header.append(badges);
    }
  }

  function mount(root,picks,onJump){
    root.replaceChildren(element('h2','特選レース'));
    if(!picks?.size){
      root.append(element('p',picks?'この号に該当する特選レースはありません。':'この号の一致予想を取得できませんでした。'));
      return;
    }
    const sorted=[...picks.values()].sort((a,b)=>Date.parse(a.deadline)-Date.parse(b.deadline)||
      a.venue_code-b.venue_code||a.race_no-b.race_no);
    const filters=element('div',undefined,'public-controls');
    const list=element('div',undefined,'special-cards');
    function filter(label,options){
      const control=element('label',label+' '),select=element('select');
      select.setAttribute('aria-label',label);
      for(const [value,text] of options){
        const option=element('option',text);
        option.value=value;
        select.append(option);
      }
      control.append(select);
      filters.append(control);
      select.addEventListener('change',render);
      return select;
    }
    const venues=[...new Map(sorted.map(pick=>[String(pick.venue_code),pick.venue]))];
    const venue=filter('開催場',[['','全場'],...venues]);
    const category=filter('特選区分',[['','全区分'],...types.map(type=>[type,labels[type]])]);
    function render(){
      const shown=sorted.filter(pick=>(!venue.value||venue.value===String(pick.venue_code))&&
        (!category.value||pick[category.value].length));
      list.replaceChildren();
      for(const pick of shown){
        const card=element('article',undefined,'public-card special-card');
        const heading=element('h3',pick.venue+' '+pick.race_no+'R');
        const badges=element('div',undefined,'special-badges');
        badges.append(...activeTypes(pick).map(type=>badge(type)));
        card.append(heading,element('p','締切 '+pick.closing_time,'public-note'),badges,
          element('p','お茶P ◎'+(pick.ochaMark??'—')+'・'+(pick.ochaMethod||'—')+
            ' ／ Gemi兄 ◎'+(pick.gemiMark??'—')+'・'+(pick.gemiMethod||'—')));
        for(const group of ['special_teppan',...directions]){
          if(!pick[group].length)continue;
          const label=group==='special_teppan'?'一致本線4点':labels[group];
          const line=element('div',undefined,'special-picks');
          const chips=element('div',undefined,'special-tickets');
          chips.append(...pick[group].map(ticket=>element('span',ticket)));
          line.append(element('strong',label),chips);
          card.append(line);
        }
        const link=element('a','レース詳報');
        const url=new URL(location.href);
        url.searchParams.delete('view');
        url.hash=pick.race_id;
        link.href=url.href;
        link.addEventListener('click',event=>{
          if(event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
          if(onJump(pick.race_id))event.preventDefault();
        });
        card.append(link);
        list.append(card);
      }
      if(!shown.length)list.append(element('p','この条件に該当するレースはありません。'));
    }
    root.append(filters,list);
    render();
  }

  window.OchaPSpecial=Object.freeze({load,select,score,activeTypes,tagForecastCards,mount,labels});
})();
