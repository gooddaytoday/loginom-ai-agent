# Local file paths #74 — итог проверки

## Результат

Реализация задач1–8 и устранение B1–B5 завершены в Linux; итоговое независимое ревью 26.10.2026 — **Approved30/30**, обязательных замечаний нет. Это результат инженерной проверки, а не утверждение, что каждый CLI завершился успешно: ниже отдельно сохранены official PASS, исходные CLI1/FAIL и производная офлайн-переоценка. Оценка качества/oracle не заменяет exit0 и подтверждённый native cleanup.

Последний установленный кандидат приёмки — `0.3.2-localpaths74.8d65045b3e`. Более поздние исправления и rebase проверены по исходникам; они не переименовывают прежние результаты в приёмку новой сборки. Согласованное поведение — в [дизайне](../../superpowers/specs/2026-10-21-local-file-paths-design.md), порядок работ и исходные оценки — в [плане](../../superpowers/plans/2026-10-21-local-file-paths.md).

Корень evidence — [исходный каталог](/home/kiselev/storage/tmp/local-paths-74-ptufs123/); пути без отдельно указанного каталога даны относительно него. Raw logs, guards, профили и снимки стендов сохранены вне Git; эта консолидация их не меняет.

## Кандидаты и границы применимости

Установленные проверки использовали Loginom7.4.2, Bun1.3.14, Node24.19.0, Chromium1246; исходная проба — Playwright1.64.0-alpha-1789764292000. Manifest/archive/resource hashes и source trees сохранены в указанных receipts:

- **bbd2e1af7d** = `bbd2e1af7df3e5deda2ea4604f9bec879ef4b2b8`: CLI `0.0.0-dev-202610211509`, Desktop `0.3.2-localpaths74.bbd2e1af7`. CSV reference и исходные Desktop docs/TXT; `task7/candidate-digests.json`.
- **9cb57e9cd9** = `9cb57e9cd9f09799625e3c97e720cc730da29515`: prod CLI `0.3.2-localpaths74.9cb57e9cd9`. Четыре CLI routing-case, B1 source и B3 native check; `task8/routing-run-prod/`, `b1-close-20261026/`, `b3-private-network-20261026/candidate-integrity.json`.
- **9f7233ce71** = `9f7233ce71fbac34959b5ba64e24e730929aa077`: prod CLI/Desktop `0.3.2-localpaths74.9f7233ce71`. B4 default-save, edit reference и первый benchmark; `b4-close-20261026/{build-cli,build-desktop}/receipt.json`, `task7-edit-reference-20261026/accepted-case.json`.
- **93f52cc169** = `93f52cc169811161bba2e3b3485ec44862c8acb2`: prod CLI/Desktop `0.3.2-localpaths74.93f52cc169`. Повторный Desktop CSV PASS и исходные B5 CLI FAIL; `task8-final-20261026/docs-fixed-candidate/{qualification.json,independent-review.json}`.
- **8d65045b3e** = `8d65045b3eee86f4a0afc47067de16441dfe6b40`, tree `b70c17dc67f1137dcd8ac29a0d1aaca4d61a0e58`: prod CLI/Desktop `0.3.2-localpaths74.8d65045b3e`, recovery0. Итоговые переходы и повторный benchmark; `task8-reprepare-20261026/candidate/`.
- **253f453457** = `253f4534579690dae1828defbe95e0c285782980`: отдельно закреплённый Desktop harness и HEAD офлайн-судьи. Исправленный helper SHA256 `08c48ca8556f209d57530a7f6f80280ccfb56c803a1210a0cf66b3dd86561d12`; product/runtime/skills/evals равны8d650. Исходный frozen CLI runner не заменялся.

CLI manifest/archive и Desktop DEB/AppImage/inventories/source archive независимо проверены. Для8d650:6039 CLI/6040 archive/5042 Desktop entries; packaging13PASS/2platformSKIP, crash logging6PASS/exit0. Static verification пакета не является живым запуском GUI. Полные digests и первоначальные build failures остаются в candidate receipts, без пересказа каждой сборки.

