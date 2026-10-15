Original script-node provenance, CODE/OFFLINE

The initial publisher now retains fixed Document.currentScript,
HTMLScriptElement.src/integrity and Node.ownerDocument/isConnected readers before
application publication. It guards their defining descriptors/prototypes and the
original constructor bindings. This is a fixed DOM reader list, not general
permission to invoke arbitrary accessors. Every read checks effective owner and
getter identity first: an own shadow or foreign reader is refused without calling
that getter. Unsupported initial DOM leaves an explicit partial witness.

At the initial ss publication it holds the current mscorlib script; at the fixed
modifier assignment it holds bg.mscorlib; at each selected class initializer it
holds rpc.js or bg.rtl.rpc.js. Script/document/URL/integrity and prototype chain
remain original through the existing guards and awaits. A connected same-document
node with the exact fixed origin/path is required; only Loader's numeric _dc query
is accepted. Storage and StreamPersist must come from the very same script node,
not separate equal-URL nodes. No later lookup reconstructs a missing initial node.

The same frozen initializers receipt already travels through acquisition,
workspace and packet. scriptIdentityComplete means all five synchronous execution
seams had original script-node witnesses. sourceExecutionQualified=false and
closureIdentityQualified=false remain literal false. Even an integrity string is
opaque evidence, not proof that a browser enforced it for these bytes. The four
native/content/save/close authorities and nativeReceiversQualified stay false.

Controls execute production publisher, pinned initializer/member-table text and
its existing private lower→Get→Set→workspace→packet→readonly composition. DOM,
script-loader, Page/native/Saltarelle/task/assembly/constructors are doubles.
Node/Promise/WebCrypto/FS/MessageChannel are real. Missing initial capture may
precede publisher-wrapper installation: ordinary application Get still executes
once, while terminal inspect refuses. This must not be tested by leaving that
original fixture RPC undelivered. One such initial fixture run was stopped by
exact Node PID; its log and stop receipt are preserved, no native resource touched.

The HTML standard defines currentScript for synchronous classic-script execution,
not module/event/timer execution; missing or wrong-script cases remain refused:
https://html.spec.whatwg.org/multipage/dom.html#dom-document-currentscript

Remaining exact input: verified executed bytes bound to these original nodes and
their defining IIFEs. Loader.js:157–160 assigns src and appends the external script;
it does not install integrity metadata. RequireScript's eval path is separate and
cannot qualify by reusing the caller's currentScript. No new loader, response
rewrite, debugger observer, RPC acquisition or source-body replay is added here.
SRI would require setting trusted metadata before the original load preparation:
https://html.spec.whatwg.org/multipage/scripting.html#prepare-the-script-element

Before adding that behavior, the original terminal-purpose startup admission
must be linked before connection-check.mjs loginBrowser/addInitScript/goto. The
existing shared login path supplies only URL/owner; applying fixed asset pins
there indiscriminately could block ordinary login after a legitimate source
change. A caller flag or copied JSON is not the missing private startup binding.
This exact producer/control and then source-byte evidence are the next own cut,
followed by fixed provider→H0. requireInvocation stays INVOCATION_UNAVAILABLE;
semantic/physical completion, native/model/cold/full Sorting remain open.
