# Linux completion audit — current evidence and remaining work

This audit applies the user's Linux-only scope and explicitly accepted Xiaomi
smoke criterion. Historical evidence is retained with its own artifact version;
it is not relabelled as execution of the final edc68138d artifact.

| Requirement | Verified evidence | Scope/remaining check |
| --- | --- | --- |
| IND-01 independent bundled startup | Final install/help/version/status; installed Xiaomi run performs real Dock import | Installed final TUI oracle PASS; container checks cover startup/libraries only |
| IND-02 common instructions/schemas/pins | Final run/TUI captures agree on 34 schemas and bootstrap; hashes match recorded Desktop comparison | Current Desktop with identical product inputs: six captures, prepare instructions/knowledge and pins PASS; full Git snapshots differ in docs/tests |
| IND-03 CSV/save/cold reopen | Final native run A=55/B=101, original-input hashes and independent cold readbacks PASS | Final installed TUI 55/101 cold readback PASS; current unpacked Desktop oracle PASS; installed Desktop evidence historical 02:25; Xiaomi smoke accepted separately |
| IND-04 headed/headless/resume | Historical CLI mode/resume runs; final headless run and installed headed TUI PASS | Do not infer every mode/resume cell from this final artifact |
| IND-05 input/profile isolation | Final run same-name inputs have different bytes/source/package paths; host inputStore contract test | Same-process multi-chat UI acceptance remains distinct from separate-profile oracle |
| IND-06 Desktop independence | CLI profile imports/process tests; final providers-list strace: no Desktop root references; install/uninstall preserved Desktop credentials | Both close orders PASS; traced setup/run/prepare/observe/close has zero Desktop references; full TUI trace not performed |
| IND-07 guards/concurrency | Current profile tests: one writer, symlink alias, separate profiles, unknown/foreign/abandoned roots | Process/host and historical live parallel profiles supplement source checks |
| IND-08 early bootstrap | Current process tests and final native help/version no profile; mutating commands guarded | No claim that help alone proves every writer command |
| IND-09 setup/pending/recover | Current management process tests; final native unconfigured status; real-provider setup | Historical live recovery and setup records retained |
| IND-10 cancellation/crashes | Review tests cover run/provider SIGINT and child drain; real run uncertainty -> code 4/recovery; second real run SIGINT ->130; historical installed crash/network cases | Existing fault evidence retains original candidate/timing; not all faults repeated on final archive |
| IND-11 permissions/secrets | Current common service/guard/proxy tests; Loginom-only policy in Xiaomi run; historical TUI once/always/reject/restart tests | Always is shared workspace/process behavior; full same-process two-chat UI flow is not inferred from service tests |
| IND-12 events/exit codes | Review process regression and actual Xiaomi code4/130; final run exit0; invalid arguments code2 | Detailed evidence in review and provider reports |
| IND-13 Linux environment | Real bundled Node HTTP/HTTPS/extra-CA/bypass; existing host sandbox acceptance; offline Ubuntu22/Debian12 libraries | Containers do not prove browser sandbox/GPU/portals; native Windows/macOS excluded |
| IND-14 packaging/Desktop regression | Final clean archive/manifest/install/uninstall, 932 notices, 8093 profile files preserved; historical installed Desktop post-extraction regression | Current unpacked Desktop with identical product sources: oracle PASS; no new DEB installation |

Current native interface oracles and both process-close orders are complete.
Remaining unexpanded acceptance boundaries are a same-process multi-chat UI
exercise and exhaustive TUI filesystem tracing; existing tests and separate-profile
oracles are not relabelled as those specific live checks. Full provider-generated
oracle is no longer required by the user. No Windows/macOS work is scheduled.

Release limitations remain explicit: unsigned development channel, no production
publication, missing upstream-specific attribution review and full third-party
source/relinking clearance. The project source archive and standard-text supplements
are evidence of supplied material, not a declaration of complete legal compliance.
