"""Offline public速報 tests. There must be NO official-page retrieval in this stage."""
import sys,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from publish_public_results import parse_api_result, unified_v1_results

DAY='2026-11-01'
URL='https://boatraceopenapi.github.io/api/v1/2026/20261101.json'
AT='2026-11-01T20:00:00+09:00'
def result():
    rankings={1:1,2:5,3:3,4:6,5:2,6:4}
    return {
      'date':DAY,'stadium_number':14,'race_number':1,
      'racers':{str(b):{'entry_number':b,'number':4000+b,'place_number':rankings[b]} for b in range(1,7)},
      'payouts':{'trifecta':[{'combination':'1-5-3','amount':4260}]},
      'technique_number_source':'逃げ'
    }
def feed(r):
    return {'programs':{'stadiums':{'14':{'races':{'1':{'result':r}}}}}}

class ApiResultsTests(unittest.TestCase):
    def test_api_results_not_official(self):
        rows=unified_v1_results(feed(result()),DAY,URL,AT)
        self.assertEqual(len(rows),1)
        x=rows[0]
        self.assertEqual(x['order'],[1,5,3])
        self.assertEqual(x['method'],'逃げ')
        self.assertEqual(x['trifecta_payout_yen'],4260)
        self.assertIs(x['official_confirmed'],False)
        self.assertEqual(x['result_status'],'API_REPORTED')
        self.assertEqual(x['result_source_ref'],URL)
        self.assertNotIn('official_result_source_ref',x)
    def test_result_not_yet_reported(self):
        self.assertEqual(unified_v1_results(feed(None),DAY,URL,AT),[])
    def test_invalid_date_rejected(self):
        r=result();r['date']='2026-10-31'
        self.assertIsNone(parse_api_result(r,DAY,14,1,URL,AT))
    def test_missing_racer_rejected(self):
        r=result();r['racers'].pop('6')
        self.assertIsNone(parse_api_result(r,DAY,14,1,URL,AT))
    def test_invalid_3rentan_rejected(self):
        r=result();r['payouts']['trifecta'][0]['combination']='3-5-1'
        self.assertIsNone(parse_api_result(r,DAY,14,1,URL,AT))
    def test_missing_racer_registration_rejected(self):
        r=result();r['racers']['2'].pop('number')
        self.assertIsNone(parse_api_result(r,DAY,14,1,URL,AT))
    def test_invalid_payout_rejected(self):
        r=result();r['payouts']['trifecta'][0]['amount']=0
        self.assertIsNone(parse_api_result(r,DAY,14,1,URL,AT))
    def test_invalid_stadium_schema_rejected(self):
        with self.assertRaises(ValueError):
            unified_v1_results({'programs':{'stadiums':[]}},DAY,URL,AT)
    def test_no_official_fetch_path(self):
        source=(Path(__file__).resolve().parents[1]/'scripts/publish_public_results.py').read_text()
        self.assertNotIn('www.boatrace.jp',source)
        self.assertNotIn('official_verify',source)
if __name__=='__main__':unittest.main()
