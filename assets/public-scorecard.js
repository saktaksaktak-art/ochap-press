/* Old-paper 100-yen flat-bet and reporter scorecard; never formal BC. */
(() => {
  "use strict";
  const cache=new Map(),ui={daypart:"",venue:"",group:"all"};
  const groups=[["all","全区分"],["main","本線"],["reverse","逆張り"],["nav","舟券ナビ"]];
  const yen=n=>Number.isFinite(n)?n.toLocaleString("ja-JP")+"円":"—";
  const pct=(a,b)=>b?(100*a/b).toFixed(1)+"%":"—";
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
  function table(cols,rows) {
    const wrap=make("div","ochap-score-scroll"),t=make("table","ochap-score-table"),
      th=make("thead"),tr=make("tr"),body=make("tbody");
    cols.forEach(c=>tr.append(make("th","",c)));th.append(tr);
    for(const row of rows){
      const tr=make("tr");
      row.forEach(value=>tr.append(make("td","",String(value))));
      body.append(tr);
    }
    t.append(th,body);wrap.append(t);return wrap;
  }
  function card(title,number,sub){
    const e=make("div","ochap-score-stat");
    e.append(make("div","ochap-score-stat-name",title),make("strong","ochap-score-stat-value",number),make("small","",sub));
    return e;
  }
  function buildControls(host,rows){
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
      select.addEventListener("change",()=>{ui[def[0]]=select.value;render(host,rows);});
      controls.append(select);
    });
    return controls;
  }
  function render(host,all){
    const records=all.filter(r=>(!ui.daypart||r.daypart===ui.daypart)&&(!ui.venue||r.venue===ui.venue));
    const a=score(records,"ocha",ui.group),b=score(records,"gemi",ui.group);
    const area=make("section","ochap-score-body"),gname=groups.find(g=>g[0]===ui.group)?.[1]||"全区分";
    area.append(make("h4","",gname+"・記者別成績"));
    const tiles=make("div","ochap-score-grid");
    tiles.append(card("お茶P｜3連単",pct(a.three,a.n),a.n+"R対象"),
      card("お茶P｜平買い収支",a.n?yen(a.profit):"—",a.n+"R対象"),
      card("お茶P｜回収率",a.roi===null?"—":a.roi.toFixed(1)+"%",a.n+"R対象"),
      card("Gemi兄｜3連単",pct(b.three,b.n),b.n+"R対象"));
    area.append(tiles);
    for(const [name,x] of [["お茶P",a],["Gemi兄",b]]){
      if(!x.n){
        area.append(make("p","ochap-score-empty",name+"記者：集計可能な予想原本がありません。0%ではなく未集計です。"));
      }else{
        area.append(make("p","ochap-score-note",
          name+"：◎1着 "+x.win+"/"+x.n+"（"+pct(x.win,x.n)+"）／2連単 "+x.exacta+"/"+x.n+"（"+pct(x.exacta,x.n)+"）／3連単 "+x.three+"/"+x.n+"（"+pct(x.three,x.n)+"）"));
        area.append(make("p","ochap-score-note",
          "100円平買い：投資 "+yen(x.stake)+"／払戻 "+yen(x.gross)+
          "／収支 "+yen(x.profit)+"／回収率 "+(x.roi===null?"—":x.roi.toFixed(1)+"%")+
          "（返還 "+yen(x.refund)+"を払戻に含む）"));
      }
    }
    const paired=records.filter(r=>snapshot(r,"ocha")&&snapshot(r,"gemi")&&
      r.reporters?.ocha?.shared_input_sha256&&
      r.reporters.ocha.shared_input_sha256===r.reporters.gemi.shared_input_sha256);
    if(paired.length){
      const p=score(paired,"ocha",ui.group),q=score(paired,"gemi",ui.group);
      area.append(make("h4","","両記者・同じレースの直接対決（"+paired.length+"R）"));
      area.append(table(["記者","◎1着","2連単","3連単","平買い収支","回収率"],
        [["お茶P",pct(p.win,p.n),pct(p.exacta,p.n),pct(p.three,p.n),yen(p.profit),p.roi===null?"—":p.roi.toFixed(1)+"%"],
         ["Gemi兄",pct(q.win,q.n),pct(q.exacta,q.n),pct(q.three,q.n),yen(q.profit),q.roi===null?"—":q.roi.toFixed(1)+"%"]]));
    } else {
      area.append(make("p","ochap-score-note","両記者の直接対決は、同じ入力・締切前に記録した両方の予想が揃ったレースだけ掲載します。"));
    }
    const hits=a.hits.filter(x=>x.hit&&x.record.result.trifecta_payout_yen>=2000)
      .sort((x,y)=>y.record.result.trifecta_payout_yen-x.record.result.trifecta_payout_yen);
    if(hits.length){
      area.append(make("h4","","2,000円以上の的中（"+hits.length+"R）"));
      area.append(table(["場・R","出目","3連単払戻"],hits.map(x=>[
        x.record.venue+" "+x.record.race_no+"R",x.record.result.order.join("-"),yen(x.record.result.trifecta_payout_yen)])));
    }
    area.append(make("h4","","全レース的中一覧"));
    const hitAt=(r,author,k)=>{
      const list=snapshot(r,author)?.[k];
      if(!list)return "—";
      return list.includes(r.result.order.join("-"))?"的中":"×";
    };
    area.append(table(["場・R","時間帯","結果","3連単払戻","お茶P本線","逆張り","ナビ","Gemi兄本線"],
      records.map(r=>[r.venue+" "+r.race_no+"R",r.daypart,
        r.result.order.join("-"),yen(r.result.trifecta_payout_yen),hitAt(r,"ocha","main"),
        hitAt(r,"ocha","reverse"),hitAt(r,"ocha","nav"),hitAt(r,"gemi","main")])));
    const old=host.querySelector(".ochap-score-body");
    if(old)old.replaceWith(area);else host.append(area);
  }
  async function mount(host,date) {
    const id=Symbol("scorecard");host.__scorecardRequest=id;
    host.replaceChildren(make("p","ochap-score-note","成績を読み込み中…"));
    if(!cache.has(date))cache.set(date,fetch("./data/public-scorecards/"+date+".json",{cache:"no-store"})
      .then(r=>r.ok?r.json():null).catch(()=>null));
    const data=await cache.get(date);
    if(host.__scorecardRequest!==id)return;
    host.replaceChildren();
    if(!data||data.schema_version!=="ochap.public.reference_scorecard.v1"||
       data.date!==date||!Array.isArray(data.records)||!data.records.length){
      host.append(make("p","ochap-score-empty","この日の予想成績はまだ集計されていません。"));
      return;
    }
    host.append(make("h3","ochap-score-title","全国結果速報｜全体ダイジェスト"),
      make("p","ochap-score-note","旧版と同じ100円平買いの参考集計。区分間の重複券も区分ごとに購入扱い。正式バックチェックとは別です。"),
      buildControls(host,data.records));
    render(host,data.records);
    if(date==="2026-10-30"){
      const link=make("a","ochap-score-original","旧版の結果速報・収支を見る");
      link.href="https://ochap-newspaper-20261025.saktaksaktak.chatgpt.site/results?date=2026-10-30";
      link.target="_blank";link.rel="noopener noreferrer";host.append(link);
    }
  }
  window.OchaPScorecard=Object.freeze({mount,score});
})();