# Result bulletin #058 acceptance revision

## Accepted design

Target 80 slots/day JST: 09:00–20:50 every 10 minutes (72),
21:00–23:20 every 20 minutes (8). 23:20 is the final target slot.
Delayed processing is labelled separately. Neither GAS nor Actions guarantees exact
execution or delivery of every scheduled slot. Actions pending-run replacement can
coalesce queued runs; GAS HTTP 204 records acceptance, not workflow completion.
UI reload remains 90 seconds; no reader HTML/assets or forecast records changed.

## Independent findings against supplied package

Source ZIP SHA256: 7d351b356d449bc01529e4708fae8640cea5f76f6ff4230fd6e3cfc22fac8c55.
The received hashes matched. Its seven-category report is not live deployment proof.

* Replacing the parser/reconciler breaks production imports `parse_api_result`,
  `unified_v1_results`, and `merge`. Replacing the existing merge tests removes
  regression coverage. The independent compatibility run produced two import errors.
* Incoming confirmed conflicts and stale API corrections are not rejected/protected
  by the proposed replacement in the same way as production.
* The GAS clock handler treats its incoming trigger event as a Date parameter.
* The GAS direct fallback appends a literal `\\n` after serialized JSON, does not
  validate the six racer identities, and can proceed after read failures.
* Its per-day property stores 80 complete reports, exceeding the 9KB/value limit.
* Fallback stage 3 equals stage 2, and the slot is marked complete even when public
  readback failed. Its fallback fingerprint differs from Python's fingerprint.
* No-change skips deployment recovery after a previously successful save/failed build.
* Proposed YAML summary contains unescaped shell backticks; uses event expressions
  in shell; disables the old cron before a new production path has succeeded.

## Implemented acceptance changes

Keep the existing production parser/reconciler and all their tests. Add the small
`scripts/results_flash.py` orchestration module. It validates before any write,
retries upstream at most three times, reconciles onto fresh main, retries push races
at most three times, and stages only the target day result JSON. Official evidence
and newer API corrections retain the original strict rules.

Four stage booleans are independent. If an unchanged saved result is not public,
retry publication without making a timestamp-only commit. Reuse a containing
queued/building/built Pages build; otherwise request an explicit branch Pages
build. Require its actual completion, then independently compare live date,
result keys/count/order/method/payout/confirmation state. HTTP readback can succeed
with `pages_publish_succeeded=false` and status `ALREADY_PUBLIC_NO_BUILD`: no new
build was required. A build failure cannot be called public success.

All telemetry is in a seven-day Actions artifact/summary, not public HTML. Workflow
arguments use environment variables. Existing `issue_date` dispatch input remains
as an alias for `target_date`. Use GITHUB_TOKEN for result pushes to avoid a PAT
push plus explicit build creating duplicate deployments. Different Pages modes
fail visibly; this adapter targets the current branch Pages publication setup.

GAS revision 2.1 dispatches Actions only, with short daily acceptance flags (801
bytes for all 80 in the tested map) and one detailed last-run record. No automatic
switch to a weaker parser when Actions permission is absent. Requires existing
`OCHAP_PRESS_GITHUB_TOKEN` with Actions write. The handler ignores trigger events;
test-only `_RUN_` accepts a Date. Installer preserves other handlers and reuses one
existing result handler, deleting only duplicates of this exact handler.

## Validation

31 production Python tests pass, including a real local bare-Git concurrent push
race preserving another writer's file and a newer API correction. Actual GAS code
runs in Node service doubles: 80 slots, trigger event, daily rollover, repeated
slot with zero extra HTTP, 403 retry, delayed final slot, property size.
These are local tests, not GAS production evidence or a full-day timing guarantee.

## Handover / rollback

1. Deploy repository code; inspect Actions and public HTTP evidence.
2. In existing GAS project `1vCaZXPcP8UON0iDKTzRDaykU_KqagLcOGjR90ro20cFrIbXvXXFR-VoY`,
   add/update ONLY `OchaP_ResultsFlash_80Slots_Dispatcher.gs` from current main.
   Do not replace the whole project using a potentially stale integration bundle.
3. Inspect current triggers/combined runtime usage. Run preflight and a real manual
   dispatch using the existing token. Check Actions and public JSON readback.
4. Run installer only after evidence is available. Record trigger ID/status. Once
   GAS has actually dispatched successfully, remove only the old result cron's
   `schedule` stanza. Do not leave both schedulers as normal production operation.
5. On dispatch trouble retain/reinstate the original cron `*/15 0-14 * * *` UTC;
   remove only the new result handler trigger. Never reset main over concurrent
   updates. Revert only the reviewed code files if needed; retain valid result JSON.

At repository acceptance, GAS deployment, token Actions-write, installed trigger,
shared daily runtime headroom and a full day's actual 80 executions remain pending
until independently observed. Do not claim them from saved source alone.

Official references:
https://docs.github.com/en/rest/pages/pages#request-a-github-pages-build
https://developers.google.com/apps-script/guides/services/quotas
