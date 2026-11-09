"""Exercise failures across the real production parser, Git merge, Pages and HTTP."""
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
import results_flash as f
from test_public_results import result, feed, DAY, AT, URL
from publish_public_results import unified_v1_results


def payload():
    return dict(schema_version='1.0', date=DAY, checked_at_jst=AT,
                races=unified_v1_results(feed(result()), DAY, URL, AT))


class FlashTests(unittest.TestCase):
    def test_real_git_push_race_preserves_other_file_and_newer_api(self):
        with tempfile.TemporaryDirectory() as root:
            root = Path(root)
            remote, first, other = root/'remote.git', root/'first', root/'other'
            def run(cwd, *args):
                return subprocess.run(['git', *args], cwd=cwd, check=True, text=True,
                    stdout=subprocess.PIPE, stderr=subprocess.PIPE).stdout.strip()
            run(root, 'init', '--bare', '--initial-branch=main', str(remote))
            run(root, 'clone', str(remote), str(first))
            run(first,'config','user.name','Test');run(first,'config','user.email','test@example.invalid')
            path = Path('data/public-results')/(DAY+'.json')
            f.atomic_json(first/path, payload())
            run(first,'add','.');run(first,'commit','-m','initial');run(first,'push','origin','main')
            run(root,'clone',str(remote),str(other))
            run(other,'config','user.name','Test');run(other,'config','user.email','test@example.invalid')
            candidate = payload()
            candidate['races'][0].update(order=[2,1,3],source_observed_at_jst='2026-11-01T20:05:00+09:00')
            newer = payload()
            newer['races'][0].update(order=[3,2,1],source_observed_at_jst='2026-11-01T20:10:00+09:00')
            raced = []
            def worker_git(*args, **kw):
                if args[0]=='push' and not raced:
                    raced.append(True)
                    f.atomic_json(other/path,newer)
                    (other/'other-writer.txt').write_text('keep')
                    run(other,'add','.');run(other,'commit','-m','concurrent writer');run(other,'push','origin','main')
                return run(first,*args)
            import os
            prior = Path.cwd()
            try:
                os.chdir(first)
                with patch.object(f,'git',side_effect=worker_git):
                    saved, committed, sha=f.save_latest(path,candidate)
                self.assertEqual(saved['races'][0]['order'],[3,2,1])
                self.assertFalse(committed)
                self.assertEqual((first/'other-writer.txt').read_text(),'keep')
                self.assertEqual(run(first,'rev-parse','HEAD'),run(first,'rev-parse','origin/main'))
            finally: os.chdir(prior)

    def test_http_failure_is_bounded_and_preserves_bytes(self):
        with tempfile.TemporaryDirectory() as root:
            p = Path(root) / 'results.json'
            f.atomic_json(p, payload())
            original = p.read_bytes()
            calls = []
            def fail(url):
                calls.append(url)
                raise TimeoutError('offline')
            with self.assertRaises(TimeoutError):
                f.acquire(DAY, p, fetcher=fail, sleeper=lambda _: None)
            self.assertEqual(len(calls), 3)
            self.assertEqual(p.read_bytes(), original)

    def test_unchanged_does_not_write(self):
        with tempfile.TemporaryDirectory() as root:
            p = Path(root) / 'results.json'
            f.atomic_json(p, payload())
            original = p.read_bytes()
            old, candidate, changed = f.acquire(DAY, p, fetcher=lambda _: feed(result()))
            self.assertFalse(changed)
            self.assertTrue(f.same_results(old, candidate))
            self.assertEqual(p.read_bytes(), original)

    def test_empty_before_first_result_creates_no_file(self):
        with tempfile.TemporaryDirectory() as root:
            p = Path(root) / 'results.json'
            self.assertEqual(f.acquire(DAY, p, fetcher=lambda _: feed(None)),
                             (None, None, False))
            self.assertFalse(p.exists())

    def test_bad_registration_never_becomes_new_result(self):
        r = result()
        r['racers']['1'].pop('number')
        with tempfile.TemporaryDirectory() as root:
            p = Path(root) / 'results.json'
            self.assertIsNone(f.acquire(DAY, p, fetcher=lambda _: feed(r))[1])

    def test_readback_rejects_wrong_date_missing_rows_and_payout(self):
        expected = payload()
        for variant in ('date', 'count', 'payout'):
            actual = json.loads(json.dumps(expected))
            if variant == 'date': actual['date'] = '2026-11-02'
            if variant == 'count': actual['races'] = []
            if variant == 'payout': actual['races'][0]['trifecta_payout_yen'] += 10
            self.assertFalse(f.public_matches(expected, lambda _: actual))
        self.assertTrue(f.public_matches(expected, lambda _: expected))

    def test_readback_retries_then_recovers(self):
        calls = []
        def fetcher(_):
            calls.append(1)
            return payload() if len(calls) == 3 else dict(payload(), races=[])
        self.assertTrue(f.verify_public(payload(), attempts=3, fetcher=fetcher,
                                        sleeper=lambda _: None))
        self.assertEqual(len(calls), 3)

    def test_failed_pages_request_is_not_success(self):
        def api(endpoint, method=None):
            if endpoint.endswith('/pages'): return {'build_type': 'legacy'}
            if method == 'POST': raise PermissionError('403')
            return {'status': 'built', 'commit': 'old'}
        with patch.object(f, 'git', side_effect=subprocess.CalledProcessError(1, 'git')):
            with self.assertRaises(PermissionError):
                f.build_pages('new', api, lambda _: None)

    def test_reuses_existing_pages_build(self):
        calls = []
        def api(endpoint, method=None):
            calls.append(method)
            return {'build_type':'legacy'} if endpoint.endswith('/pages') else {
                'status':'built', 'commit':'expected'}
        self.assertEqual(f.build_pages('expected', api)['status'], 'built')
        self.assertNotIn('POST', calls)

    def test_no_change_recovers_previous_publication_failure(self):
        expected = payload()
        with tempfile.TemporaryDirectory() as root:
            report = Path(root) / 'report.json'
            with patch.object(sys, 'argv', ['results_flash', '--date', DAY, '--report-out', str(report)]), \
                 patch.object(f, 'acquire', return_value=(expected, expected, False)), \
                 patch.object(f, 'git', return_value='commit'), \
                 patch.object(Path, 'read_text', return_value=json.dumps(expected)), \
                 patch.object(f, 'public_matches', return_value=False), \
                 patch.object(f, 'build_pages', return_value={'commit':'commit'}) as build, \
                 patch.object(f, 'verify_public', return_value=True):
                self.assertEqual(f.main(), 0)
                build.assert_called_once()
            state = json.loads(report.read_text())
            self.assertFalse(state['results_changed'])
            self.assertTrue(state['pages_publish_succeeded'])
            self.assertTrue(state['public_url_verify_succeeded'])


if __name__ == '__main__': unittest.main()
