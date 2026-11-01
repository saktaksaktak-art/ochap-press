"""Offline strict-parser tests. Does not assert live GitHub Actions success."""
import sys
from pathlib import Path
import unittest
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from publish_public_results import candidate, official_verify

FAKE_HTML=b'''<html><body>
<table><thead><tr><th>\xe7\x9d\x80</th><th>\xe6\x9e\xa0</th><th>\xe3\x83\x9c\xe3\x83\xbc\xe3\x83\x88\xe3\x83\xac\xe3\x83\xbc\xe3\x82\xb5\xe3\x83\xbc</th></tr></thead>
<tbody><tr><td>\xef\xbc\x91</td><td>1</td><td>4156</td></tr><tr><td>\xef\xbc\x92</td><td>5</td><td>5409</td></tr><tr><td>\xef\xbc\x93</td><td>3</td><td>4229</td></tr></tbody></table>
<table><thead><tr><th>\xe5\x8b\x9d\xe5\xbc\x8f</th><th>\xe7\xb5\x84\xe7\x95\xaa</th><th>\xe6\x89\x95\xe6\x88\xbb\xe9\x87\x91</th></tr></thead>
<tr><td>3\xe9\x80\xa3\xe5\x8d\x98</td><td><div>
<span class="numberSet1_number is-type1">1</span><span class="numberSet1_number is-type5">5</span><span class="numberSet1_number is-type3">3</span></div></td><td><span class="is-payout1">\xc2\xa54,260</span></td></tr></table>
<table><thead><tr><th>\xe6\xb1\xba\xe3\x81\xbe\xe3\x82\x8a\xe6\x89\x8b</th></tr></thead><tbody><tr><td>\xe9\x80\x83\xe3\x81\x92</td></tr></tbody></table>
</body></html>'''
URL='https://www.boatrace.jp/owpc/pc/race/raceresult?hd=20261101&jcd=14&rno=1'
ITEM=dict(jcd=14,race_no=1,order=[1,5,3],payout=4260)

class OfficialResultsGateTests(unittest.TestCase):
    def test_official_matching(self):
        row=official_verify(FAKE_HTML,ITEM,URL)
        self.assertIsNotNone(row)
        self.assertEqual(row['order'],[1,5,3])
        self.assertEqual(row['method'],'逃げ')
        self.assertEqual(row['trifecta_payout_yen'],4260)
        self.assertTrue(row['official_confirmed'])
        self.assertEqual(len(row['official_html_sha256']),64)
    def test_payout_mismatch_fail_closed(self):
        self.assertIsNone(official_verify(FAKE_HTML,{**ITEM,'payout':9999},URL))
    def test_order_mismatch_fail_closed(self):
        self.assertIsNone(official_verify(FAKE_HTML,{**ITEM,'order':[1,3,5]},URL))
    def test_missing_method_fail_closed(self):
        self.assertIsNone(official_verify(FAKE_HTML.replace('逃げ'.encode(),b''),ITEM,URL))
    def test_candidate_mapping(self):
        row={'date':'2026-11-01','stadium_number':14,'number':1,
             'boats':[{'racer_boat_number':b,'racer_place_number':p}
                      for b,p in [(1,1),(5,2),(3,3),(2,4),(4,5),(6,6)]],
             'payouts':{'trifecta':[{'combination':'1-5-3','amount':4260}]}}
        self.assertEqual(candidate(row,'2026-11-01')['order'],[1,5,3])
        row['payouts']['trifecta'][0]['amount']=1234
        self.assertEqual(candidate(row,'2026-11-01')['payout'],1234)
        row['payouts']['trifecta'][0]['combination']='5-1-3'
        self.assertIsNone(candidate(row,'2026-11-01'))
    def test_no_unsupported_or_missing_fields(self):
        self.assertIsNone(candidate({'date':'2026-11-01','stadium_number':14,'number':1},'2026-11-01'))
        self.assertIsNone(candidate({'date':'2026-11-02','stadium_number':14,'number':1},'2026-11-01'))

if __name__=='__main__':
    unittest.main()
