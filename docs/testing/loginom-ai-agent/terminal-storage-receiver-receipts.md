## Scoped FileStorage receiver receipts

The fixed in-capsule invocation boundary retains its actual `this` before applying each retained original `get_Connected`, `get_CurrentDirectory`, `get_IsOwnCurrentDirectory`, and `get_RootPath`. It requires reference equality with the FileStorage captured before creation, the same initial storage reader table, and the original packet. No caller can supply an alternative receiver.

The original transport dispatch records a frozen receipt connecting that call to its actual request, receiver, method, initial custody and packet. Only this receipt has `nativeReceiversQualified: true`, scoped to `FileStorage.<method>:dispatch`. The pre-call receipt and all broad native/closure/authority predicates remain false. This is a receipt for the fixed invocation boundary and transport dispatch; it does not claim access to the original method's own JavaScript arguments frame or hidden lexical environment.

Receipts remain in the capsule and the private same-realm provider inspector. Host DTOs do not carry them and cannot mint qualification. The existing packet/control storage route, task/reader/continuation guards, raw first rejection behavior, no-replay behavior, and stock H0 refusal are preserved. `NATIVE_LEXICAL_QUALIFICATION_MISSING` remains the route outcome.

Targeted CODE/OFFLINE controls named `storage receiver` cover the exact four receivers and original methods, packet/initial linkage, copied provider/packet/storage/identity refusal, pending accessor drift, and raw Error/falsy precedence. The positive uses pinned mscorlib/Task in one VM on the existing route with calls `[0,907,909,910,911]` and zero writes. Page, native Loginom/session/SDK/transport and dispatch tasks remain doubles; no native operation is performed.
