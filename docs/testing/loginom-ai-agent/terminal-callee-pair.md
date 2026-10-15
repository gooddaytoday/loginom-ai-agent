Bounded CODE/OFFLINE constructor pair qualification, from accepted `304b78a1`.

Before creation the existing capsule retains the published Task and
TaskCompletionSource function objects, their own prototype descriptors and the
original Task.continueWith. For one invocation on the retained primary task,
it temporarily changes only those two own prototype values to distinct frozen
marker objects inheriting the original prototypes. It calls the retained
continueWith once. The existing task-assignment setter observes the actual
secondary source and born task: their immediate prototypes must be exactly the
two markers. The returned object must be that born task, with status 3.
Changing namespace slots to different function objects, even sharing the old
prototype, cannot produce this observation from the lexical callee.

The original function descriptors and both observed instance prototypes are
restored before returning or throwing. Only exact owned descriptors and marker
prototypes are restored; a foreign descriptor/prototype is left untouched and
refuses. Raw first Error/falsy stays primary over a restoration refusal. The
instance restoration intrinsic is retained before creation, so a late accessor
is not invoked. The original guard synchronously suspends these prototype
patches alongside the existing native overlays while inspecting the unchanged
publisher, then reapplies them. No await or extra constructor invocation occurs
inside this window. Invalid/missing/nonwritable definitions cannot qualify it.

The frozen continuationBirth receipt now has sourceConstructor/taskConstructor,
sourceMarker/taskMarker and lexicalCalleeScope
`Task.continueWith:TaskCompletionSource/Task`. Its
`lexicalCalleeIdentityQualified:true` applies only to this pair on this call.
The same task/source functions, original descriptors and instance prototypes
remain guarded afterwards. Missing Task still has observed:false and a false
qualification. Forwarder closure qualification remains separate and false.
The broader sourceExecution/closure/sourceBytes/nativeReceiver and all four
authority flags remain false. NATIVE_LEXICAL_QUALIFICATION_MISSING and stock H0
refusal remain: this pair does not prove the rest of the native environment.

The new `^callee pair` controls run whole pinned mscorlib.js and Task.js in one
VM. They verify markers, exact returned task, native status 3→5, restoration
before return/throw, six raw throws after original birth, foreign descriptor
preservation, same/different-prototype namespace aliases, pending and pre-call
drift, and the original packet/control/storage route `[0,907,909,910,911]`,
writes zero. One changed assertion in the earlier birth positive reflects the
new local predicate; that closed matrix is not rerun. Page/session/native/SDK/
PID/catalog and dispatch-task remain doubles; Node/VM/Promise/AbortController/
FS/MessageChannel and pinned class functions are real. Negative continuation
wrappers are test instrumentation. No native Loginom/login/model/acquire/
Prepare/Save/Close/replay or broader stock exposure is added. Closed extra15,
forward16, birth26, 52/H0/ordinary/SRI/boot/86/76 are not repeated.
