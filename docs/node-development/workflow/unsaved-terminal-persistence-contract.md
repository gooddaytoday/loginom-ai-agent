# Private unsaved terminal persistence

node-orchestration-v2 / MAS-artifacts-v1. The owner's decision
01a13516-2162 permits preservation of the ORIGINAL unsaved draft into one new
personal UUID .lgp with conflict_policy=fail. It does not permit public Save,
overwrite, reopen, discard, reacquire, replay or a new live operation in this
offline assignment. This contract supersedes the earlier disposition question,
not the original refusal or ordinary save/cleanup guards.

## Admission and mint boundary

Only the existing managed owner may mint this private transition. Retain the
original host run/lease/generation/chat, startup owner, Page/context/document,
bridge/client/session/account/origin, preparation receipt, package node/proxy,
active tab and inventory at their real creation/verified preparation boundaries.
Do not resample these operands at terminal admission. The original caller signal
and absolute deadline remain operands; launcher expiry and a fresh timeout are
not substitutes. Keep the original refusal value (including undefined/null/
false/0/empty/Error and its cause) and journal independently of later failures.

Admission requires the existing completed pre-native CONFIRMED_SAVE_REQUIRED
qualification, no native cleanup dispatch, no unsettled executor operation,
RUNNING/UNKNOWN work, clipboard uncertainty, held transfer leases, active or
pending capture/cleanup/storage writers, blocking native dialog or foreign
inventory. The original single package is unsaved (path=null), owned and writable;
its dirty state is known, not inferred from readonly eligibility. A boolean or
serialized/copied tuple cannot mint permission. Pre-READY and Import MODEL/clean
tokens cannot mint it either.

The host-selected packages directory must be proven personal and bound to the
original storage/account/document/lease. A path below an arbitrary configured
directory is insufficient. Generate one UUID in the owner, exactly once, and
retain <original-personal-packages-root>/<uuid>.lgp with conflict_policy=fail.
No caller path, filename, callback, resource path or replacement destination is
accepted. Collision is a terminal refusal, never overwrite or a second UUID.

## Content prerequisite before physical dispatch

Before Save is dispatched, a fixed trusted original-package provider must retain
a complete content baseline and a supported verification method for the saved
artifact that does not close/reopen the package. The baseline must cover all
original package semantics/settings/mappings/data dependencies and inventory,
not only DOM graph topology or the last node result. Where .lgp serialization
contains nonsemantic metadata, an independently pinned complete parser/projection
must define the comparison; comparing unrelated serialized bytes is not proof.
Missing, incomplete or unknown baseline/verifier refuses BEFORE Save.

After the awaited original Save, recheck every original operand and match the
one retained destination and original package/tab. Verify actual durable saved
content against that complete baseline through the supported fixed provider.
An idle UI, modified=false, save_completed=true, returned path, caller-supplied
hash or planned receipt is insufficient. Do not set managedSave/savedPackages
or clear readonly state from such fields.

## Physical effect, evidence and repair states

The only admissible order is:

1. Original authority and complete baseline/verifier confirmed; target retained.
2. At most one original Save, without overwrite/reopen; original native completion
   and post-await owner/inventory checks confirmed.
3. Complete persisted content proof for that same original and UUID destination.
4. Bound save evidence durably written on the captured original session directory:
   callback-confirmed write/fsync/close, followed by directory durability. Evidence
   binds the authority, target, physical completion and full content proof.
5. Existing guarded package Close/logout; independently confirmed original native
   cleanup result, then durable bound cleanup receipt.
6. Existing transport/lease/browser/process exit and ACK guards.

Any mismatch before dispatch refuses without mutation. A lost Save reply or
unknown physical effect retains the original handles and attempt; it cannot
dispatch another Save or use a new UUID. A confirmed Save is retained even when
subsequent content/receipt IO fails. Only confirmed content proof plus failed
durable evidence permits repair of the same original captured records; it cannot
repeat Save, reader/native close or logout. Corrupt/incomplete/missing content
does not become storage-only repair authority. Pending callbacks retain the same
FD/callback and owner. Late owner replacement never writes evidence to the
replacement directory. Restoring the original tuple cannot replay physical work.
First primary and all secondary refusals remain distinct, including falsy values.

## Applicability to the current production source

Fresh common source is 1035f748392fccebbf5c106800e92c7f2afcadcd. Reference
receiving a2e16c9b97f43f6f21224625d82f054570b8d664 is not that source head.
Import component 8c0c6ff3970d95d8172798965de9768d632dad91 remains separately
reviewed; no shared bytes are modified by this document.

Existing executor runPackageSaveAs (client/lib/executor.mjs:1045 onward) can
reject destination conflict. Ordinary package.save_as then closes and reopens
the package, so it cannot implement this terminal transition. The keepOpen
package.save_checkpoint branch preserves the workflow but its verification
(around 1101-1129) is graph/path/workflow/continuation comparison, and explicitly
returns persisted_content_verified=false. Its task deadline is produced by the
ordinary operation runtime, not retained original terminal caller authority.
package-persistence.mjs:readSavedPackageState only reads IsPackageModified and
also explicitly returns persisted_content_verified=false. Existing acceptance
content proofs use reopen and fresh node execution; those are excluded here.
storage-policy.mjs validates selected-directory containment, not personal
ownership. Preparation retains native packageNode/tab within the original Page
(workspace.mjs:verify), but only its DTO is returned to the Node bridge.

Therefore the concrete next implementation dependency is a supported fixed
original-package content-baseline and saved-artifact verifier, operating without
reopen/new execution, plus proven original personal storage authority retained
with that package before terminal admission. The currently supplied production
seams do not provide these facts. Extending readonly dispatch to the existing
checkpoint merely because Save is now authorized would dispatch an effect
without the required content/durability predicate. No such allowance is added.
This is a missing production provider, not a request to revisit draft disposition.

Once that provider is established, the same source author can compose the
private transition into bridge close/executor/managed owner seams sequentially,
keeping existing Save/readonly/cleanup rules. Full qualification->two reads->
private persistence->guarded cleanup SOURCE/INSTALLED controls remain required.
Positive Page/provider doubles may test the controller but cannot qualify the
missing native provider. No native/ordinary-caller/full acceptance is claimed by
this contract-only cut.