Модель агентов — **openai/gpt-6.1-sol/xhigh**: CLI подтверждён физической SQLite, Desktop — сохранёнными backend messages. TEST_ONBOARDING Desktop использует SQLite `:memory:`, persisted DB не заявлен. Судья — **gpt-6-sol/xhigh**, codex-cli0.157.0; его `--ephemeral` не создаёт доказательства постоянной judge DB.

## Проверенные сценарии

### Локальные данные и приватный upload

- Ранняя source CLI проверка: два внешних CSV с пробелами/кириллицей и одинаковыми `sales.csv`, prompt без вложений, `run --auto`; distinct admission/grant/delivery/destination/SHA, реальные серверные bytes и импорт в сохранённом пакете. Результат Alpha17/Beta20/Gamma5, CLI0/runtime ACK0/no writer, исходники неизменны. Источник `1f52de3d58` + сохранённый dirty patch, bundle manifest `89719f65bc057dec341a13b716e5f21920c627cad3ff5d7c357957245088e5ee`; `early-smoke/{verification.json,result.csv,result.lgp}`. Это source smoke, не installed acceptance.
- Отсутствующий путь дал `NotFound: FileSystem.realPath` с полным путём, без attachment hint. TDD/source checks задач2–6 покрыли16MiB, realpath snapshot, вложения/deny/permission hints, несколько путей, identity/hooks, безопасные имена, staging, routing и неизменность paths-mode inputs. Изменение/удаление входа сохраняет before/after hashes, запрещает judge; judge-only не снимает этот отказ. Логи `task{4,5,6}-*.log` и ранних проверок сохранены.
- Read-only native completion без контрольного скачивания: неизменный владелец document/input/sender/store, завершённый upload и ровно одна свежая FileStore-запись с точными destination/size; исходная AMBIGUOUS receipt сохранена. Проба source `34cb53ba7b040f7e0b2da536fd1811ce793be523`: непрерывный A→B1915мс; paused upload не подтверждается до завершения, conflict reject не перезаписывает файл. `route-b.json`, `while-paused.json`, `delayed.json`, `reject-observed-conflict.json`.
- Приватный IPC source `324b00c618` + recorded patch: A6867мс/B6338мс в одном runtime, разные operation/workflow IDs, `workspaceReady:false→true`, прежний графA неизменен, private bytes недоступны через публичный MCP. Бюджет100с внутри105с runtime/~120с Host/≥180с adapter; маленькие локальные fixtures не доказывают худшее время. Серверные файлы отдельно сверены с источниками, runtime ACK0/cleanup подтверждены: `task3-native-v2/{runtime-cleanup.json,stand-cleanup.json}`. Контрольного скачивания и второго browser/context не добавлено; обычная доставка данных сохраняет проверку скачанных bytes.

### Routing

Проверены **6 уникальных IDs ×2 интерфейса**; результаты использованы с явной привязкой к источникам:

- CLI `docs-local-path`, `docs-external-unicode-path`, `scenario-create-path`, `text-read`: **9cb57e9cd9,4/4 ожидаемых исхода**. External-docs — намеренный отказ разрешения с путём и attachment hint, CLI1; это PASS ожидаемого отказа, не созданная документация. CSV path: admit→delivery→import→SUM35/20→Save; TXT — точный `PATH-74-АБВ-37`. PDF прочитан полностью с финальным ответом, обе страницы просмотрены. `task8/routing-run-prod/`, `task8/cli-prod-manual-review.json`.
- Desktop docs-local/docs-external/TXT: **bbd2e1af7d,3/3**; Desktop `scenario-create-path`: **93f52cc169,PASS**, GUI once2, внешний CSV без вложения,35/20, физический граф2узла/1связь, native Close/logout/3ACK0/no writer/process0. `task8/routing-desktop-v2/`, `task8/desktop-manual-review.json`, `task8-final-20261026/routing/desktop-scenario-create-path-93f52cc169-01/`. Legacy fixtures неизменны и не содержат Calc Expressions; reuse не подменяет текущую проверку формул.
- CLI `edit-after-docs` на **8d650**: **official PASS**, CLI0/670.21с. CLI `docs-after-edit`: **исходный harness FAIL740.73с, editCLI1/docsCLI0**. Ошибка binary Read осталась в execution status; модель продолжила работу, фактический Markdown содержит правильное amount*3. Его неизменённые bytes проходят **только производную офлайн-переоценку** исправленным helper253f; нового official/model PASS нет. `task8-reprepare-20261026/routing/{cli2-settled.json,cli2-proof/}`, `task8-reprepare-20261026/docs-fact-verifier-fix/reassessment.json`.
- Desktop переходы на **candidate8d650/harness253f**: **official2/2PASS**,628.2/611.70с. Два пользовательских хода в одной session, пути без вложений, реальные GUI once approvals4/2; модель подтверждена32/29 assistant records. Документы вручную сверены: исходный amount*2, после правки amount*3/tripling, extract/emit привязаны к изменённой копии. `task8-reprepare-20261026/routing/desktop2-proof/`.

