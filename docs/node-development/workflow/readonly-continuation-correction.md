## Original runtime tuple for qualified readonly continuation

node-orchestration-v2. Corrects the two P2 findings on frozen readonly
`a689a6810122295dc32c0d608704db223f5e7672`; generic runtime is a separate
prerequisite/component at `91df5631da5cf9127c666d95b0e62c730c11f3aa`.

Managed startup freezes the original startup binding, owner, bridge, client and
session when the client is created, before its connection awaits. Admission
uses that authoritative tuple and the original bridge's qualification policy.
Every qualified read, including the first, checks identity before dispatch and
after its await. Substitution refuses without publishing an observation or
updating the tuple. Subsequent reads retain the same original objects.

The eligible cleanup origin remains the completed pre-native
CONFIRMED_SAVE_REQUIRED refusal. Unknown/pending/running work, dispatched native
cleanup, capture and retained writers remain excluded. No mutation, recovery
reconciliation, reacquisition, replay, cleanup or release permission is added.

The reviewer's 15 production-start/call controls are retained unchanged except
for their source-root default, under `test/readonly-first-owner.test.mjs`.
The existing 27 HostPort/lease/managed linked controls now create an authoritative
startup tuple and require prior owner/Page/account substitutions to refuse the
first dispatch. Page/authentication/SDK/bridge policy are doubles; filesystem,
HostPort, strict journal, connection lease and transport are real. Source and
installed results are separate from native continuity or full acceptance.

Minimal correction is the startup tuple plus call-admission/post-await hunks in
`src/managed-entry.mjs`. It can be received independently on a689 or alongside
the generic component. Preserve receivers' stronger lifecycle/writer code;
do not transfer the complete bridge or generic branch for this correction.
