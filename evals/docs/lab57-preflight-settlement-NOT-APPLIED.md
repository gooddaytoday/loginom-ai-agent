# Preflight-only lease settlement proposal — NOT_APPLIED

This document is a separate operator proposal. No executable settlement code,
new release kind, private once, lease mutation or new recovery is implemented
or invoked by the offline patch. It requires a new explicit owner approval.

The held lease has phase eval, only historical failed preflight proof, and no
eligible ordinary eval/reference/cold/unit completion. A successful future
preflight would be admission, not a product completion. Keeping phase/owner/
config immutable prevents a fresh cold/unit acquire until the lease is safely
settled. Existing release and cleanup criteria must not be bypassed.

Proposed narrow operator scope: original owner task01a134fd only, exact issue,
author49522, acquiredAt11:53:15.320Z, config hashf76b3a6a…b264, exact container
b030b7bc…18e. Approval must supply full identities and source hashes; shortened
values in this prose are not execution authority. Hash the original complete
lease inventory and actual failed preflight/cleanup receipts privately.

First seek genuine durable eligible completion; use ordinary release if it
exists. Otherwise STOP until the owner approves one targeted archive-as-
ABANDONED operation. Admission must prove original token/owner/config/device/
inode, guard absent, no active invocation, all worker queues except the current
operator empty, runtime online, exact container/isolation marker/no mounts,
empty fixed storage, all profiles settled, no writers/native/browser/debugger
processes, full process ancestry/absence and preserved history hashes. Unreadable
relevant state, mismatch, race, another worker or existing destination => STOP.

Only after those proofs, record a new distinct private wx/0600 once BEFORE any
mutation, bound to this exact lease and the new approval. Then atomically move
the ENTIRE unchanged lease, preserving owner/guard/bytes/inodes, to a private
ABANDONED destination with no replacement. Compare complete before/after file
and directory inventory and original receipt hashes, then verify real FREE.
Failure/crash after once => no retry. Do not create completion/RELEASED/PASS;
historical PROFILE_NOT_READY and cleanup results retain their original meaning.
Publish only allowlisted settlement and integrity hashes, never private archive,
token, env, profiles or DB. Fresh acquire/pilot requires separate live approval.

Old unit once is consumed and applies solely to task01a134a1. Recovery0,
wrapper1/1 and admission3/3 counters do not gain an allowance from this proposal.