Все четыре итоговых edit transitions подтвердили FileStore upload, неизменный source9873bytes/SHA4313b47f…, amount*3, исходные4nodeGUID/3linkGUID/endpoints/JavaScript и CSV30/60/75. Для CLI docs-after-edit это проверка результата и native lifecycle, а не отмена исходного FAIL. Desktop saved packages:10236bytes/SHA61db0fbe4eb603223b2f1c362ecd7f470cdf959940263b5eecec0a3e77ea1f07 и10215bytes/SHA04c551a64f41dc370607c71aef504c37d15f2a5a9378360f816eff392e8ad826; Markdown SHA34eab749fde704c67bb14249a5797f7b1ad647f44b5b3c5837e9d2f3456c960e и7d89d06feca08e7aea06d74fb9664b5e284e15a22777ded9bcc4993c3822e9b2.

### Save и native cleanup

B4 natural default-save на **9f723**: без output path агент выполнил `replace` ровно собственной открытой upload-копии, в последнем ответе назвал полный серверный путь и прямо сообщил неизменность локального файла. CLI0/220.8с,16 DB-confirmed assistant messages; prepare/upload/open14653мс. Сохранённый пакет10004bytes/SHA256 `35823316e466beab4eac6706465b0494d4dd91d7c6ca2670c891bb44a2fe4867`: в Unit.xml единственное изменение amount*2→amount*3, исходные4GUID/3links сохранены. [Evidence](/home/kiselev/storage/tmp/local-paths-74-ptufs123/b4-close-20261026/installed-green/): `summary.json`, `evidence/verification.json`, `snapshot`, `stand-archive`.

В итоговых переходах Save использовал explicit destination/`conflict:fail`; canonical receipt связана с теми же operation/session/document, что и native Close/logout: packages1→0, **без discard**, resource ACKtrue/exit0, writer0/process0. Для default-save использован тот же own-copy Save/replace. Resource ACK сам по себе не доказывает native Close: source-пробы с `nativeClose NOT_TESTED` не включены в эту приёмку. Desktop использует обычный `package-cleanup.json`, CLI — `saved-package-cleanup.json`; envelope CLI на Desktop не навязывался.

## Эталоны и оценка качества

[Принятая коллекция](../../../evals/tasks/local-path-scenarios/README.md) содержит только `csv-two-paths` и `local-lgp-edit`: paths-mode внутри attempt, вложенные пути/одинаковые basename/`{{INPUT_ROOT}}`, пустые files, mode в hash и before/after input hashes. Использованы task-local копии scripts `loginom-eval-case`, установленный skill не менялся. Графы, независимый oracle, физические bytes и cold browser ExecuteAll с новой CSV проверены отдельно от exit code.

