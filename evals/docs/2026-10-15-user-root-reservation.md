# Native user-root reservation

Parent preparation RED: `reconcileUser` created/configured a blocked account and
reconciled ACL, then `prepareUserStorage` rejected an existing directory with
`USER_STORAGE_OWNERSHIP`. The old publication implementation (`cce47aa1fc`)
required exclusive mkdir after account creation. Its data-only account fixture
could not expose this native ordering defect; no earlier known-good composed
native execution exists, so history bisect would not identify a regression.

Retained RED fixture: `/tmp/evals-parent-prepare-XnBhbF`, nonce
`910f1d39-4eb8-48d7-ab98-aff3c25897cc`, Server
`722e3d356803392959624c9bab58d40e3e66b560660f8b6c957e095459321b83`, Studio
`dcee92dd8842f85da5853b30557a1743180f50692882b8783bf4e6b7781232a7`.
Three independent read-only observations agreed: `/workdir/UserStorage/eval-a`
was empty, device232/inode209474242, UID/GID0:0/mode0755. Its birth timestamp
01:33:58.343 UTC follows blocked-create acknowledgment01:33:58.246 UTC; container
start was01:33:43.299 UTC. Docker diff lists the root as added; there are no
workdir mounts, and the same-image permanent research pair has no such root.
This establishes creation during native preparation, not the exact backend
operation responsible for mkdir. Journals and reservations remain retained;
no filesystem adoption or incident cleanup was inferred from emptiness.

The fix reserves the absent physical root before native account creation, under
held normal slot/server leases, private preparation intent and verified pair.
A private planned→created reservation binds nonce, identity and physical inode.
Existing unowned roots and planned-only ambiguous mkdir outcomes still fail.
The parent first reads native users, preserving the existing name-conflict
path; immediately before dispatch it verifies the reserved inode again.
Publication then binds that same inode to the confirmed native account source
and updates the marker through the existing atomic publication protocol.

The composed native test uses a fresh disposable pinned pair and the real
parent bridge. It checks blocked creation/configuration/ACL, physical root
identity, repeated account/secret reuse and passwordChanged true→false. Native
admin transport disconnection and process capture must be confirmed before
test-only finalization and factory destruction. That test finalization does
not qualify production cleanup of activated users or retained incidents.
Successful redacted evidence is saved under research/evidence/native-parent-*.

Verification: targeted native composition1 PASS/11 assertions (34.37s), native
storage publication1 PASS/21 (34.18s), related unit98 PASS/384 across5 files
(6.47s), bun typecheck and git diff --check PASS. The final composed native
regression including name/fence and disposed-context controls is recorded in
the canonical execution plan: 3 PASS/56 assertions (55.85s). Full harness/model/judge acceptance was not run.
Public prepare/verify/recover, effective evaluated-user access, SessionBackup
and activated-user cleanup remain open.
