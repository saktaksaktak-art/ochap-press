#!/usr/bin/env python3
"""Result-only acquisition, safe Git save, Pages build, and independent HTTP readback.

Reuse the production parser and reconciler; no prediction or formal BC writes.
State belongs in Actions artifacts, never in reader-facing HTML.
"""
import argparse
from datetime import datetime
import hashlib
import json
import os
from pathlib import Path
import subprocess
import time
from urllib.error import HTTPError

from publish_public_results import fetch, unified_v1_results, JST
from reconcile_public_results import checked, merge, CORE

PUBLIC_BASE = 'https://saktaksaktak-art.github.io/ochap-press'


def stamp():
    return datetime.now(JST).isoformat(timespec='seconds')


def fingerprint(payload):
    day, rows = checked(payload)
    core = [[key[0], key[1], *[r.get(k) for k in CORE[2:]],
             r['official_confirmed']] for key, r in sorted(rows.items())]
    return hashlib.sha256(json.dumps([day, core], ensure_ascii=False,
                                    separators=(',', ':')).encode()).hexdigest()


def same_results(a, b):
    return fingerprint(a) == fingerprint(b)


def retry_fetch(url, attempts=3, fetcher=fetch, sleeper=time.sleep):
    for attempt in range(attempts):
        try:
            return fetcher(url)
        except Exception:
            if attempt == attempts - 1:
                raise
            sleeper(min(2 ** attempt, 4))


def atomic_json(path, payload):
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix('.tmp')
    tmp.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + '\n')
    tmp.replace(path)


def acquire(day, path, fetcher=fetch, sleeper=time.sleep):
    """Validate before any write. A failed acquisition cannot replace valid data."""
    existing = json.loads(path.read_text()) if path.exists() else None
    if existing is not None and checked(existing)[0] != day:
        raise ValueError('Existing result date mismatch')
    compact = day.replace('-', '')
    source = f'https://boatraceopenapi.github.io/api/v1/{day[:4]}/{compact}.json'
    raw = retry_fetch(source, fetcher=fetcher, sleeper=sleeper)
    observed = stamp()
    rows = unified_v1_results(raw, day, source, observed)
    incoming = dict(schema_version='1.0', date=day,
                    status='API_RESULTS_REFERENCE_ONLY', checked_at_jst=observed,
                    not_formal_m0=True, not_formal_bc=True, races=rows,
                    source_policy='Unified third-party API; formal BC is separate.')
    result = merge(existing, incoming)
    changed = bool(rows) and (existing is None or not same_results(existing, result))
    # Do not create an empty daily file before results become available.
    return existing, (result if rows or existing else None), changed


def git(*args, check=True):
    return subprocess.run(['git', *args], check=check, text=True,
                          stdout=subprocess.PIPE, stderr=subprocess.PIPE).stdout.strip()


def save_latest(path, candidate, attempts=3):
    """Retry against fresh main. Merge only the target day; never stage other files."""
    git('config', 'user.name', 'github-actions[bot]')
    git('config', 'user.email', '41898282+github-actions[bot]@users.noreply.github.com')
    for attempt in range(attempts):
        git('fetch', 'origin', 'main')
        git('reset', '--hard', 'origin/main')
        current = json.loads(path.read_text()) if path.exists() else None
        result = merge(current, candidate)
        if current is not None and same_results(current, result):
            return current, False, git('rev-parse', 'HEAD')
        result['result_changed_at_jst'] = stamp()
        atomic_json(path, result)
        git('add', '--', str(path))
        git('commit', '-m', 'data(results): update API newspaper bulletin (not formal BC)')
        try:
            git('push', 'origin', 'HEAD:main')
            return result, True, git('rev-parse', 'HEAD')
        except subprocess.CalledProcessError:
            if attempt == attempts - 1:
                raise
    raise RuntimeError('Safe push retry limit exceeded')


def public_matches(payload, fetcher=fetch):
    """Compare date, complete result keys/count/content, and confirmation state."""
    url = f"{PUBLIC_BASE}/data/public-results/{payload['date']}.json"
    try:
        remote = fetcher(url + '?verify=' + str(time.time_ns()))
        return same_results(payload, remote)
    except Exception:
        return False


def verify_public(payload, attempts=12, fetcher=fetch, sleeper=time.sleep):
    for n in range(attempts):
        if public_matches(payload, fetcher):
            return True
        if n < attempts - 1:
            sleeper(5)
    return False


def gh_api(endpoint, method=None):
    cmd = ['gh', 'api'] + (['--method', method] if method else []) + [endpoint]
    r = subprocess.run(cmd, check=True, text=True, stdout=subprocess.PIPE,
                       stderr=subprocess.PIPE)
    return json.loads(r.stdout) if r.stdout.strip() else {}


