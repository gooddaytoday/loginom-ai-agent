Closed preservation cold source pin; process node-orchestration-v1.
Product baseline eec075d5b1ef5db9def6b883cff7b8f86376620e (PR54). This change is test/docs only; its published SHA is separate from the reused product SHA. No whole-product rebuild required.

cold-source-template.json is OPERATOR/REVIEWER input only, outside model cwd/PWD/--dir and prompts. Model sees the separate previously accepted model-input and exact CSV; never this expected/source policy or config files.
Template keeps accepted literal schema/values. Static source pin:167 bytes/SHA256 5f1b19c2d28d1548bdc287fff6e61fbaee72147753379a2aaa5e38d56dca72a3, UTF-8/LF, delimiter ;, decimal ., NULL, double quote. Fixture provenance is authored_fixture_bytes_contract from committed738ae7b8, not observed UI/output/native settings. Required future receipt provenance is independent_server_file_download; none exists yet.

Operator binds explicit account/package_path/source_path/fixture_path before a future separately permitted cold run:
- package_path must be the assigned own /<account>/<unique>.lgp and equal expected.package_path. New name's server absence/writability NOT_VERIFIED by this path check.
- source_path must be /<account>/rowid-ab-c.csv and equal the sole pin's source_path.
- fixture_path is exactly fixtures/preservation/rowid-ab-c.csv relative to this acceptance directory.
- Manually substitute only {{PACKAGE_PATH}}/{{SOURCE_PATH}}; store bound oracle privately (directory0700/file0600) outside model input. Do not change bytes/schema/values/provenance/format for observed output. Worker/reviewer source-path changes get separate exact explicit binding/copy correspondence.
- Call verifyPreservationColdPin({expected,bindings,bytes}) with independently retained original fixture bytes. It is a LOCAL preflight, no browser/launcher/public checker change.
- pin_ready=true only means the authored pin and operator paths are structurally ready; native_source_verified always false. Future source proof still requires independently downloaded server bytes and exact source/settings/reveal/return receipts.

Existing contracts:
cold-check.mjs:111 uses if(expected.static_sources). Missing section skips fresh source proof; existing parseExpectedOutputs accepts the value/schema template with or without it. Do not describe the public checker as rejecting missing static_sources.
With the pin, existing verifyStaticSourceFixture verifies exact bytes/one fixture/canonical parser; observeStaticSources/verifyStaticSourceBytes later require independently downloaded bytes, provenance, exact owned account/source path and settings pass. This offline task does not execute those native helpers.
New local guard rejects absent/empty/partial/duplicate source specs, wrong bytes/size/SHA/format/encoding/fixture/UI-output provenance/receipt provenance and foreign/unresolved paths.
20 addressed tests include explicit full-pin acceptance and existing-parser absence behavior; old accepted suites not repeated.

FP applicability on product eec075d5b:
| Condition | Confirmed/offline | Still NOT_VERIFIED |
|---|---|---|
| Pin and contract | accepted167-byte input/literal5x4/schema/Extra; complete canonical authored pin | independent native download/source-byte/provenance receipts |
| Runtime support | scalar transform.reform_columns, public input_field names, persistent native field-ID binding and full phase readback guards present | native IDs/metadata/order/full baseline and executed five-row read |
| Opening | source12a123aedfc0a50bb7f03a4d0d9b8a0d4bfc2998 accepted OFFLINE separately; eec node-wizard-open/node-context differ | assigned reviewed FP receiving SHA, clean exact candidate and Field Parameters opening applicability. Not integrated here |
| Caller/authority | eec receives private Amount/Calculator seams with separate review; nine runtime pins retained in artifact | FP controlled caller/admission/exact original owner/Page/host/IPC/lease applicability. Amount/Calculator PASS never FP authority |
| Isolation | closed oracle/operator-only contract, model-input separate | actual model cwd/PWD/--dir/instructions/input exposure verified before run |
| Fresh resources | no resources created by this task | exact own account/profile/path/session/document; dirty known, running=false, unsettled/pending clear; original deadline. Preserve historical UNKNOWN, no replay |
| Native route | prior preflight import→bound read→listed changes→values→save/reopen receipt plan | source identity/graph/port/field IDs/execution freshness; complete RowID/A/B/C/Extra baseline and 5x4 values/preservation receipts |
| Metadata/cache | caching_method=2 remains authored fixture baseline | actual native baseline; mismatch stops, never normalize cache or rewrite expected |
| Persistence/cleanup | standard save/dirty/close/logout and cold receipt criteria unchanged | exact save/source proof, original Page cleanup before shutdown/release, artifact/copy hashes and reopen without reapplying settings |

No new native/live/model/replay/save/reopen/cleanup authorization. Public checker/host/runtime and foreign helpers unchanged. Pending/unknown-effect/accounts/branches/resources preserved; full node/wide/empty/scalar/cold acceptance remains open.
