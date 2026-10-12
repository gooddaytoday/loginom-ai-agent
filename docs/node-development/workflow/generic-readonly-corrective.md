## Generic retained runtime / readonly corrective

node-orchestration-v2. Minimal corrective over60c753; frozena689, pre-READY2cd
and main cleanup886e remain separate. No new public APIs, consumer algorithms,
module choices, atomic writer policies or cleanup authority.

Original created session/metadata/directory/session ID and startup owner refs are
checked through subsequent startup awaits. Readonly mint uses the original
session local, never the current state replacement. Admission policy remains
the existing completed pre-native CONFIRMED_SAVE_REQUIRED policy.

Publication, receipt and root are JSON records. Arrays must have only dense
canonical indices and normal length; extra properties, holes, accessors,
non-enumerables, non-JSON values and cycles refuse before validators, IO or
projection. A publication array is not normalized into authority.

A capture IO guard failure with no operation object proves no callback was
invoked. Only that unused writer record is removed. Dispatched callbacks retain
their original pending/close state, even without an FD. First refusal/cause and
failure history remain; verified restoration permits storage-only repair,
without a repeated reader/native call or release/ACK.

Reviewer controls exercise actual production start/whole bridge/executor/FS
callbacks and original publication/evidence path. Page/auth/resources/SDK/fixed
reader/validator/native services are labelled doubles. This is bounded offline
source/installed evidence, not native readiness, consumer receiving or ACK.