def build_pages(expected_commit, api=gh_api, sleeper=time.sleep):
    """Current production uses branch Pages; fail visibly on a different mode."""
    base = '/repos/' + os.environ.get('GITHUB_REPOSITORY', 'saktaksaktak-art/ochap-press')
    config = api(base + '/pages')
    if config.get('build_type') != 'legacy':
        raise RuntimeError('Pages is not branch publishing; explicit deployment adapter required')
    # Reuse an already queued/building/built deployment containing this commit.
    def contains_commit(build):
        sha = build.get('commit')
        if not sha:
            return False
        if sha == expected_commit:
            return True
        try:
            git('fetch', 'origin', sha)
            git('merge-base', '--is-ancestor', expected_commit, sha)
            return True
        except subprocess.CalledProcessError:
            return False
    try:
        latest = api(base + '/pages/builds/latest')
    except subprocess.CalledProcessError:
        latest = {}
    if not (latest.get('status') in ('queued', 'building', 'built') and contains_commit(latest)):
        api(base + '/pages/builds', 'POST')
    for _ in range(36):
        latest = api(base + '/pages/builds/latest')
        if contains_commit(latest):
            if latest.get('status') == 'built':
                return latest
            if latest.get('status') == 'errored':
                raise RuntimeError('Pages build failed')
        sleeper(5)
    raise RuntimeError('Pages build confirmation timed out')


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--date', default='')
    p.add_argument('--scheduled-slot-jst', default='')
    p.add_argument('--dispatched-at-jst', default='')
    p.add_argument('--trigger-source', default='manual_recovery')
    p.add_argument('--report-out', default='/tmp/public-results-4stage.json')
    args = p.parse_args()
    day = args.date or datetime.now(JST).date().isoformat()
    parsed = datetime.strptime(day, '%Y-%m-%d').date()
    if parsed.isoformat() != day or parsed > datetime.now(JST).date():
        p.error('Invalid or future result date')
    if args.scheduled_slot_jst:
        slot = datetime.fromisoformat(args.scheduled_slot_jst)
        if slot.tzinfo is None or slot.astimezone(JST).date() != parsed:
            p.error('Scheduled slot and target date mismatch')
    path = Path('data/public-results') / (day + '.json')
    state = dict(date=day, scheduled_slot_jst=args.scheduled_slot_jst,
                 dispatched_at_jst=args.dispatched_at_jst,
                 trigger_source=args.trigger_source, actual_started_at_jst=stamp(),
                 exact_on_time_guaranteed=False, fetch_succeeded=False,
                 json_save_succeeded=False, pages_publish_succeeded=False,
                 public_url_verify_succeeded=False, results_changed=False)
    code = 0
    try:
        old, result, changed = acquire(day, path)
        state.update(fetch_succeeded=True, last_checked_at_jst=stamp())
        if result is None:
            state.update(json_save_succeeded=True, publication_status='NO_SETTLED_RESULTS')
        else:
            if changed:
                result, committed, sha = save_latest(path, result)
            else:
                # The run may have queued behind a newer writer. Verify newest saved main.
                git('fetch', 'origin', 'main')
                git('reset', '--hard', 'origin/main')
                result = json.loads(path.read_text())
                checked(result)
                committed, sha = False, git('rev-parse', 'HEAD')
            state.update(json_save_succeeded=True, results_changed=committed,
                         git_commit_sha=sha, race_count=len(result['races']),
                         results_content_sha256=fingerprint(result),
                         last_result_changed_at_jst=result.get('result_changed_at_jst', result.get('checked_at_jst')))
            if public_matches(result):
                state.update(public_url_verify_succeeded=True,
                             publication_status='ALREADY_PUBLIC_NO_BUILD')
            else:
                # Includes recovery of a previous save whose deployment failed,
                # even when today's upstream result content has not changed.
                state['publication_status'] = 'BUILD_REQUIRED'
                build = build_pages(sha)
                state.update(pages_publish_succeeded=True,
                             pages_build_commit=build.get('commit'))
                state['public_url_verify_succeeded'] = verify_public(result)
                if not state['public_url_verify_succeeded']:
                    raise RuntimeError('Pages built, but public JSON does not match saved results')
                state['publication_status'] = 'BUILT_AND_HTTP_VERIFIED'
    except Exception as e:
        state['error'] = type(e).__name__ + ': ' + str(e)
        code = 1
    finally:
        state['actual_finished_at_jst'] = stamp()
        atomic_json(Path(args.report_out), state)
        print(json.dumps(state, ensure_ascii=False))
        summary = os.environ.get('GITHUB_STEP_SUMMARY')
        if summary:
            with open(summary, 'a') as f:
                f.write('### Result bulletin execution (JST)\n\n```json\n' +
                        json.dumps(state, ensure_ascii=False, indent=2) + '\n```\n')
    return code


if __name__ == '__main__':
    raise SystemExit(main())
