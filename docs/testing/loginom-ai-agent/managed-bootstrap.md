Managed IPC boot boundary

Continues bounded7f36a88e. managed-entry.mjs has no static imports. It registers
one listener and private linked records (no ambient Array queue readers), then dynamically imports the fixed managed-session.mjs body. Early
messages are stored as the exact channel objects, never cloned/reconstructed.
Once the body is available, the original handler receives each object once in
FIFO order, including messages arriving reentrantly while draining. No new opcode,
reply, send, timer, controller, operation task or budget is introduced. The body
creates and retains its own original handle/SDK tasks and controller at the same
places as before. Existing parent fork/execArgv are unchanged.

The body is the old entry with only process.on('message',callback) changed to an
exported receiveManagedMessage function. Whole-file normalized bytes are equal;
boot-body-identity.json records both hashes. Original startup, cancellation, raw
Error/falsy, UNKNOWN/pending, writer, Close/drain/ack algorithms are unchanged.
A disconnected original channel cannot dispatch queued startup work after import.
Import/handler rejection remains raw, without fabricated completion or retry.
The closed Sorting launcher verifies this exact body resource alongside entry.

Test parsers/VM fixtures read the relocated body and bind its exported handler;
all original assertions remain byte-identical (boot-assertions-proof.json). The
source-startup fixture additionally runs the actual entry text with a gated fixed
import: the original start waits before resources, then production body retains
its original owner/task/control. The real drain test still forks the actual entry
with execArgv:[] and immediately sends list. There is no preload or readiness
handshake in that control. New VM controls check exact-object/FIFO/reentrancy,
getter0, raw import/handler rejection and pre-import disconnect.

Source preparation finding: the ignored client/node_modules symlink pointed at
a historic packet70-corrective artifact. An independent import probe waited in
SDK types.js filesystem read (folio_wait_bit_common); another ESM trace eventually
loaded. Old early no-reply failures and raw probes remain evidence. Only this
checkout's ignored dependency alias was rebound to the SDK directory of the
verified7f36a88e product. The original symlink and its target remain preserved;
no historical artifact was modified, deleted or rebuilt. The binding metadata is
recorded separately. Attribution is bounded: the dependency repair affects source
load time; deterministic gated-import controls prove the new retention behavior.
An observed passing no-start run does not establish a universal Node ESM delivery
guarantee before the entry's first statement. No blanket claim is made about that
external Node startup window.

Node/VM/Promise/FS/EventEmitter/IPC are real in their controls; Page/native/SDK/
services/lease are labelled doubles where used. Actual no-start entry does not
start a browser/login/session. Fixture finalization is not native cleanup.
Native/login/model/acquire/Prepare/Save/Close/replay remain0 as actual Loginom
operations. Four authorities, source execution/closure qualification and H0
INVOCATION_UNAVAILABLE remain unchanged. Next is original lexical/provider→H0;
semantic/physical/full Sorting/model/cold remain open.

Node source discussion of the earlier delivery window:
https://github.com/nodejs/node/issues/39140 and
https://github.com/nodejs/node/issues/41134 . The local measured controls, not
those discussions, define the bounded result for this candidate.
