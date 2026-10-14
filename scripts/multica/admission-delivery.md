# Private original child delivery (SOURCE component)

The producer is Linux-only. `private_child_delivery(decision)` accepts the active
original `_Decision` from this fixed `admit.py`, guards it before allocating, and
retains its original `_Claim`, receipt bytes, argv object/bytes, execution origin
and monotonic deadline. Claim-keyed process-local tombstones prohibit allocation
again after consumption, failure or disposal. No business criteria, public CLI,
model input, permission, SDK signal or native authority is added.

`admit.launch` consumes birth once and creates one actual `subprocess.Popen` with
the validated argv/cwd and the private helper's `locator_env` and `pass_fds`.
`bind_child` retains that exact Popen once. The original creator PID, kernel
parent PID/UID/starttime, original argv, current claim, validated inputs and both
original clocks are checked throughout the exchange. PID/starttime inspection
is a kernel operand bound to the retained Popen, never a serialized owner grant.
The boundary assumes trusted producer/child code; it is not a sandbox against
compromise of either process or hostile code running inside that realm.

## Closed reader ABI for Source68

The only locator is `LOGINOM_PRIVATE_ADMISSION_FD`, containing the inherited
O_CLOEXEC bootstrap read FD number. It has no scope or key in its value. The fixed
bootstrap reader removes the locator and makes the FD non-inheritable immediately,
reads one JSON line and closes it before RunCommand's first await. The private
line is `{format:"multica-private-child-v1", endpoint, key}`; key is 32 random
bytes encoded lowercase hex. Endpoint is a private 0700 directory/0600 AF_UNIX
socket outside business cwd. These bytes alone cannot authenticate a child.

All socket frames are bounded to 65536 bytes and newline-delimited UTF-8 JSON.
Duplicate fields refuse. JSON used for MAC is sorted by keys, ASCII-escaped and
compact (Python `json.dumps(sort_keys=True,separators=(',',':'),ensure_ascii=True)`)
with recursively equivalent encoding in the fixed Node reader. MAC is lowercase
hex HMAC-SHA256 of `ASCII(stage) + NUL + canonicalJSON(transcript)`.

1. Kernel-authenticated original direct child sends exactly `{format,nonce}`;
   nonce is 32 fresh bytes as 64 lowercase hex characters. SO_PEERCRED UID/PID
   must match the retained original child and current kernel starttime/parent.
2. Parent sends exactly `{transcript,mac}` with stage `challenge`. Transcript
   has `format`, `client_nonce`, fresh `parent_nonce`, original `origin_json`,
   `deadline_unix_ns`, and
   `argv_sha256` of canonical original validated argv. Child checks all bindings
   and challenge MAC. `origin_json` is the exact original canonical ASCII JSON
   string; `deadline_unix_ns` is its original integer as decimal string (use
   BigInt, never a rounded JS number). The flat transcript contains only ASCII
   strings, avoiding JS integer rounding or Unicode serializer differences.
   Origin is original durable provenance, not SDK authority.
3. Child sends exactly `{mac}` for stage `response`; parent guards original
   claim/both clocks again, verifies it and sends `{stage:"grant",mac}`.
4. Child sends exactly `{mac}` for stage `ack`. Parent guards original refs,
   claim and both clocks, then sends `{stage:"accepted",mac}`. Only this complete
   live exchange authenticates the producer delivery. `grant` alone is pending.
   There is no second transcript, retry, new budget or second child.

The reviewed c321 origin's `private_receiver=UNAVAILABLE` and `sdk_authority=false`
remain unchanged. A complete Python exchange qualifies only private producer
provenance to this child. Source68 must independently implement/check its fixed
bootstrap reader and same-process RunCommand/Request/session/SDK association.
Public env/JSON/receipt/FD/key/PID or copied context cannot substitute for those
original references. RunCommand and SDK signals remain distinct original objects.

## Settlement and failure

`settle_child` services the original exchange and drains that exact process in
foreground. Before ACK, EOF/exit/refusal/expiry/drift means unknown delivery and
an original exception; no durable `exited` is written. After accepted ACK, EOF
is channel disposal only: it never proves process completion. The helper still
checks the same claim, original inputs, original clocks and actual child until
ordinary `Popen.wait()` completion. Extra post-ACK bytes refuse as replay. Only
successful delivery plus proven ordinary exit allows the existing guarded
`decision.exited(returncode)`. A nonzero ordinary exit is recorded as nonzero;
there is no synthetic business/native success.

On failure, endpoints close to make the fixed fail-closed bootstrap exit normally,
then the same original child is drained. No kill, timeout-kill, restart, second
spawn, replay, claim release, SDK cancellation controller or native cleanup ACK
exists here. Context exit drains a child even if binding/handshake/caller fails;
first Python exception identity/cause is retained, secondary disposal refusal is
separate. Own temporary endpoints are removed only after original drain.

The fixed receiver must finish or exit ordinarily on bootstrap refusal/EOF. An
arbitrary executable that ignores this contract is unsupported. The helper does
not force its termination or turn an unobserved child into success. Installed
kit/catalog pins remain untouched; publication/reader receiving is a separate
reviewed step before any real model admission.

## Addressed SOURCE controls

`python3 -m unittest test_admission_delivery.DeliveryTest` from scripts/multica
uses real admission decision/claim/FS/profile lock/Popen/AF_UNIX/SO_PEERCRED/fork
and ordinary foreground exit. Candidate/resource evidence, kernel identity
substitution and injected IO/clock failures are labelled offline fixtures. The
fixed child is harmless Python, not Node/SDK/model/Loginom. No admit CLI command,
model spawn, installed reader or product build occurs. SOURCE tests cover actual
launch hunk, original one-use birth/child, missing reader, copied key/FD via fork,
wrong key/foreign peer, lost response/ACK, replay, claim/argv/PID identity drift,
initial/late expiry, wall rollback with expired monotonic budget, first/cause and
secondary disposal failure, and ordinary drain/no second launch. Closed c321
origin/metadata/whole product suites are not repeated.
