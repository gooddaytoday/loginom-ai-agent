Original standalone RunCommand control — CODE/OFFLINE boundary

Producer: `standalone.ts` selects the existing `run` command; `withStandaloneCancellation` creates the original AbortController and one frozen signal/deadline binding before `executeProfile` acquires a profile or starts the host. The established run bound is 7200 seconds. Startup, SDK and tool calls cannot reset this deadline. Providers/auth/models retain cancellation without a run deadline. Concurrent root admission refuses before replacing the foreground binding.

Consumer: the existing noninteractive RunCommand interruption path observes this same signal and invokes its existing deduplicated session.abort. Its listener is removed in its own finally. Registration currently follows event subscription; pre-subscription cancellation is checked after subscription returns. This cut does not prove cancellation of a pending subscription or interactive RunCommand.

The producer retains its binding through foreground cleanup/profile release. Deadline expiry aborts the original controller; it does not manufacture a cleanup receipt, terminate processes or clear writer/UNKNOWN records. Raw callback rejection, including false/null/undefined/0/empty string, propagates unchanged. The binding is private and has no CLI/JSON input field.

Missing next inputs: original typed creation/request and this control must reach managed per-call acquisition and stock dock_prepare without reconstruction. Current managed-entry makes a new per-tool controller and local timeout; original-prepare-lender.requireInvocation still refuses. Original loaded-source/closure qualification and semantic/physical completion remain separate. No H0/native/Save/Close authority is supplied here.

Tests execute compiled production producer and the fixed RunCommand interruption fragment with controlled time/process and SDK doubles. AbortController/Promise and compiled functions are real; this is not native/model execution. The previously published standalone-owner-finally fixture omits auditRefused from its VM environment and fails unchanged on the accepted parent; preserve that independent FAIL.
