## Bound activation: unresolved callee identity seam

The next requested predicate is an activation of the exact original function returned by retained `ss.mkdel`, invoking the exact delegate with precreation FileStorage and dispatching within that activation. The accepted runtime at `96c1de0e61413f9411176d7e198b821723e37fb4` does not observe this predicate. No runtime qualification is added here.

The new diagnostic executes complete pinned `mscorlib.js` and `Task.js` in one VM. It never reads `_targets`, edits vendor bytes, performs native Loginom operations, or changes the existing packet/control route.

The controls show:

- A direct call of the original returned function bypasses its own `call` and `apply` hooks. Delegate receiver and outcome stay correct.
- An owned `delegate.apply` hook can observe the exact delegate, receiver and a synchronous fixture dispatch. An explicitly substituted function that directly calls that same delegate through `apply` produces identical hook observations. A Proxy callee does too. These are negative substitutions, not permitted implementations or new original refs.
- In this pinned strict IIFE, reading `caller` or `arguments` of the returned function during execution throws TypeError. It supplies no original-function activation receipt.
- Wrapping the delegate before passing it to original mkdel changes that operand. Returning a wrapper or Proxy instead of the exact mkdel result would likewise change the callee. Neither proves the requested predicate.

Relevant defining source is `mscorlib.js:2103–2130`: the returned function directly calls `targets[1].apply(targets[0], arguments)`. The original storage methods synchronously call their local `$sm()` after mkdel returns. Reading `_targets`, function text, stack labels, and inferring invocation from a prior mkdel receipt are not activation identity evidence.

This is a bounded counterexample to qualification through the currently examined JavaScript hooks, not a proof that engine-level instrumentation could never observe the call. No existing CDP/Debugger function-call observer was found in the current client/lib or runtime/src route. Such an observer would be a separate implementation cut requiring custody before the first activation, exact function identity, original control/deadline and descriptor/raw-failure guarantees; this diagnostic does not supply it.

The concrete review question is: which supported pre-call observation seam can distinguish the exact original returned callee while preserving both returned and delegate identities? If a separate fixed observer is necessary, define that minimal cut rather than qualifying the delegate.apply counterexample. The original bound predicate and `NATIVE_LEXICAL_QUALIFICATION_MISSING` remain open; stock H0 must continue refusing.

Validation is four new diagnostic controls on source Node 24.19.0 and the Node executable in the accepted mkdel product. This is not an installed runtime/packet acceptance run. No new product build, native/model operation, or repeat of the closed matrices is performed. Current mkdel and previous receiver products are retained.
