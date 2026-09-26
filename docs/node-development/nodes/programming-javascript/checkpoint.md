# JavaScript: checkpoint исполнения

Дата: 2026-09-26. Фаза **0A/0B: OpenViking восстановлен; discovery JavaScript продолжается**.
Пользователь назначил исполнение [плана](plan.md), Ubuntu и только headed-браузеры.
Начаты операторские наблюдения 0B. JS-handler, полное discovery, ревью реализации
и CLI-приёмка ещё не выполнены.

Повторная проверка после перезапуска Codex: MCP `health`, actor `find` и чтение
найденной записи `g2_g3_module_integration.md` успешны. Установленный Doctor
0.8.1 подтвердил credentials, `system/status`, 15 MCP tools и все подсистемы
`/ready`: **0 failures**. Единственное предупреждение — исторические ENOENT
при чтении rollout других задач; текущий поиск/чтение ими не заблокированы.
Настройки доступа не менялись. Разработчик продолжает G2/G3 operator в прежней
задаче; до передачи проверенной версии новый live-прогон не запускался.

## Актуальная диагностика после запроса пользователя

### Live30: selection/source/Next наблюдены, G2 ещё открыт — 2026-09-27

Freshprofile03, unchanged operator29, Chromium1246: status OBSERVED, process0.
Полный typed input и mapping подтверждены; selection допустил одну новую DOM
shape при сохранённых native owner/cell. Мастер открыт, режим code установлен,
контрольный source прочитан целиком с SHA256
`e0ea9794bb7e640ed0918f8bbdb48d4b0ae5b097959d248528a48ba7aa8f8749`.
Next UI transition terminal/owner verified, но sentinel не найден:
**execution=ambiguous, gate_passed=false**. Отсутствие сообщения не доказывает,
что JS не исполнялся. Все668 journal references SHA проверены.
Cleanup package_closed/logged_out/browser_closed=true, crash не было.

Следующий этап назначен той же задаче разработчика: bounded batch независимых
G2 cases в одном fresh-profile heldcontext, общий проверенный input и новый
JS-node/UUID/source binding на каждый случай. Один общий30min предел, прежние
phase deadlines, no replay неизвестных UI effects, общий cleanup. Подтверждённый
UI transition с отсутствующим sentinel не приравнивать к потерянному dispatch;
такое наблюдение не закрывает G2 и допускает только проверенное закрытие draft
перед независимым следующим узлом. Profile03 после этого запуска не переиспользовать.

### Доказана зависимость crash от рестарта профиля — 2026-09-27

Exact1246 `chromium1246-restart-matrix/report.json`: три fresh profiles,
каждый запускался в трёх отдельных процессах. Первые3PASS; все6 последующих
REUSE завершились native crash (4SIGSEGV,2SIGTRAP). Контроль fresh-per-process:
**9/9PASS**,22bytes и1500ms survival. Все local browsers закрыты. Это установление
условия воспроизведения, не доказательство конкретной ошибки native lifetime.

Discovery адаптирован к уже существующему product lifecycle: отдельный fresh
profile на попытку, как managed-entry attempts/randomUUID. Assignment/host lease
переназначены на `javascript-discovery-profile-03`; receipt
`profile-reassignment-03.json` содержит прежний assignment SHA и основания.
Profile02/старые данные сохранены; они не очищались. Это не retry прежнего
server effect. Trial30 code-sentinel-next начат с unchanged freeze29 и новым
UUID/evidence; результат ещё ожидается. Для следующей попытки нужен новый
профиль, а не повторное использование03 после download и рестарта.

### Live29: SIGSEGV на1246; проверка повторного профиля — 2026-09-27

Operator29 freeze13 и22 operator tests PASS, но live не дошёл до selection:
Chromium1246 закрылся при download/saveAs. Outcome AMBIGUOUS, cleanup исходного
прогона не подтверждён;41 journal refs SHA проверены. Fresh dump
`957fc655-cbca-4fbc-8851-28e8c8bdbd5d`: PID894822, exception11/SIGSEGV,
faultaddr0, RIPchrome+0x44941db. Это не прежний SIGTRAP; общая причина неизвестна.
Следовательно обновление1246 **не доказало устранение crash**. Результаты
local15PASS и live28PASS сохраняются как ограниченные наблюдения.

Отдельный headed recovery29: packages0, logout/browserClosed=true, без
package mutations и без повтора неопределённого download. Следующая диагностика
не меняет прежние server files или исходный profile02.

