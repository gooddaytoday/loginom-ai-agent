# Original admission: private same-child delivery boundary

Status: proposed producer delivery cut, NOT_IMPLEMENTED / reader NOT_QUALIFIED.
This is the next producer-to-reader boundary, not a repeat of the closed c321
birth audit. No production file or installed kit is changed by this document.
No model/admit --launch/native operation is required to review the proposal.

## Selected source and write map

Receiving HEAD 24699d538af584f9f286bc585d3e1bdfa81bcbbf; previous e423;
fresh remote shared-oauth 1035f748392fccebbf5c106800e92c7f2afcadcd.
All seven selected receiving files below are byte-equal to e423. Production c321
admit.py is externally pinned to 3f4bf9045d77969085e70ec8121150d9d151ecaf56bef11958cce57839a48406.
The authoritative installed kit is c321-producer-handoff79-v1, a mixed release.

Source67 owns proposed scripts/multica/admit.py:launch and a fixed private
scripts/multica/admission_delivery.py helper. Source68 owns the downstream
private bootstrap/RunCommand receiver and in-process prompt/SDK context after
that producer cut is reviewed and sequenced. Neither writer edits the installed
kit. Host/managed/carrier and Source70 H0/H1 remain outside this cut.

Current c321 admission_decision captures original _Claim/open inode, validated
manifest/argv, explicit requirements.business_execution_seconds (1..7200), one
absolute deadline and one monotonic bound. consume_birth consumes once. But
launch:257 uses subprocess.run without pass_fds or a private receiver. No child
can currently authenticate that live decision. Receipt/JSON/FD/PID/env labels
alone must continue to refuse. The absent symbol is private_child_delivery;
it is proposed here, not an existing supported import.

## Closed producer signature and lifecycle

private_child_delivery(decision) accepts the actual active _Decision object,
not an origin DTO. Before allocation it calls before_spawn(), retains the exact
_Claim, _Decision, original argv/spec bytes and existing absolute/monotonic bounds.
The context owns one private bootstrap endpoint and one exact Popen handle.
pass_fds contains only this launch's endpoint; locator_env adds only its private
FD locator, never a secret or scope in public argv/model input. This selector
is not authority. Child marks the inherited endpoint non-inheritable immediately
and consumes/closes it before RunCommand's first handler await. No public option,
PromptInput field, tool flag or reusable receipt entry is introduced.

A concrete Linux implementation can use an O_CLOEXEC anonymous bootstrap pipe
plus a per-launch mode0700 private AF_UNIX endpoint outside business cwd. The
bootstrap carries a random one-use key and endpoint discovery privately. The
parent retains the sending endpoint, key and decision until settlement. Exact
Popen binding is fixed once; parent authenticates each accepted connection with
SO_PEERCRED uid/pid == its direct original child handle, and process-exit/current
launch checks. A challenge/transcript MAC from the retained one-use key binds
that live exchange to exact validated argv/candidate/task/inputs/requirements
hashes, original claim generation and original absolute deadline. A copied
locator, origin JSON or receipt cannot answer a fresh live producer challenge.
A foreign/forked child with copied bytes fails kernel child identity. This is
same-process provenance for the trusted private bootstrap, not a sandbox against
compromise of producer/child or a native owner credential.

bind_child(child) is called exactly once immediately after Popen and retains
that Popen object, not a reconstructed PID. No retry after consume_birth,
spawn/handshake loss or UNKNOWN. The parent guards live claim and both original
clocks before challenge, before publishing the response and before accepting
original child ACK. Neither party recomputes birth/deadline from current clock.
The child verifies the live challenge/MAC and exact local RunCommand binding,
then retains a private branded origin record before handler dispatch. Duplicate
handshake/request returns the same original outcome or refuses; no packet2/key2/
spawn2 or later deadline. No rebind after unknown effect or endpoint loss.

