/* Old-paper 100-yen flat-bet and reporter scorecard; never formal BC. */
(() => {
  "use strict";
  const cache=new Map(),ui={daypart:"",venue:"",group:"all"};
  const groups=[["all","全区分"],["main","本線"],["reverse","逆張り"],["nav","舟券ナビ"]];
  const yen=n=>Number.isFinite(n)?n.toLocaleString("ja-JP")+"円":"—";
  const pct=(a,b)=>b?(100*a/b).toFixed(1)+"%":"—";
  const zonedTime=x=>typeof x==="string"&&/(?:Z|[+-]\d{2}:\d{2})$/.test(x)?Date.parse(x):NaN;
  const sha=x=>typeof x==="string"&&/^[a-f0-9]{64}$/.test(x);
  function make(tag,cls,txt) {
    const x=document.createElement(tag);
    if(cls)x.className=cls;
    if(txt!==undefined)x.textContent=txt;
    return x;
  }
  const isTicket=x=>typeof x==="string"&&/^[1-6]-[1-6]-[1-6]$/.test(x)&&new Set(x.split("-")).size===3;
  function snapshot(r,reporter) {
    const a=r.result,f=r.reporters?.[reporter];
    if(!a||!f||f.eligible!==true||!f.picks)return null;
    if(!Array.isArray(a.order)||a.order.length!==3||new Set(a.order).size!==3||
       !a.order.every(n=>Number.isInteger(n)&&n>=1&&n<=6)||
       !Number.isInteger(a.trifecta_payout_yen)||a.trifecta_payout_yen<100)return null;
    const times=[new Date(f.freeze_at_jst).getTime(),new Date(f.issue_at_jst).getTime(),new Date(r.close_at_jst).getTime()];
    if(!times.every(Number.isFinite)||times[0]>times[2]||times[1]>times[2])return null;
    const output={};
    for(const [key] of groups.slice(1)){
      const bets=f.picks[key];
      if(bets==null){output[key]=null;continue;}
      if(!Array.isArray(bets)||!bets.length||!bets.every(isTicket)||new Set(bets).size!==bets.length)return null;
      output[key]=bets;
    }
    return output.main?output:null;
  }
  function score(rows,reporter,group) {
    const out={n:0,win:0,exacta:0,three:0,stake:0,gross:0,refund:0,profit:0,roi:null,hits:[]};
    for(const r of rows){
      const sets=snapshot(r,reporter);if(!sets)continue;
      const categories=group==="all"?["main","reverse","nav"]:[group];
      const buckets=categories.map(k=>sets[k]).filter(x=>Array.isArray(x)&&x.length);
      if(!buckets.length)continue;
      const bets=buckets.flat(),distinct=[...new Set(bets)],actual=r.result.order.join("-");
      const refunded=new Set(r.result.refund_boats||[]);
      const hitN=bets.filter(b=>b===actual).length;
      const refundN=bets.filter(b=>b.split("-").some(n=>refunded.has(Number(n)))).length;
      out.n++;
      if(distinct.some(b=>b[0]===actual[0]))out.win++;
      if(distinct.some(b=>b.slice(0,3)===actual.slice(0,3)))out.exacta++;
      if(hitN)out.three++;
      out.stake+=100*bets.length;
      out.gross+=hitN*r.result.trifecta_payout_yen+refundN*100;
      out.refund+=refundN*100;
      out.hits.push({record:r,hit:!!hitN});
    }
    out.profit=out.gross-out.stake;
    out.roi=out.stake?100*out.gross/out.stake:null;
    return out;
  }
  function liveRecords(bulletin,forecasts,issue,date) {
    if(!bulletin||issue?.date!==date||!forecasts)return [];
    const late=new Set(issue.post_deadline_reference_races||[]);
    const issueTime=zonedTime(issue.publication_timing_checked_at);
    const ochaTime=zonedTime(issue.reporters?.ocha?.frozen_at_jst||issue.forecast_frozen_at_jst);
    const gemiTime=zonedTime(issue.reporters?.gemi?.recorded_freeze_at_jst);
    const observation=issue.gemi_first_publication_confirmed_at_jst||issue.gemi_publication_timing_checked_at;
    const gemiIssueTime=observation?zonedTime(observation):issueTime;
    const rows=[];
    for(const [key,result] of bulletin.results){
      if(!result)continue;
      const id="v"+key.replace(":","-r"),f=forecasts[id];
      // Both journalists must belong to this edition's published race.
      const deadline=zonedTime(f?.meta?.closing_at);
      if(!f||late.has(id)||!(deadline<bulletin.checkedAt)||
        new Date(deadline+9*60*60*1000).toISOString().slice(0,10)!==date||
        f.meta.race_no!==result.race_no||f.meta.venue!==result.venue)continue;
      const entry={};
      if(f.ocha&&sha(issue.forecast_sha256)&&Math.max(issueTime,ochaTime)<deadline)entry.ocha=f.ocha;
      if(f.gemi&&sha(issue.gemi_original_sha256)&&(!issue.gemi_publication_pending||observation)&&
        zonedTime(f.gemiTiming?.closing_at)===deadline&&
        Math.max(gemiIssueTime,gemiTime,zonedTime(f.gemiTiming?.freeze_at))<deadline)entry.gemi=f.gemi;
      if(!Object.keys(entry).length)continue;
      const session=result.session_verified===true?result.session:f.meta.session_verified===true?f.meta.session:null;
      const daypart=({morning:"モーニング",day:"デイ",night:"ナイター","モーニング":"モーニング","デイ":"デイ","ナイター":"ナイター"})[session]||"未判定";
      rows.push({...result,result,reporters:entry,daypart});
    }
    return rows.sort((a,b)=>a.venue_code-b.venue_code||a.race_no-b.race_no);
  }
  function liveScore(rows,reporter,group) {
    const key=group==="nav"?"navi":group;
    const forecasts=Object.fromEntries(rows.map(r=>["v"+r.venue_code+"-r"+r.race_no,r.reporters]));
    const s=window.OchaPHitReporters.score(rows,forecasts,reporter,key);
    const finance=s.financeN>0&&!s.missingPayout;
    return {...s,win:s.head,winN:s.headN,exacta:s.two,stake:s.totalStake,
      gross:finance?s.payout:null,profit:finance?s.profit:null,roi:finance?s.roi:null,
      hits:s.hits.map(record=>({record,hit:true}))};
  }
  function table(cols,rows,kind="") {
    const wrap=make("div","ochap-score-scroll"),t=make("table","ochap-score-table"+(kind?" ochap-score-"+kind:"")),
      th=make("thead"),tr=make("tr"),body=make("tbody");
    cols.forEach(c=>{
      const cell=make("th","",c);
      cell.scope="col";
      tr.append(cell);
    });th.append(tr);
    for(const row of rows){
      const tr=make("tr");
      row.forEach(value=>{
        const td=make("td"), fraction=typeof value==="string"&&value.match(/^(\d+(?:\.\d+)?%)（(\d+\/\d+R)）$/);
        if(fraction)td.append(make("span","",fraction[1]),make("small","ochap-score-denom",fraction[2]));
        else td.textContent=String(value);
        tr.append(td);
      });
      body.append(tr);
    }
    t.append(th,body);wrap.append(t);return wrap;
  }
  function card(title,number,sub){
    const e=make("div","ochap-score-stat");
    e.append(make("div","ochap-score-stat-name",title),make("strong","ochap-score-stat-value",number),make("small","",sub));
    return e;
  }
  function buildControls(host,rows,live){
    const controls=make("div","ochap-score-controls");
    const definitions=[
      ["daypart","時間帯",[["","全時間帯"],["モーニング","モーニング"],["デイ","デイ"],["ナイター","ナイター"]]],
      ["venue","開催場",[["","全国"],...[...new Set(rows.map(r=>r.venue))].sort().map(v=>[v,v])]],
      ["group","予想区分",groups]
    ];
    definitions.forEach(def=>{
      const select=make("select");
      select.setAttribute("aria-label",def[1]);
      def[2].forEach(opt=>{const x=make("option","",opt[1]);x.value=opt[0];select.append(x);});
      select.value=ui[def[0]];
      select.addEventListener("change",()=>{ui[def[0]]=select.value;render(host,rows,live);});
      controls.append(select);
    });
    return controls;
  }
  function render(host,all,live=false){
    const records=all.filter(r=>(!ui.daypart||r.daypart===ui.daypart)&&(!ui.venue||r.venue===ui.venue));
    const calculate=live?liveScore:score;
    const a=calculate(records,"ocha",ui.group),b=calculate(records,"gemi",ui.group);
    const area=make("section","ochap-score-body"),gname=groups.find(g=>g[0]===ui.group)?.[1]||"全区分";
    area.append(make("h4","",gname+"・記者別成績"));
    const tiles=make("div","ochap-score-grid");
    tiles.append(card("お茶P｜3連単",pct(a.three,a.n),a.n+"R対象"),
      card("お茶P｜平買い収支",a.n?yen(a.profit):"—",a.n+"R対象"),
      card("お茶P｜回収率",a.roi===null?"—":a.roi.toFixed(1)+"%",a.n+"R対象"),
      card("Gemi兄｜3連単",pct(b.three,b.n),b.n+"R対象"));
    if(live)tiles.append(card("Gemi兄｜平買い収支",yen(b.profit),b.n+"R対象"),
      card("Gemi兄｜回収率",b.roi===null?"—":b.roi.toFixed(1)+"%",b.n+"R対象"));
    area.append(tiles);
    // Restore the old newspaper's all-category comparison at a glance.
    // A separate line for each journalist keeps historical one-sided
    // reference scores visible without inventing a head-to-head match.
    const categories=make("section","ochap-score-categories");
    categories.append(make("h4","","予想区分別 成績比較"));
    const categoryRows=[];
    const fmtStat=(number,n)=>n?pct(number,n)+"（"+number+"/"+n+"R）":"—";
    for(const [key,title] of groups){
      for(const [author,label] of [["ocha","お茶P"],["gemi","Gemi兄"]]){
        const x=calculate(records,author,key);
        categoryRows.push([
          label,title,x.n?x.n+"R":"未集計",
          fmtStat(x.win,x.winN??x.n),fmtStat(x.exacta,x.n),fmtStat(x.three,x.n),
          x.n?yen(x.stake):"—",x.n?yen(x.gross):"—",
          x.n?yen(x.profit):"—",x.roi===null?"—":x.roi.toFixed(1)+"%"
        ]);
      }
    }
    categories.append(table(["記者","予想区分","対象",live?"◎1着":"1着","2連単","3連単","投資","払戻","収支","回収率"],categoryRows,"by-group"));
    categories.append(make("p","ochap-score-note",
      "各買い目100円。全区分は本線・逆張り・舟券ナビを合算し、区分間で重なる買い目もそれぞれ1枚として計算。対象のない記者は未集計。"));
    area.append(categories);
    for(const [name,x] of [["お茶P",a],["Gemi兄",b]]){
      if(!x.n){
      area.append(make("p","ochap-score-empty",name+"記者：集計対象のレースがありません。0%ではなく未集計です。"));
      }else{
        area.append(make("p","ochap-score-note",
          name+"：◎1着 "+x.win+"/"+(x.winN??x.n)+"（"+pct(x.win,x.winN??x.n)+"）／2連単 "+x.exacta+"/"+x.n+"（"+pct(x.exacta,x.n)+"）／3連単 "+x.three+"/"+x.n+"（"+pct(x.three,x.n)+"）"));
        area.append(make("p","ochap-score-note",
          "100円平買い：投資 "+yen(x.stake)+"／払戻 "+yen(x.gross)+
          "／収支 "+yen(x.profit)+"／回収率 "+(x.roi===null?"—":x.roi.toFixed(1)+"%")+
          (x.missingPayout?"（的中払戻の確認待ち "+x.missingPayout+"R）":
            "（返還 "+yen(x.refund)+"を払戻に含む"+(x.refundUnknown?"、返還未確認 "+x.refundUnknown+"R":"")+"）")));
      }
    }
    const paired=live?[]:records.filter(r=>snapshot(r,"ocha")&&snapshot(r,"gemi")&&
      r.reporters?.ocha?.shared_input_sha256&&
      r.reporters.ocha.shared_input_sha256===r.reporters.gemi.shared_input_sha256);
    if(paired.length){
      const p=score(paired,"ocha",ui.group),q=score(paired,"gemi",ui.group);
      area.append(make("h4","","両記者・同じレースの直接対決（"+paired.length+"R）"));
      area.append(table(["記者","◎1着","2連単","3連単","平買い収支","回収率"],
        [["お茶P",pct(p.win,p.n),pct(p.exacta,p.n),pct(p.three,p.n),yen(p.profit),p.roi===null?"—":p.roi.toFixed(1)+"%"],
         ["Gemi兄",pct(q.win,q.n),pct(q.exacta,q.n),pct(q.three,q.n),yen(q.profit),q.roi===null?"—":q.roi.toFixed(1)+"%"]]));
    } else if(!live) {
      area.append(make("p","ochap-score-note","両記者の直接対決は、同じ入力・締切前に記録した両方の予想が揃ったレースだけ掲載します。"));
    }
    // Show paying hits for either journalist, not only for OchaP.
    const hits=[...a.hits.map(x=>({reporter:"お茶P",...x})),
      ...b.hits.map(x=>({reporter:"Gemi兄",...x}))]
      .filter(x=>x.hit&&x.record.result.trifecta_payout_yen>=2000)
      .sort((x,y)=>y.record.result.trifecta_payout_yen-x.record.result.trifecta_payout_yen);
    if(hits.length){
      area.append(make("h4","","2,000円以上の的中（"+hits.length+"件）"));
      area.append(table(["記者","場・R","出目","3連単払戻"],hits.map(x=>[
        x.reporter,x.record.venue+" "+x.record.race_no+"R",x.record.result.order.join("-"),
        yen(x.record.result.trifecta_payout_yen)])));
    }
    area.append(make("h4","","全レース的中一覧"));
    const hitAt=(r,author,k)=>{
      const list=live?r.reporters?.[author]?.[k==="nav"?"navi":k]:snapshot(r,author)?.[k];
      if(!list?.length)return "—";
      return list.includes(r.result.order.join("-"))?"的中":"×";
    };
    area.append(table(["場・R","時間帯","結果","3連単払戻",
      "お茶P本線","お茶P逆張り","お茶Pナビ","Gemi兄本線","Gemi兄逆張り","Gemi兄ナビ"],
      records.map(r=>[r.venue+" "+r.race_no+"R",r.daypart,
        r.result.order.join("-"),yen(r.result.trifecta_payout_yen),
        hitAt(r,"ocha","main"),hitAt(r,"ocha","reverse"),hitAt(r,"ocha","nav"),
        hitAt(r,"gemi","main"),hitAt(r,"gemi","reverse"),hitAt(r,"gemi","nav")]),"by-race"));
    const old=host.querySelector(".ochap-score-body");
    if(old)old.replaceWith(area);else host.append(area);
  }
  function renderLive(host,date,rows,checkedAt) {
    if(!rows.some(r=>r.venue===ui.venue))ui.venue="";
    const update=new Intl.DateTimeFormat("ja-JP",{timeZone:"Asia/Tokyo",hour:"2-digit",minute:"2-digit"}).format(new Date(checkedAt));
    host.replaceChildren(make("h3","ochap-score-title","結果速報｜記者別参考成績"),
      make("p","ochap-score-note",date.replaceAll("-","/")+" "+update+" 更新・照合 "+rows.length+"R。締切前の掲載予想を結果に照合した速報値です。正式バックチェック・正式比較には加算しません。"));
    if(!rows.length){
      host.append(make("p","ochap-score-empty","締切前の掲載予想に照合できた結果を待っています。"));
      return;
    }
    host.append(buildControls(host,rows,true));
    render(host,rows,true);
  }
  async function mount(host,date,{deferEmpty=false}={}) {
    const id=Symbol("scorecard");host.__scorecardRequest=id;
    host.replaceChildren(make("p","ochap-score-note","成績を読み込み中…"));
    if(!cache.has(date))cache.set(date,fetch("./data/public-scorecards/"+date+".json",{cache:"no-store"})
      .then(r=>r.ok?r.json():null).catch(()=>null));
    const data=await cache.get(date);
    if(host.__scorecardRequest!==id)return false;
    host.replaceChildren();
    if(!data||data.schema_version!=="ochap.public.reference_scorecard.v1"||
       data.date!==date||!Array.isArray(data.records)||!data.records.length){
      if(!deferEmpty)host.append(make("p","ochap-score-empty","この日の予想成績はまだ集計されていません。"));
      return false;
    }
    const note=date==="2026-11-01"
      ? "Gemi兄の11/1参考予想（9:36作成）を集計。締切後の8Rと結果未取得の2Rは除外。7時までの正式朝刊予想ではありません。"
      : "旧版と同じ100円平買いの参考集計。区分間の重複券も区分ごとに購入扱い。正式バックチェックとは別です。";
    host.append(make("h3","ochap-score-title","全国結果速報｜全体ダイジェスト"),
      make("p","ochap-score-note",note),
      buildControls(host,data.records));
    render(host,data.records);
    if(date==="2026-10-30"){
      const link=make("a","ochap-score-original","旧版の結果速報・収支を見る");
      link.href="https://ochap-newspaper-20261025.saktaksaktak.chatgpt.site/results?date=2026-10-30";
      link.target="_blank";link.rel="noopener noreferrer";host.append(link);
    }
    return true;
  }
  window.OchaPScorecard=Object.freeze({mount,score,liveRecords,liveScore,renderLive});
})();
