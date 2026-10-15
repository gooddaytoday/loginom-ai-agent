Private initial dynamic-script integrity admission

This cut adds a browser-enforced SRI prerequisite to the existing terminal-purpose
login branch. It does not qualify the stock native provider or enable H0.
`connection-check.mjs` installs the fixed integrity script before the existing
publisher, init Promise and navigation. Ordinary login gets neither this script
nor its private receipts. The fixed factory's manifest dependencies include the
new module. No caller pins, callback, module path, tool or JSON permission exists.

The script uses the original HTMLScriptElement.src setter. For the fixed twenty
full-IIFE inputs in terminal-iife-inputs.json it sets the exact SHA-256 integrity
with the original native setter before assigning src, while the original node
is disconnected. This is the path used by unmodified pinned Loader.CreateScript
and AddScriptAsync. Only the accepted Loader `_dc=<digits>` query is eligible.
The exact original node/document/URL/integrity and descriptor/prototype chain
remain guarded. The initial map readers, URL constructor and native DOM readers
are retained; substitutions refuse without invoking a foreign getter. Missing,
copy, late, duplicate and unsupported parser-created nodes receive no receipt.
Foreign descriptors are never restored over. There is no observer, timer,
controller, synthetic task completion, source rewrite or extra acquisition.

Publisher captures the original frozen integrity API at init, before application
publication; it never adopts a late API. During the existing five currentScript
observations it retains the same original per-node receipt. Those refs travel
inside the existing frozen initializer/definitions graph and guarded realm capsule.
Receipt `armedBeforeSource` records SRI installation, not successful execution:
a blocked resource still has an armed receipt. None of sourceExecutionQualified,
closureIdentityQualified, sourceBytesVerified, nativeReceiversQualified or the four
terminal authorities becomes true. requireInvocation remains UNAVAILABLE.

Real local Chromium controls execute all twenty unmodified IIFEs, also through
unmodified pinned Loader.js, and show a modified rpc.js rejected by native SRI
before its added statement executes. The positive composition runs the original
Get/Set/Init, initializers, original realm capsule and recheck with five identical
node receipts. DOM/browser/SRI are real. Routing/offline HTML, cached data user,
transport, selector and application session are doubles; no Loginom native login,
model, acquire, Prepare, Save, Close or replay is performed.

The native enforcement mechanism is defined by W3C Subresource Integrity:
https://www.w3.org/TR/sri/ . It validates fetched bytes against metadata before
script execution. An integrity string or receipt alone is not execution evidence.

Remaining executable work: join browser-enforced integrity on these exact nodes
with the existing host response receipts and initial execution witnesses; qualify
the full supported load/lexical environment, then fixed original provider/stock H0.
Parser-loaded nodes, other loader mechanisms and unobserved initial dependencies
remain unsupported. Do not repair them with late integrity, reflection or proxy
reconstruction. Semantic/physical predicates, native/full Sorting/model/cold remain
open. Historical UNKNOWN, pending, .writer and originals are unchanged.
