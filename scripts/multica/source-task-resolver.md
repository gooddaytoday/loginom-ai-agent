# Cross-issue original source task resolver

Existing private helper boundary: deliver/select_assignment/assignment_sender.
Source identity is the server-stamped original comment.source_task_id and agent
comment.author_id from authenticated target comments. Source issue can differ
from target; neither a current task nor supplied target-run row is authority.

The resolver uses the existing authenticated author tasks API, limit200 and
before=created_at|id. It reads all pages up to50 (10000 rows); repeated IDs/cursors,
foreign author/workspace, missing ID/issue/cursor, missing source or an exhausted
bound refuse. Workspace is retained from the authenticated scoped request/header
or explicit server rows. Redundant workspace fields may be absent only once that
scope is known; an explicit workspace mismatch always refuses. Only the exact
unique task ID can be the sender, even when it is completed. No first-match exit.
Source issue is stored separately from target issue in confirmed reconciliation.
Initial selection, canonical receipt retry and explicit legacy adoption share this
resolver. Target comment/receiver issue, linked trigger/delivered/coalesced/planned
IDs, full original body/wrapper fingerprints, headers/descriptors and UNKNOWN/
no-rePOST rules remain. No public CLI/API/receipt migration is introduced.

Offline tests use complete captured cross68/cross72 original bodies and prepared
fingerprints with authenticated loopback transport, separate Python processes and
own fixture receipts. Captured inputs are never edited. Success changes only the
fixture copy's state to assigned through normal verified reconciliation; it does
not rewrite its original fingerprint. Adversarial author/workspace/IDs/missing/
duplicates/pagination/receiver/body operands are explicitly labelled. POST0 and
no live adoption/receipt/pin edit/model/native operation are required.

Frozen6247b7fc remains unchanged. Its line54 asserts that the *fixture receipt*
is byte-equal to its original admitted state even for successful actual/source-
present cases. A correctly confirmed reconciliation writes assigned/source/receiver
metadata and therefore hits this assertion after cross68 acceptance. This fixture
assertion conflicts with its expectedAccepted=true; original captured inputs stay
byte-equal. Do not weaken the frozen assertion or disguise this as full probe PASS.
The raw failure and successful helper output are retained for independent review.
The addressed process tests separately cover both captured originals, canonical
retry, explicit legacy adoption and refusals. Future immutable reviewer assertions
must distinguish original input preservation from normal fixture reconciliation.

Only after independent review and existing publisher/new authoritative pins may
the original receipt owner reconcile the original admitted receipts read-only.
Current installed f73 and c129 admit/origin, runtime and historical receipts remain
unchanged; no new receiving POST/scope/key, cancellation or fingerprint repair.
