# eval-tests — checkpoint 2026-10-07
Статус: среда READY/PASS; delivery финального support DELIVERED_VERIFIED. [Runbook](2026-10-07-eval-tests-runtime.md); R=/home/user/.local/share/loginom-evals-runtime, хост 10.200.13.152/user.
Rich/Ben: clean frozen harness 63a19e902786b1528edaab5878bb079842cad97b, ветка evals; средовая приёмка PASS, measured product FAIL сохранены отдельно.
Bun 1.3.14, Node 24.19.0, Codex 0.159.2+companion, CLI clean 904f7f85; integrity CLI 5389/runtime 261/Node 4711 PASS; full pins в runbook.
CLI native_file_store/Cross handler byte-equal срезам fc3/c50; product pin 904 сохранён. Fixtures fe20… 9/9 PASS, default skip/mandatory explicit error сохранены.
Docker archive SHA 7503d2e0367f1902117aeb568c6f29c326cd813ce274d0267e392dc7723fbf6d; original 5e3… и imported OCI fe20… — обе provenance.
Server loginom-evals-server b030b7bc86873b473f5d77d90132b82d3a4d15e993074929939c099748e3918e; loginom-net/alias loginom-server-7.4.2-test; Studio/browser/license/ws PASS.
Cold refs 3/3 PASS, exact CSV/independent Decimal tolerance=0; reconfigure cold только final avg; cleanup confirmed; manifest 34/34 PASS, SHA 546a1fee…8d204.
Final isolation 11:33:03 UTC PASS: storage/backups empty, Python disabled. Static audit 4 services/2 clean checkout/role env 0600/wrappers/online agents/squad 2 PASS; AppArmor scoped/nested PASS.
Profiles inventory/setup/check/model smokes 4/4 PASS; actual DB reference 6.1-sol/xhigh, eval 6-sol/default; cleanup confirmed/history archived. Boundary mount/auth PASS; forced OAuth refresh не проверен.
Judge auth gpt-6-astra/high smoke PASS; analytic artifact judgment не выполнялся. LAB-22 third completed/PASS: actual Codex 0.159.2/6.1-sol/xhigh/companion, health+actor search isError=false, auto Git Peer.
Stand/routes/Multica enabled/active; registration сохранена, max=1/no auto-update/reload; systemd verify PASS, reboot не проверен. Rich leader + Ben, squad ровно 2.
License narrow forward к 10.200.1.87 TCP/UDP 3186/3187: container TCP оба PASS, UDP не проверен; остальной DROP сохранён.
VPN exceptions: logi-test-plan.bg.local/mcp.loginom.ai/app.loginom.ai direct HTTP/HTTPS; прежние mas/ov direct сохранены, прочее VLESS. Apps HTTP proxy 10.200.13.152:2080; scoped config/service checks PASS.
Routes dst/32 priority 8998: 10.200.11.224/62.113.108.18/151.244.228.56/194.156.118.61; scoped nft 80/443, DROP сохранён. После restart curl direct+proxy и Node runtime 3 URL=200; внутренний HTTPS не поднят, HTTP работает. DNS pins требуют сверки.
Final remote SHA63a: 386/386 PASS, 29 files/1666 expects/373.177 s; frozen install/typecheck 0, Python 35 tasks/113 mutations PASS без LLM. Native timeout/interrupt cleanup/recovery/history PASS.
Корпус 35/280 unchanged vs import 55fc9/source d5fb803; input/rubric/calibration pins прежние, 210 source hashes PASS. Before-small-evals 904 corpus не содержит, старые 12 task files unchanged.
Final tar 87676 bytes, SHA 067fca83da31b2ca87161b6409e676ee21e1f9690195b3d954b704717302b33b: 41 assets+manifest/COLD-RERUN, nested 18 records 340cce… unchanged; DELIVERED_VERIFIED: remote manifests и CLI re-download hash PASS, role runtime.md скопированы; LAB-16 paths опубликованы --no-start/in_review, attachment 01a11629-6d97-7dbd-8e61-683bcd1d616a. Archive delivery PENDING — исторический immutable snapshot.
Analytic 20261007-110747-63a19e902: product FAIL/no_artifact, CLI 0, errors[], failure_kind=null; node 20261007-111731-63a19e902: fixed-sum PASS / 248 s; reconfigure FAIL/no_artifact / 283 s; sliding-average PASS / 315 s, code-verdict FAIL, code 1, errors[].
Все 4 live: actual DB 6-sol/default, infrastructure PASS/issues[], 6 cleanup stages confirmed, owned_remaining=0/storage_leftovers[], без infra retry/quality повторов. Далее LAB-16 Rich → Ben → Rich; final ERROR/unknown cleanup stop, обычный infra_error штатный retry 1; done/merge владельцу. Baseline 35 не запускался.
