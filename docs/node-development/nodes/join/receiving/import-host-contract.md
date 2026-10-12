## Closed Import observation contract

Process: node-orchestration-v2. This contract precedes the LAB-68 production
composition. LAB-71 owns the fixed resource implementation; LAB-68 owns routing,
the pre-configure gate and same-bridge clean proof. No native run is authorized.

The only selector is `import-before-configure-v1`. `launchImportDiagnostic`
verifies the canonical Node, Node-host CLI inventory and the unique fixed
`runtime/src/acceptance/import-before-configure-v1.mjs` resource hash before fork.
No callback, code, getter or caller module path is accepted. The host mints a
one-shot grant for its actual retained run/lease/generation/chat/account/path.
The private launcher requires the original absolute upstream deadline; this
deadline is forwarded unchanged as binding.expires. Missing or expired deadlines
refuse. A fresh ten-minute capture allowance is not an upstream deadline.

The existing `acceptance.capture` routing reaches the same managed browser and
serial gate after guarded preparation. This Import bridge denies all model
action/remote/browser calls other than preparation, descriptions, inspection and
observation. In particular apply, resume, read (which executes), UI actions,
configure, finish, execute, Save and uploads are refused before dispatch, even
after capture refusal. Preparation itself remains guarded and is not replayed.
The gate never turns a caller label, GUID, cleanup path or upload receipt into
native authority. Ordinary runs and ordinary Save-required shutdown are unchanged.

The fixed ABI is `captureImport({binding,identity,browser,record})`. It observes
native node GUID/output0, source path, format, ordered fields, canonical type and
data_kind, activity and execution freshness. Each missing/foreign/unknown fact
must remain refused or partial. `complete:false` or `close_authority:false` is
never upgraded by the host. Resource PARTIAL is evidence, not configure or close
authority. No full Import positive is claimed until an independently accepted
resource supplies the complete proof. LAB-71's current candidate is partial.

Only a complete readonly resource result can request a clean proof. The bridge
creates an opaque proof on its original Page with a private nonce, retaining the
actual native connection/session/package/proxy/tab/controller and preparation
objects. A strict boolean dirty=false must be observed before proof creation;
all identities, global/package running and dialogs are rechecked after the
awaited dirty read. The bridge, not the resource or caller, owns this proof.
The native helper checks it again immediately before the close gesture, after
its own dirty read. Dirty/unknown/unsettled/deadline/identity races refuse.
The proof cannot authorize configure or normal Save-required cleanup.

The original result or rejection (including Error cause and undefined/null/
false/0/empty) is retained separately from evidence persistence failure.
Capture/refusal evidence uses the existing durable file/journal path; evidence
must be synced before cleanup, and bound native cleanup plus durable receipt
must precede release, transport/browser/process exit and acknowledgement.
Unknown replies retain the original owner and prohibit native replay. A known
native success may repair evidence on that owner without repeating the helper.

Offline tests label Page/Application/IPC doubles explicitly. Missing accepted
resource, unavailable upstream deadline, unsupported native facts and historical
lost owners remain dependencies; no synthetic fixture establishes live safety.

## Current implementation boundary

This first composition implements the fixed launcher, unchanged upstream deadline,
actual retained binding, same managed bridge routing, enforced pre-configure gate,
durable partial observation and refusal retention. It deliberately accepts only
the current PARTIAL/REFUSED resource ABI. Even a synthetic `complete:true` refuses.
The ordinary Save guard is unchanged; the opaque clean proof and its native
gesture integration described above remain unimplemented. No prepared readonly
close, successful Import capture transaction or full host/native PASS is claimed.
The component resource is not copied before its independent source review passes.
The stock product therefore refuses a missing Import inventory entry before fork.
The next dependency is a reviewed resource result/ABI defining the complete native
facts; this must be reconciled with the same-bridge clean proof before affirmative
cleanup authority can exist. The fail-closed gate is independently reviewable now.
