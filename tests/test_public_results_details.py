"""Source snapshot retention: no extra retrieval and no official promotion."""
import copy,json,sys,tempfile,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from test_public_results import result,feed,DAY,URL,AT
from publish_public_results import parse_api_result,unified_v1_results
from reconcile_public_results import merge,checked
from results_flash import acquire,same_results,public_matches

LATER='2026-11-01T20:10:00+09:00'

def detail():
    r=result()
    r.update(wind_speed=3,wind_direction_number=8,wind_direction_number_source='8',
             wave_height=2,weather_number=1,weather_number_source='晴',
             air_temperature=18.5,water_temperature=21.0,remarks=None,refunds=[])
    for n,v in r['racers'].items():
        v.update(course_number=int(n),start_timing=0.12,start_timing_source='.12',
                 place_number_source=str(v['place_number']))
    return r

def pack(raw,at=AT):
    return dict(schema_version='1.0',date=DAY,checked_at_jst=at,
                not_formal_bc=True,races=unified_v1_results(feed(raw),DAY,URL,at))

class ResultDetailsTests(unittest.TestCase):
    def test_full_source_object_is_preserved_not_preview(self):
        raw=detail()
        p=feed(raw)
        p['programs']['stadiums']['14']['races']['1']['preview']={'wind_speed':99}
        row=unified_v1_results(p,DAY,URL,AT)[0]
        self.assertEqual(row['api_result'],raw)
        self.assertIsNot(row['api_result'],raw)
        self.assertEqual(row['api_result']['racers']['6']['number'],4006)
        self.assertEqual(row['api_result']['wind_speed'],3)
        self.assertFalse(row['official_confirmed'])
        self.assertEqual(row['result_status'],'API_REPORTED')
    def test_missing_details_stay_missing(self):
        row=parse_api_result(result(),DAY,14,1,URL,AT)
        self.assertNotIn('wind_speed',row['api_result'])
        self.assertNotIn('start_timing',row['api_result']['racers']['1'])
    def test_legacy_row_enrichment_and_no_timestamp_commit(self):
        old=pack(result())
        del old['races'][0]['api_result']
        incoming=pack(detail(),LATER)
        out=merge(old,incoming)
        self.assertEqual(out,incoming)
        self.assertFalse(same_results(old,out))
        repeat=pack(detail(),'2026-11-01T20:20:00+09:00')
        self.assertEqual(merge(out,repeat),out)
        legacy=copy.deepcopy(repeat)
        del legacy['races'][0]['api_result']
        self.assertEqual(merge(out,legacy),out)
    def test_detail_only_correction_and_stale_protection(self):
        a=pack(detail())
        corrected=detail()
        corrected['wind_speed']=5
        b=pack(corrected,LATER)
        self.assertEqual(merge(a,b),b)
        self.assertEqual(merge(b,a),b)
        self.assertFalse(same_results(a,b))
        self.assertFalse(public_matches(b,lambda _:a))
        self.assertTrue(public_matches(b,lambda _:b))
    def test_snapshot_identity_and_payout_validation(self):
        for key,value in [('date','2026-10-31'),('stadium_number',13),('race_number',2)]:
            bad=pack(detail())
            bad['races'][0]['api_result'][key]=value
            with self.assertRaisesRegex(ValueError,'snapshot identity'):
                checked(bad)
        bad=pack(detail())
        bad['races'][0]['api_result']['payouts']['trifecta'][0]['amount']=100
        with self.assertRaisesRegex(ValueError,'snapshot payout'):
            checked(bad)
    def test_legacy_official_not_downgraded(self):
        old=pack(detail())
        row=old['races'][0]
        del row['api_result']
        row.update(official_confirmed=True,official_result_source_ref='https://www.boatrace.jp/owpc/pc/race/raceresult?hd=20261101&jcd=14&rno=1')
        self.assertEqual(merge(old,pack(detail(),LATER)),old)
    def test_one_fetch_and_enrichment_only_change(self):
        with tempfile.TemporaryDirectory() as d:
            path=Path(d)/'result.json'
            old=pack(result())
            del old['races'][0]['api_result']
            path.write_text(json.dumps(old))
            calls=[]
            def get(url):
                calls.append(url)
                return feed(detail())
            prior,new,changed=acquire(DAY,path,fetcher=get)
            self.assertEqual(calls,[URL])
            self.assertTrue(changed)
            self.assertEqual(new['races'][0]['api_result'],detail())
            self.assertEqual(json.loads(path.read_text()),old)

if __name__=='__main__': unittest.main()
