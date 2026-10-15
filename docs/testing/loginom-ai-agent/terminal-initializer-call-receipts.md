Bounded CODE/OFFLINE original initializer-call custody, from accepted `92ebb607`.

The existing initial publisher wrapper already captured the selected initializer,
constructor, assembly and member table. The new receipt pins their call boundary:
before Reflect.apply, it holds the actual wrapper arguments object, all its own
descriptors/flags and prototype, original delegate function and constructor
function prototypes, receiver, ordered operand refs and ordinal. Numeric arguments
are read only as data descriptors. The original delegate is applied once with
that exact arguments object as its array-like input. No argument DTO reconstructs
it. A frozen completion is created only after normal original return and refers
to that same pre-call receipt and returned value. Raw original Error/falsy throws
remain primary; failed calls cannot publish a complete initializer set.

The three selected calls are ObjectProxy in rpc.js, FileStorage and StreamPersist
in bg.rtl.rpc.js. The existing script-node/SRI/currentScript and original member,
constructor-publication, assembly and lifetime guards remain. New call checks
also reject changes to argument flags/prototype, original function prototypes or
operand identities. Late constructor aliases cannot replace a retained call.
The collector retains the same call/completion objects from the original frozen
records and checks their initializer/receiver/ctor/assembly/members/base/interfaces
and original argument values. Precreation initial custody carries the same three
call and completion refs, so packet/component/storage use the same original
records. Host projection contains neither argument objects nor native call refs;
a copied packet/DTO cannot obtain original packet membership.

The new `^initializer call` VM controls verify tuple/completion identity through
the existing packet/control/storage route `[0,907,909,910,911]`, writes zero,
getter-blind pending drift, argument flags, late alias, copied packet/DTO and six
raw original throws. Constructor, assembly, DOM, native, SDK and dispatch-task
remain labelled doubles in those controls. Negative initializer fixtures are
explicitly labelled and do not qualify real native execution.

A separate new Chromium control executes unchanged complete IIFEs and observes
all three call receipts from the actual script nodes, the same native class and
member-table refs, one original JSHandle and 23 verified request/fulfills. Page,
DOM, SRI, IIFEs, request/frame/fulfill and JSHandle are real. Root/PID/admission/
account, fetch/body adapter, user/session and remote method-7 response are offline
doubles. This is not a native Loginom acquisition or a UI creation control. The
initial browser file-not-found preparation log is preserved; the control runs
only after fixture generation has completed.

closureIdentityQualified and nativeReceiversQualified stay false. The existing
callee-pair scope is unchanged; this does not qualify its broader environment.
sourceExecution/sourceBytes/nativeReceiver/four authority flags remain false.
NATIVE_LEXICAL_QUALIFICATION_MISSING and stock H0 refusal remain. No native/login/
model/acquire/Prepare/Save/Close/replay, new timer/controller/budget, public API,
module loader, callback input or source rewrite is introduced. Closed extra15,
forward16/birth26/52/H0/ordinary/SRI/boot/86/76 matrices are not rerun.
