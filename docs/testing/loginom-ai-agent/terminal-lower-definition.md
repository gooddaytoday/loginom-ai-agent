The fixed publisher observes the original publication of
TIBGBaseDeductorServerSession_Proxy in bg.model.rpc.js. A private one-use
initializer wrapper records its actual member-table get_CurrentUser before the
original ss.initClass call (27096/27678), with constructor, assembly, base,
interfaces, defining dependencies and same-script/SRI birth/execution receipts.
After that call the same function must occupy both prototype.get_CurrentUser
and the native CurrentUser accessor getter. No text/ID reconstruction supplies
that binding. The selected frozen receipt is lowerSessionDefinition.

The previous three initializer receipts remain separate and restore normally.
Their guard recognizes only this fixed private later initializer while active;
its exact original descriptor is restored immediately after the selected call.
A foreign descriptor is never overwritten. The publisher's own pending bg.rpc
slot is treated as absent only with its exact private descriptor; no getter is
invoked and foreign accessors remain refused.

The lower capture now handles the native accessor whose getter is the same
original method. prepareProperties assigns conf.get = targetGet at
bg.mscorlib.js:481; replacing only session.get_CurrentUser cannot intercept that
accessor. An own temporary accessor invokes the proven original function once,
with the original receiver/arguments, and returns its identical task. The
existing reader/dispatch/response/$R guard chain applies. Restoration deletes
only that exact temporary own slot and leaves the original prototype getter.
The old method-forwarding fixture path remains for absent defining evidence;
when this definition exists, only the same direct class/method is qualified.
Derived forwarders require their own applicable evidence.

The addressed real-Chromium composition executes the pinned IIFEs and genuine
native-created CurrentUser accessor, Saltarelle task, byte readers and Get/Set/
User.Init/property codecs. Method1792 dispatch and the existing method7 property
request each occur once. Fixture transport supplies the response bytes and its
$R returns the same fixture typed user; this is not server acquisition or native
Loginom proof. Existing pooled message Release runs normally in the original
vendor continuation; retained response identity is not an immutable byte copy.

Controls cover post-completion method/public accessor/member flags/namespace/
base and method-prototype drift, plus pending resolver/method-prototype/public
reader drift. Pending guard refusal stops the continuation before resolver;
original application Get stays pending, with no synthetic completion or cleanup.
A real Task rejection preserves the same Exception object/cause0 over secondary
drift. Test context teardown is not native cleanup.

Execution/closure/bytes/nativeReceiver and four terminal authorities stay false;
stock H0 remains INVOCATION_UNAVAILABLE. The whole lexical environment, extra
three host-response receipts, fixed provider/root-control composition and full
native/semantic/physical/Sorting/model/cold acceptance remain open.
