# Terminal content native input acquisition

Process: node-orchestration-v2 / MAS-artifacts-v1. This is a new fixed native
input result after accepted contract 44628a50, not another disposition contract.
Common source remains 1035f748. Import correction 872c77ce and Replacement
0f469ca7 are separate published cuts; this change touches no shared runtime.

## Acquired defining inputs

The immutable evidence includes full bytes, not only these hashes. Public static
GETs do not attach to an original Page or invoke any server method. The new RPC
paths are literal `bg.AddScripts` inputs in `bg/app/Uses.js:39,40,56`.

| Input under https://app.loginom.ai/app/ | SHA256 |
| --- | --- |
| bg/app/MainForm.js | d0b2324d7162816d675e52adc5a5674b46b635d516157ced799ea33690a3c42e |
| bg/app/Uses.js | 2b8598cddfd5f224b9e75806c9ba475cf1ff2ed6c37b599feb5b035be9a3dfb8 |
| bg/js/bg.model.rpc.js | 53d043e4a7ee9dcc8006aa8915ca43d83a1df427fa0d73d8ea403357ec61a28f |
| bg/js/bg.rtl.js | 052ec6039e68de03f2e34fea56c3e3ed8b7b0dddadb03281ff8d9a816e6e5dc9 |
| bg/js/bg.rtl.rpc.js | 11ac2c63d2e8162b974f57d14e0f4f57b19cc80d3d39797be377e22eced6a973 |

`scripts/node-acceptance/terminal-native-input-check.mjs` verifies four pins,
extracts unchanged fixed proxy bodies and exercises their actual state machines
with explicit Saltarelle task/transport doubles. Source Node and bundled Node
from reference a2e16c9b execute the same checker. Ten cases each pass: deferred
SaveAs reply, six raw transport refusals, own/non-own directory replies and
read-only OpenFile returning an original stream handle. Error has cause=0;
Exception.wrap is an identity double. This does not audit native exception wrapping.
Pending replies remain unsettled until their original continuation; successful
completion releases request/response. No original Page, serializer or filesystem
storage service is represented by these doubles. Native calls: zero.

## Exact residual operands and next acquisition seam

1. **Full original baseline:** MainForm:1219–1239 delegates to session SavePackage
   or app SavePackageAs. The server proxy `TIBGBaseDeductorServerSession.SavePackageAs`
   at bg.model.rpc.js:27380 dispatches method 1808 with package proxy type 893 and
   filename, then resolves null. No content bytes, version, parser schema or
   storage durability receipt is returned. The actual serializer implementation
   behind this server entry and its complete `.lgp` semantic coverage remain
   missing. Graph/property enumeration is not a replacement for that input.
2. **Candidate serializer interface, not a supported package provider:**
   bg.rtl.js:5207 defines `IBGStreamPersist.SaveToStream/LoadFromStream`;
   bg.rtl.rpc.js:89297 dispatches SaveToStream method 1291 with stream type 402.
   The package proxy at bg.model.rpc.js:76574 declares IBGModelPackage, not
   IBGStreamPersist. Dynamic interface support is not disproved by that declaration.
   Before registration, the existing private same-Page owner would need a
   read-only interface-support acquisition on the ORIGINAL package reference,
   plus the server serializer/schema/version and independently complete coverage
   specification. Do not invoke SaveToStream to discover support or assert that
   it is pure, complete or byte-compatible with SavePackageAs without that source.
3. **Saved artifact read without reopening the package:** `Session.FileStorage`
   is the real interface route. `TIBGFileStorage.OpenFile` at bg.rtl.rpc.js:63116
   dispatches 921 with filename/read mode/share mode and returns stream type 402.
   This is a concrete candidate for a fixed owner-private artifact reader; it
   does not open a model package. Missing inputs are the retained ORIGINAL
   storage/stream references, read-only mode and complete-length/EOF/close rules,
   `.lgp` parser/projection coverage and server completion/durability semantics.
   No getter, stream read or artifact download was invoked here. A stream handle
   alone cannot compare the saved bytes to the unsaved original.
4. **Personal authority:** MainForm:1625–1635 selects session FileStorage,
   CurrentDirectory/RootPath and CurrentUser.Name for URL formatting. Actual
   `get_IsOwnCurrentDirectory` exists: bg.rtl.js:4988 and bg.rtl.rpc.js:63849,
   method 910, returning a server boolean separately from root path method 911.
   The next implementable acquisition is to retain ORIGINAL session.CurrentUser
   and FileStorage and read this predicate/current directory/root as one guarded
   private acquisition before target selection; verify the exact target is in
   that proved owned directory. This input is not present in the existing
   terminal owner receipt. Name/path containment alone remains insufficient.
   Server meaning of ownership, write rights and account/session binding must
   be qualified; IsOwnCurrentDirectory does not certify every subdirectory.
5. **Conflict and durability:** SavePackageAs has exactly package/filename
   operands, no conflict-policy or fsync receipt operand. A separate FileExists
   check cannot establish atomic conflict_policy=fail. Qualification needs the
   existing server SaveAs collision/exclusive creation semantics for that exact
   entry, and its physical completion/durability predicate. No new native opcode
   or speculative pre-created target is proposed.

The baseline/verifier/personal-authority provider cannot be registered from the
acquired proxy definitions: the serializer/schema and original interface-support
and storage operands above are still unqualified. Terminal dispatch stays refused
before Save. The next code step can retain/read original supported interface and
owned-directory facts in the existing private Page route, after the fixed
serializer/coverage source is supplied; it must not claim a complete baseline or
durable content proof from these replies. Original signal/absolute deadline,
pending/writer/inventory and same-owner guards remain prerequisites to that step.

No runtime change, new build, supported-provider/native/receiving PASS or terminal
Save/Close/logout/release result is produced. The reference product is used only
as an exact bundled Node checker environment. The eight closed source-blob audit,
unsaved boundary, old contract suite and adjacent Import/Resource68/Replacement
tests were not repeated. Future full SOURCE/INSTALLED qualification remains a
separate transition after the missing input is obtained.
