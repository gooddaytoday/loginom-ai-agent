Original terminal packet producer contract (CODE/OFFLINE)

Base883c933685475b9f5adb7778b419c9d65a403455, PR49; terminal author70.
The receipt Map reader is qualified before creation and retained privately with
its original descriptor holder, flags and prototype chain. Custody checks reject
accessors, missing/foreign readers, shadows or descriptor drift without invoking
them; membership reads call only the retained original reader on the original
Map. Relevant pre/post-await checks retain this qualification. Raw first task
failure and the existing abort/deadline priorities remain unchanged.

Paths/hunks: workspace.mjs first verified preparation receipt, fixed private
original-custody checks around existing preparation awaits, and shared options
validation (ordinary serialized preparation supplies no private packet);
terminal-original-packet.mjs new private initial/creation/task custody helper;
terminal-original-interfaces.mjs fixed optional branded-packet checks and
QueryInterface task continuation; addressed terminal-original-packet tests.
No node-procedure/workspace-ui/executor/runner/bridge/managed/startup/host write.

Producer -> packet -> existing component:
1. A supported same-realm owner captures custody, native user/storage/session,
   loaded defining exports/source bytes/closure dependencies before creation.
   Original Page/context/document, owner/run/lease/generation/chat/account,
   session/operation IDs and original signal/absolute deadline are retained.
   The helper accepts data references, never a callback/module/code selector.
   The loaded receipt borrows the original rpc/bg.rpc/bg/ss exports directly;
   it does not accept caller-selected defining functions or closure dictionaries.
   An initial already verified/effect-possible receipt refuses late capture.
   prepareTerminalOriginalPacket invokes only the fixed production preparation,
   checks every preparation await, forbids test login/recovery/other intents,
   and retains its first preparation Promise/rejection without replay.
2. Production workspace first verification freezes tab/packageNode/packageProxy,
   connection/native session/path/account/document/request identity in its
   existing receipt. Reverification validates, never repins. The packet binds
   only this retained receipt to the initial custody; unsaved path is null.
3. Packet metadata is branded in a private WeakMap. Copies/serialized DTOs
   cannot consume it. Loaded exports/closures and native session dependencies
   remain the original references; missing/foreign/replaced operands refuse.
4. The existing component takes only producer arguments from that packet. Its
   private current callback is fixed by the helper, not provided as a new
   arbitrary callback input. Existing evidence writer contract is unchanged.
5. QueryInterface is called once on the retained original receiver. Its original
   task and continuation methods are retained before waiting. A fixed internal
   continuation obtains task.getAwaitedResult(): the proxy from __Session.$R,
   not xResult (HRESULT). Raw completion failure wins over later custody drift.
   Late duplicate completions cannot publish another result or replay a reader.
   Connected/directory tasks use the same fixed original-task continuation; no
   Promise/JSON conversion invents a receiver or calls SaveToStream.
6. Check initial/current refs before and after every relevant await, including
   component read/evidence writer, with original signal/deadline. Retain primary
   Error/falsy and first refusal separately. Packet end is not native release.

This is a conditional private producer in one realm. Stock host->Page wiring
and an actual initial loaded-export/closure provider are not registered by this
cut; absent supported inputs fail. Cached data-only load/document records are
required; missing/accessor records refuse rather than probing a native loader.
Fixtures label Page, loader/closures, native
proxy/session/task/transport as doubles. Production preparation and component
code execute; this does not prove native initial provenance from source pins.
All native/content/save/close authorities stay false. Full semantic baseline,
serializer/verifier/settings/mappings/dependencies and exclusive physical
completion remain separate predicates. No Save/native/cleanup allowance,
observer/daemon/public API/IPC, vendor algorithm change or historical replay.
