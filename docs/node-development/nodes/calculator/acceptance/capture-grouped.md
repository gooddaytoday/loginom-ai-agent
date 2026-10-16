## Fixed grouped capture prerequisite

The receiving product now stages `runtime/src/acceptance/calculator-grouped-before-done-v1.mjs`, exporting `captureCalculator({binding,identity,browser,record})` for the accepted private admission chain. The existing builder recursively inventories `src`; no builder or host/bridge contract change is required. The fixed resource never imports a caller recipe or exposes a model tool.

Preparation must provide an owned, confirmed saved diagnostic package containing exactly one Calculator named `LAB66CaptureCalculator`, already configured with a nonexcluded optional Region source and another active output. The harness does not create/login/upload/save/execute a package. It binds that existing node via the native graph, opens output port zero with the existing guarded channel, captures before and after normal Region exclusion and cancels before Done. The caller must not reuse an acceptance result or historical unknown operation as this diagnostic package.

The normal exclusion procedure still requires a verified rendered definition page. If mapping readiness refuses, the harness refuses; it does not widen tolerance, copy predicates or silently bypass the Page guard. An uncertain mutation propagates without compensating cancellation. Pure capture failures may cancel only a freshly verified owned draft. Error/falsy rejection is preserved by the harness and accepted admission/owner chain. Package/logout cleanup and release remain the bridge/host's responsibility after a confirmed cancellation receipt; harness does not close browser or release owner itself.

Raw collection is bounded to the wizard subtree (4096 elements), both cached mapping stores (1000 records each), 512-byte strings and 512 KiB per snapshot. DOM includes hierarchy/binding attrs and rect/client/scroll; cache includes record/source membership, whitelisted field data/flags, local counts and proxy pending state. Accessor properties are marked unread instead of invoking arbitrary getters. Capture IDs are local to each snapshot; cross-snapshot native identity uses record/field IDs, not ephemeral object IDs. Region's target record can legitimately change on exclusion; original source record/field identity must remain.

The actual complete/window/coverage predicate collector is not yet supplied by LAB-67. Snapshots explicitly report `predicates.evaluated=false`; cancellation success does not imply capture completeness or mapping PASS. The resource always reports `capture_complete=false`, missing collector and `native_verified=false`. A collector integration requires a separate agreed interface; this implementation does not modify workspace-ui.

Offline tests distinguish orchestration doubles from the actual fixed resource entry: the latter executes the real transport wrapper and raw collector with explicitly synthetic Page/Ext/native graph/guarded procedure substitutes. Existing receiving admission/owner tests prove refusal and cleanup-before-release with their labelled doubles. Neither class proves native Loginom or live capture. Live/model/upload and replay remain unassigned.

Run source checks with pinned Node:

```sh
node --test packages/loginom-runtime/test/calculator-grouped-harness.test.mjs
node --experimental-test-module-mocks --test packages/loginom-runtime/test/calculator-grouped-page-double.test.mjs
```

For an actual clean product, set `CALCULATOR_HARNESS` to its fixed resource for the first check and `CALCULATOR_RUNTIME` to its `runtime` directory for the second. These load actual inventoried product modules without modifying manifests or substituting a successful capture resource. Launcher tests and resource verification must separately use unmodified receiving inventories.
