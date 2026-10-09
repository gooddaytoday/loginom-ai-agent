# Finite readback proposal and current boundary

Status: **source adapter NOT_IMPLEMENTED / no live activation**. The parent
attached to the already open owner Chrome Admin tab on Mac and performed a
complete calibrated Dispatcher refresh without a new browser or Loginom login.
The existing owner tab/session is preserved. LAB53 does not search mas for a
browser or create another observer.

Published normalized receipt: shared-oauth docs commit
`541e17e34aad7a39100aad07541884c3cfd48e0d`,
`docs/testing/loginom-ai-agent/reports/2026-10-08-node-recheck/existing-admin-mac-readback.json`,
SHA256 `c133704943beec586ec87565b75cbe9ef0ea8b9891154cbc318bbcdfd03c09cd`.
It records Count8/roots8/nodes10, complete session and two package proxy matches,
unique connected mstSelf3123 and observer3119 absence at that observation time.
This is historical calibration, not acceptance of this candidate or a reusable
post-operation absence receipt. LAB45/LAB48 remain NOT_RECONCILED.

The bounded source-backed option is to use that **already connected Admin tab**
for the final independent readback. Attaching to that exact existing tab, or
owner-assisted readback in it, must not instantiate a new Loginom application,
open another login tab or create an observer session. Its pre-existing ownership
and session identity are recorded separately from all task-created effects.
The parent can perform a fresh readback for a future operation. The accounts
candidate has no admitted transport or receipt importer for this view.

1. Identify the owner-authorized device, browser/profile and exact connected tab.
   Establish observer identity and its connected unique mstSelf/RemoteGUID
   positive privately; verify the stand and account. No username-only ownership.
2. Use the standard Dispatcher refresh, with complete cached manager/store/count
   equality, package traversal and refresh completion. Capture the observation
   privately; publish only normalized counts, target bindings and hashes.
3. For LAB45/LAB48, no numeric session binding was captured. An empty account
   bucket in a complete calibrated inventory may establish absence. A nonempty
   bucket is UNKNOWN until exact ID/CreateTime/GUID ownership is available; it
   never authorizes closing by username.
4. Observer3119 has its retained exact ID/CreateTime/GUID binding. Only its owner
   may reconcile a present disconnected/packages0 row with standard Close and
   confirmation; a fresh complete inventory must prove absence afterward. LAB53
   does not change other cards' markers or sessions. Owners archive histories
   only after server/process/FD proof with current config/lock identities.
5. For new approved preparation, every task-created worker/reviewer/admin effect
   requires rights/identity, UI logout, exact process/FD shutdown and final
   server absence read from the same pre-existing Admin view. Keeping that
   pre-existing owner session open does not create a new task-owned verifier
   effect. No verifier-chain is started. If the view disconnects or cannot be
   positively calibrated, stop; do not relogin automatically.

The actual operation cannot start until the complete adapters and lifecycle are
qualified and independently reviewed, including fresh post-operation readback.
Both public gates remain unconditional. This does not relax any acceptance
criterion. It also does not claim all possible methods are impossible. A
supported server inventory/journal without a new Loginom session would be an
alternative if the owner supplies its existing authorized access.

## Source evidence

These are read-only client snapshots from LAB47, independently rehashed for
LAB53. Raw bytes remain private; this document records only method names,
line references and file digests.

| Client source | SHA256 | Relevant behavior |
| --- | --- | --- |
| `bg_app_Application.js` | `1b922bfff58f5d71ab08bc25b3198da17ae2a4d2a7ce4c034265aca9de15bc78` | LogOut:570–578 invokes DoDisconnect; this is UI/transport disposal. |
| `bg_app_ServerConnection.js` | `4c8203aa04050c45f55f2dfec76ef65d93b056a9cbe092419a9bbea821e0c5a6` | Dispose:304–313 clears references and calls Finalize. |
| `bg_ts_CustomClient.js` | `feb12b9040f155e581531b9796066de0c2fc65d23cfaa19fcbb7028af27e58de` | Finalize:39–44 calls connector.Disconnect, without independent inventory. |
| `bg_admin_SessionsManagerForm.js` | `e70ccf4d0cf4e37b87c149c08bc3a46c5ce50901a5c996e0e9ef80a2bbeb0e0a` | IsClosable:46–50 uses mstClosable; LoadSessions:437 and UpdateSessions:475 call UpdateSessionInfos and traverse manager.Count and all packages. |

The cached model stores CreateTime, SessionType, PendingDisconnect and Info;
these support exact reconciliation after positive calibration. mstSelf is not
eligible for standard Close. Bypassing that rule is outside scope. A prior
ConnectToSession reply of enum1 provides neither fresh inventory nor a calibrated
exact absence receipt. Retention duration and local PID absence remain separate
facts and cannot replace server proof.

LAB48 TimeoutError cause remains NOT_ESTABLISHED. LAB45 reconstructed source is
not executed-byte evidence. The common source fixes candidate selection and
diagnostic loss; offline tests do not retroactively identify either error.
