# Coordinator-authorized existing-role preflight, in progress

2026-09-13, same node16 close-native-gates phase. Production change authorized
ONLY for Collapse existing-role validation before open_input_port. General
sorting-preflight and NULL must remain unchanged; no Hermes/full repeat review.

Current source370020bc / runtime51ceb0d186560a82c7f91b54390bf6300945456bc052c5358d3a948ca534ab1e.
No new production edits yet. Live native discovery is in
.dock/node16/live-1789314876117, PTY99490, own package
/test-1/node16-20260913-a56c2488/Node16-existing-input-preflight-20260913.lgp.
Active graph TF-4, document1789314881553-g9fa7rjiz35,
workflow1789314881553-g9fa7rjiz35-2, Collapse f1ef29d6-bb91-43d6-8b57-b56425aadc69,
source9b198fee-7dfd-46af-96dd-34176f8701bf, input9dc72a3f-56bf-3bfc-84ec-f979daf4da6b.
Saved copy originally mapped; its unsaved working state now renames input Id to
EntityId, uses information EntityId/Zone, transposes S/I/R/B/D and is ACTIVE.
The rename operation SUCCEEDED with exact full output; original mapped file untouched.

Observed readonly native chain:
- node diagram link.FTargetPort.data.get_Socket() (native model input proxy).
- socket.QueryInterface(bg.IBGTuneDataSourceSocket), after inspecting actual getter
  and QueryInterface source; no Verify/Invalidate/Activate/Set/Sync calls.
- tune.get_TuneDataSource(), ds.get_Columns(), columns.get_Count(),
  get_PresentUsageTypes(), getItem(i) → get_Index/get_ID/get_Name/get_DataType/get_DisplayName.
- ds.get_ColumnDefs(), defs.get_Count()/getItem(i) → same index/ID/name/type and
  get_InputColumnInfoName(). Renamed definition reads EntityId, source_name Id.
  This is effective saved mapping, NOT upstream schema substitution.
- ds.GetColumnsHash(presentUsageTypes), default AHashComponents=3. Result is Uint8Array;
  Array.from is necessary. Omitting first arg yields empty bytes (early diagnostic error).
- ds.get_Active(). Model native FStatus1/FState0, input FStatus1 remain unchanged;
  before/after/final link/source/node/port GUIDs identical, schema bytes before/after same.
- Native APIs return Saltarelle tasks; await via continueWith/getAwaitedResult.
- Release each acquired proxy in reverse order via await task(proxy.disposeAsync(true)).
  disposeAsync() WITHOUT true returns PostDispose void, which caused an early diagnostic
  cleanup-wrapper error; retained trace. Current session must be fully logged out/closed
  to release refs whose earlier local scope was lost. Do not report those probes as
  complete resource cleanup. Corrected probes released every acquired reference.

Evidence commands/results:
existing-input-effective-fields / existing-input-renamed-fields: 7 actual columns,
active unchanged, nonempty schema bytes before/after, 11 references released.
existing-input-effective-definitions: EntityId → Id mapping proved, node/port still1.
All raw browser outputs retained. Node graph cache __$cachedProps is empty.

Required before release: native implementation pins and exact identity/schema-version
binding (GetColumnsHash is NOT a monotonic server version or atomicity guarantee),
repeat/freshness guard before first gesture; preserve explicit prospective input mapping
semantics; focused missing/renamed-valid/stale/incomplete/foreign and real active-state,
settings/link unchanged refusal. If no safe snapshot can be proved, keep gate OPEN,
not a blanket refusal of all existing nodes declared as a fix.


Current implementation added (not yet live accepted):
client/lib/collapse-existing-input{,-browser,-pins}.mjs; Collapse-specific preflight
and optional beforeInput lifecycle hook. General sorting-preflight and NULL unchanged.
Native reader validates49 observed getter/release functions and the existing53 critical
RPC runtime pins, rereads columns/definitions and native schema bytes, releases proxies.
Host signature includes exact names/source_name/case, node/port/link/activity binding;
checks initial and immediately before input wizard. Prospective explicit mapping names
resolve via verified InputColumnInfoName. No atomic snapshot is claimed.
Runtime e33dd667c8e7eba1edd96a13621aa7251874198e2340e2efede15baa3681b98b,172 inputs.
14 focused tests PASS; full client1506 PASS/1 SKIP.
Live prototype guard read actual EntityId→Id and released33 refs in3s with active state
unchanged. Native node.FPorts is an array of TestablePortCollection; input uses
FPorts[0].FCollection, not direct includes.

Old source51 session99490 safely logged out/closed, including lost prototype reference
scopes. Renamed copy saved at checkpoint, actual LGP8240B downloaded, SHA
1ec27a1be38e8641bb0506525ba6c74fcbc0238c9b306ab82768b849c6ac3b21.
Fresh manifest .dock/node16/existing-input-renamed-manifest.json (case renamed) opens
copy with readonly-first and automatic source/reexecute; custom rename oracle still
needed because frozen mapped case expects Id/order different from EntityId output.

## Проверено на актуальном runtime — 13 сентября 2026

Свежая сессия `.dock/node16/live-1789316444289`, документ
1789316449168-ortdsp45kq, runtime e33dd667c8e7eba1edd96a13621aa7251874198e2340e2efede15baa3681b98b.
Перед записью реально скачаны CSV и сохранённый LGP. После открытия получен прежний
результат с EntityId, независимый audit_renamed.py проверил все75ячеек.
Запрос fixed-missing с __MissingField__ вернул NOT_APPLIED, effect_possible=false,
cleanup_complete=true: до/после одинаковые native graph, активность узла/порта,
GUID связей, мастер отсутствует; node_step_prepared отсутствует.
Затем fixed-valid-renamed с EntityId/Zone и S/I/R/B/D SUCCEEDED; независимый аудит
повторно проверил75ячеек и сохранность schema/settings. Raw evidence:
fixed-missing-evidence.json, fixed-valid-renamed-public.json, existing-input-impact.json.
Полный client suite1506PASS/1SKIP, focused14PASS. Атомарность серверного snapshot
не заявлена. General sorting-preflight и NULL этой правкой не изменены.
Сессия вышла из test-1 и закрылась; native upload/download очереди пусты.
Hermes не запускался; это адресная проверка исправления после review.