settle_child(child) services that original channel while waiting for the same
child's ordinary process completion; it never spawns, kills, replays native work,
ACKs host cleanup or calls decision.exited on a synthetic success. Original
channel failure is retained with its first exception; child completion and
transport disposal are separate. Lost child/channel outcome remains UNKNOWN.
No context manager may hide an active child or let it outlive run-owned foreground
work. Error during binding/handshake still drains the original child through its
normal fail-closed bootstrap exit or proven ordinary exit, not kill/timeout.
Failure to prove exit retains the exact claim/custody boundary; no release claim.
The helper closes only its own endpoints after original drain. Existing claim
history/lock and decision.exited durable FS ordering remain intact.

A finite exchange/dispatch is bounded by the ORIGINAL parent monotonic deadline.
Child local wall-clock checks alone are insufficient under rollback: use the
same live parent guard before admissions and retain original duration consumption,
not Date.now()+timeout. An expired parent refuses and uses existing cancellation
linkage; it does not create a new SDK AbortController or force process exit.
The original RunCommand cancellation signal is captured separately in the child.
It is not the later SDK ToolExecutionOptions.abortSignal.

## Required child and SDK seams (after producer agreement)

run.ts handler:266 must retain actual args/request and standaloneCancellation()
before its first Effect.promise/yield. Bind the live origin to that original
handler creation and local session sender only; attach/mini/remote HTTP or legacy
standalone without the channel stays ordinary and cannot mint terminal scope.
command:919/prompt:938 need a PRIVATE same-child association, not public schema.
Local fetchFn:1044 creates Request twice; original association must move by a
fixed private helper to the actual Request before Server.Default().app.fetch.
A WeakMap keyed to a pre-JSON args object alone would lose the scope here.

Session HTTP handler must extract only that private in-process Request association
into the existing Effect/session route. PromptInput:1546 stays unchanged. One
prompt-message/session creation is bound to one original RunCommand origin;
command->prompt follows the same original reference. This may require a narrowly
sequenced local session-handler context hunk, not a public HTTP header/token.
Retain context through processor creation/prompt:1265 and llm:280 streamText
experimental_context; never put origin in model messages or serialized parts.
SessionTools tools.ts:566 captures genuine options/toolCallId/request/raw SDK
signal synchronously before run.promise/plugin/permission/host awaits. SDK signal
is distinct from RunCommand signal and both keep their original refs/reasons.
Known-creation guard precedes mutable name/kind/ID classification; repeated exact
creation returns same record/Promise, distinct creations are separate but share
the original unextended business bound. Copied experimental_context never mints.
Terminal-purpose selection requires a fixed private admitted policy at the
actual terminal tool creation; Union canonical-kind/startup scope cannot relabel.
Source67 acquired owner/currentness/purpose carrier remains the next prerequisite.
All native/Save/Close/release authorities stay false.

## Proposed shared hunk, not applied

This patch applies only to pinned c321 source. The fixed helper is a REQUIRED
unimplemented dependency; applying this patch alone is forbidden. Registry must
sequence Source67 implementation/review before Source68 receiver runtime writes.

```diff
--- a/scripts/multica/admit.py
+++ b/scripts/multica/admit.py
@@ -14,6 +14,7 @@
 
 from artifacts import verify_build
 from supplement import DeliveryError, save
+from admission_delivery import private_child_delivery
 
 
 def digest(path):
@@ -254,9 +255,16 @@
             LOGINOM_AI_AGENT_EXPERIMENTAL_WEBSOCKETS='false')
         # No origin JSON/env authority is delivered to the unsupported reader.
         # Do not kill a resource-owning CLI on timeout or retry on failure/UNKNOWN.
-        result = subprocess.run(decision.consume_birth(), cwd=spec['cwd'], env=env, stdin=subprocess.DEVNULL)
-        decision.exited(result.returncode)
-        return result.returncode
+        # Proposed only: fixed private helper must satisfy the receiver contract.
+        with private_child_delivery(decision) as delivery:
+            argv = decision.consume_birth()
+            child = subprocess.Popen(argv, cwd=spec['cwd'],
+                env=delivery.locator_env(env), stdin=subprocess.DEVNULL,
+                pass_fds=delivery.pass_fds)
+            delivery.bind_child(child)
+            returncode = delivery.settle_child(child)
+            decision.exited(returncode)
+            return returncode
 
 
 def main():
```

