## Original capsule creation receipt / QueryInterface provider

Based on accepted H0 consumer `0d6e92770bfa876768d1f8ee38b603b62b2eada3`.
Production change is confined to `terminal-script-witness.mjs`. No new public
tool, opcode, input callback/module, observer, native grant or host registration.

The frozen capsule now has a non-enumerable `originalProvider`. Before workspace
creation it retains the original preparation store/Map and qualified data reader,
document/id, original acquisition receiver/session/user, application backing
connection/storage, native transport dependencies and defining QueryInterface/type.
When the store is absent it initializes the same fixed bookkeeping shape used by
workspace; the startup id is retained, no native object is acquired. Existing
partial witnesses keep their previous evidence projection; missing native slots
create a sticky unavailable provider, not late qualification.

Private `arm` retains one realm request before creation; only new_draft is supported.
Copies/reentry with another request and already verified receipts refuse. After
the existing workspace has produced a verified receipt, the provider accepts only
that same Map's completion, document/id/account/session, original connection,
package-node/proxy relation, native session and proxy identity. It calls the retained
QueryInterface with the original proxy and StreamPersist type once, keeps the same
returned task, original reader/continuation and returned support. The first task
rejection is preserved over secondary document drift. Repeated query returns the
same Promise; foreign task readers are refused without invoking getters. Original
tasks are never synthetically completed/rejected by the provider.

The fixed host-evaluable `inspectTerminalOriginalProvider` returns only custody
evidence and four false authorities. It cannot arm/query. It is not registered in
stock H0 in this cut; H0 still returns INVOCATION_UNAVAILABLE. Existing native,
source execution, lexical and content qualification are not inferred from refs.
The provider is not a UI creation driver; it binds original creation completion.

### Scope still open

Original QueryInterface internally performs its existing RPC and `$R` resolution.
This cut retains that method/task/result but does not interpose the lower dispatch
task/response/`$R` continuation or make its dynamic lookups safe against all pending
replacements. The native fixture transport and returned proxy are doubles. Full
loaded/lexical qualification, derived forwarding definitions, three extra host
response receipts, original RunCommand operand/control→stock positive preparation
and native receiver permission remain open. The next source cut must address the
original lower QueryInterface continuation/custody before exposing query through
H0, then compose the fixed realm provider with H1/H2. Native/Save/cleanup remain
unavailable; semantic and physical predicates remain separate.

### Addressed validation

New capsule-provider controls use production capsule code, pinned Get/Set/init
definitions and the existing production workspace/packet creation path. They verify
precreation custody, same creation Map/proxy/task/support, no replay, copy/late and
typed-request refusal, getter0 reader/store/storage/resolver drift, pending proxy
and task-reader replacement, and raw falsy/Error(cause0) rejection. Node, VM,
Promise, FS and MessageChannel are real. Page/DOM/SDK/native/session/task and loader
are labelled doubles. One affected full-IIFE Chromium initial-load positive checks
that partial native evidence still projects without becoming a provider. Closed
matrices are not repeated. Initial two assertion errors concerned the task fixture
registry and numeric dispatch history; raw logs are retained.