- `csv-two-paths`: **CLIbbd2**, первая попытка без hint,570с/CLI0;6узлов, oracle17/20/5. Cold rerun через Packages/Open совпал с CLI CSV; Close без Save, runtime ACK0/no writer. `task7/work/`, `task7/csv-runtime-evidence.tar.gz`, accepted provenance.
- `local-lgp-edit`: **CLI9f723**, первая попытка без hint,300.601с/**CLI1/CLI_TOOL_FAILED** из-за binary Read; затем модель успешно продолжила через Dock. Reference10223bytes/SHA256 `5dd377cdef037d13eb9e80ff8fb80f8387e812646d5b82f240e32cea87d30e35`, исходные4GUID/3links/JavaScript, amount*3/oracle30/60/75. Cold ExecuteAll/новая CSV/Close без Save/logout прошли; source/reference bytes неизменны, native Save и runtime ACK0/no writer подтверждены отдельно. `task7-edit-reference-20261026/{accepted-case.json,cold-browser.json,cold-physical-proof.json,cli-reference-proof.json,physical-graph.json}`.

Коллекция: `agent_inputs_hash=5f4445075f167cdf2b842bb8dd36496e5ccf1bc71396ef924545981846520490`, `rubric_hash=d761d93d039f65e21f5f452163c1b959575317b5a8fdbaf5d4bbec72c15a2d97`. Прежние9 CSV-case файлов не менялись при принятии edit reference; runtime evidence архивировали до штатного prune. Секреты и private auth/config в Git не включены.

### Калибровка

Official run **`20261026-142707-calibrate-NprfPu`**, clean harness **`289c55d985a4c64695c137d1cc957446ea8aa6a0`**: positive100/negative0 для каждого case, оба positive oracle=true, пороги90/40, четыре оценки без встроенных judge retries,236.04с/warnings0/exit0. Judge lease51 released. Это калибровка качества пары, не повтор агентского исполнения. [Evidence](/home/kiselev/storage/tmp/local-paths-74-ptufs123/task7-calibration-20261026/): `results/20261026-142707-calibrate-NprfPu/{config.json,calibration.json,calibration.md}`, raw judge sets и cleanup receipts.

### Benchmark

Итоговый official run **`20261026-183856-8d65045b3e-d81SnM`**: installed agent8d650, judge HEAD253f, исполняемые evals/runtime/skills trees равны. Ровно два case, `--repeat 1 --skip-judge`, затем штатный `--judge-only` тех же артефактов. Исходное execution completion — **1/2**: CSV CLI0/624.706с, edit **CLI1/tool/402.544с** после binary Read. Продолжение модели, физические пакеты, oracle и native Save/Close/logout успешны; исходные execution outcomes/`summary.prev` не переписаны.

Judge дал **100/100, oracle2/2, attempts1/1**,117.686с/runner0; private lease53 released с exact-run cleanup. Agent DB27/21 assistant records, input hashes, физические/reference/oracle outputs,5ACK0 на case и process/profile/storage cleanup проверены. Независимый аудит **Approved41/41**. [Evidence](/home/kiselev/storage/tmp/local-paths-74-ptufs123/task8-reprepare-20261026/benchmark/): `result.json`, `judge-lease-proof.json`, `stand-postrun/receipt.json` и `final-evidence-review/` в родительском каталоге.

Предыдущий run **`20261026-144455-ad02b483d9-CahUF0`** остаётся историческим: installed9f723, harness **`ad02b483d9df20bb1ac82c69cffcb75a3ad29953`**, scores100/100/oracle2/2, completion1/2 (CSV0/761.674с, edit1/393.106с), judge lease52 released. Он исполнял изменённую позже B5-ветку, поэтому его результат не переносился на8d650: оба case повторены в итоговом run. Evidence: `task8-final-20261026/benchmark/`.

## Закрытые отказы

### B1. Автономный источник

CLIbbd2 отказал новому zero-input JavaScript (`Invalid parameters.inputs`, NOT_APPLIED/effect_possible=false): runtime требует вход. Это ограничение создания узла не исправлялось. По разрешению владельца исходный seed создан обычным browser MCP, Unit.xml вручную не писался. Чтение JS на9cb затем удержало input wizard без публичного release; следующая попытка упёрлась в пустую cold source schema. Обе CLI1/no ACK/guards сохранены: `task7/source-capability-refusal.json`, `b1-resume-20261026/`, `b1-final-attempt-20261026/`.

Решение: UI declared `Category/String`, `amount/Integer`, явные Calculator mappings; close/reopen подтвердил mapping **до Execute**. Assisted CLI9cb attempt4/583с изменил существующий Calculator на amount*2, добавил порядок колонок/ExportCSV и сохранил `/user/source-authoring-edit-source-4.lgp`. [Source](../../../packages/agent/test/cli/package-docs-routing/fixtures/edit-source.lgp)9873bytes/SHA256 `4313b47f09cc875993e8acc42ef2d35baec7d7dc61589af817d413b37261e7bf`, [provenance](../../../packages/agent/test/cli/package-docs-routing/fixtures/edit-source.provenance.json),4узла/3связи, без внешних inputs/references, oracle20/40/50. CLI0/own Save/ACK0/no writer; независимый cold rerun с новой CSV и явным «Не сохранять» сохранил SHA. Это assisted source authoring, не unassisted eval. Evidence: `b1-close-20261026/{declared-seed-proof.json,ui-cold-mapping-mcp.json,physical-source-proof.json,accepted-source-proof.json,final-cold-*-mcp.json,work/source-authoring/edit-source/attempt-4/}`.

### B2. Offline-восстановление guard

После исходной несохранённой source-попытки `CONFIRMED_SAVE_REQUIRED`/`LOGINOM_HOST_CLEANUP_FAILED`, runtime exit1/no ACK и `.writer` остались. Browser/process closure не подтверждает native package cleanup. `.writer/owner` содержит nonce без PID; public unlock нет, `loginom recover` сам требует свободный guard. Исходные receipts: `task7/profile/loginom/runtime/`, `task7/source-capability-refusal.json`.

Отдельно разрешённое offline-восстановление **исходного `task7/profile`, CLI0.0.0-dev-202610211509**: полный backup профиля/UserStorage/SessionBackup/state, старые процессы и own containers остановлены, owners/inode/nonce проверены непосредственно перед одним atomic rename только `.writer` в `archived-writer`. Из240 same-UID процессов четыре ограничения чтения объяснены по PID/starttime/cgroup; полная читаемость всех процессов не заявлена. Guard сохранил inode/bytes; DB/auth/recovery не заменялись, история2sessions/11messages/40parts неизменна, старый failed ACK побайтно прежний и **остаётся FAIL**.

Публичные status/setup(URL only)/check с `LOGINOM_AI_AGENT_STRICT_RECOVERY=1` прошли на исходном CLI; journal пуст, acknowledge не требовался. Сохранены generation1/credentials, добавлены URL32783/generation2 и8 новых validation/knowledge ACKtrue/exit0; no writer/owners. Исходный own stand снова остановлен, другие failed guards не восстанавливались. Это пригодность профиля после offline recovery, не ретроактивный native-cleanup PASS. [Evidence](/home/kiselev/storage/tmp/local-paths-74-ptufs123/b2-recovery-20261026/): `offline-*.json`, private `profile-before.tar`/`archived-writer`, `public-check-proof.json`, `status-final-receipt.json`, `result.json`, `stand-stopped.json`.

### B3. Собственная Docker-сеть

Исходный `checkIsolatedLoginom` exit2 наbbd2 ошибочно требовал имя `loginom-net`; обязательный alias уже был в собственной сети. Модели не запускались. Исправлен только поиск точного `loginom-server-7.4.2-test` среди всех сетей; marker/container/no-mount/empty/Python/predecessor guards и slot-ветка сохранены. Original evidence: `task8/benchmark-preflight/{stand.json,result.log,receipt.json}`.

Own Studio route квалифицирован реальными общим NetworkID, DNS/IP, Apache WebSocket target и served `wsproxy=true` после entrypoint; installed9cb public setup/check/status,5closeACK0/no writer и полный binary/bubblewrap preflight на harness54bd7b8142+recorded patch прошли. Это native/preflight qualification, не модельный benchmark. Собственная пара остановлена с data/state, все68 прежних контейнеров неизменны. Evidence: `b3-private-network-20261026/{route-topology.json,candidate-integrity.json,native-route-proof.json,admission.json,preflight.json,stand-stopped.json}`.

### B4. Unicode upload и скрытый breadcrumb

Исходный installed9cb default-save истратил остаток100с на upload: `BROWSER_CALL_UNCERTAIN`, destination отсутствует, Open/Save не было, CLI1/no ACK/guard retained. Повтор в том же Docker image воспроизвёл отказ до Open. Это исходный **FAILED/UNKNOWN**, не доказанный flaky; ранние logs не сохранили первичное execute exception. `task8/default-save/`, `b4-close-20261026/{installed,native-docker,native-api}/`.

FileReader discriminator установил отсутствие UTF8 locale: Unicode FileList0 при успешном setInputFiles, ASCII bytes/SHA корректны. Task-local `LANG=C.UTF-8` (без LC_ALL) исправил Unicode на0644 и staging0400/0500; installed payload и shared Desktop Dockerfile не менялись. Отдельный Group input_mapping/NODE_RELEASE_REFUSED остался исходным FAIL; его handler не исправляли. Default-save затем проверяли на автономной B1 Calculator-фикстуре: именно её mapping-отказ вызвал660px caption, из-за которого Ext скрывал node breadcrumb. Минимальная проверка native node GUID/Ext reference для input/main/output сохранила ownership guards и дала source GREEN; source resourceACK не выдавался за native Close. Evidence: `b4-close-20261026/{file-reader,node-breadcrumb,node-breadcrumb-fix,node-breadcrumb-green}/`.

Завершение B4 подтверждено новым clean installed9f723 natural default-save и native lifecycle, описанными выше: `b4-close-20261026/installed-green/`. Старые guards и отказы сохранены. При исчерпании Docker address pools собственные `/28` выделяли только после проверки непересечения сетей/маршрутов; общие сети не меняли.

### B5. Save после Export

Оба installed93f52 CLI transitions исходно **FAIL (~1003с)**: Save записал bytes, но navigation predicate искал `Сценарий>ExportCSV` вместо workflow; `SAVE_RECEIPT_MISSING`, `CONFIRMED_SAVE_REQUIRED`, no ACK/retained writer. Физические amount*3/CSV30/60/75 не заменяют canonical Save/native closure. Original: `task8-final-20261026/routing/{result-at-blocker-93f52cc169.json,cleanup-boundary-93f52cc169.json,run-docs-after-edit-93f52cc169-01,run-edit-after-docs-93f52cc169-01}`.

Минимальная native WorkFlowTreeNode/Ext-reference привязка выбирает workflow breadcrumb, сохраняет hidden ancestors и исключает node/port suffix. TDD55+80PASS; source GREEN2933мс с canonical Save/Close/logout/no discard/ACK0 — `task8-save-receipt-20261026/{summary.json,diagnostic.json,evidence/result.json,fix-work,green/}`. Последующее ревью также исправило public prepare после reload: storageBinding передаётся только private upload/open, RED→GREEN77tests. Эти source-результаты не подменяли installed acceptance: окончательно B5 закрыли четыре перехода8d650 и повтор двух benchmark-case с сохранением описанных выше CLI1/FAIL/offline различий.

### Другие существенные отказы

- Studio entrypoint перезаписывал ранний `wsproxy:true` в `auto`: ранняя CLI попытка попала на общий8080 и отменена, native cleanup не подтверждён/guard retained. Исправлена task-local последовательность readiness→проверка served config; успешные повторы шли только в own Studio. `early-smoke/`, `reconnect.json`, `stand-cleanup.json`; это не cleanup PASS первой попытки.
- Dev CLI docs выдал PDF, но Read/final answer упали API400/unsupported WebSocket PDF; исходный CLI1 не PASS. Prod9cb использует штатный HTTP transport, полный тот же сценарий прошёл без skill/provider patch или model fallback. `task8/routing-run-v2/`, `task8/routing-run-prod/`, `task8/cli-prod-manual-review.json`.
- Старый verifier ожидал внутренний outcome вместо публичного delivery; TXT allow передавался через удаляемый bootstrap `CONFIG_CONTENT`. Исправлены runner-проверка и supported `LOGINOM_AI_AGENT_PERMISSION`. Старый CSV driver FAIL сохранён, его saved artifact отдельно проверен офлайн, затем prod4/4 получен отдельно: `task8/csv-offline-recheck/`, `task8/routing-run-v2/`, `task8/routing-run-prod/`.
- Docs-after-edit на9f723 действительно был SEMANTIC_INCOMPLETE (Markdown не подтверждал amount*3). Additive Calc Expressions extraction и exact-fact checks исправлены, исходный плохой текст продолжает отвергаться. На8d650 другой, положительный текст ошибочно отклонял whole-paragraph tripwire; sentence-scoped helper253f дал лишь производную офлайн-переоценку этого CLI FAIL. Actual MD SHA057140de23c97452429e6d624c350152a106046e4364e205d4b112f99434b579; прежний negative и amount*30 отвергаются. `task8-final-20261026/{docs-expression-fix,docs-fact-verifier,routing}/`, `task8-reprepare-20261026/docs-fact-verifier-fix/`.
- Calibration prestarts отказали на version cleanup и затем401 expired private OAuth до подтверждённой inference; вердиктов модели они не дали. Private config/auth восстановлены под lease, global files неизменны; успешный official run отдельный. `task7-calibration-20261026/` (исходные launch/stdout/stderr/exit и `retry-{1,2}/`, `auth-recovery/`, `config-sync/`).
- Candidate2206 prestarts отказали `LOGINOM_MANIFEST_PAYLOAD_MISMATCH` до model/native actions: собственный sidecar внутри payload перенесён наружу, manifest/archive/image unchanged. Crash logging93f52 сначала SIGILL под deepTMPDIR; тот же binary/test на коротком TMPDIR прошёл6/6, точный native predicate не доказан. Original failures сохранены: `task8-save-receipt-20261026/routing/prestart-admission-failure.json`, `task8-final-20261026/docs-fixed-candidate/crash-logging-signal/`.

## Ограничения и сохранённые ресурсы

**Windows native filesystem acceptance — NOT_RUN:** в этой приёмке не было Windows environment. Продолжение требует native Windows с закреплёнными candidate/resources, абсолютными путями с пробелами/кириллицей и несколькими источниками; Linux string/unit tests её не заменяют.

Общая attribution-проверка **не PASS**: известен baseline mismatch `client/README.md` (ожидалось `c80b3a06…`, фактически `1c5fdc7b…`). Affected entries проверены отдельно, immutable source-map не менялся. Source-only результаты ниже не устраняют это ограничение.

Own CLI32806/32805, Desktop32800/32801, benchmark32807 и завершённые B1–B4 пары архивированы/остановлены; UserStorage/SessionBackup, Docker state, успешные профили и исходные failed guards сохранены. B2 recovered только свой исходный профиль с архивом guard; остальные failed profiles не выдаются за пригодные к reuse. Другие сервисы/профили не менялись. Evidence: `task8-reprepare-20261026/routing/own-stands-archive.json`, `task8-reprepare-20261026/benchmark/stand-postrun/receipt.json`, B1–B4 `stand-stopped.json`.

Итоговое evidence review: `task8-reprepare-20261026/final-evidence-review/final-documents.json`, SHA256 `d75b4c8bbffe13b95675000bde4fd38a8da9eb3ef61c702e2a68efb059151611`. На момент приёмки diff от merge-basea30a651266:92files/+4205/−348=4553changed text lines,4binary; исходный общий сигнал154files/4990textlines не повышался. Превышения локальных сигналов Task6–8 рассмотрены независимым simplicity review; пересекающиеся объёмы не складывались. Это исторический объём до последующих source-исправлений, не текущий git diff.

## Последующие source-проверки

- Continuation fix от базы `106d2759e06dc5e453d3707c42528b4d887f0039`: после confirmed no-effect menu refusal существующий original-ID `open_package` продолжает reserved receipt с fresh readiness/foreign-workflow guards; uncertain replies не повторяют Open/upload. RED→GREEN,7runtime files111/111, attribution/review Approved. `reserved-open-fix-20261027/{plan.md,red-main.log,red-foreign.log,targeted-tests.log,attribution.json,review.md}`. Без rebuilt/installed/model acceptance.
- Rebase36commits `d087986049afb3707e700d82bcd077ee812d423e` на `loginom=db13009886534c3d115096a9ad8e3575275381ec`, replay tip `039cde6c8524fbd98e47202a4ef109b879605bc1`; range-diff без потерь, backup ref сохранён. Integration fix совместил native hidden-node identity с inherited input mode/navigation/opening guards. Source507checks, Agent/Host typechecks,16affected attribution entries PASS/review Approved; unfiltered UI run остановлен без verdict, заявлен только адресный subset. `rebase-20261027/{range-diff.txt,red-hidden-input-mode.log,*-merged-green.log,attribution.json,review.md}`.
- Более поздние полные локальные наборы и их skips/environment limits — в [отдельном отчёте27.10](local-file-paths-local-tests-2026-10-27.md); публикация ветки и source CI исправления — в [плане PR/CI](../../superpowers/plans/2026-10-27-local-file-paths-pr-ci.md). Они не меняют привязку установленной модельной приёмки выше. Слияние и выпуск — отдельная команда владельца.
