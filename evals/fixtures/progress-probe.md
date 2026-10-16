# Native package Progress fixture

`progress-probe.lgp` contains one JavaScript node with the exact source from
`progress-probe.js`, no input data dependency, and one integer output `Value`.
The loop stops after five seconds or 100 million iterations. It runs only in
the disposable research pair used by the opt-in native integration test.

The self-contained archive uses XML entries, native-style `FK` MD5 ZIP fields,
and empty `ModelViews/Nodes` and `ModelViews/Links` containers. The XML skeleton
was reduced from an existing native-generated eval artifact (SHA256
`9b5b1d460e5afbd3b2d89ac10f61d959d45372e53d454f41c13f2e275e7d435d`).
The test has no runtime dependency on that original artifact or its workspace.

The test observes actual non-null Progress, successful native task completion
with the same package still open and Progress null, then fresh package absence
after targeted CloseSession. It grants no general operation/lock quiescence or
storage cleanup authority. Native StartTime is retained without clock correction.


The Pool control reuses this fixture through one own Scheduler job on a separate
research service account. After the completed job and creator session close,
the package remains in Pool; the test keeps cleanup/operation authority false.
The exact job GUID is deleted and checked absent before fixture disposal.

The active-backend controls load the same package and replace the engine Code
in memory with the exact `interrupt-probe.js` source before activation. That
source loops for twenty seconds and then fills the same one-row output table.
The work item is still unfinished when the creator's client context is lost.
One control observes active→idle at natural completion; the other closes the
owned native session while Progress is active and checks fresh package absence
before that normal lifetime. The observer is connected before the probe
supervisor starts; existing deadlines and ownership/pending-disconnect guards
are unchanged. Timing uses browser/controller observations; native StartTime
remains unmodified. This does not qualify backend file descriptors, locks,
all component kinds, or evaluated-attempt cleanup.

The two-user active-peer control sets B to exact `peer-probe.js` (ten seconds)
and keeps its context until the work item successfully completes. A uses the
detached twenty-second source. Both packages must have Progress concurrently;
after A closes, B's same package stays active and completes successfully, its
file-canary hash remains unchanged, and B is then closed by its own binding.
This remains a Native API control rather than a CLI-crash or file-lock proof.

The actual-CLI control uses `interrupt-probe.lgp`: the exact twenty-second
`interrupt-probe.js` node feeds a preconfigured Calculator (`ReplayValue=Value`).
Its Calculator XML skeleton comes from the tracked budget-variance reference;
the reduced fixture is self-contained. The local provider opens this package,
reads the Calculator contract and executes that existing node without changing
its expressions or links. Both GUIDs belong to this pinned fixture and the
normal runtime verifies them in the prepared graph. A new Calculator would
correctly refuse its inactive input at preflight. The provider stops waiting on
a terminal node refusal. Only this longer CLI scenario uses120s (300s aggregate);
the four existing replay modes retain60s and their original aggregate budgets.
Native Progress triggers supervisor abort; a fresh inventory must still show
backend activity after local process closure. The finalizer archives pending
recovery bytes before the exact session closes. This is controlled interruption,
not a hard-kill, FD/lock or storage/admission qualification.
