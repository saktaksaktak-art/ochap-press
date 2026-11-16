import {test} from 'node:test';
import assert from 'node:assert/strict';
import {courseScope,displayMonths,gradeCourse,renderReaderMethods} from '../scripts/reader_methods.mjs';

const day='2026-11-17';
const badge=n=>'<b>'+n+'</b>';
const boats=Array.from({length:6},(_,i)=>({
  boat:i+1,method:{sample_count:21+i,win_rates_pct:{nige:52,sashi:[null,17,4,4,0,0][i],makuri:2,makurisashi:0},
    loss_rates_pct:{sasare:9,makurare:12,makuraresashi:10},nigashi_rate_pct:53}
}));
const verified=(n,months=6)=>({status:'verified',scope:'national',race_class:'sg_g1',grades:['SG','G1'],period_months:months,
  expected_course_stats:{course:n,starts:12,first_rate_pct:10},
  expected_method_stats:{course:n,sample_count:12,win_rates_pct:{nige:65,sashi:n,makuri:0,makurisashi:0}}});
const baseline = (scope, months=6) => ({
  schema:'ochap.course-national-benchmark.v1',as_of_date:day,
  groups:{[scope]:{[months]:{status:'verified',source:'official_results',scope:'national',race_class:scope,
    period_months:months,period_start:months===6?'2026-05-17':'2025-11-17',period_end:'2026-11-16',
    venue_count:24,grades:['SG','G1'],courses:boats.map((b,i)=>({...b.method,course:i+1,sample_count:27412+i}))}}}
});
test('six cells, exact numbers, separate losing measures, ties and missing baseline',()=>{
  const s=renderReaderMethods({boats},day,null,badge);
  assert.match(s,/逃げ／逃し/);
  assert.match(s,/差され<\/small>9%/);
  assert.match(s,/逃し<\/small>53%/);
  assert.match(s,/method-1"><small class="method-rank">1位<\/small>17%/);
  assert.equal((s.match(/同率2位/g)||[]).length,2);
  assert.match(s,/<tfoot>.*全国.*未取得.*<\/tfoot>/);
  assert.doesNotMatch(s,/data-ochap-baseline-picker/);
});
test('national comparisons use the exact matching group and keep unverified 2C escape unshown',()=>{
  const s=renderReaderMethods({boats},day,baseline('all'),badge);
  assert.equal((s.match(/data-ochap-baseline-course=/g)||[]).length,6);
  assert.match(s,/27,412/);
  assert.match(s,/照合中/);
  assert.doesNotMatch(renderReaderMethods({boats},'2026-11-18',baseline('all'),badge),/data-ochap-baseline-picker/);
});
test('SG/G1 rejects combined data with PG1, full fields without period evidence and all-grade values',()=>{
  const bare={...boats[0],course_stats_by_scope:{sg_g1_course:{expected_course_stats:{course:1,starts:66}}}};
  const wrong={...boats[1],course_stats_by_scope:{sg_g1_course:{...verified(2),grades:['SG','PG1','G1']}}};
  const genuine={...boats[2],course_stats_by_scope:{sg_g1_course:verified(3)}};
  const fixture={grade:'GⅠ',boats:[bare,wrong,genuine,...boats.slice(3)]};
  assert.equal(courseScope(fixture),'sg_g1');
  assert.equal(courseScope({grade:'PG1',is_sg_g1_venue:true}),'all');
  assert.equal(gradeCourse(bare,6,'expected_course_stats'),null);
  assert.equal(gradeCourse(wrong,6,'expected_course_stats'),null);
  assert.equal(gradeCourse(genuine,6,'expected_course_stats').starts,12);
  const s=renderReaderMethods(fixture,day,baseline('all'),badge);
  assert.match(s,/全国SG・G1のみ・直近6か月/);
  assert.doesNotMatch(s,/52%|53%|27,412|data-ochap-baseline-picker/);
  assert.match(s,/method-1"><small class="method-rank">1位<\/small>3%/);
});
test('only matching SG/G1 uses the official 2C reference, without treating it as a player rate',()=>{
  const data=baseline('sg_g1');
  const group=data.groups.sg_g1[6];
  const ref={definition:'official_c1_c2_numeric_finish',eligible_races:1376,escape_wins:860,rate_pct:62.5};
  group.nigashi_reference=ref;
  const grade={grade:'SG',boats};
  const s=renderReaderMethods(grade,day,data,badge);
  assert.match(s,/<tbody>.*全国参考<\/small>62\.5%.*<\/tbody>/);
  assert.match(s,/<tfoot>.*逃し（参考）<\/small>62\.5%.*<\/tfoot>/);
  assert.match(s,/選手別の成績ではありません。.*1,376レース/);
  assert.doesNotMatch(s,/照合中|53%/);
  const withOwn={...grade,boats:boats.map(b=>{
    if(b.boat!==2)return b;
    const stats=verified(2);
    stats.expected_method_stats.nigashi_rate_pct=32.5;
    return {...b,course_stats_by_scope:{sg_g1_course:stats}};
  })};
  assert.match(renderReaderMethods(withOwn,day,data,badge),/<tbody>.*逃し<\/small>32\.5%.*<\/tbody>/);
  const other=baseline('all');
  other.groups.all[6].nigashi_reference=ref;
  assert.doesNotMatch(renderReaderMethods({boats},day,other,badge),/全国参考|62\.5%/);
  assert.doesNotMatch(renderReaderMethods(grade,'2026-11-18',data,badge),/全国参考|62\.5%/);
  const year=baseline('sg_g1',12);
  year.groups.sg_g1[12].nigashi_reference=ref;
  assert.doesNotMatch(renderReaderMethods(grade,day,year,badge),/全国参考|62\.5%/);
  group.nigashi_reference={...ref,rate_pct:99};
  assert.doesNotMatch(renderReaderMethods(grade,day,data,badge),/全国参考|99%/);
});
test('twelve-month SG/G1 window must apply to every cell and to the baseline',()=>{
  const b=boats.map(x=>({...x,course_stats_by_scope:{sg_g1_course:verified(x.boat,12)}}));
  b[0].course_stats_by_scope.sg_g1_course=verified(1,6);
  const race={grade_number_source:'G1b',boats:b};
  assert.equal(displayMonths(race),12);
  assert.doesNotMatch(renderReaderMethods(race,day,baseline('sg_g1',6),badge),/data-ochap-baseline-picker/);
  const s=renderReaderMethods(race,day,baseline('sg_g1',12),badge);
  assert.match(s,/全国SG・G1のみ・直近1年/);
  assert.match(s,/27,412/);
  assert.doesNotMatch(s.split('</tbody>')[0],/65%/);
});
