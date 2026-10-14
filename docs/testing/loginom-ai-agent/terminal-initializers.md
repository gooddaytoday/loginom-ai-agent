Fixed initial class-initializer custody, CODE/OFFLINE

The existing login init script observes only a new ss namespace published after
its installation. An already present ss stays untouched and produces an explicit
INITIAL_SS_ALREADY_PRESENT partial receipt. The script's own pending namespace
accessor is distinguished from foreign accessors without calling either.

mscorlib.js publishes its completed local ss. bg.mscorlib.js:103 then saves the
original ss.initClass and :104 assigns the final bg$initClass. Wrapping the base
before that save would change the modifier's lexical dependency. Instead a
one-assignment accessor returns the exact unwrapped base to the modifier. Its
setter restores a data descriptor, checks the fixed modifier text shape and
wraps only that final function. Text shape is not source-execution authority.
The script never installs an arbitrary supplied initializer/module/callback.

The fixed wrapper selects only the published ObjectProxy, FileStorage and
StreamPersist constructors. Before the original call it retains receiver,
constructor, assembly, member table, base/prototype, interfaces, selected methods,
base initializer and actual shallowCopy/prepareProperties dependencies. Member
own descriptors/prototype, defining dependencies and installed methods are guarded.
Arguments, return value and raw throw pass through the original once. Capture
failure marks terminal refusal and does not suppress ordinary class initialization.
After all three calls the exact final initializer descriptor is restored; a
foreign descriptor is not overwritten. No continuing observer or replay is added.

The acquisition's frozen loadedDefinitions.initializers receipt is carried unchanged
through workspace and packet. complete indicates three witnessed initializer calls,
not executable source/closure qualification. sourceExecutionQualified=false and
closureIdentityQualified=false remain explicit. The four authorities remain false.
An incomplete initial receipt cannot be upgraded by later reflection/publication.

Controls use unchanged pinned initClass, shallowCopy, bg$initClass and member-table
text. One control executes the full pinned mscorlib IIFE before the modifier.
A production initializer→lower→Get→Set→workspace→packet→readonly control carries
the same receipt, with native/proxy/assembly/loader/task dependencies explicitly
doubled. Post-initializer accessor/prototype/table/namespace drift stops lower
continuation before resolver, getter0; raw lower rejection wins secondary drift.
Original initializer raw falsy/Error and restored ordinary unrelated calls are
also checked. Stopped original tasks remain pending, not synthetically completed.
Node/Promise/WebCrypto/FS/MessageChannel are real; this is not a native Page test.

Static inputs and SHA256 are in terminal-initializer-inputs.json. bg.mscorlib also
replaces shallowCopy at :9 and supplies prepareProperties at :199; Task.js changes
Task prototype members, not the initializer producer. These static bytes are not
identity of the actual loaded Page. The remaining dependency is a fixed load /
executed-source provenance path for these IIFEs and defining lexical environments,
then the original provider binding into stock H0. Current private receipt alone
must not grant that binding. requireInvocation remains INVOCATION_UNAVAILABLE;
semantic/physical completion, native/model/cold/full Sorting remain open.