## Acceptance of the eventual composition

Use an isolated real producer/child process fixture, no admit --launch/model.
Prove kernel child binding + fresh MAC + retained live claim + pre-await original
RunCommand and SDK refs; distinguish named SDK/model/native doubles explicitly.
Address missing/legacy/copied endpoint/key/foreign pid/fork/replaced claim/argv,
initial and await drift, expired/rollback/abort, pending join, lost original reply,
raw first Error(cause0)/undefined/null/false/0/empty plus secondary, once-only birth,
same-creation reuse/distinct calls and no budget extension. No second spawn or
SDK/native dispatch after refusal. Test ordinary/Union guards without rerunning
closed43/c321 source/full audits. Runtime changes require a new clean exact product
and actual installed producer->reader hooks, not old bfac or expression-only PASS.

This result verifies a source map and patch applicability only. No supported live
private channel, positive reader, SDK delivery, installed reader, carrier/native
or full-node acceptance is asserted.

## Exact selected file pins

```json
{
  "receiving": "24699d538af584f9f286bc585d3e1bdfa81bcbbf",
  "prior": "e42325399a10cb912df5fa39a18d6ff44f95235b",
  "producer": "c3211b9fe63f3e207b8de804a1a4bc8ff7ae06f0",
  "shared": "1035f748392fccebbf5c106800e92c7f2afcadcd",
  "files": [
    {
      "path": "packages/agent/src/cli/cmd/run.ts",
      "sha256": "0888524d7f6d5ed325c330b05f7c45bd5612865d10de94e8fe524cac9a85e4fd",
      "bytes": 37077,
      "same_as_e423": true
    },
    {
      "path": "packages/agent/src/cli/standalone-cancellation.ts",
      "sha256": "aab9728415f8f05cfd7b48b39f673955805fa6b77b0d3e4693807abf144e0695",
      "bytes": 678,
      "same_as_e423": true
    },
    {
      "path": "packages/agent/src/session/prompt.ts",
      "sha256": "53074e749117bd0187c68a056a36e3610747e2049c2db6b1aa8a28f9ba578231",
      "bytes": 67656,
      "same_as_e423": true
    },
    {
      "path": "packages/agent/src/session/llm.ts",
      "sha256": "442bd50dad17ea5f9058ca732947234fcc48e56765f64c51f02e9ffe1cac01b6",
      "bytes": 15155,
      "same_as_e423": true
    },
    {
      "path": "packages/agent/src/session/tools.ts",
      "sha256": "445721a06671df75c3004bf76c21257ce649cd7a48968e5a005bca1622f954a3",
      "bytes": 30170,
      "same_as_e423": true
    },
    {
      "path": "packages/agent/src/session/union-invocation.ts",
      "sha256": "ee88622dcf6ee8df73ba45b365bc8c4a3dc4d240255ed96d8c59121fc37be65b",
      "bytes": 127,
      "same_as_e423": true
    },
    {
      "path": "packages/agent/src/server/routes/instance/httpapi/handlers/session.ts",
      "sha256": "eb512bd403312d980413b0932b68bad35c07fc181d0457198aba9ec386b0ccfc",
      "bytes": 17537,
      "same_as_e423": true
    },
    {
      "path": "scripts/multica/admit.py",
      "sha256": "3f4bf9045d77969085e70ec8121150d9d151ecaf56bef11958cce57839a48406",
      "bytes": 15328,
      "source": "c3211b9fe63f3e207b8de804a1a4bc8ff7ae06f0"
    }
  ]
}
```
