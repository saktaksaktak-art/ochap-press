/* Reader-facing live dashboard. Uses published tickets and public results only. */
(() => {
  'use strict';
  const authors=[['ocha','お茶P記者'],['gemi','Gemi兄記者']];
  const groups=[['main','本線'],['reverse','逆張り'],['navi','舟券ナビ'],['all','全区分']];
  const venues=['桐生','戸田','江戸川','平和島','多摩川','浜名湖','蒲郡','常滑','津','三国','びわこ','住之江','尼崎','鳴門','丸亀','児島','宮島','徳山','下関','若松','芦屋','福岡','唐津','大村'];
  const states=new Map();
  const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const yen=x=>Number.isFinite(x)?x.toLocaleString('ja-JP')+'円':'—';
  const signed=x=>(x>0?'+':'')+yen(x);
  const rate=(x,n)=>n?(x/n*100).toFixed(1)+'%':'—';
  const recordKey=r=>'v'+r.venue_code+'-r'+r.race_no;
  const session=r=>r.session_verified===true?({morning:'morning',day:'day',night:'night','モーニング':'morning','デイ':'day','ナイター':'night'})[r.session]||'unknown':'unknown';
  const boat=n=>'<span class="lr-boat lr-b'+Number(n)+'">'+Number(n)+'</span>';
  const order=r=>r.order ? '<span class="lr-order">'+r.order.map(boat).join('')+'</span>' : '<span class="lr-muted">結果待ち</span>';
  const selectedAuthors=state=>authors.filter(([id])=>state.author==='both'||state.author===id);
  function select(name,label,options,value){
    return '<label class="lr-filter"><span>'+label+'</span><select data-filter="'+name+'" aria-label="'+label+'">'+options.map(([id,text])=>'<option value="'+esc(id)+'"'+(id===value?' selected':'')+'>'+esc(text)+'</option>').join('')+'</select></label>';
  }
  function toggle(action,value,text,active){
    return '<button type="button" data-action="'+action+'" data-value="'+esc(value)+'" aria-pressed="'+active+'">'+text+'</button>';
  }
  function matching(row,forecasts,author,group){
    const rec=forecasts?.[recordKey(row)]?.[author];
    if(!rec)return {known:false,groups:[],one:false,two:false,three:false};
    const keys=group==='all'?['main','reverse','navi']:[group];
    const bets=keys.flatMap(k=>Array.isArray(rec[k])?rec[k]:[]);
    const actual=row.order?.join('-');
    return {known:!!bets.length,groups:groups.filter(([k])=>keys.includes(k)&&rec[k]?.includes(actual)).map(([,n])=>n),
      one:!!actual&&bets.some(t=>t[0]===actual[0]),two:!!actual&&bets.some(t=>t.slice(0,3)===actual.slice(0,3)),
      three:!!actual&&bets.includes(actual)};
  }
  function reporterLines(row,forecasts,state,hitsOnly=false){
    return selectedAuthors(state).map(([author,label])=>{
      const m=matching(row,forecasts,author,state.group);
      if(hitsOnly&&!m.three)return '';
      const status=!row.order?'結果待ち':!m.known?'予想なし':m.three?m.groups.join('・')+' 的中':'3連単 —';
      const checks=row.order&&m.known?'<small>1着 '+(m.one?'✓':'—')+'　2連 '+(m.two?'✓':'—')+'　3連 '+(m.three?'✓':'—')+'</small>':'';
      return '<div class="lr-reporter lr-'+author+(m.three?' lr-hit':'')+'"><b>'+label+'</b><span>'+esc(status)+'</span>'+(!hitsOnly?checks:'')+'</div>';
    }).join('');
  }
  function finance(s){
    const partial=s.missingPayout>0,known=s.financeN>0&&!partial;
    return '<dl class="lr-finance"><div><dt>投資額</dt><dd>'+(s.n?yen(s.totalStake):'—')+'</dd></div><div><dt>払戻合計</dt><dd>'+(known?yen(s.payout):'—')+'</dd></div><div><dt>平買い収支</dt><dd class="'+(s.profit>=0?'lr-positive':'lr-negative')+'">'+(known?signed(s.profit):'—')+'</dd></div><div><dt>回収率</dt><dd>'+(!known||s.roi===null?'—':s.roi.toFixed(1)+'%')+'</dd></div></dl>'+
      (partial?'<p class="lr-caption">払戻未取得 '+s.missingPayout+'R・収支集計待ち</p>':'');
  }
  function makeRows(rows,forecasts){
    const map=new Map();
    for(const [key,f] of Object.entries(forecasts||{})){
      const id=key.match(/^v(\d+)-r(\d+)$/);
      if(!id||!f.meta)continue;
      map.set(key,{venue_code:Number(id[1]),race_no:Number(id[2]),...f.meta});
    }
    for(const row of rows){
      const code=Number(row.venue_code)||venues.indexOf(row.venue)+1;
      const r={...row,venue_code:code};
      map.set(recordKey(r),{...map.get(recordKey(r)),...r});
    }
    return [...map.values()].sort((a,b)=>Number(!!b.order)-Number(!!a.order)||
      String(a.closing_time||'99:99').localeCompare(String(b.closing_time||'99:99'))||a.venue_code-b.venue_code||a.race_no-b.race_no);
  }
  function mount(host,{date,rows,forecasts,issue,updatedAt,onRefresh}){
    const engine=window.OchaPHitReporters;
    if(!engine?.score)return;
    if(!states.has(date))states.set(date,{author:'both',venue:'all',session:'all',band:'all',decision:'all',group:'all',list:'all',bet:'three',page:0,extra:false});
    const state=states.get(date),all=makeRows(rows,forecasts);
    const availableVenues=[...new Set(all.map(r=>r.venue).filter(Boolean))];
    if(state.venue!=='all'&&!availableVenues.includes(state.venue))state.venue='all';
    const authorsNow=()=>selectedAuthors(state);
    function filtered(){
      return all.filter(r=>{
        if(state.venue!=='all'&&r.venue!==state.venue)return false;
        if(state.session!=='all'&&session(r)!==state.session)return false;
        if(state.band!=='all'&&Math.ceil(r.race_no/4)!==Number(state.band))return false;
        if(state.decision==='first'&&r.order?.[0]!==1)return false;
        if(state.decision==='other'&&(!r.order||r.order[0]===1))return false;
        return true;
      });
    }
    function score(rs,author,group,bet=state.bet){return engine.score(rs,forecasts,author,group,bet);}
    function hasHit(row){return authorsNow().some(([author])=>matching(row,forecasts,author,state.group).three);}
    function compactTable(rs){
      return '<div class="lr-compact"><table><colgroup><col class="lr-col-race"><col class="lr-col-order"><col class="lr-col-pay"><col class="lr-col-author"></colgroup><thead><tr><th>場・R</th><th>出目</th><th>払戻</th><th>的中記者</th></tr></thead><tbody>'+rs.map(r=>'<tr><td>'+esc(r.venue)+'<b>'+r.race_no+'R</b></td><td>'+order(r)+'</td><td class="lr-payout">'+yen(r.trifecta_payout_yen)+'</td><td>'+reporterLines(r,forecasts,state,true)+'</td></tr>').join('')+'</tbody></table></div>';
    }
    function raceCards(rs){
      return '<div class="lr-races">'+rs.map(r=>{
        const checks=reporterLines(r,forecasts,state),id=recordKey(r);
        const details=authorsNow().map(([a,label])=>{
          const f=forecasts?.[id]?.[a];if(!f)return '<p>'+label+'：予想なし</p>';
          const keys=state.group==='all'?groups.filter(([k])=>k!=='all'):groups.filter(([k])=>k===state.group);
          const list=keys.map(([k,n])=>'<div class="lr-bets"><b>'+n+'</b><span>'+((f[k]||[]).map(t=>'<span class="'+(t===r.order?.join('-')?'lr-ticket-hit':'')+'">'+esc(t)+'</span>').join('')||'見送り')+'</span></div>').join('');
          const s=r.order?score([r],a,state.group):null;
          return '<div class="lr-pick-detail lr-'+a+'"><h4>'+label+'</h4>'+list+(s?.financeN?'<p>投資 '+yen(s.stake)+' ／ 払戻 '+yen(s.payout)+' ／ 収支 <b class="'+(s.profit>=0?'lr-positive':'lr-negative')+'">'+signed(s.profit)+'</b></p>':'')+'</div>';
        }).join('');
        return '<article class="lr-race"><div class="lr-race-top"><div><strong>'+esc(r.venue)+' '+r.race_no+'R</strong>'+(r.closing_time?'<small>締切 '+esc(r.closing_time)+'</small>':'')+'</div><div>'+order(r)+(r.method?'<small>'+esc(r.method)+'</small>':'')+'</div><div class="lr-payout">'+(r.order?yen(r.trifecta_payout_yen):'—')+'<small>3連単・100円</small></div></div><div class="lr-race-reporters">'+checks+'</div><details><summary>掲載買い目・このRの収支</summary>'+details+'</details></article>';
      }).join('')+'</div>';
    }
    function pagination(total){
      const pages=Math.max(1,Math.ceil(total/12));
      state.page=Math.max(0,Math.min(state.page,pages-1));
      return '<div class="lr-pages"><button type="button" data-action="page" data-value="-1"'+(state.page===0?' disabled':'')+'>前へ</button><span>'+(total?state.page*12+1:0)+'〜'+Math.min(total,(state.page+1)*12)+' / '+total+'R</span><button type="button" data-action="page" data-value="1"'+(state.page>=pages-1?' disabled':'')+'>次へ</button></div>';
    }
    function render(){
      const scoped=filtered(),finished=scoped.filter(r=>r.order),who=authorsNow();
      const stats=Object.fromEntries(who.map(([a])=>[a,score(finished,a,'main','three')]));
      const schedule=scoped.length;
      let time='';const d=new Date(updatedAt||'');
      if(Number.isFinite(d.getTime()))time=new Intl.DateTimeFormat('ja-JP',{timeZone:'Asia/Tokyo',hour:'2-digit',minute:'2-digit'}).format(d);
      const filters=select('venue','開催場',[['all','全国・全場'],...availableVenues.map(v=>[v,v])],state.venue)+select('group','予想区分',[['all','全区分'],...groups.filter(([g])=>g!=='all')],state.group);
      const extras=select('session','開催時間帯',[['all','全時間帯'],['morning','モーニング'],['day','デイ'],['night','ナイター'],['unknown','未判定']],state.session)+select('band','レース帯',[['all','1〜12R'],['1','1〜4R'],['2','5〜8R'],['3','9〜12R']],state.band)+select('decision','決着',[['all','全決着'],['first','①号艇1着'],['other','非①号艇1着']],state.decision);
      const summary=[['結果取得',null],['本線・1着',s=>[s.one,s.n]],['本線・2連単',s=>[s.two,s.n]],['本線・3連単',s=>[s.three,s.n]]].map(([label,metric])=>{
        const content=metric?who.map(([a,name])=>{const [n,total]=metric(stats[a]);return '<div class="lr-metric-author lr-'+a+'"><span>'+name.replace('記者','')+'</span><b>'+rate(n,total)+'</b><small>'+n+' / '+total+'R</small></div>';}).join(''):'<strong class="lr-total">'+finished.length+'<small> / '+schedule+'R</small></strong><small>残り '+Math.max(0,schedule-finished.length)+'R</small>';
        return '<div class="lr-metric"><h3>'+label+'</h3>'+content+'</div>';
      }).join('');
      const financeTop=who.map(([a,label])=>{const s=score(finished,a,'all');return '<div class="lr-total-finance lr-'+a+'"><h3>'+label+'<small>全区分・'+(state.bet==='three'?'3連単':'2連単')+'</small></h3>'+finance(s)+'</div>';}).join('');
      const high=finished.filter(r=>r.trifecta_payout_yen>=2000&&hasHit(r)).sort((a,b)=>b.trifecta_payout_yen-a.trifecta_payout_yen);
      const listed=scoped.filter(r=>state.list==='hits'?hasHit(r):state.list==='pending'?!r.order:true);
      const pages=pagination(listed.length);
      const categoryCards=groups.map(([g,label])=>'<section class="lr-category"><h3>'+label+'</h3>'+who.map(([a,name])=>{
        const s=score(finished,a,g);
        return '<div class="lr-category-author lr-'+a+'"><h4>'+name+'<small>対象 '+s.n+'R</small></h4><div class="lr-rates"><div><span>1着</span><b>'+rate(s.one,s.n)+'</b><small>'+s.one+'/'+s.n+'R</small></div><div><span>2連単</span><b>'+rate(s.two,s.n)+'</b><small>'+s.two+'/'+s.n+'R</small></div><div><span>3連単</span><b>'+rate(s.three,s.n)+'</b><small>'+s.three+'/'+s.n+'R</small></div></div>'+finance(s)+'</div>';
      }).join('')+'</section>').join('');
      const summaryFoot=who.some(([a])=>score(finished,a,'all').refundUnknown>0)?'返還未確認分は返還を含まない速報値です。':'';
      host.innerHTML='<div class="lr-dashboard" id="lr-top"><header class="lr-header"><div><h2>結果速報</h2><p>'+esc(date.replaceAll('-','/'))+'<span>'+(time?time+' 更新':'結果待ち')+'</span></p></div><button type="button" data-action="refresh" class="lr-refresh">更新</button></header><nav class="lr-tabs" aria-label="速報の記者">'+toggle('author','both','両記者',state.author==='both')+authors.map(([a,n])=>toggle('author',a,n,state.author===a)).join('')+'</nav><div class="lr-filters">'+filters+'<button type="button" data-action="extra" aria-expanded="'+state.extra+'">絞り込み '+(state.extra?'−':'＋')+'</button></div>'+(state.extra?'<div class="lr-filters lr-extra">'+extras+'<button type="button" data-action="reset">条件解除</button></div>':'')+'<div class="lr-summary">'+summary+'</div><div class="lr-finance-overview">'+financeTop+'</div><nav class="lr-jumps" aria-label="結果速報の項目"><a href="#lr-high">高配当的中</a><a href="#lr-list">レース一覧</a><a href="#lr-performance">区分別成績</a></nav><section id="lr-high" class="lr-section"><div class="lr-section-title"><h3>2,000円以上の的中速報</h3><span>'+high.length+'R</span></div>'+(high.length?compactTable(high):'<p class="lr-empty">この条件では、2,000円以上の的中はまだありません。</p>')+'</section><section id="lr-list" class="lr-section"><div class="lr-section-title"><h3>'+(state.list==='hits'?'的中一覧｜全国レース結果':'全国レース結果一覧')+'</h3><span>'+listed.length+'R</span></div><div class="lr-tabs lr-list-tabs" aria-label="レース一覧の表示">'+toggle('list','all','全レース',state.list==='all')+toggle('list','hits','的中一覧',state.list==='hits')+toggle('list','pending','結果待ち',state.list==='pending')+'</div>'+pages+(listed.length?raceCards(listed.slice(state.page*12,(state.page+1)*12)):'<p class="lr-empty">この条件に該当するレースはありません。</p>')+pages+'</section><section id="lr-performance" class="lr-section"><div class="lr-section-title"><h3>予想区分ごとの成績</h3></div><div class="lr-tabs lr-bet-tabs" aria-label="収支の券種">'+toggle('bet','three','3連単・各点100円',state.bet==='three')+toggle('bet','two','2連単・各点100円',state.bet==='two')+'</div><div class="lr-categories">'+categoryCards+'</div></section><details class="lr-howto"><summary>集計の見方</summary><p>結果取得済みのレースを集計。1着・2連単は掲載買い目の先頭1艇・2艇、3連単は3艇すべての一致です。2連単の買い目は区分内で重複を除きます。全区分は区分ごとの購入を合算し、区分をまたぐ同じ券は別々に各100円購入として計算します。予想なし・見送り・結果待ちは的中率の分母に含めません。</p><p>'+esc(summaryFoot)+'払戻未取得の的中Rは収支集計を保留します。</p></details><a class="lr-back-top" href="#lr-top" aria-label="結果速報の上へ">↑ 上へ</a></div>';
      host.querySelectorAll('[data-filter]').forEach(el=>el.addEventListener('change',()=>{state[el.dataset.filter]=el.value;state.page=0;render();}));
      host.querySelectorAll('[data-action]').forEach(el=>el.addEventListener('click',()=>{
        const action=el.dataset.action,value=el.dataset.value;
        if(action==='refresh'){onRefresh?.();return;}
        if(action==='extra')state.extra=!state.extra;
        else if(action==='reset'){Object.assign(state,{venue:'all',session:'all',band:'all',decision:'all',page:0});}
        else if(action==='page'){state.page+=Number(value);}
        else {state[action]=value;state.page=0;}
        render();
        if(action==='page')host.querySelector('#lr-list')?.scrollIntoView({block:'start'});
      }));
    }
    host.dataset.liveResultsDate=date;
    render();
  }
  window.OchaPLiveResults=Object.freeze({mount});
})();
