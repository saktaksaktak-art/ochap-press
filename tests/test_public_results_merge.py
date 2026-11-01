import sys,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from reconcile_public_results import merge
def row(no,order,pay):
    return {'venue':'鳴門','venue_code':14,'race_no':no,'official_confirmed':True,
            'order':order,'trifecta_payout_yen':pay,'method':'逃げ',
            'official_result_source_ref':'https://www.boatrace.jp/owpc/pc/race/raceresult?hd=20261101&jcd=14&rno='+str(no)}
def pack(rows):
    return {'schema_version':'1.0','date':'2026-11-01','races':rows,'checked_at_jst':'2026-11-01T15:30:00+09:00'}
class ResultsMerge(unittest.TestCase):
    def test_preserve_prior_and_add_new(self):
        a=pack([row(1,[1,2,3],1230)])
        b=pack([row(2,[2,1,4],2630)])
        c=merge(a,b)
        self.assertEqual([x['race_no'] for x in c['races']],[1,2])
        self.assertEqual(a['races'][0],c['races'][0])
    def test_identical_is_idempotent(self):
        a=pack([row(1,[1,2,3],1230)])
        self.assertEqual(merge(a,a),a)
    def test_conflicting_result_fails_closed(self):
        a=pack([row(1,[1,2,3],1230)])
        b=pack([row(1,[1,3,2],1230)])
        with self.assertRaisesRegex(ValueError,'Conflicting'):
            merge(a,b)
    def test_unverified_fails_closed(self):
        a=pack([row(1,[1,2,3],1230)])
        b=pack([dict(row(2,[2,1,4],2630),official_confirmed=False)])
        with self.assertRaisesRegex(ValueError,'Unverified'):
            merge(a,b)
    def test_no_prior_file(self):
        a=pack([row(1,[1,2,3],1230)])
        self.assertEqual(merge(None,a),a)
    def test_cross_date_fails(self):
        a=pack([row(1,[1,2,3],1230)])
        b=pack([row(2,[2,1,4],2630)])
        b['date']='2026-11-02'
        with self.assertRaisesRegex(ValueError,'Cross-date'):
            merge(a,b)
def api_row(no,order,pay,at='2026-11-01T20:00:00+09:00'):
    return {'venue':'鳴門','venue_code':14,'race_no':no,
        'official_confirmed':False,'result_status':'API_REPORTED',
        'result_source_ref':'https://boatraceopenapi.github.io/api/v1/2026/20261101.json',
        'source_observed_at_jst':at,'order':order,'method':'逃げ',
        'trifecta_payout_yen':pay}
class ApiMergeTests(unittest.TestCase):
    def test_api_added(self):
        a=pack([row(1,[1,2,3],1230)])
        b=pack([api_row(2,[2,1,4],2630)])
        m=merge(a,b)
        self.assertEqual([x['race_no'] for x in m['races']],[1,2])
        self.assertIs(m['races'][1]['official_confirmed'],False)
    def test_api_correction_replaces_earlier_api(self):
        a=pack([api_row(2,[2,1,4],2630)])
        b=pack([api_row(2,[2,4,1],2640,'2026-11-01T20:05:00+09:00')])
        self.assertEqual(merge(a,b)['races'][0]['order'],[2,4,1])
    def test_api_does_not_downgrade_verified_legacy(self):
        a=pack([row(1,[1,2,3],1230)])
        b=pack([api_row(1,[1,3,2],3330)])
        self.assertEqual(merge(a,b),a)
    def test_unchanged_api_no_commit(self):
        a=pack([api_row(1,[1,2,3],1230)])
        b=pack([api_row(1,[1,2,3],1230,'2026-11-01T20:05:00+09:00')])
        self.assertEqual(merge(a,b),a)
    def test_stale_api_correction_does_not_revert(self):
        a=pack([api_row(1,[1,3,2],3330,'2026-11-01T20:10:00+09:00')])
        b=pack([api_row(1,[1,2,3],1230,'2026-11-01T20:05:00+09:00')])
        self.assertEqual(merge(a,b),a)
    def test_api_row_without_status_rejected(self):
        x=api_row(1,[1,2,3],1230)
        del x['result_status']
        with self.assertRaisesRegex(ValueError,'Unverified'):
            merge(None,pack([x]))
if __name__=='__main__':unittest.main()
