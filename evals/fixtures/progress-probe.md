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
