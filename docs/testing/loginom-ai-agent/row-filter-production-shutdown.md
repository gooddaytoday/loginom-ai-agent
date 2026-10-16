# Row Filter production shutdown

The native 1680595 run completed import, both filter configurations, save/reopen,
warm execution and a final checkpoint. Its CLI exited 0, but the server retained
the package in a disconnected session; cold opening was readonly. No native
cleanup receipt existed because bridge cleanup required an acceptance-only path.

A prepared production bridge now retains the path from its latest successful
awaited Save As/checkpoint and uses the existing original-Page native cleanup.
No save produces CONFIRMED_SAVE_REQUIRED. Unsettled operations refuse cleanup;
foreign identity, dirty state and running nodes remain guarded by the existing
closeOwnedPackage implementation. A durable cleanup receipt precedes browser
closure and upload/clipboard lease release. The existing exact acceptance path
still takes precedence. Repeated close joins the original promise.

Addressed bridge tests cover production success, missing save, pending work and
native Close refusal without an acceptance override. Browser/server services in
these tests are doubles; the native 168 run is evidence of the missing route,
not native validation of the correction. Historical pending operations remain
unchanged. Ordinary unprepared connections retain their existing shutdown.