[Playwright42506](https://github.com/microsoft/playwright/issues/42506) описывает
аналогичный crash при повторном persistent profile на Edge152/Windows; это
гипотеза, не доказательство нашей причины. Root начал exact1246 local matrix:
три группы по три отдельных browser processes с reuse против fresh-each.
Все headed/sandbox=true; проверяются bytes и1500ms post-save survival.
Прежняя15-file матрица выполняла пять downloads внутри каждого одного процесса
и не проверяла последовательные рестарты. Product managed-entry создаёт
fresh attempt profile; discovery operator повторно использовал assignedprofile02.
Решение по профилям — только после результатов и сверки product lifecycle.

### Live28: Chromium1246 прошёл download; DOM selection отказ — 2026-09-27

Infrastructure зафиксирована отдельным commit **58d85fe07c** в node-javascript:
17 файлов dependencies/pins/packaging/credits/MCP ownership tests/docs.
Незавершённые operator/shared discovery changes в этот commit не включены.
Root не выполнял merge/cherry-pick в продуктовую ветку или выпуск.

Новая связка прошла реальный upload/download157bytes с точным SHA256,
полный typed input6×5 и input0 mapping. Аварии Chromium нет. JS GUID
`f263f739-ba85-4385-b98b-584470434edb`; storage новой пробы
`/jsteach/js-g2-6ae16eee-7cea-4500-8143-49846c25a0d5`.
После единственного private body click оператор отказал в open-wizard:
`Private selection DOM changed` (dispatch/returned/refused записаны).
Это не доказательство смены native node: требуется различить обычную
перерисовку selected shape и реальную потерю owner. JS source не вводился.

Все648 references проверены SHA256 по полным journal lines с LF.
Cleanup package_closed/logged_out/browser_closed=true, recovery не нужна.
Назначен operator29: доказуемая привязка нового DOM к сохранённым native
workflow/graph/node/GUID/cell после выбора, без повторного click; отдельно
закрыть известные private reopen/execute paths до следующих G2/G3 cases.
Общий public JS deny не изменять. G2/G3 и весь план остаются открытыми.

### Source gates перед live28 — 2026-09-27

Root повторил operator/shared suites плюс новый MCP-contract: **123 PASS**.
Bridge, managed-shutdown, action-catalog-lifecycle: **23 PASS**; отдельный
catalog suite: **11 PASS**. Прежние отказы этих четырёх suites в среде задачи
разработчика не воспроизвелись. Evidence: `operator28-tests.txt`,
`browser-1246-runtime-regressions.txt`, `browser-1246-action-catalog.txt`.
Freeze27 всех13 операторских/shared файлов совпал; новые dependencies/product
pins/session config дополнительно закреплены в `g2-operator-28-source.json`.

Начата live28 `code-sentinel-next` на assigned profile02 и exact1246. Это новая
независимая проба с новым UUID/evidence, не replay прежнего upload/download.
Результат и cleanup ещё ожидаются; не считать запуск закрытием G2.

### Exact1246: реальные MCP paths и staging PASS — 2026-09-27

После перевода MCP-owned integration ветки на продуктовый stdio transport:
`browser-1246-integration-02.txt` — **2 PASS, 0 FAIL**, process exit0 за7.7s.
Оба браузера headed/sandbox=true, download/upload bytes, picker scoping,
geometry, reload/new tab подтверждены; оставшихся fixture Chromium процессов
нет. Source hashes до последующей сверки неизменны. Managed explicit context
ownership сохранён, продуктовый shutdown не ослаблялся. Первая leak-проба
остаётся failed cleanup и не заменяется этим результатом задним числом.

Shared stageResources(flavor=cli) собрал `resources-1246-01`; bundled Node
выполнил verifyResources и независимую сверку product fields/runtime sources:
**PASS4375files, mismatches=[]**. Manifest SHA256
`cc6aa31baeb0426ea0fadcc143d26245b8630d087580b08f89912179e54fd736`.
Evidence: `stage-1246-01.txt`, `resources-1246-01-verification.json` в campaign.
Это staging/source acceptance, не compiled CLI бизнес-приёмка или Desktop build.
Live Loginom на новой связке ещё не запускался; следующий шаг — завершение
source handoff/checks и новая независимая G2 проба с новым evidence directory.

### Новый MCP: интеграционная проверка и cleanup — 2026-09-27

Root запустил existing browser-downloads.integration.test.mjs с exact1246,
новой связкой MCP/Playwright, DISPLAY=:1, LOGINOM_DOCK_TEST_HEADED=1.
Оба режима подтвердили download/upload/geometry/navigation assertions, но
MCP-owned browser остался после finally; **общий PASS не засчитан**.
Source freeze шести файлов до/после совпал. Evidence: campaign
`browser-1246-integration.txt`, `browser-1246-integration-source.json`,
`browser-1246-integration-cleanup.json`.

Installed coreBundle.js:createConnection создаёт BrowserBackend без dispose
callback; Context.dispose освобождает listeners/tabs, но не браузер. CLI backend
передаёт закрывающий callback. Existing test использовал in-process API и для
MCP-owned варианта, хотя продуктовый createBridge запускает CLI через stdio.
Разработчику передана проверка реальных ownership paths: stdio для MCP owner,
переданный context + явный close для managed. Исправление ещё не проверено.
Зависший собственный local-fixture Chromium закрыт SIGTERM после проверки
точных PID/PPID/profile; тестовый Node завершился. Это forced cleanup, не
штатное завершение. Loginom и его пакеты в этой проверке не открывались.

Во время подготовки OpenViking read дважды дал timeout15s; повторный Doctor
показал timeout /mcp при исправных authorization/systemstatus/ready. Работа
была приостановлена. Затем MCP health и чтение **той же** URI прошли за <1s
без правки настроек; точная причина транзитного сбоя не установлена.

Официальные native архивы154.0.8037.0 скачаны и executable hashes измерены:
Windows `e3390ab4c5d43b720a4aac16cb5c3889857a449d1aaeeda4ec86005beb98ff37`;
macOS arm64 `ae4d66517f6879a70239c073f7be3d3b4d82bb3158938c6cb456bcd66f8f386e`.
Provenance сохранены в campaign, native execution NOT_RUN.

### Перезапуск Codex и exact1246 — 2026-09-27

Повторная MCP health/actor search и установленный Doctor: PASS, 0 failures.
Авторизация, system/status, 15 MCP tools и /ready подтверждены. Единственное
предупреждение относится к прежним ENOENT чужих rollout; конфигурация не менялась.

`chromium-1246-matrix-report.json`: exact Chromium1246/154.0.8037.0 прошёл
три независимых headed запуска, 15/15 local blob файлов с точными bytes;
все процессы exit0. Linux executable SHA256
`1e0652a37f41d22ca22066c40896398cb7acce71f2746028061064369b299ab9`.
Это локальная диагностическая проверка; managed/MCP Loginom acceptance нового
комплекта ещё предстоит. Source operator27 и прежние неопределённые эффекты
не повторялись.

Root установил MCP0.0.82 в client worktree с pinned Node (npm exit0, changed3).
Разработчик продолжает согласование pins, config, staging и проверок в той же
задаче; root готовит платформенные executable hashes из официальных архивов.
Экспорт chrome://credits/ выполнен exact1246 с новым Playwright в видимом браузере,
sandbox=true: 768 sections, 8454009 UTF-8 bytes; браузер штатно закрыт.
Text SHA256 `cea255da4312bb6d32ec752e911c2074f5fba89463d773e6c004f5b56e1dc36d`,
gzip SHA256 `7113fe981e2d1031f3c40cc7408231dd918bef487d9a2e36ad466a68fc0c6507`.
Native Windows/macOS acceptance этим не подтверждается.

### Сравнение версий Chromium — 2026-09-27

`chromium-version-matrix-report.json`: по три независимые копии profile02,
до пяти local blob22bytes download на запуск, same Playwright1.63-alpha,
headed/sandbox=true,1500ms post-save наблюдение. Chromium153.0.8010.12:
два FAILED до первого подтверждённого download, один PASS5. CfT154.0.8037.57:
три PASS, все15 файлов точны. Это проверка зависимости от версии, не доказательство
конкретного upstream fix; sandbox/защита скачивания не отключались.

Diagnostic binary154.0.8037.57 SHA
`e528b77a8b250c48a5bbd7aeeabbc2813940c0a2fe39b1b11fbaf1f01fb04f18`, official
CfT URL/metadata сохранены в `cft-154-diagnostic-pin.json`/`cft-available-builds.json`.
Он не принят как product pin и не использовался для G2 Loginom.

Primary npm metadata: @playwright/mcp0.0.82 закрепляет playwright/core
`1.64.0-alpha-1789764292000`, Chromium1246/154.0.8037.0; стабильный Playwright1.63.0
всё ещё содержит Chromium1243/153.0.8010.12. Root начал скачивание **точного1246**
для отдельной диагностической проверки; результат154.0.8037.57 на него не переносится.
Developer делает read-only аудит согласованного обновления dependencies/lock,
release pins, resource verification и Linux acceptance. Источники27 frozen;
продуктовые версии пока прежние. До нового G2 нужны точная browser-проба и
согласованное решение по связке, без обхода проверки pins оператора.

### Operator27: busy settlement PASS, Chromium crash повторился — 2026-09-27

После preflight поправки root повторил122 теста PASS, freeze13/syntax. Private
selection теперь отклоняет descendant Execute/Preview/port/control; body/icon
с точным владельцем допускаются. Live27 до этой проверки не дошёл.

На profile02 download снова завершился SIGTRAP (PID816917, 21:38:51.838Z).
Смена профиля **не является надёжным исправлением**. Перед этим впервые live
подтверждён same-owner busy settlement: ready/loadCount4 → busy/loading4 →
ready/loadCount5/count2/file_ready, без Refresh/upload replay. UI157bytes видны,
download gesture SUCCEEDED, saveAs target_closed; hash не подтверждён.
Все41 journal references проверены. Путь этой отдельной пробы сохранён:
`/jsteach/js-g2-6d4cd820-1ab1-4f1e-b0d7-6650c3b7aaf7`.
Headed recovery27: packages0, logout/browserClosed=true, без package mutations.

Локальная диагностическая матрица на шести отдельных копиях profile02:
`download_bubble.partial_view_enabled=true` — 3/3 PASS; false — 2/3 PASS,
одна SIGTRAP. Все пробы headed, sandbox=true, same pins, blob22bytes, с1500ms
наблюдением после сохранения. Следовательно отключение панели не доказано
как исправление и не применяется к продукту/исходному профилю.

CfT official metadata от2026-09-26 перечисляет Stable154.0.8037.57. Root готовит
отдельную локальную пробу этой версии для сравнения; product pins, runtime и
operator27 пока не меняются. Не переносить результаты другого бинарника на
Chromium1243/153.0.8010.12. Developer выполняет bounded offline source/crash audit.

### Operator27: preflight selection audit — 2026-09-27

Первый source handoff27 заменил неприменимый generic selection отдельным
private native body click и наблюдением Setting. Root повторил121 адресный
тест PASS, но **live27 не запускал**: `shape.contains(hit)` допускает попадание
во вложенный Execute/Preview/port overlay, если Setting ещё недоступен.
Это риск неверного действия, а не наблюдённое исполнение JavaScript.

Разработчику возвращена одна конкретная поправка до freeze: проверять ближайший
`data-tid`/владельца hit отдельно для body и Setting; descendant Execute должен
давать ноль кликов, собственный body/icon — допустимый выбор. Общий UI deny
не менять. На момент записи задача разработчика активна; требуется обновлённый
handoff и повтор адресных checks перед первой live27. Source manifest27 ещё нет.

Дополнительно отмечены неготовые downstream paths: `reopen()` требует generic
begin_wizard, Execute при невыбранном узле может попасть в generic body selection.
Они не вызываются в следующем `code-sentinel-next`, но должны быть исправлены
до соответствующих G2/G3 trials; готовность всего operator/плана не заявляется.

### G2 operator26: fresh profile PASS, generic selection deny — 2026-09-27

На unchanged freeze13 operator25 новый выделенный профиль подтвердил download
и bytes/hash CSV, полный typed input6×5 и двухсторонний input0 mapping5. JS GUID
`4856d23f-c0d9-4cb6-8c72-1e15447762da`; source/storage этой отдельной пробы —
`/jsteach/js-g2-64ff0659-3f76-4f1f-93fb-ca07761d9d13`. Source JS не вводился.

Отказ до открытия мастера: `Prepared graph node has no observed selection point`.
Journal652: prepared node verified, graph/unlocked, body и label visible/enabled,
оба `interaction.state=point_observed`, но **allowed_actions=[]**. Общий UI deny
JavaScript действует штатно; `selectPreparedGraphNode` требует разрешённый click
и поэтому неприменим для этой discovery-пробы. Screenshot подтверждает отсутствие
Setting, а не маску/потерю native owner. Все652 journal references SHA проверены.

Все штатные cleanup flags true: package_closed/logged_out/browser_closed.
Recovery26 не нужна. Это успешное прохождение прежнего download участка в новом
профиле, не доказанное устранение первопричины Chromium crash.

Разработчику назначен operator27: отдельный private diagnostic selection с
native/DOM/owner/hit-test binding и одним жестом под прежним opening deadline,
по аналогии существующих operator port/Setting clicks. Generic UI deny сохраняется;
не подделывать allowed_actions и не добавлять преждевременный public handler.
После выбора обязательно повторное same-node наблюдение Setting. Следующий live
только после source handoff; G2/G3 остаются открытыми.

### Изоляция Chromium download crash и новый профиль — 2026-09-27

В `~/.config/google-chrome-for-testing/Crash Reports` найдены minidumps21/23/25.
Offline-разбор metadata/registers/frame pointers: общий RIP `chrome+0x850d1fb`
после `int3`, совпадают 12 последовательных return addresses. Сохранённый EDX
после `sub 6`: 21/25=`0xcdcdcdc7`, 23=`0x7468`; все проходят unsigned `>3`
в trap. Это подтверждает одинаковый путь отказа, но не причину неверного состояния.
Exact-tag Chromium153.0.8010.12 source и disassembly согласуются с гипотезой
`DownloadItemImpl::IsDone`/`InternalToExternalState`; matching symbols пока нет.
Архив официальных Google Chrome symbols скачан, но Build ID
`f911272ebbb5182d003df59dfe2ab1cd347e18ea` отличается от используемого CfT
`801e223ae2df0c3aa4d000dd388ed8048a864b9e`: символизация им недопустима.
Dumps/heap не отправлялись наружу; runtime source не менялся.

Дополнительные независимые **headed** local download trials, same pinned
Chromium/Playwright/sandbox, без Loginom и без повторов прежних server effects:

- 01: HTTP + fresh profile — PASS22bytes; 02: HTTP + campaign profile — PASS22bytes.
- 03/04: invalid diagnostic HTML (`URL` в onclick разрешался как document.URL),
  download не возник; эти пробы ничего не доказывают о blob-пути.
- 05: исправленный `window.URL`, blob22bytes + campaign profile — SIGSEGV,
  RIP `chrome+0x4449bca`, другая сигнатура; равенство причин с SIGTRAP не доказано.
- 06: тот же valid blob + fresh profile — PASS22bytes; 07: повторное открытие
  профиля06 и новое независимое blob-скачивание — PASS22bytes.

Профиль `connection-preflight-profile` сохранён для диагностики. Для продолжения
discovery назначен `javascript-discovery-profile-02`; private assignment/lease
обновлены с backup и `profile-reassignment-02.json`. Это изоляция наблюдаемого
сбоя, не доказанное исправление Chromium и не ослабление продуктовых guards.
Operator26 запущен на неизменённом freeze13 operator25, отдельные draft/storage.
Текущий результат проверять по `g2-operator-26/report.json`; запуск не равен PASS.

### G2 operator25: Chromium SIGTRAP подтверждён — 2026-09-27

Root повторил 118 адресных тестов, freeze13 и syntax: PASS. Same-owner busy
settlement исправлен под исходным deadline, перед Refresh повторяется полный
контекст и удерживаемый native store. Regression N→N+1 исключает засчитывание
фоновой загрузки за результат Refresh; замена store до dispatch даёт ноль кликов.

Live25 сразу увидел готовый CSV157/loadCount5/count2, поэтому ветка busy/Refresh
не была задействована. Download gesture SUCCEEDED; saveAs завершился closed-target.
Private process log впервые подтвердил **exitCode=null, signal=SIGTRAP** в
21:11:27.448Z. Download event — 21:11:27.273Z; page/context закрылись до запроса
operator cleanup. Crashpad сообщил `elf_dynamic_array_reader.h:64 tag not found`;
это не доказательство причины crash. JS/import не запускались. Upload/download
не повторять; путь `/jsteach/js-g2-4468f056-303e-40fe-972f-542cddf4848f` сохранён.

Отдельная headed recovery25: packages0, logout/browserClosed=true,
packageMutation=false. Затем независимая локальная HTTP download-проба с новым
профилем, теми же Chromium/Playwright и sandbox=true прошла: saveAs, точные22bytes,
exit0/signalnull. Это ограниченная проверка базового скачивания; она не воспроизводит
Loginom/blob/старый профиль и не устанавливает причину SIGTRAP. Evidence:
`chromium-download-diagnostic-01/report.json` в приватной кампании. Raw logs вне git.

Разработчик выполняет read-only разбор download/launch пути; source25 frozen.
Следующий live run пока не назначен: сначала ограниченная диагностическая проба
для локализации crash. G2/G3 и весь план остаются незавершёнными.

### G2 operator23/24: download interruption и transient busy — 2026-09-27

После перезапуска root снова проверил MCP health, actor search и read записи
`operator24_diagnostic_launch.md`: PASS. Doctor 0.8.1: 0 failures, прежнее
предупреждение о недоступных исторических rollout. Настройки не менялись.

Operator23 подготовлен с native `selectPreparedGraphNode` перед поиском Setting
и единым 90-секундным opening deadline; 116 адресных тестов PASS. Live source
`javascript-live.mjs` SHA `5401250fe91b080061bbe28ad3049e386a6774d70dd792713f0208ac1684c219`.
Оба прогона использовали одни frozen13 исходники. До открытия JS wizard они
не дошли, поэтому исправление раскрытия Setting пока live не проверено.

Operator23 подтвердил Refresh собственной файловой панели: native loadCount4→6,
появление CSV и UI bytes157. Но на download.saveAs page/context/browser закрылись
до operator close request; target_closed=true, события page_crash нет. Причина
не установлена. Upload/download не повторялись. Отдельная headed recovery23:
packages0, logout/browserClosed=true, packageMutation=false. Серверный путь
`/jsteach/js-g2-9a452876-5845-4477-9206-e7d00e8881bb` сохранён, hash неизвестен.

Operator24 — самостоятельная новая проба с приватным `DEBUG=pw:browser` log.
Здесь браузер завершился штатно: exitCode0, signal=null, после operator cleanup;
package_closed/logged_out/browser_closed=true. Recovery24 не требуется.
До download gesture не дошло: readiness ready=true/loading=false/loadCount4,
затем refresh preconditions сохранили все owner predicates, но увидели busy mask
`MF;TF-2;FileStorageForm`. Получен `DISCOVERY_EMPTY_DIRECTORY_UNCONFIRMED`.
Это подтверждённый переход ready→busy между двумя наблюдениями, не crash.
Путь `/jsteach/js-g2-02238f91-5242-49c5-9fbb-0f7f0e7a2c52` сохранён.

Разработчику назначен operator25: ограниченное исходным deadline ожидание
same-owner busy и повторная полная проверка контекста до единственного Refresh,
без replay upload/download и без ослабления guards. Root продолжает владеть
браузером; следующая проба только после source handoff. G2/G3 остаются открытыми.

### G2 operator22: input-port proof PASS, Setting absent — 2026-09-26

Root повторил **110 адресных тестов PASS**, syntax/freeze13. Live operator SHA
`0cba99eaf3da0700eb3e1a454615cb47ee8ce790210d54a77fe402b279f3342f`.
Download и серверные bytes подтверждены; imports.text дал полный typed6×5 PASS.
JS GUID `d7eef805-0b69-46b6-a16b-de9c1b5d5050` соединён input0. Отдельный
native port reader подтвердил полный same-node schema/mapping пяти колонок,
RowID Integer; port GUID `9dc72a3f-56bf-3bfc-84ec-f979daf4da6b`.

После закрытия port wizard основной мастер не открыт: `Unique bound Setting
control required`. GUID и `MF;TF-1;Graph;JavaScript` до/после совпадают, node
rendered=true. Screenshot показывает JS с выделенным входным портом без Setting.
Зависимость Setting от hover/selection пока гипотеза; разработчик проверяет
штатный механизм открытия и добавляет наблюдаемое UI-раскрытие control.
JS source/Next ещё не отправлялись.

**Все штатные cleanup flags true**: package_closed/logged_out/browser_closed.
Recovery22 не нужна. Новый fsync lifecycle journal содержит download и затем
явно запрошенное оператором закрытие → page_close/context_close/disconnected;
crash/неожиданное закрытие не наблюдались. Это не объясняет прерывание operator21.
Следующий source handoff/live — operator23; матрица полного плана остаётся открытой.

### G2 operator21: ожидание загрузки PASS, download interrupted — 2026-09-26

Root повторил **107 адресных тестов PASS**, сверил freeze11 и syntax.
Оба новых waits используют настоящие functions с poll flag; regression проверяет
ложный initial sample и deadline. В headed operator21 исправление подтверждено:
native store loading=true/loadCount4/count1 перешёл к loading=false/loadCount5/
count2/file_ready=true. Появилась уникальная `sales.csv`, UI bytes157 проверены.
Refresh и повторный upload для этого результата не потребовались.

После `download_gesture_result=SUCCEEDED` получен **AMBIGUOUS /
DOWNLOAD_BROWSER_CALL_FAILED**, cleanup=false. До создания failure snapshot
page/context/browser уже закрыт; оператор не мог завершить package/logout.
Причина закрытия не установлена. User/system journal в 23:44:34 MSK содержит
завершение `app-org.chromium.Chromium-730200.scope`; в проверенном интервале
нет записей OOM/segfault, что не доказывает отсутствие сбоя. chrome-debug.log
в профиле отсутствует. Пользователю задан фактический вопрос о ручном закрытии,
ответ пока не получен; молчание не трактуется как подтверждение причины.

Upload/download gesture выполнены однократно. Серверный hash неизвестен;
путь `/jsteach/js-g2-a7457f4f-fc5a-480c-b8b3-a20a62da374e` сохранён. Повторять
эти эффекты нельзя. Отдельная headed recovery21 подтвердила packages0/logout/
context close без package mutations. Разработчик исследует download lifecycle
и добавляет доказательства close/crash/error cause для source handoff operator22.
До JS/import этот run не дошёл; G2/G3 не закрыты.

### G2 operator20: доказана ошибка Playwright wait predicate — 2026-09-26

Freeze11/syntax и **105 адресных тестов PASS** повторены root. Новый headed
operator20 опять остановился до JS, но доказал точную причину мгновенных waits:
в два новых `page.waitForFunction` передавалась **строка arrow-функции**.
Установленный `playwright-core/lib/coreBundle.js` (client60579/server24345)
передаёт `isFunction=false` для строки и возвращает результат eval(expression)
без вызова; сам function object truthy. Это локально проверенный контракт,
не гипотеза о скорости сервера. Прежние VM fixtures неверно моделировали его.

Journal20: discovery before/terminal показывают loading=true и собственную
`FileStorageForm.bg-mask-message`, отказ `DISCOVERY_READY_CHANGED`. Cleanup
before20:40:08.670Z/after20:40:08.676Z оба ready=false, blocker «Загрузка»;
60-секундный срок не исчерпан, ожидание ложно завершилось примерно за 6ms.
Upload20 отправлен однократно, серверные bytes неизвестны; повтор не разрешён.
Исходный cleanup unconfirmed, browser закрыт. Отдельная headed recovery20
подтвердила packages0/logout/context close без package mutations.

Назначено исправить оба waits на реальные functions с poll/diagnostic режимом
того же predicate. Regression обязан моделировать фактический Playwright
контракт и проверять false initial sample, ожидание settlement и исходный
deadline. Следующий source handoff/live — operator21. Native empty-store proof
operator19 остаётся действительным; закрытие G2/G3 из этих проб не следует.

### G2 operator19: native empty-store proof — 2026-09-26

Root сверил freeze 11 файлов, syntax и повторил **102 адресных теста PASS**:
discovery16/delivery51/download13/verification7/workflow-activation7/operator8.
Live SHA `b6da61a61a86519c6596c806eb9eb81a18f16be23a3889a3563ffaed9624cced`;
shared discovery SHA `4d72a6e51e0a79236953882aa9e2741f3f76c7aeabb5e45a26815523743c6d5d`.

Новый headed operator19 подтвердил empty-directory binding: native
`bg.filedialog.FileStore`, loadCount4, count/total/materialized1, полный cache,
единственная parent-row `..`, собственный empty placeholder, masks/dialogs0.
После `artifact_empty_directory_pending` получен
`NOT_APPLIED / DISCOVERY_EMPTY_DIRECTORY_UNCONFIRMED`; Refresh не подтверждён,
download не отправлялся. Upload отправлен один раз, bytes остаются неизвестны.
Storage `/jsteach/js-g2-dca583e7-176f-46ca-94af-ff26ea6ec85e` сохранён;
загрузку этой попытки не повторять. Root проверил **40/40** journal references.

Cleanup допущен по исходному native package/workflow, но activation вернул
`NOT_APPLIED / Workflow activation blocked`. Исходный итог снова
`CLEANUP_UNCONFIRMED`, browser закрыт. Отдельная headed recovery19 подтвердила
0 packages, logout/context close без package mutations. До JS/import не дошло.

Разработчику переданы точные observations для operator20: диагностировать
конкретный ранний отказ refreshDirectory (control уже наблюдался enabled/visible),
снять bounded inventory блокеров activation и ждать их settlement в исходном
cleanup deadline. Guards, uncertain upload и запрет повторных эффектов сохранить.
Перед этим разработчик ошибочно завершил один ход старым memory bootstrap;
основное задание восстановлено в той же задаче, память healthy, нового enrollment
нет. Исторические memory instructions не являются текущим заданием.

### G2 operator18: upload verification readiness — 2026-09-26

Исправлены conditional initial page admission (только после same-node input-port
proof) и отдельный cleanup deadline. Полные journal events заменены в report
ссылками line/SHA; fsync journal и полная acknowledgement сохранены. Восемь
адресных тестов, syntax/freeze девяти модулей PASS; live SHA
`05069877d8cbc21e813a94cfc924307375550a105f84df2a4ecebe3537c373d0`.

Headed `code-sentinel-next` остановился **до импорта и JS**. Новый upload
отправлен один раз; receipt `upload_native_input_settled` требует проверки
серверных bytes. Немедленный download verification вернул `NOT_APPLIED /
DISCOVERY_GRID_BLOCKED`, итог delivery — **AMBIGUOUS, inspection_required**.
Повтор upload запрещён. Папка `/jsteach/js-g2-f8d8b105-d7fc-4688-8de1-1970af704758`
создана; наличие/bytes серверного файла в этом прогоне не подтверждены.
В screenshot список пуст. Связь отказа с устранением медленного report write —
гипотеза для проверки semantic readiness, не доказанная первопричина.

Исходный cleanup снова unconfirmed: `Owned draft changed`, хотя packages1,
Package1/path empty/running false; активная вкладка — StorageDirectoryTreeNode,
не прежний workflow. Browser закрыт. Отдельная headed recovery18 подтвердила
0 packages, logout/context close без package mutations. Разработчику назначено
исправить readiness download и безопасный возврат к собственному workflow
для cleanup; проверку принадлежности пакета не ослаблять.

Root независимо проверил **38/38** line/SHA references against actual journal
bytes, report 30016 bytes. Следующий новый evidence directory — operator19
после source handoff. Изменения admission из operator18 до live JS не дошли;
они пока подтверждены только локальными тестами. Полный scope плана сохранён.

### G2 operator17: вход проверен, условная первая страница — 2026-09-26

После source handoff в прежней задаче выполнен headed `code-sentinel-next`.
SHA оператора `ed6493c7895676e869bf9d83cbce5cdab326f8c6dfa56930b00dbfcb45b5d496`;
freeze всех девяти модулей — приватный `g2-operator-17-source.json`. Перед запуском
root повторил шесть адресных тестов и syntax checks: PASS.

В собственном context успешно созданы UUID storage directory и серверная копия
157-byte CSV с закреплённым SHA, без overwrite. Штатный `imports.text` выполнился,
полный typed input **6×5 PASS**: все значения, порядок, exact integers и пробелы.
JS GUID `62507b20-f268-4eab-8a7b-23136b462108` создан, input0 link подтверждён
graph diff. Storage `/jsteach/js-g2-108ed9e6-c209-4b58-abc0-c95c9ad240bc` с CSV
оставлен как диагностический ресурс; удаление не выполнялось.

У connected JS первая native page — **JavaScriptColumnsWizard index0**, четыре
индикатора. У прежнего unconnected node первой была TuneDataSourceInputPortWizard.
На deadline все ownership/readiness predicates истинны, blockers пуст,
единственный отказ — `input_page_expected`. Ни JS source replacement, ни
Next/Done/Preview/Execute с probe source не выполнялись. **G2 не закрыт**.

Operator завершился `CLEANUP_UNCONFIRMED`: close снова потребовал initial input
page с истекшим opening deadline; package/logout не подтверждены, browser закрыт.
Отдельная headed `g2-recovery-17.json` в 20:11:45Z подтвердила account `jsteach`,
**0 packages**, logout и context close, без package mutations. Она не заменяет
неуспешный cleanup исходного прогона.

Разработчику передано исправление admission условной первой страницы с отдельным
подтверждением input mapping, самостоятельного once-only cleanup deadline и
избыточного копирования полного journal в report (33MB report/17MB journal).
Полные fsync receipts должны сохраниться. Следующий live — только после нового
source handoff, новый evidence directory operator18; source/probes G4 run16
повторять не требуется. Серверная ОС, полный G1–G7 и CLI-приёмка остаются открыты.

Пользователь попросил перепроверить причину и сообщил, что ничего не менял.
Журнал владеющего Desktop App Server подтверждает для той же задачи:
`17:17:27.465Z starting → 17:17:42.445Z failed`, затем
`18:29:50.697Z starting → 18:30:04.867Z ready`; в `18:39:08.004Z` снова ready.
Прежний отказ запуска больше не является текущим блокером.

В turn `01a0df04-a426-7b50-babf-b43bbe5dc48e` инструменты реально появились,
но `mcp__openviking__health` и `mcp__openviking__find` оба отклонены до обращения
к адаптеру: `MCP tool call requires approval, but approval policy is never`.
Причина текущего отказа — несовместимость требуемого подтверждения инструмента
с политикой задачи, а не доказанная недоступность OpenViking.

Проверены локальный helper регистрации и фактическая конфигурация: per-tool
approval settings отсутствуют; registration config SHA совпадает с текущим файлом.
Все 15 инструментов свежего каталога адаптера не имеют `annotations`, включая
`readOnlyHint`. Штатный root MCP health успешен; pinned Node получил HTTP 200
за 1.001 с, прямой curl — 200 за 1.405 с. Отдельный Doctor в том же ходе встретил
сетевой timeout и отказ VPN-проверки CLI launcher; это сохранено как отдельное
наблюдение, не как установленная причина прежнего старта или текущего policy refusal.
У процесса адаптера и координатора одна network namespace. Проверки не меняли
VPN, proxy, credentials или sandbox.

Исходная транспортная первопричина неизвестна: adapter заменяет upstream error
на общее сообщение, а transport logger отключён. Длительность около 15 секунд
согласуется с timeout, но не доказывает его. Улучшение безопасной диагностики
требует отдельного изменения исходников/поколения; текущие pins не переписаны.

Пользователь явно разрешил **все операции памяти, включая запись**. На idle-границе
в существующем worktree установлено `mcp_servers.openviking.default_tools_approval_mode
= "approve"`; согласованно обновлён config SHA регистрации:
`54994d52ba430d7acb76517fa71cd52cda20a3658dda1a2fb2e9cd5aab8617d9`.
Прежнее предложение только девяти операций чтения заменено этим решением.
Global config, approval_policy и sandbox не менялись. Побайтная проверка
подтвердила сохранение capture state, activation, routing receipt и hooks;
новый enrollment не выполнялся, cursor не сбрасывался. Backup и receipt —
приватный `.local/project-memory/rollouts/20260926.2/approval-all-20260926/`.
Свежий App Server `config/read` увидел настройку; проверка hooks сохранила пять
trusted project hooks и отсутствие original memory hooks в worktree. Доверие
hooks само по себе не подтверждает разрешение вызовов MCP.

Пользователь перезапустил Codex. Root health и точное чтение ранее извлечённого
результата успешны. В той же задаче разработчика запущен turn
`01a0df0d-b86b-73e2-ab7f-b1778a97a466`: проверить actor health/find/read после
перезапуска, затем продолжить bounded диагностику wizard-ready11. Разработчик
в 18:50:41Z подтвердил успешные health, find (один результат) и exact read.
Доступ обеих задач восстановлен, продуктовая работа возобновлена.
Исходники адаптера и его generation не менялись.

После восстановления проверено и новое извлечение: root actor find/read вернули
`viking://user/kiselev/peers/-home-george-git-loginom-ai-agent/memories/events/2026/09/26/operator_pass14_ready.md`.
Запись содержит сообщение разработчика после перезапуска и правильный SHA
оператора14 `20a2553407442e4231a832659f6f7772f4f427182c27c2b439218f8f8b494f45`.
Это дополнительное доказательство доступности нового общего контекста из root;
ручной remember/capture не запускался. Summary другой записи назвал cleanup15
успешным, что противоречит его report: cleanup был подтверждён отдельным
recovery15. Канонические reports/checkpoint имеют приоритет над summary памяти.

## Продолжение G1 после восстановления памяти

Operator12 запущен координатором в headed Chromium под `jsteach` на прежнем
стенде и профиле. Проверки native ownership мастера (GUID, исходный `FModelNode`,
workflow, tab, package ancestry и root) прошли. Единственное false-условие —
`no_visible_blockers`: начальные маски загрузки исчезли, к deadline осталась
ровно одна `.x-mask.x-border-box` над `TuneDataSourceInputPortWizard;colTargetDelete`,
размер 30×27. Поэтому полное отсутствие любой `.x-mask` не является корректным
условием готовности этой страницы. Нельзя исключать все маски: разработчику
поручена точная проверка принадлежности маски disabled control.

Private evidence: `g1-operator-12/report.json`. Результат прогона —
`CLEANUP_UNCONFIRMED`, browser closed, Close не отправлялся, logout не подтверждён
самим оператором. Отдельный readonly recovery12 подтвердил аккаунт `jsteach`,
0 пакетов, успешные UI logout и закрытие browser context; evidence —
`g1-recovery-12.json`. Source insertion, Next, Done, Preview и engine probes не выполнялись.

Operator13 (operator SHA256
`fa4f618d047035b8529d3f63088b04ae908b8714758bd77467f112a556313675`)
подтвердил native `Ext.grid.column.Action`, `disabled=true`, exact DOM identity,
цепочку владельцев grid/page/wizard и совпадение геометрии оставшейся маски.
Не прошли только предполагаемые `empty_mask` и `no_dialog_role`; реальная маска
содержит дочерние элементы и role. Эти предположения не подтверждены source и
не должны считаться доказательством загрузки. Разработчик уточняет структуру
штатной Ext mask; blanket-исключение всех масок не вводится.

Report13: `CLEANUP_UNCONFIRMED`, browser closed, Close/Next не отправлены.
Recovery13 отдельно подтвердил `jsteach`, packages0, logout/context close.
Private evidence — `g1-operator-13/report.json`, `g1-recovery-13.json`.
Режим `--inspect-pages` подготовлен, но ещё не запущен. G1 не закрыт.

Operator14 подтвердил исправление маски: cached native mask identity,
отсутствие видимого сообщения и все ownership predicates прошли; overlays1,
blockers0. Source SHA оператора —
`20a2553407442e4231a832659f6f7772f4f427182c27c2b439218f8f8b494f45`.
Штатный Ext `Element.mask()` содержит presentation/message subtree:
[официальный исходник](https://docs.sencha.com/ext/6.2.0/classic/src/Element.js-1.html).
Live проверка cache identity подтверждена на самом стенде.

Первый `--inspect-pages` остановился до Next: поиск `input[type=radio]` вернул
0 при существующих Ext indicators, index=null. Это неверное предположение об
HTML controls, не доказательство отсутствия страниц. Single Close и подтверждение
успешно вернули исходный WorkFlowTreeNode/граф с тем же JS GUID
`8f607965-3a27-4b81-96a6-5ef070f5e3ee` (`wizard-close-settled`). Cleanup затем
истёк в `wait-owned-package-ui`: код использовал observation до закрытия мастера
и fallback visibility только по размерам. Разработчику переданы исправления
наблюдения native indicators и обновления observation после Close.

Report14 остаётся `CLEANUP_UNCONFIRMED`; отдельный recovery14 подтвердил
`jsteach`, packages0, logout/context close. Evidence: `g1-operator-14/report.json`,
`g1-recovery-14.json`. Editor/source/engine не проверены; G1 остаётся открытым.

Operator15 (SHA256 `e1cf0472b21357ef621c55dc4abeef6855529f180518d4b5dd20a35c7b24a128`)
подтвердил переходы 0 `TuneDataSourceInputPortWizard` → 1
`JavaScriptColumnsWizard` → 2 `JavaScriptCodeWizard`. Всего пять native
`Ext.form.field.Radio`, их `InputEl` — HTML `input type=button`; ownership и
согласование native checked/DOM прошли. Два Next выполнены по одному.

Полный CodeMirror read: 2 строки, 130 UTF-8 байт, SHA256
`6eb6e2f9e8395c9b00185f1fa9f77cae18c041784f2b2033da946e74aebecc64`,
`source_redaction_changed=false`; owner `JavaScriptCodeWizard;cmpCodeCM`.
Настройки: readOnly=false, mode=javascript, indentUnit=4, indentWithTabs=false,
smartIndent=true, electricChars=true. Это чтение исходного шаблона, не проверка
ввода, исполнения или сохранения. Версия CodeMirror и оставшиеся страницы ещё
не наблюдены. Single Close/confirmation с code page вернули собственный граф.

Cleanup15 остановился при закрытии пакета: ожидание по одному размеру hidden
messagebox могло завершиться раньше появления нового Save dialog, затем
одноразовый dialog.count() пропустил discard. `cleanup-refusal` подтверждает
ожидаемый вопрос о сохранении Package1 и кнопку «Не сохранять». Разработчику
передана замена на bounded observation видимого exact dialog либо packages0,
с записью эффектов до single dispatch. Report сохраняет CLEANUP_UNCONFIRMED.
Recovery15 отдельно подтвердил `jsteach`, packages0, logout/context close.
Evidence: `g1-operator-15/report.json`, `g1-recovery-15.json`. G1 частично закрыт
наблюдениями identity/editor, полный gate и G2–G7 ещё открыты.

Operator16 завершён с **подтверждённым полным cleanup**: package closed,
UI logout и browser closed true; дополнительный recovery не потребовался.
Source SHA оператора `4c335c766c4622b93ade7d69b6f7ad127eaf14d5733184b582ec1f4163f244c5`.
CodeMirror на стенде — **4.11.1**, настройки совпадают с operator15.

G4 input probe: keyboard.type изменил sample (896 вместо 849 байт); insertText
передал sample точно (849 байт/8 строк, 20ms). Граничный insertText: ровно
32768 UTF-8 байт/1024 строки, полное совпадение SHA256
`5aead120eaa874ee7b1f02c0e2971dd79eac6ddf091528053b59ccf343b186e0`, 1007ms.
Baseline восстановлен точно, прежний SHA `6eb6e2f9…ebecc64`, 22ms.
Aggregate `PROBE_PASS`, selected_method=insertText, full_g4_status=not_closed.
Это доказательство выбранного способа ввода и readback на этом редакторе;
сохранение, исполнение и вся матрица G4 ещё не доказаны.

После восстановления шаблона единственный Next со страницы code2 открыл
`DoneWizard`, «Описание узла», checked native indicator4. Indicator3 оказался
скрытым; его назначение не установлено. Остальные native owners и отсутствие
blockers подтверждены. Оператор ошибочно требовал видимость всех индикаторов
и переход строго index+1, потому финальный work status FAILED на
`expected_page_transition`. Исправление должно сохранять owner и ограниченный
порядок, но учитывать наблюдённые пропуски условных страниц. Done/Preview не
нажимались. Evidence — `g1-operator-16/report.json`; очистка прошла штатно.

## Подготовка G2/G3

Координатор проверил `execution-probe-design.md` разработчика: собственный
закреплённый CSV → наблюдённые typed input6×5 → отдельные declared/code trials,
sentinel положительно доказывает исполнение, отсутствие sentinel его не
отрицает; passive table read не должен повторять Execute. Execution runner
ещё разрабатывается, live G2/G3 не запускался.

Независимый private oracle подготовлен стандартным Python csv из source с
проверенным SHA `4fce338d2edd2901ba35732ed148a1a80eba4a5fbf927f2828f3cdbe6b8fa09e`.
Сохранены пробелы Customer, кириллица и все30 входных значений. Ожидаемый
результат — 6×2: ObservedID Integer1..6 и PhaseMarker String JS_G2_TABLE_V1,
исходный порядок, numerical tolerance0. Technical names входа ещё должны быть
наблюдены на стенде; позиционное совпадение не заменяет binding.
`g2-independent-oracle.json` в кампании, SHA256
`d61d649ed91c41c4961f51855508a893b17d6fc75b11c30419d3836186e8f97a`.
Статус expected_not_live_validated; это не финальный business CLI oracle.

Source oracle в новом `javascript-execution-evidence.mjs` независимо сверён
координатором с Python oracle: все30 входных и12 выходных значений и обе схемы
совпали (pinned Node, package directory). Live correctness этим не доказана.
В review передано требование fresh sentinel messages для конкретного
once-effect/node/source SHA: прежняя запись консоли не подтверждает исполнение
после нового Next/Done/Preview; terminal outcome проверяется отдельно.


## CLI-профиль: offline reconciliation после отменённого OAuth

Старый guard отменённого сеанса (nonce `b0e663b1-6c9f-48f0-9e32-54150f220415`)
архивирован только после проверки отсутствия процессов со ссылками на собственный
профиль в args/environment/cwd/fd, пустого state/locks и отсутствия auth.json.
Недоступные служебные процессы отдельно идентифицированы как sd-pam/ssh-agent.
Acceptance lease свободен; проверка/архивирование выполнены под registry lock.

Первый source `providers list` в developer worktree завершился CLI_START_FAILED:
AppRuntime import не находил cross-spawn в SDK. Pinned Bun1.3.14 выполнил
`install --frozen-lockfile --ignore-scripts`, установлено2 пакета. bun.lock SHA256
до/после совпал: `e97377f2000cd858fa0d4d770cc5f03d0012312edc4606267cb3c3b3513184ff`.
Guard этого неуспешного запуска тоже архивирован после отдельной offline-проверки.
Повтор `providers list` завершился exit0, **0 credentials**; штатный выход снял
.writer, state/locks пуст, auth.json отсутствует. OAuth не возобновлялся, прежний
код входа не используется. Это подготовка source CLI, не приёмка candidate.

Private receipt/backups: `cli-oauth-offline-reconciliation-20260926/` в прежней
кампании. CLI profile остаётся прежним, новый профиль/кампания не создавались.
Требуется новый собственный OAuth перед приёмкой собранного кандидата.

## История остановки: MCP при возобновлении разработчика

После recovery11 задача разработчика подтвердила отсутствие OpenViking tools
и ошибку `MCP startup failed`, code `-32003`, `OpenViking transport request
failed; no automatic write replay.` Это наблюдение turn
`01a0deec-d45a-7493-a286-913922938f20`, а не отрицание ранее проверенного полного
цикла. Продуктовая работа приостановлена по правилу проекта о доступной памяти.

Координатор повторно прочитал точный URI результата через штатный root-плагин.
Установленный Doctor подтвердил `/ready`, авторизацию и 15 MCP tools:
0 failures; warning относится к прежним ENOENT transcript других задач.
Свежий отдельный запуск того же собранного `20260926.2/server.mjs` выполнил
initialize/tools-list и получил 15 инструментов без stderr. Причина первоначального
транспортного сбоя не установлена; ошибка уже загруженного MCP-клиента разработчика
остаётся. Не объявлять её доказанной ошибкой регистрации или недоступностью сервера.

Регистрация, routes, hooks и capture state не менялись. Наблюдённый cursor — 298,
canonical workspace Peer сохранён; ручной capture/commit не запускался.
Приватный receipt — `developer-memory-startup-20260926T1814.json` в кампании.
Разработчик idle; Browser закрыт с подтверждённым logout/recovery11; resources
lease сохранён, CLI acceptance slot не занят. Начатый device-code OAuth процесс
ожидал входа; при окончательной остановке отменён координатором через Ctrl+C,
exec session 82194 завершился с exit 0. Auth-файл не появился; `.writer/owner`
остался, поэтому профиль нельзя считать освобождённым. Guard сохранён для
отдельной reconciliation перед следующим OAuth запуском, не удалён вслепую.

Следующий шаг: Restart MCP `openviking` в приложении, владеющем задачей, затем
actor health/find/read в **той же** задаче разработчика. Root CLI daemon control
socket отсутствует; новый отдельный App Server не обновит подключение Desktop.
Пользователю отправлен запрос перезапуска MCP, при отсутствии кнопки — Codex.
Не пересоздавать задачу, не повторять enrollment и не сбрасывать cursor.
После восстановления продолжить диагностику конкретного условия wizard-ready11,
затем G1–G7. Runtime/исходники адаптера и предыдущие доказательства сохранены.

Блокер подтверждён в трёх последовательных ходах Goal: исходная диагностика,
повторный turn `01a0deef-c99b-7e41-a799-8074412e5efb` и последний
`01a0def0-6c07-7d82-b3a3-f269d3225e60`. Каждый повтор дал ту же ошибку запуска
при одном вызове зарегистрированного MCP. Все 18 файлов source manifest совпали
с hashes. Дальнейших безопасных действий для восстановления MCP уже загруженной
задачи доступными средствами не найдено; Goal переводится в **blocked**, не
complete. После перезапуска подключения пользователем продолжить эту кампанию.

## Актуальное состояние после реализации адаптера

- В Git добавлены собственные исходники project-memory, generation `20260926.2`,
  source commit `1419ec3906b80a30be91cdd5bab9af35ad88e548`.
  Внешний macOS adapter больше не требуется. Старые hashes/runtime сохраняют
  историческое значение; [отчёт реализации и проверки](../../../../services/loginom-ai/tools/project-memory/ubuntu-adapter.md).
- В прежнем worktree `.worktrees/node-javascript` создана настоящая задача
  `01a0de3e-6a07-7661-aa88-ed4807aef6ec` — «JavaScript: общая память и допуск Ubuntu»,
  Astra medium. Product base `a8ad59766dbdb4f2da0b54367a755ce00891dd71` сохранён.
  После передачи документации исходный чистый HEAD разработчика —
  `b21a63f01ad326870c70c2479508508bc59825c1`; plan source —
  `14a4fa47b676f087eac06de21a2654737788f8ef`. Все 30 отличающихся от base файлов
  документации совпали с источником побайтно; product code не переносился.
- Registration `22ccfcf0-7919-4954-9342-82450a28a6f3` активна. Пять project hooks
  trusted, original memory hooks в worktree отсутствуют; основной плагин сохранён.
- Реальные host metadata Codex совпали с thread/cwd. Успешны actor health/find/read,
  официальный Stop/capture, native PreCompact/commit, exact read-back и semantic
  find результата из основного проекта. Cursor `0 → 13 → 22`, сервер: 22 сообщения,
  один commit. При смене поколения capture state сохранён побайтно; сброса не было.
- Извлечённая запись:
  `viking://user/kiselev/peers/-home-george-git-loginom-ai-agent/memories/events/2026/09/26/memory_verification_success.md`.
  Ручных remember/write не было. Локально: 59 runtime Node + 13 Python + 23 helper
  Node checks PASS. Документационный validator и diff whitespace checks PASS.
- Runtime и квитанции приватны: `.local/project-memory/{runtime,rollouts}/20260926.2/`.
  Неуспешный первый runtime/rollout `20260926.1` сохранён. Основной checkout и корень
  worktree получили `0755` вместо `0775`; cache плагина не менялся, hooks используют
  отдельную защищённую копию с теми же bytes. Validators ownership не ослаблены.
- На границе проверки памяти compaction turn completed подтверждён приложением;
  тогда задача была notLoaded, model/hook
  writer не оставлен работающим. Capture cursor 22, ovSessionId null, own lock отсутствует.
  Browser/CLI в этой проверке не запускались; выделенный headed profile закрыт ранее.

Продолжение назначено **этой же** задаче после переноса явно выбранных docs-only
commits: фазы 0A/0B и разработка до первого ревью. Browser/account/profile lease
теперь принадлежит координатору: разработчик готовит исходники оператора,
координатор выполняет headed-проверки и возвращает evidence. Параллельных
Loginom-сессий нет. Повторная регистрация не нужна. Использовать Ubuntu
Node/Bun, `jsteach`, заданный стенд, только headed; установить server OS и storage,
подготовить независимый CLI profile/candidate, выполнить JS discovery. Полный план
обучения пока не завершён; снята его блокирующая зависимость от внешнего adapter.

## Текущее выполнение на Ubuntu

Desktop при продолжении задачи разработчика выбрал managed sandbox без доступа
к сети стенда и внешнему browser profile. Возобновление этой же задачи отдельным
App Server остановлено штатным active-writer guard. Guard, capture state и
права sandbox не менялись. Поэтому координатор выполняет живую часть в своей
разрешённой среде; разработчик сохраняет владение исходниками handler/оператора.

Разработчик подготовил каталог 14 engine probes и оператор `javascript-live.mjs`
в своём worktree. Это пока исходники проб, не доказательство native execution.
Первый headed запуск `g1-operator-01/report.json` подтвердил account `jsteach`,
Loginom Enterprise 7.4.2, ноль исходных пакетов, собственный черновик `Package1`
и native model `MF;TF-1`. На скрытом элементе палитры выполнение остановилось;
JS-узел не создан. Закрытие черновика подтверждено Count=0, logout первой попытки
не подтверждён. Отдельная адресная recovery `g1-recovery-01.json` затем подтвердила
тот же аккаунт, ноль пакетов, UI logout и закрытие browser context. Обе попытки
сохранены вне Git. Server OS/storage остаются не установленными; G1 не закрыт.

Дополнительные наблюдения: `g1-palette-02` завершился с полным cleanup, но снял
пустое дерево до загрузки строк. В `g1-operator-03` ожидание строк подтвердило
палитру и элемент JavaScript; отказ произошёл при hit-test после прокрутки,
до drag. Сообщение — `Palette item covered after scroll`, а не timeout.
Cleanup остановился на неизвестном подтверждении, его последний native snapshot
показал Count=0. Отдельный `g1-recovery-03.json` подтвердил `jsteach`, ноль пакетов,
UI logout и context close. Следующий шаг — ограниченная диагностика координат,
фактического элемента в точке захвата и сообщения cleanup; не повторять drag
без устранения причины. Все 14 engine probes по-прежнему not_run.

Последующее уточнение `g1-hit-test-04`: элемент перекрывала `bg-mask-message`
формы сценария. При раннем закрытии наблюдён диалог Loginom
`Cannot read properties of null (reading 'GetNodes')`. Ожидание снятия маски
в 05 устранило это препятствие. В 05 также обнаружена ошибка атрибуции оператора:
системный узел переменных был принят за новый; JS creation этим не доказан.
В 06 после нового drag появился отдельный GUID/label JavaScript, но проверка
ошибочно отвергла промежуточные null icon/DOM. Сохранён фактический prompt
отбрасывания своего пакета и кнопка «Не сохранять». Recovery06 прошла.
В 07 создание пакета подтвердилось, но workflow не загрузился за 30 секунд;
это ошибка подготовки графа, не JS-кода. Screenshot показывает загрузочную
маску без сообщения об ошибке. Для 08 owner пакета связывается до ожидания
графа; отдельный диагностический предел графа — 90 секунд, без повторного create.

Независимая readonly-проверка `storage-platform-01.json` подтвердила отсутствие
пакетов до/после навигации (reconciliation07), собственный каталог `/jsteach`,
native `DefaultStorageDirectoryTreeNode`, доступные Upload/CreateDirectory,
UI logout и context close. Файлы/каталоги не создавались: write/readback ещё
not_checked. Assignment обновлён этим наблюдённым storage; server OS не установлен.

В worktree разработчика зафиксирован отдельный Host commit `9d75933fac`:
валидированный явный URL сохраняет внутренний `urlSource: explicit`, поэтому
не мигрирует на product default при restart. Старые записи без provenance
сохраняют legacy migration. Проверки разработчика: 44 tests PASS, включая
6 отдельных процессов для Desktop/CLI codec; Host typecheck PASS. Координатор
прочитал diff и выполнил commit, поскольку sandbox разработчика запрещает
запись worktree git index. Это source-проверка J27, не actual candidate CLI gate
и не формальное ревью фазы 5. Product base регистрации не изменялся.

Последующие попытки G1 сохранены отдельно:

- 08 выявила ещё одну промежуточную фазу создания: native package уже существует,
  но имя/путь ещё null. Recovery08 подтвердила `jsteach`, Count=0 и полный выход.
  Оператор теперь сначала связывает native package, затем ожидает его metadata
  и граф в пределах одного исходного deadline, без повторного Create.
- 09 доказала создание отдельного JS-узла: GUID
  `5de8c1c2-47ac-4d58-b61a-025cbcc41d54`, иконка `bg-vendor-icon-javascript`,
  собственный DOM в графе; системный узел переменных сохранён. Double-click
  внутреннего vertex был отклонён из-за перекрытия кнопками выбранного узла.
  Закрытие пакета, UI logout и browser close подтверждены в этой попытке.
- 10 открыла мастер через принадлежащую этому узлу кнопку `;Setting`, как
  существующий `node-wizard-open.mjs`. Наблюдена страница «Настройка входных
  столбцов». При закрытии появился точный диалог подтверждения с кнопками
  «Да/Нет»; оператор его не обработал. Recovery10 подтвердила Count=0 и выход.
- 11 сохранила screenshot и DOM уже открытого мастера без видимого сообщения,
  но readiness predicate истёк. Это отказ оператора, а не доказательство
  неработоспособности JS-узла. Close не отправлялся после истечения deadline;
  cleanup той попытки не подтверждён, browser context закрыт. Отдельная
  `g1-recovery-11.json` подтвердила account `jsteach`, Count=0, UI logout и
  context close. Следующая проба должна показать результат каждого условия
  readiness и проверить native ownership по существующему node-context.

После recovery11 браузер закрыт; lease профиля остаётся у координатора.
CodeMirror, источник/версия редактора, страницы после входного mapping и
движок ещё не проверены. Все 14 engine probes остаются `not_run`, G1–G7 открыты.
Видимые пять индикаторов страниц мастера нельзя автоматически приравнять
к четырём страницам исторического e2e enum; порядок предстоит наблюдать.

CLI dependency preparation завершена закреплённым Bun по lockfile. После
адресной reconciliation собственного неуспешного старта команда source CLI
`providers list` завершилась с exit 0 и показала 0 credentials в отдельном
профиле кампании. Начата штатная device-code OAuth авторизация ChatGPT, ожидается
пользовательский вход. Название метода `headless` относится к device-code flow,
браузер в этом процессе не запускается. Это source preflight, не compiled
candidate и не CLI-приёмка. До приёмки нужны собственный candidate и проверка
OpenAI OAuth/доступности Sol по регламенту.

## История подготовки до нового адаптера

Ниже сохранены прежние проверки и причины остановки. Статусы «не создана»,
«adapter отсутствует» и прежний next trigger относятся к прошлым шагам;
актуальный допуск и следующий шаг указаны выше.

## Изоляция и владельцы

- campaign: `javascript-20260926-ubuntu`, mode `single`, единственный узел
  `component.programming.JavaScript`; attempt реализации/CLI ещё не создан.
- Координатор: task `01a0ddc9-3e19-75d3-a5c9-724783ed6c35`, основной checkout
  `/home/george/git/loginom-ai-agent`, ветка `javascript`.
- Создан постоянный worktree
  `/home/george/git/loginom-ai-agent/.worktrees/node-javascript`, ветка
  `node-javascript`, чистый HEAD/base
  `a8ad59766dbdb4f2da0b54367a755ce00891dd71` (`loginom`).
- Задача разработчика/её bootstrap **не созданы**; регистрация памяти не активна.
  Это намеренно сохраняет HEAD==base для fresh-enrollment helper.
- Исходный согласованный docs source:
  `086cad12c3` (перед исполнением); дополнения Ubuntu находятся в этом checkpoint
  и соседнем плане. Перед переносом закрепить полный SHA docs-коммита этих файлов.
  Координаторские изменения memory kit — отдельный
  `01cc4dc86392cf3e8820780fc8cc68b6e9a22985`; они не меняют product base.
  Переносить только явно выбранные docs-only commits после допуска памяти.
- Приватный общий журнал:
  `~/.local/state/loginom-ai-agent/node-development/host-resources.json`, owner —
  текущая задача; создан под атомарным `registry.lock` после проверки списка задач
  приложения и процессов. Других активных Loginom-задач в полученном списке нет;
  существующие Chrome-процессы не присваивались и не изменялись.
- Кампания: `~/.local/state/loginom-ai-agent/node-development/campaigns/javascript-20260926-ubuntu/campaign.json`.
  Lease `javascript-20260926-ubuntu-preparation`; CLI slot не занят,
  `acceptance.lock` не создавался. Общий lock записи освобождён.

## Проверено на Ubuntu

1. Сеть: назначенный `http://logi-test-plan.bg.local/app/` разрешается в
   `10.200.11.224`, прямой HTTP GET вернул 200.
2. Пользователь назначил выделенный аккаунт `jsteach`; он закреплён в lease.
   Секреты в документацию/Git не сохраняются.
3. Штатный `src/connection-check.mjs::loginBrowser`, отдельный профиль
   `connection-preflight-profile` внутри приватной кампании, `headless:false`,
   Chromium1243, действующий DISPLAY, sandbox и `--no-proxy-server`.
   Прочитаны фактические account=`jsteach`, Connected=true, `bg.app.Version=7.4.2`,
   PackageNodes.Count=0. Logout через UI и закрытие собственного context подтверждены;
   пакеты/узлы/файлы Loginom не создавались. Native receipt:
   `connection-preflight.json`; операторский скрипт и screenshot — рядом, вне Git.
   Screenshot был сделан до полной отрисовки рабочего интерфейса и не доказывает
   готовность палитры/мастера. Редакция и ОС сервера пока **не установлены**.
4. Отдельный toolchain в
   `~/.local/state/loginom-ai-agent/node-development/toolchains/`:
   Bun `1.3.14+0d9b296af`, полный Node `24.19.0`, npm `11.17.0`.
   PATH пользователя и системный Bun `1.3.13+bf2e2cecf` не менялись.
   Bun получен из [официального release](https://github.com/oven-sh/bun/releases/tag/bun-v1.3.14);
   archive SHA256 `951ee2aee855f08595aeec6225226a298d3fea83a3dcd6465c09cbccdf7e848f`
   сверён с GitHub release asset digest. Node archive SHA256
   `14b342e71204f811bde6153be8e04b62aef63c236fef92b55f9c83154b409647`
   сверён с официальным SHASUMS256; executable SHA256
   `bc17c508ffeed0ec622934f9b7fa72f8e78da65350e63c3eceb56fa688aa5e12`
   совпал с product pin. Точные пути — приватный `javascript-toolchain.json`.
5. Использованный Chromium executable SHA256
   `8c599d43aec53f2460a31ae2f4af6bd863f8258b34ff519564bc5d4726bfaa1e`
   совпал с Linux product pin. Это ещё не проверка целого candidate/resource manifest.

## Память и переносимость подготовки

Основной checkout использует рабочий штатный OpenViking. Doctor подтвердил
авторизацию, `system/status`, чтение, MCP и `/ready`: 0 failures, 1 warning о
прошлых прерванных recall. Точное чтение памяти текущего проекта прошло.
Effective Peer выводится из Ubuntu cwd; macOS URI не копировался.

Подтверждены и исправлены в координаторском kit:

- Исходный adapter передаётся явно `--source`; больше нет исполняемого default
  `/Users/kartamyshev/...`. Старый upstream manifest/hashes сохранены.
- `review_hooks.mjs --codex <absolute executable>` вместо пути macOS app.
  Настоящий Ubuntu `/home/george/.local/bin/codex` (Desktop 0.153.4) успешно
  выполнил initialize и hooks/list; системное доверие этим чтением не менялось.
- Фактический установленный ID — `openviking-memory@loginom-dock`, версия 0.8.1.
  Он передаётся `--plugin-id`, сохраняется в manifest и отключается только в
  новом worktree. Для прежних manifest сохраняется прежний marketplace.
- До bootstrap inventory должен доказать отсутствие original memory hooks
  **любого marketplace** в worktree; helper отказывает раньше захвата данных.
- Ubuntu umask `0002` создаёт `0775`/`0664`, которые текущий ownership validator
  отвергает. В тестовых fixtures установлен приватный umask; в CURRENT описаны
  проверка прав и защищённая копия неизменённого plugin pin. Права основного
  checkout и установленного плагина ещё не менялись, validators не ослаблялись.

Локальные проверки: **11 Python preparation tests + 4 Node hook-review tests PASS**.
Первый Python запуск дал 11 setup errors из-за umask `0002`; после исправления
fixtures — 11/11. Python suite выполнялась с временным preparation fixture:
настоящий overlay и `workspace-peer.mjs`, совпавший с upstream hash;
`server.mjs` специально неработоспособен и выбрасывает ошибку при запуске.
Это проверяет Git/TOML/manifest preparation, **не собранный MCP adapter**.
Node suite использует процесс RPC fixture и не пишет реальное доверие Codex.
Проверки синтаксиса Python/Node и `git diff --check` прошли.

Отдельный исходный `integrations/codex-mcp-adapter` с 11 файлами из manifest
пока не найден в проверенных checkout, cache и подходящих локальных архивах.
Установленный официальный plugin — другой компонент и не содержит этот adapter.
Путь/репозиторий его копии запрошен у пользователя. Поэтому project runtime,
hooks manifest/install, registration ID, bootstrap, activation и actor access
новой задачи пока отсутствуют. Тестовый fixture не установлен как runtime.
Capture/extraction/read-back новой задачи ожидают её допуска и первого этапа.

## Следующий шаг

Владелец — координатор текущей задачи. Восстановить точный исходный adapter,
проверить все hashes и собрать настоящий runtime. Затем закрыть права/identity
установки по CURRENT, проверить новый worktree до bootstrap, создать настоящую
задачу, оформить свежие receipts, activation и actor health/find/read.
После допуска перенести docs-only commits и выполнить discovery 0B в headed
Loginom под выделенным аккаунтом. Отдельно установить edition/ОС сервера,
палитру JavaScript, доступный storage, action manifest и будущий CLI/OAuth profile.

Подготовительный Loginom logout/context close подтверждены; неизвестных мутаций
или pending browser operations нет. Приватный profile/evidence сохранён.
При возобновлении сверить worktree, процессы, account lease и receipts;
не создавать вторую кампанию и не сбрасывать состояние существующих задач.

## Продолжение 0A: интерфейс и целостность bundle

Повторная проверка 2026-09-26, после docs source
`ed45485ac032ff6bc4921a2ca4a55a5650356719`. Worktree остаётся чистым на product
base; разработчик/bootstrap ещё не созданы, исходный adapter по-прежнему отсутствует.
Запрос его доступной копии остаётся без ответа. Предыдущий этап дал реальный
прогресс (Ubuntu helpers/toolchain/login), этот — следующие наблюдения.

- Штатный `verifyResources` выполнен bundled Node: **4668 файлов PASS**,
  manifest SHA256 `ff80b90e2c543a0f3afcdddae843af28372fad43c27c51cce0d58a7f9c66a9b4`.
  Приватный receipt — `source-bundle-verification.json` в каталоге кампании.
  При отдельном сравнении с product release pin найдено одно различие:
  `endpoint=https://loginom.duckdns.org/mcp` у этого bundle вместо актуального
  `https://mcp.loginom.ai/mcp`. Поэтому целостность подтверждена, но **допуск
  candidate не выдан**. Новый candidate должен собираться из исходников и pins
  по фазе 6; существующий source bundle не подменять именем нового candidate.
  Action manifest URI/hash и остальные release fields совпали с product pin.
- В собственном headed context под `jsteach` ранний переход «О программе»
  после успешного login показал `Cannot read properties of undefined (reading
  'NodeIndex')`. Доказательство сохранено: `platform-preflight.json` и screenshot.
  About metadata не прочитаны, logout первой пробы **не подтверждён**, context
  закрыт. Попытка сохранена как неуспешная, не переписана последующей проверкой.
- Отдельная recovery-проба подтвердила тот же account, 0 пакетов, отсутствие
  открытых сообщений, затем успешные UI logout и context close:
  `platform-recovery.json`. Серверных объектов/пакетов не создавалось.
- Проба с ожиданием видимой страницы «Начало» установила `homeVisible=true`,
  `bg.app.PlatformEdition=Enterprise`, успешные logout/context close:
  `platform-readiness.json`. Это отделяет login admission от загрузки интерфейса.
- Повтор чтения «О программе» после ожидания HomePage и подтверждения native
  active tab == `FAboutNode` прошёл. Фактически прочитаны
  `MF;TF-1;About;lblPlatformEditionValue=Enterprise` и
  `MF;TF-1;About;lblVersionValue=7.4.2`. Успешные UI logout/context close —
  `platform-ready.json`; screenshot — `platform-ready.png`. Полные локальные
  observations остаются приватными. Страница не содержит ОС сервера;
  эта характеристика запрошена у пользователя и не выведена из ОС агента.

Последний Loginom context закрыт, logout подтверждён. Browser lease хранит
профиль и evidence, но не объявляет работающий процесс; CLI slot свободен.
Содержимое установленного bundle не менялось. Блокирующее условие регистрации
памяти прежнее: нужна точная копия исходного adapter либо отдельно реализованное
и проверенное новое поколение; ослабление manifest/routing guards не допускается.
Условие сохраняется третий последовательный ход Goal: создание worktree,
Ubuntu-адаптация и дополнительные live-проверки дали прогресс, но не восстановили
зависимость. Автоматическое продолжение приостановлено на этом предусловии;
Goal не завершён. Next trigger — доступная копия adapter с проверяемыми hashes
или новое явное решение о замене механизма регистрации. ОС сервера также ожидает
подтверждения; работающий штатный OpenViking основного checkout не отключён.

## Передача разработчику — 2026-09-26

Задача подтверждена active/inProgress через App API. Разработчику назначен Goal
до ready-for-review, без запуска нового ревью/CLI-приёмки; scope обоих output
режимов и всей матрицы сохранён. Одно same-task review и acceptance будут
назначены отдельно на соответствующих границах. Product base и memory
registration не менялись. В docs-only transfer конфликт CURRENT.md разрешён
точной закреплённой версией документа, code-коммиты kit исключены.

Координатор отдельно готовит CLI provider/OAuth prerequisites. Source CLI
`providers list` в собственном приватном `cli-profile` завершился до model/Host
dispatch с CLI_START_FAILED. Диагностика import обнаружила отсутствующую
зависимость https-proxy-agent; это ещё не дефект продукта. Запущена установка
по lockfile закреплённым Bun с `--frozen-lockfile --ignore-scripts`. Guard
этого профиля сохранён до адресной проверки cleanup; browser не запускался.
