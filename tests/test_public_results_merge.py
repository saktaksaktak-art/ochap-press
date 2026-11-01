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
if __name__=='__main__':unittest.main()
