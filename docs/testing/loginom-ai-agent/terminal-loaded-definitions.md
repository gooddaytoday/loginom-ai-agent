Fixed pre-acquisition defining-reference custody

The publisher snapshots its fixed defining export graph inside the original
ServerConnection.GetCurrentUser wrapper, before calling the retained original
method and before installing the lower task shims. The graph includes rpc/bg/ss
namespaces, ObjectProxy/FileStorage/StreamPersist exports and prototypes, their
query/read/persist methods, GuidHelper/MessageDynamicData/HResult and the loaded
awaiter/task/delegate/exception/selector functions. This is reference custody,
not permission to call these functions.

Every present binding retains its effective data descriptor, flags, owner and
prototype chain, including the defining owner's prototype. Missing slots retain
absence through the end of their original chain. An accessor is never invoked.
The existing publisher guard checks this graph around the original acquisition,
its pending continuation and source-hash awaits. The original method/Promise is
unchanged: failure to capture does not replay or suppress ordinary application
acquisition. Once a lower continuation has been stopped by its existing guard,
its task stays pending; no synthetic rejection, cleanup or resolver follows.
The first actual lower/application rejection still wins later descriptor drift.

The frozen acquisition.loadedDefinitions receipt has complete=true only when
all listed operands were present. It always has closureIdentityQualified=false.
An incomplete receipt cannot be repaired by later publication. Workspace checks
the same initial constructors/prototypes/methods against its before-creation
snapshot. Packet repeats this linkage and the original publisher guard through
its existing relevant awaits. These receipts stay in the browser realm, not DTOs.

SOURCE and INSTALLED controls execute production publisher text and the existing
lower→Get→Set→workspace→packet→readonly composition. Node/Promise/WebCrypto/FS/
MessageChannel are real; Page/loader/native/Saltarelle/task/session are doubles.
The addressed suite also covers missing and late exports, accessor getter0,
namespace/constructor/method/flags/shadow/prototype substitution while pending,
post-success drift and six raw rejection values. All four authorities stay false.

Remaining concrete source seam: rpc.js publishes global.rpc.TBGObjectProxy at
1971 before ss.initClass at 4652; bg.rtl.rpc.js publishes FileStorage at 12367
before its initializer at 62670, and StreamPersist at 16518 before 89293.
The present snapshot does not witness those initializer calls or their IIFE
lexical environments. Matching function text and a static publisher-source pin
cannot prove hidden closure identity or the bytes executed by a loaded Page.
A fixed initial-module/initializer provenance capture is still needed before
closure qualification and the fixed provider binding to stock H0. No new loader
hook is claimed here. requireInvocation remains INVOCATION_UNAVAILABLE; original
RunCommand/control association alone does not qualify native receivers. Semantic
baseline/serializer/verifier and exclusive physical completion remain separate.
Native/login/model/acquire/Prepare/Save/Close/replay remain zero in this cut.
