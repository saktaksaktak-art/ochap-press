# Result bulletin source detail for BC (2026-11-26)
The existing single unified Open API fetch is unchanged. Each accepted API race
now retains its complete decoded `result` object in `races[].api_result`.
This is the source JSON object, not the original HTTP byte stream or official
BOAT RACE page evidence. Its source and observation time are the existing
`result_source_ref` and `source_observed_at_jst`.

Read weather from the result object: `weather_number`, `wind_direction_number`,
`wind_speed`, `wave_height`, `air_temperature`, `water_temperature`. Racer data
is keyed by boat number under `racers`: `number`, `place_number`,
`course_number`, `start_timing`, and original `*_source` fields when supplied.
Retain `technique_number`, `remarks`, `refunds`, and full `payouts` as supplied.
Never infer missing/null values or use `preview` as actual results.

Schema 1.0 and normalized fields remain compatible. Supplemental changes trigger
a save and independent HTTP fingerprint check; unchanged observations do not
create timestamp-only commits. Historical JSON without the optional snapshot
remains readable and can be enriched by an explicit existing date dispatch.
Keep the newest coherent result object rather than assembling an alleged raw
snapshot from multiple observations; prior versions remain in Git history.
The existing eligibility checks (including single trifecta and unique podium),
official flags, result status, 80-slot dispatcher, UI, forecast data and formal
BC ledger are unchanged. Third-party result data is not official confirmation.
No automated historical bulk backfill is introduced.

API schema: https://github.com/boatraceopenapi/api/blob/gh-pages/docs/v1/schema.md
