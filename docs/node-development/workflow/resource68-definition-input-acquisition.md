# Resource68 original definition input acquisition

node-orchestration-v2 / MAS-artifacts-v1. This independent CODE/OFFLINE source-input
component does not register a supported Resource68 producer. It narrows the
specific definition entry and the next implementable private acquisition seam.
Common base1035f748, Import8c0c6ff3 and terminal44628a50 remain separate.

## Actual source obtained

Retained MainForm.js is 112459B / SHA256
d0b2324d7162816d675e52adc5a5674b46b635d516157ced799ea33690a3c42e.
MainForm.PrepareRequired:1355-1356 calls bg.RequireClass for bg.app.MapTreeForm
and bg.app.TabForm. MainForm.AddTab:1368 awaits the ORIGINAL TabForm.SetMapTree;
the following lines bind original FMapStore and OnChangedNode. Calling another
SetMapTree later is not this original await.

Retained Loader.js is 14073B / SHA256
543fc4c07ef270ab55f1055fcaf97f8f471d308a0877a3b3aef029ac0fa61f3b.
Loader.InternalRequireClass:270-285 reads Ext.ClassManager.get or calls
Ext.syncRequire, then returns the actual constructor. Its private LoadedScripts
table and load callbacks are not exported. Do NOT call RequireClass to synthesize
an observation: that may load/initialize new code.

Retained Uses.js is 5070B / SHA256
2b8598cddfd5f224b9e75806c9ba475cf1ff2ed6c37b599feb5b035be9a3dfb8.
Its actual script list names bg/ext/Lock.js:88. An unauthenticated static GET of
https://app.loginom.ai/app/bg/ext/Lock.js returned application/javascript,
22738B / SHA256 e321d140d5da0ef14ab24435e9a6562c1042f2e5f789424de6d1c3dfa2af23bd.
This is acquired public source, NOT proof of bytes loaded on an original Page.

Lock.js:460-478 defines the exported bg.LockDeferred and closes over the actual
GetLockDeferredDefault function and LockDeferredDefault cache. The helper creates
its default decorator on first call. Neither lexical binding is publicly exported.
Lock.js also closes over OptionsSymb/PrepareMethodFunc/MethodLock in the defining
CreateLock realm. Calling a decorator to make a new default would change state;
it cannot recover an original default or original completion promise.

The named Uses.js dependencies bg/ts/Promises.js and bg/lib/Exceptions.js were
retrieved, along with bg/lib/Message.js and bg/ext/errormessage/ErrorMsg.js; none
defines LockedSessionCatch. No closure-defining source entry for that symbol is
established by these inputs. MainForm:1571 uses it but does not define it. Do not
guess a URL or treat the use site as its defining source.

## Addressed controlled checks and next internal seam

The attached fixed input checker loads these exact Lock.js bytes in an own VM.
It holds the original exported function, rejects identity equality with another
realm's function, and proves the lexical getter/cache are not ordinary globals
or bg properties. It never invokes LockDeferred or any initialization method.
The transpiler __extends helper is a declared double; VM is not native Page.

The second checker uses real own-process Node V8 inspector Runtime.getProperties
to retain the function's internal [[Scopes]] reference and ORIGINAL lexical
GetLockDeferredDefault function reference without function invocation, toString,
source rewriting, or returning the function by value. It observes the default
cache as undefined before first invocation. Inspector has no listening socket;
references remain private and its object group/session is released at completion.
This proves a concrete offline handle acquisition primitive, NOT its supported
behavior on the pinned original Chromium Page or original native load tuple.

Next implementable internal acquisition seam: install an original-owner private
CDP session at Page creation BEFORE loginPage.goto and before the native loader
can define/start the relevant modules. Retain actual scriptParsed/script source
and execution-context provenance, then qualify fixed export/function scope handles
on that SAME Page/document/session. Source bytes/contexts/object groups are private;
no public opcode, Page/callback/module path or serialized raw refs are introduced.
The installer must bind original run/lease/generation/chat/account/owner/Page/
context/gate/signal/absolute deadline and refuse late install/substitution/pending
completion. Ordinary context capture or a post-login CDP attach is insufficient.

Playwright documents context.newCDPSession(page); CDP exposes scriptParsed,
getScriptSource and getProperties/internalProperties. [[Scopes]] discovery and
its retention/release behavior must still be verified against the pinned Chromium
and original function/context, not inferred from Node inspector success:
https://playwright.dev/docs/api/class-browsercontext#browser-context-new-cdp-session
https://chromedevtools.github.io/devtools-protocol/tot/Runtime/#method-getProperties
https://chromedevtools.github.io/devtools-protocol/tot/Debugger/#event-scriptParsed

## Exact remaining inputs

Needed next are native defining SessionsManagerForm/TabForm/MapTreeForm bytes and
Ext loader/class-to-actual-request/export identities, the defining
LockedSessionCatch module and lexical dependency refs/pins, and original
Dispatcher initialize/ChangeNode/refresh/autoUpdate/select promise refs retained
at their actual creation. MainForm/Loader/Lock sources above narrow the load and
lexical entry; they do not supply these missing inputs or original native owner.
The old Resource68 fixture uses bytes `explicit OFFLINE module/closure ...` and
`offline dependency source`; those six hashes remain fixture pins only.

No speculative provider registration or borrowed openRead is added. The accepted
consumer scope.inputs/token/initialization ABI remains unchanged. Original native
completion/refusal/falsy/deadline/overlap/terminal-before-finish control matrix is
not claimed passed by these two source-input checks. Existing SDK/facade/adapter/
FP/static applicability suites are not rerun. No runtime change/rebuild, native
Page/login/observer/initialization/read/Save/model/replay/attach is executed.
Source/provider owner remains LAB68; integration stays sequential after the
existing shared cuts, with original-generation39e1 work owned by LAB69.
