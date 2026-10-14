Exact missing installed seam: fixed FP constructor is eliminated from the CLI module graph. The installed Node-client exports only the ordinary constructor. There is no writer of its private WeakMap and no inventory implementation in that module. Adding fields to model JSON is explicitly refused/ineffective, not a fallback.

Minimal proposed private registration (not applied):

1. A fixed private entry exporting only `launchFieldParametersDiagnostic` from the existing Node-client implementation. No dynamic module/callback/script input or public tool/schema.
2. `packages/loginom-host/script/build-node-host.ts`: stage this fixed entry as `resources/loginom/host/fp-private-launcher.mjs` with its own build-input metadata; retain the existing Node-host build and return value byte-for-byte.
3. `packages/loginom-host/script/build-cli.ts`: include the additional private bundle's metadata in notices/inventory processing. The ordinary CLI roots and existing source/manifest/capability guards remain unchanged.

These build/notice paths are outside the currently named runtime receiving seams. Approval/ownership from Registry is required before writing them; no production patch is applied. Do not retain the function by allowing a model/config selector, global object, new callback or manufactured nonce. The installed private entry enables a controlled operator-owned caller, not ordinary model authority.

After registration, the FP-specific constructor/caller also needs an explicit original AbortSignal/absolute deadline and immutable inventory/startup argument binding across its awaits. Current `NodeHostInput` has no such launch control: SOURCE inventory awaits live input fields, and `launchNodeHost` uses ordinary start RPC budget 180000. The corrected36 readPreReady control begins only after that startup. Extending only the fixed FP private path belongs to the agreed Node-client/supervisor receiving area; its precise startup control must precede any future native launch, not be borrowed from PRE_READY_CLOSED_READ or config metadata.

Even a retained inventory constructor does not prove native admission. Current bridge FP context requires an owned existing configure operation, saved/prepared binding and fresh native identity/resources; none are supplied by the inventory test or closed read. Those conditions remain explicit gates, with LAB-66 original-opening and LAB-68 early-retention authors unchanged. No general owner/host fix or foreign branch is copied here.
