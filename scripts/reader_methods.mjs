// Presentation only. Scope and period are matched before comparing any rates.
const escape = value => String(value).replace(/[&<>"']/g, c => ({
  '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
}[c]));
const pct = v => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 100 ? v : null;
const count = v => Number.isSafeInteger(v) && v >= 0 ? v : null;
const formatCount = v => count(v) === null ? '未取得' : v.toLocaleString('en-US');
const rateKeys = ['sashi','makuri','makurisashi'];
const winnerLabels = ['差し','まくり','まくり差し'];
const loserLabels = ['差され','まくられ','まくり差され'];
const baselineSchema = 'ochap.course-national-benchmark.v1';

export function courseScope(race) {
  const grade=String(race.grade_number_source ?? race.grade ?? '').toUpperCase()
    .replace(/[Ⅰⅰ]/g,'1').replace(/[Ⅱⅱ]/g,'2').replace(/[Ⅲⅲ]/g,'3').trim();
  if (/^(SG|G1(?![0-9])[AB]?)$/.test(grade)) return 'sg_g1';
  if (/^(PG1[AB]?|G[23][AB]?|IPPAN|一般戦?)$/.test(grade)) return 'all';
  return race.is_sg_g1_venue === true ? 'sg_g1' : 'all';
}
const exactGrades = x => Array.isArray(x) && x.length===2 && x.includes('SG') && x.includes('G1');
function confirmedGrade(x) {
  return x?.status === 'verified' && x.scope === 'national' &&
    x.race_class === 'sg_g1' && exactGrades(x.grades) && [6,12].includes(x.period_months);
}
export function gradeCourse(b, months, field) {
  const record = b.course_stats_by_scope?.sg_g1_course;
  const series = record?.periods?.[months] ?? record;
  const value = series?.[field];
  if (!confirmedGrade(series) || series.period_months !== months ||
      !value || value.course !== Number(b.boat)) return null;
  return value;
}
export function displayMonths(race) {
  if (courseScope(race) === 'all') return 6;
  const fields = ['expected_course_stats','expected_method_stats'];
  const available = months => race.boats.flatMap(b => fields.map(f => gradeCourse(b, months, f))).filter(Boolean).length;
  // Pick one whole-table window. Never mix periods per cell or per racer.
  return available(12) > available(6) ? 12 : 6;
}
const kind = s => s ? '<small class="method-kind">'+(s==='まくり差され'?'まくり<wbr>差され':escape(s))+'</small>' : '';
const missing = '<span class="method-muted">未取得</span>';
const dash = '<span class="method-muted" aria-label="対象外">—</span>';
function metric(course, record, index) {
  const m=record || {};
  if (index===0) return course===1 ? ['逃げ',m.win_rates_pct?.nige] :
    course===2 ? ['逃し',m.nigashi_rate_pct] : null;
  if(course===1) return [loserLabels[index-1],m.loss_rates_pct?.[['sasare','makurare','makuraresashi'][index-1]]];
  return ['',m.win_rates_pct?.[rateKeys[index-1]]];
}
function rankAt(records, index, val) {
  if (val === null || index === 0) return null;
  const group = records.filter(x => x.course > 1 && count(x.method?.sample_count) > 0)
    .map(x => pct(metric(x.course,x.method,index)?.[1])).filter(x => x !== null);
  const rank = 1 + group.filter(x=>x>val).length;
  return rank<=2 ? {rank, tied:group.filter(x=>x===val).length>1} : null;
}
function rateCell(pair, rank=null, displayOverride=null) {
  if (!pair) return '<td>'+dash+'</td>';
  const label = rank ? '<small class="method-rank">'+(rank.tied?'同率':'')+rank.rank+'位</small>' : kind(pair[0]);
  const value = pct(pair[1]);
  return '<td'+(rank?' class="method-'+rank.rank+'"':'')+'>'+label+
    (displayOverride ? '<span class="method-muted">'+escape(displayOverride)+'</span>' : value===null?missing:escape(value)+'%')+'</td>';
}
function readBaseline(input, issueDate, scope, months) {
  const group = input?.groups?.[scope]?.[months];
  // Dates, source, scope and population must be verified upstream before publication.
  if(input?.schema!==baselineSchema || input.as_of_date!==issueDate ||
     group?.status!=='verified' || group.source!=='official_results' ||
     group.scope!=='national' || group.race_class!==scope || group.period_months!==months ||
     (scope==='sg_g1'&&!exactGrades(group.grades)) ||
     group.venue_count!==24 || !/^\d{4}-\d{2}-\d{2}$/.test(group.period_start??'') ||
     !/^\d{4}-\d{2}-\d{2}$/.test(group.period_end??'') || group.period_start>group.period_end ||
     group.period_end>=issueDate || !Array.isArray(group.courses) ||
     group.courses.length!==6 || group.courses.some((row,i)=>row?.course!==i+1 || !(count(row.sample_count)>0))) return null;
  return group;
}
export function renderReaderMethods(race, issueDate, baseline, badge, months=displayMonths(race)) {
  const scope = courseScope(race);
  const rows = race.boats.map(b => ({
    course:Number(b.boat), b,
    method: scope==='sg_g1' ? gradeCourse(b,months,'expected_method_stats') : b.method
  }));
  const grouping = readBaseline(baseline,issueDate,scope,months);
  const title = scope==='sg_g1'?'全国SG・G1のみ':'全国・全レース区分';
  const rowHtml = rows.map(({course,b,method})=> {
    const cells = Array.from({length:4},(_,i)=>{
      const item=metric(course,method,i);
      return rateCell(item,course>1&&count(method?.sample_count)>0?rankAt(rows,i,pct(item?.[1])):null);
    }).join('');
    return '<tr><th scope="row">'+badge(b.boat)+'<span class="method-boat">'+course+'C</span></th><td>'+
      formatCount(method?.sample_count)+'</td>'+cells+'</tr>';
  }).join('');
  const foot = grouping?.courses.map((m,i)=>{
    const course=i+1;
    return '<tr data-ochap-baseline-course="'+course+'"'+(i?' hidden':'')+'><th scope="row">全国<wbr>平均<small class="method-kind">'+course+'C</small></th>'+
      '<td>'+kind('集計走')+'<span>'+formatCount(m.sample_count)+'</span></td>'+
      Array.from({length:4},(_,j)=>{
        const item=metric(course,m,j);
        if(item && course>1 && j) item[0]=winnerLabels[j-1];
        return rateCell(item,null,course===2&&j===0&&grouping.nigashi_definition_verified!==true?'照合中':null);
      }).join('')+'</tr>';
  }).join('') ?? '<tr><th scope="row">全国<wbr>平均</th><td class="method-muted" colspan="5">未取得</td></tr>';
  const options = Array.from({length:6},(_,i)=>'<option value="'+(i+1)+'">'+(i+1)+'コース</option>').join('');
  return '<div class="ochap-method-section"><table class="ochap-method-table"><colgroup>'+
    [12,17,16,16,17,22].map(n=>'<col style="width:'+n+'%">').join('')+
    '</colgroup><thead><tr>'+['艇/C','母数','逃げ／逃し','差し','まくり','まくり差し'].map(h=>'<th scope="col">'+h+'</th>').join('')+
    '</tr></thead><tbody>'+rowHtml+'</tbody><tfoot>'+foot+'</tfoot></table>'+
    (grouping?'<p class="ochap-method-controls"><label>全国平均の比較コース <select data-ochap-baseline-picker>'+options+'</select></label></p>':'')+
    '<p class="small">'+title+'・直近'+(months===12?'1年':'6か月')+'</p></div>';
}
