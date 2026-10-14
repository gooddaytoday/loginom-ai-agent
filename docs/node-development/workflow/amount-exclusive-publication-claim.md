# Exclusive capture publication claim

The private writer now obtains an actual `O_CREAT|O_EXCL|O_NOFOLLOW`, mode0600
claim at the fixed evidence destination after the original temporary file has
been written, synced and physically closed. A competing exclusive UNKNOWN
receipt creation wins or loses against this kernel claim; an existing receipt
refuses the claim before rename. Another `lstat` is not the admission primitive.

The original claim is retained in the same publication record before its first
IO await. Its FD, inode/device/UID, empty size, mode/link count, original directory,
metadata/session and captured bytes are guarded. Rename replaces that owned
claim, then the original claim FD closes through callback and projection, before
directory sync/close and once-only journal completion. Changed claims refuse.
No receipt/evidence-complete flag is derived from the reservation alone.

An uncertain callback/projection holds the publication, original claim/FD and
first boxed reason. A settled rejected exclusive open acquired no FD and is
removed from the writer registry without fabricating `closeComplete`. Its IO
record and genuine secondary remain in publication.claimFailures. Confirmed
same-tuple storage repair can reattempt this failed storage acquisition without
second consumer/read/native/Close calls. An acquired but unqualified claim stays
fail-closed; no original owner, deadline or callback is reconstructed.

SOURCE controls: frozen d13da644 slot-race2 unchanged; four new claim controls
cover real kernel EEXIST, pending original projection, genuine equal false/Error
secondary and same-tuple repair. Thirteen applicable earlier writer controls
remain, with retained claim FD assertions for uncertain rename; the three old
file-to-directory rename cases now refuse earlier at exclusive open and are
covered by the claim controls. Own FD fixture finalization after an uncertain
fault does not set production completion or grant native cleanup authority.

The selected installed runtime defining bytes run the same addressed controls.
FS/FD/exclusive creation/sync/close/rename/journal are real; scheduling, bound
owner labels and callback/projection faults are offline conformance operands.
Preparation/original consumer/cleanup completion/ACK, full writer union and
embedded/native acceptance remain unqualified. Close39 and host/caller/managed
neighbors, native permissions, public routes and historical UNKNOWN are retained.
