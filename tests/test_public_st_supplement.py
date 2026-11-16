from copy import deepcopy
from datetime import date, datetime
from hashlib import sha256
import json
import unittest

from scripts.build_public_st_supplement import build


class PublicST(unittest.TestCase):
    day = date(2026, 11, 16)
    now = datetime.fromisoformat('2026-11-16T16:00:00+09:00')
    closing = '2026-11-16T15:00:00+09:00'
    registrations = ['4567', '4568', '4569', '4570', '4571', '4572']
    html = (
        '<article id="v01-r1" data-deadline="' + closing + '">'
        '<details><summary>01 出走表</summary><table>'
        + ''.join('<tr><td><small>' + n + '・A1</small></td></tr>' for n in registrations)
        + '</table></details></article>'
    )
    row = dict(date_jst='20261116', venue=1, race=1, racer_numbers=registrations,
               source='kyoteibiyori.com', st_metrics_status='verified',
               fetched_at_jst='2026-11-16T14:00:00+09:00', st_metrics_by_waku={
                   'st_breakout_pct': [None, 0, 2.34, 0, 0, 0],
                   'st_stability_pct': [0, 20, 30, 40, 60, 80],
               })

    def run_build(self, row, **other):
        data = dict(schema='ochap.hiyori-st-daily.v1', target_date_jst='20261116', records={'01:01':row})
        data.update(other)
        raw = json.dumps(data).encode()
        return build(raw, sha256(raw).hexdigest(), self.html, self.day, self.now)['races']

    def test_current_checkpoint_and_null_vs_zero(self):
        row = self.run_build(deepcopy(self.row))['01:01']
        self.assertEqual(row['metrics'][1][:3], [None,0,2.34])
        self.assertEqual(row['metrics'][2], [None]*6)

    def test_wrong_identity_or_after_deadline_excluded(self):
        for changes in (
            dict(racer_numbers=self.registrations[::-1]),
            dict(fetched_at_jst=self.closing),
            dict(fetched_at_jst='2026-11-16T15:01:00+09:00'),
            dict(fetched_at_jst='2026-11-16T00:01:00+00:00'),
            dict(before_race_deadline=False),
            dict(closed_at_jst='2026-11-16T15:01:00+09:00'),
            dict(st_metrics_status='unverified'),
        ):
            with self.subTest(changes=changes):
                self.assertEqual(self.run_build({**self.row, **changes}), {})

    def test_wrong_date_and_sha(self):
        with self.assertRaises(ValueError):
            self.run_build(self.row,target_date_jst='20261117')
        with self.assertRaises(ValueError):
            build(b'{}','0'*64,self.html,self.day,self.now)
