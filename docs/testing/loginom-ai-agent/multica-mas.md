# Обработка узлов на mas

Оркестрация штатная: один проект LoginomAi, один сквад «Обработчики узлов»,
Генератор Тасок → Тест-Манки #1 → Ловец Галюцинаций. Карточки назначаются вручную.
WatchDog исключён из сквада; его агент и история сохранены. Сквад Eval не меняется.

Runtime Codex (mas): 24aa980b-b8c3-43e2-b087-bad8f79c9517.
Текущий общий предел daemon — 12 задач: 08.10.2026 в 22:52 MSK штатные
config set max_concurrent_tasks 12 и daemon restart --max-concurrent-tasks 12 выполнены.
Обратное чтение config=12 и argv нового daemon=12 PASS; тот же runtime online.
mas: 12 logical CPU, RAM30863MiB/available29569MiB, swap0, load0.07/0.02/0.00,
391GiB свободно на диске (снимок без нагрузки перед изменением).
09.10 по команде владельца caps ролей стали 8/8/8; partial PUT/readback подтвердил:
остальные настройки сохранены. Это ёмкость агентов, не отдельный лимит CLI.
Прежние preflight LAB-27 и round4 выполнены при cap8; 12 одновременных задач
и первые реальные обработки при новом cap — NOT_RUN. LGD/XLSX остаются Backlog.
Ubuntu26.04 x64/glibc2.43, Multica0.6.1, Codex0.160.1.
Общий daemon cap учитывает все роли; одна задача имеет максимум один внутренний
модельный прогон одновременно. Дополнительных очередей/брокеров/semaphore нет.

Основной интерфейс — API/CLI Multica. При необходимости разрешён SSH
user@10.200.13.132; реквизиты доступа не включать в документацию или журналы.
Использовать отдельные штатные task checkout GitHub-ресурса; card branch/exact SHA
имеют приоритет над ref проекта. Старые LGD/XLSX результаты и рабочие данные
не переносятся и не возобновляются. Новые ветки lgd-research/xlsx-research и
карточки imports-lgd/imports-excel начинаются Stage0 и остаются Backlog.

Короткая карточка фиксирует slug, stage, исходный SHA и ветку/PR target.
Критерии и разрешённые изменения читаются в RUNBOOK и подплане узла.
Для каждой карточки новая пара Loginom worker/reviewer, отдельные browser/CLI
profiles и доказательства. До первой команды CLI новый профиль пуст: private logs размещаются рядом,
после инициализации допустимы внутри него. Иначе CLI отказывает PROFILE_FORMAT_INVALID.
Повтор занятого аккаунта ждёт завершения предыдущей
попытки; cleanup только собственных пакетов/сессий после остановки процессов.
Технические проблемы исправлять; вопрос владельцу — изменение критериев,
общего контракта, нехватка доступа или 3 последовательные попытки без прогресса.
Передача роли требует clean SHA, evidence и cleanup; история попыток immutable.
Stage0 нового узла — исследование; Stage0 реализованного узла — перепроверка
заданного реализованного объёма, включая модельную и независимую полную приёмку.
Merge/release — отдельная команда владельца.

Восемь Генераторов готовят карточки независимо, без общего readiness barrier.
09.10 подтверждены два одновременных отдельных browser profiles общего admin;
Root-only cleanup прежних попыток независимо проверен. После возобновления LAB45
и LAB48 оставили новые неизвестные серверные эффекты; общий bootstrap снова удержан.
Подготовка и конечная очистка вынесены в согласованную владельцем общую задачу. Необходимость
новых технических admin не доказана: штатная подготовка использует существующий
закрытый глобальный operator config. Короткая операция с общим admin защищена
постоянным account flock до подтверждённого собственного logout/server/process cleanup.
Уже созданные и запланированные card operator configs/credentials сохраняются.
В собственных role configs допускается сменить только operator_file с before/after
hash/key diff; identities/credentials/история остаются прежними. Worker/reviewer
разные и без Admin; данные operator закрыты и не передаются внутренней модели.
Отдельная неизвестная сессия card operator удерживает только её карточку;
Root proof не переносится на неё, узел или модель. Нужные критерии cleanup сохраняются.

Новые Loginom worker/reviewer создаёт Генератор Тасок существующим инструментом:
`python3 ~/.local/share/loginom-multica-accounts/scripts/provision-accounts.py --issue <UUID карточки> --stage stage0`.
Режим stage0 подготавливает только Loginom-аккаунты; historical full с provider pool
не использовать. На mas установлены только common.py, provision-accounts.py и
provision-account.mjs из сохранённых исходников этой задачи (bundle source c1b73577f),
без старых аккаунтов, результатов и остальных компонентов OPS. VERSION.json
фиксирует контрольные суммы; Python/Node syntax и installed hash read-back PASS.
Подключение и административный вход находятся в закрытом
`~/.config/loginom-multica/operator.json` (0600, parent0700); секреты не публиковать.
Пара сохраняется до UI creation в `~/.config/loginom-multica/cards/<UUID>/worker.json`
и reviewer.json. Повтор использует ту же пару; неизвестный эффект требует сверки.
Генератор подтверждает ready обеих ролей, разные identities, эффективные права
без admin и освобождение собственных сессий. Подготовка аккаунтов сама по себе
не назначает и не запускает исследование; LAB29/30 остаются Backlog.

Владелец восстановил https://app.loginom.ai и https://mcp.loginom.ai/mcp.
08.10 с mas HTTPS стенда 200, MCP initialize/tools-list с сервисным ключом PASS;
сертификаты проверяются. Это проверка доступа, вход/UI и модель проверяются отдельно.
Native OpenViking Multica не заменяется этим knowledge MCP.

На mas штатными правилами sing-box/Xray, DNS и firewall настроены прямые HTTPS
исключения: app.loginom.ai (194.156.118.61), mcp.loginom.ai (62.113.108.18),
mas.kartamyshev.dev (151.244.228.56). Domain rules и IPv4 /32 согласованы; firewall
разрешает эти публичные адреса только по TCP443 через enp3s0. Остальной трафик
сохраняет VPN-маршрут. Config validation, services active, DNS/route read-back,
HTTPS стенда/авторизованный MCP и native Multica CLI PASS. Обычный VPN egress
проверен отдельно; прямой запрос к постороннему публичному адресу блокируется.
IPv4 исключения закреплены по DNS на 08.10: при смене адреса обновить route и
firewall вместе. Проверка остановки VPN после этой правки не выполнялась.
Перед правками сохранены закрытые backups в /root/mas-loginom-vpn-20261008 и
/root/mas-multica-vpn-20261008. Конфиги/backup с секретами не публиковать.

LAB44 подтвердил защиту повторной попытки: штатный flock отдельного аккаунта должен
охватывать CLI/browser и cleanup; имя lock задаёт Loginom username, не task slot.
Не удалять постоянный lock inode и не снимать неопределённый результат по возрасту.
В реальной проверке после SIGKILL supervisor работающие CLI/Host/browser удерживали
унаследованный lock; повтор и cleanup были запрещены. После подтверждённого
завершения процессов и точного server cleanup допускается новый профиль; старый
writer остаётся AMBIGUOUS/retired и не удаляется.
Закрытие браузера может оставить disconnected server session до истечения её
срока жизни; это не доказательство logout. В [Диспетчере](https://help.loginom.ru/userguide/admin/dispatcher.html)
команда «Закрыть» удаляет выбранную сессию. Сначала подтвердить её принадлежность
своей карточке и отсутствие работающих дочерних процессов; после узкого закрытия
проверить Refresh read-back. Чужие/неустановленные сессии не закрывать.

CLI OAuth задаётся по [shared-oauth](shared-oauth.md), отдельно от native Codex.
На mas launcher — ~/.local/bin/loginom-ai-agent-cli, shared каталог —
~/.local/state/loginom-cli-oauth/shared-oauth-v1; свежий отдельный вход завершён
08.10, auth.json regular/nonlinked 0600, каталог0700, uncertainty отсутствует.
Служебная установка фиксирует artifact SHA/checksum/manifest/capability и private
пути вне checkout/GC; затем один новый headless login. Проверка параллельности:
8 штатных test cards, отдельный профиль/аккаунт каждой, 8 overlapping реальных
CLI model requests и девятая задача в native очереди. Независимый reviewer
проверяет результаты. Публикуются нормализованные отчёты без секретов;
старые OPS/provider pool/publisher на mas не устанавливаются.
Ubuntu требует стандартную подготовку sandbox из .github/workflows/test.yml:
на mas kernel.apparmor_restrict_unprivileged_userns=0 сохранён в
/etc/sysctl.d/60-loginom-browser.conf. Chromium работает с sandbox и seccomp;
--no-sandbox не используется. Права/hash payload остаются как в manifest.
Версионный кандидат установлен штатными uninstall.sh/install.sh, profilesPreserved=true.
Linux CLI сохраняет XDG_CONFIG_HOME для системного proxy, но XDG_CACHE_HOME и
XDG_RUNTIME_DIR принадлежат guarded profile. Это не меняет native Codex/Multica.

Завершённую карточку повторно запускают штатным `multica issue rerun <UUID>`.
Изменение статуса или того же исполнителя само по себе не запускает новую попытку.
Зависший native run отменяют `multica issue cancel-task <taskUUID>` после проверки
его собственных процессов и возможных эффектов; daemon целиком не перезапускают.

## Диагностика VPN TLS-профиля — 08.10.2026

В полном CLI candidate597 чтение общей авторизации завершилось; безопасные признаки запроса подтвердили gpt-5.6-sol, stream=true, store=false и reasoning=low. HTTP headers не пришли. В тот же период независимые HTTPS-запросы без OAuth к провайдеру и обычным сайтам через proxy также не завершались. На VPN endpoint185.21.15.251:443 из146 TCP-сокетов129 не получили подтверждения data; отмечены retransmissions. Прямой HTTPS Multica продолжал работать. Это подтверждённый сетевой сбой текущего периода, а не автоматическая атрибуция всех исторических таймаутов.

Временные стандартные процессы Xray с закрытыми конфигами сравнили один параметр realitySettings.fingerprint при одинаковых endpoint/маршруте/остальных настройках. Chrome дал10/12 таймаутов, Firefox12/12 HTTPS200. Одновременные серии исключили только временную последовательность: Chrome2/8 ответов против Firefox8/8. TLS к тому же endpoint стандартным OpenSSL прошёл с проверкой сертификата. Уменьшение MTU1200 в отдельном кратком тесте не помогло; временный маршрут удалён. Причина сетевых потерь зависит от TLS-профиля Chrome; устройство или сторона фильтрации не установлены. Это не OAuth-refresh, модельная квота или доказательство готовности восьми CLI.

Private metadata receipts на mas: round3/control/vpn-transport-stall.json, vpn-endpoint-direct-tls.json, vpn-fingerprint-discriminator-v2.json и vpn-fingerprint-simultaneous-ab.json под ~/.local/state/loginom-cli-qualification. Первый fingerprint discriminator не прошёл preflight из-за расширения временного конфига; его результат не засчитывается. Временные диагностические процессы/конфиги удалены. Подготовлены закрытые backup/candidate в /root/mas-vpn-fingerprint-20261008; На момент этого диагностического этапа production оставался Chrome; последующее переключение на Trojan описано ниже. Авторизации, daemon и Loginom-конфиги не изменяются.

Native cancellation остановила supervisor последней CLI-попытки раньше дочерних процессов. Cleanup-followup01a11c82-4f7d-78d9-8f0e-0ad7fa1ef477 затем остановил только свои подтверждённые CLI/Host/browser; process absence PASS. Попытка13caa9f3-f044-4491-9eeb-435de78a7420 содержит один model invocation и сохраняется AMBIGUOUS; delayed/пустая лента API не доказывает отсутствие модели. Независимый серверный cleanup LAB44 task01a11c86-eae9-7846-94f3-ebcc92bd79fe завершён PASS; receipt приведён ниже. Перед каждым повтором проверять actual processes/active metadata, а не только ленту API; guard не снимать по возрасту/PID.

## Проверка предоставленных Trojan-конфигов и переключение

08.10 первый Trojan/WebSocket/TLS через kartamyshev.dev подтвердил8/8 одновременных HTTPS200 и egress151.244.228.56. Одновременное сравнение двух конфигов: первый8/8 успешных за1.0–1.1sec, obh1 только1/8 (egress89.125.144.75), остальные7 timeout12sec. Секреты остаются в закрытых конфигурациях mas; URI/password/path не публикуются. Это сравнение сети, не моделей. Первый preflight временного firewall rule второго конфига не прошёл синтаксическую проверку; маршрут автоматически удалён, запросы не выполнялись. Исправленная отдельная попытка сохраняется в vpn-trojan-comparison.json. Временные процессы/конфиги/маршрут159.194.211.251 и rule удалены.

На mas выбран первый Trojan. Сохранён private backup `/root/mas-vpn-trojan-20261008`; Xray config проверен, direct exceptions/Multica daemon/Loginom/OAuth не изменены. Первый application control не прошёл и автоматически вернул старый конфиг; причина этого control отказа UNKNOWN. Следующая отдельная application attempt с ограниченным ожиданием proxy listener прошла две проверки egress; установлен Trojan, TLS certificate verification включена. Non-model compiled plugin usage GET с существующей shared авторизацией: HTTP200, elapsed2753ms; OAuth payload не сохранялся.

Проверка выключения обеих служб Xray/sing-box: public IPv4 с фиксированным DNS и proxy blocked, physical publicIPv4/IPv6 blocked, после восстановления служб egress151.244.228.56 PASS. `trojan-fail-closed.json` содержит metadata. Старый endpoint185.21.15.251 оставлен как узкое исключение для deliberate rollback проверенной dev-конфигурации. При отказе от rollback удалять его согласованно из DNS/route исключений и firewall с новой проверкой восстановления. Не переиспользовать retired CLI profile.

LAB38 options cleanup независимо PASS_PROCESS_AND_CALIBRATED_SERVER_ABSENCE, task01a11c86-eae9-7846-94f3-ebcc92bd79fe завершён,0 новых моделей; evidence-private/options-diagnostic-recovery.json. Guard/history сохраняются. Подготовлена отдельная LAB39 fresh CLI попытка на candidate597 с прежними параметрами и DISABLE_PROJECT_CONFIG=true; изменён сетевой путь. Native task01a11c9a-76fc-746c-90ed-a84a2a7bfa2d завершён: attemptc03ae120-dd65-421f-9469-1faa3874ea6a, full CLI exit0/HTTP200/usage10540, elapsed15329ms. Headers пришли за2153ms после dispatch58092bytes. Отдельный calibrated cleanup LAB44 task01a11c9f-2c17-750a-82a5-ee9997bc4917 завершён PASS. Обычная repoConfig проверена отдельной LAB40 task01a11ca0-dcc1-77df-8f11-1ba27364eacf (project-disable=false); результат приведён ниже. Готовность восьми реальных модельных потоков не объявлена.

## Разделение Git-копии и рабочего каталога CLI

После переключения VPN LAB40 с обычной конфигурацией Git-репозитория завершилась `BadRequest` до auth/dispatch. Отдельная немодельная проверка в фактической вложенной Git-копии подтвердила `ERR_MODULE_NOT_FOUND`: отключённые в проекте `github-triage` и `github-pr-search` импортируют отсутствующий `@loginom-ai-agent/plugin`. `ToolRegistry.all` импортирует файлы до фильтрации отключённых инструментов; ошибка затем преобразуется в `BadRequest`. Реестр в рамках диагностики не изменён. Proof: private `round3/control/disabled-tool-import-proof-v2.json`; первая проверка с неверным корнем не засчитывается.

Для обработки узлов использовать штатное разделение: native Codex работает в собственной Git-копии карточки, а Loginom CLI получает через `run --dir` собственный новый каталог пакетов вне Git-копии и собственный профиль. Общий каталог содержит только OAuth. Отключать проектную конфигурацию не требуется. LAB41 на candidate597, с `DISABLE_PROJECT_CONFIG=false` и отдельным каталогом, выполнила один полный модельный запрос: HTTP200, exit0, usage10355, elapsed17122ms. Source checkout остался чистым. Это положительный одиночный контроль, не приёмка восьми потоков.

LAB39 independent cleanup завершён PASS_PROCESS_AND_CALIBRATED_SERVER_ABSENCE: native01a11c9f-2c17-750a-82a5-ee9997bc4917, private evidence-private/vpn-fixed-diagnostic-recovery.json. Независимый cleanup LAB40/LAB41: native01a11caf-dbd6-785c-94cd-4f674ea67ed6; ожидаемый private evidence-private/final-diagnostics-recovery.json. Cleanup завершён PASS_PROCESS_AND_CALIBRATED_SERVER_ABSENCE для обеих точных попыток; оригинальные guards/results сохранены до отдельного forward recovery. Все старые профили, результаты и записи попыток сохраняются.

## Checkpoint — daemon12, квалифицированы восемь CLI-потоков, 08.10.2026

- Новая приёмка узлов: итог Worker и независимый модельный прогон Reviewer — на модели/уровне рассуждения из действующих инструкций сквада Multica; промежуточные модели любые. Хелперы/инструкции исправляются по ошибкам, контракты/критерии согласуются; Stage0 неизменен. Выбор модели хранится только в Multica; доказательства фиксируют фактические настройки. Новый итоговый прогон NOT_RUN.

- PR40 draft → loginom; shared-oauth source basis f9bf332cc491baa784e6e04fdfda7c0f09151cb7. Merge/release NOT_RUN; проверенный artifact не получает PASS новых merge SHA.
- Installed source597592f5d53f86beb69ffe318af2d4db52c5f416/version0.0.0-dev-202610081651, Linux x64/glibc; executable+manifest shared-oauth-v1;5678 file checksums PASS.
- Archive SHA2561aa667f7d34bc066b7fb7e3c52f69f0b7db0f042351f9aedde6cf36afcf1dbaa; source/manifest/build/archive roundtrip PASS; replacement штатный, OAuth/profile history сохранены.
- Exact597 на mas: Agent118/Host6/Product3/runtime5=132 tests PASS/0FAIL, Agent/Host/Product typechecks PASS (Bun1.3.14/Node24.19); docs-only pre-push32 PASS.
- mas daemon cap12 подтверждён config/argv после штатного restart без активных задач; нагрузка12 NOT_RUN; Generator/Worker/Reviewer runtime24aa980b-b8c3-43e2-b087-bad8f79c9517/caps1/8/8; WatchDog excluded, Eval unchanged; API partial updates/readback PASS.
- Round4 LAB34–41:8/8 full CLI exit0/positive usage, gpt-5.6-sol/low, one CLI model run each; eight distinct profiles/Loginom identities/package --dir outsideGit, one shared CLI OAuth directory.
- Independent local step_start→step_finish overlap3464ms:1791484322488–1791484325952; native queue9 queued/null при running8 и starts при первом освобождении; timestamp precision limitations retained.
- Reviewer01a11cce-729b-7735-9a1b-b848e2c9513f completed; private lab-44-b848e2c9513f/workdir/evidence-private/round4-independent-acceptance.json: PASS_WITH_EXPLICIT_OBSERVABILITY_LIMITS.
- Independent calibrated cleanup8/8 PASS:49 target session records→0, positive own admin control, own processes/browser/admin logout complete; permanent account inode/nonblocking release checks PASS.
- Three partial LAB40 close effects remain AMBIGUOUS in immutable history; current absence independently proven. Remote provider internal concurrency/retries and direct historical child FD readback NOT_OBSERVED; source/retained receipts support inheritance.
- Owner accepted installed597 for eight local concurrent checks; private 20261008-round4/control/owner-acceptance.json pins receipt hash/source/limits. LAB34–42/LAB44 Done; no model reruns.
- Auth directory0700/files0600/regular file/no uncertainty PASS, no OAuth content copied/read by reviewer; native Codex auth separate. Common quota/revocation/uncertain-refresh remain shared failure boundaries.
- CLI uses fresh profile+package --dir outsideGit with ordinary projectConfig; native Codex owns Git checkout. Disabled GitHub tool import defect remains unfixed; diagnostics saved separately.
- First supplied Trojan installed; parallel comparison first8/8 vs second1/8; VPN-down/physical publicIPv4+IPv6 blocked/recovery PASS. Old185 endpoint retained only for deliberate rollback; private config backups outside Git.
- New LGD LAB29/XLSX LAB30 and lgd-research/xlsx-research fast-forward to current loginom0ca9e75bc7bb6897f46ac1ddc880b9758e993dc9; source change only attachments, Stage0 criteria preserved.
- LGD/XLSX Backlog0, pairs ready via Generator, manual assignment only; no PR38/39 continuation, Stage0/full node acceptance NOT_RUN. Node profiles/accounts/branch/evidence independent.
- Next: вручную назначить LGD/XLSX или другие узлы и наблюдать CPU/RAM/очередь/ошибки при cap12; испытание12 NOT_RUN. New shared-oauth build/merge requires new exact artifact qualification; merge/release remain owner commands.

## Checkpoint — новая параллельная волна восьми узлов, 09.10.2026

- Docs prechange b8f71474c; baseline4e626d547/basef9bf332c; loginom0ca исключён; назначения узлов сохранены.
- Node SHA: LAB45 a00b0203/PR42,46 41e0b170/PR43,47 c92a3bfd;48–52 4e626d547; старый PASS не переносится.
- Caps8/8/8/runtime24aa…/daemon12/stock3m сохранены; восемь реальных приёмок и нагрузка12 NOT_PROVED.
- Installed CLI597/version-dev и Multica0.6.1/source2ea — разные артефакты; global launcher не менялся.
- Central instructions8d7a… неизменны: target CLI selection/native/Eval/caps сохранены; LAB53 live hold действует.
- LAB53 approved scope d4241c818; [draft PR44](https://github.com/gooddaytoday/loginom-ai-agent/pull/44) common-preparation→shared-oauth.
- Новый clean published SHA9e2ccc724a3b8616f2f878dc7719cd10bb957a94/tree87acd6d7…; delta4 файла в утверждённом scope.
- SHA9b93201…: независимые25offline PASS, дополнительные cases выявили2P2/REQUEST_CHANGES; история сохранена.
- SHA9e2ccc724: F1/F2 CLOSED, независимые33offline+5собственных cases PASS; новых findings в delta0.
- Worker completed04:39:32MSK, повторный Reviewer completed04:46:26MSK; штатные handoff в той же карточке, дублей0.
- Parent: Worker attachments2 и Reviewer3 APIbytes/SHA/manifest PASS; tree и19/19candidatefiles сверены независимо.
- Source-only PASS: обе live entrypoints закрыты; полный lifecycle/install/rollback/runtime qualification NOT_ACCEPTED/NOT_RUN.
- Root cause Timeout48 NOT_ESTABLISHED; адресные source-исправления не доказывают причину исторических45/48 failures.
- LAB45 attempt6d13… numericNOT_CAPTURED/serverUNKNOWN/marker9595…; LAB48 attempt8d6f… numeric/causeNOT_ESTABLISHED/marker74f25….
- Root47 старые3117/3118 PASS лишь для прежних effects; observer3119 serverabsence PENDING; markers/history сохранены.
- Owner: existing Admin browser наmas; discovery/SSH не нашли browser/CDP/GUI/headless; actual endpoint/access pending.
- Fresh Dispatcher/mstSelf NOT_READ; Reviewer85fixture/collector records absent/nonlive; не server proof. Loginom/model/build/install0.
- 04:50MSK все8 node cards blocked, новых Worker/Reviewer node runs0; provider counters NOT_EXPOSED, APIcompleted не absence proof.
- 01:52UTC mas CPU12/load0/0/0/MemAvailable30240748kB/free408545464320B; daemon212379/cap12/3m argv PASS; workload12 не проверен.
- [SHA/результаты/границы](reports/2026-10-08-node-recheck/parallel8-restart.json). Далее existing Admin доступ→finite45/48/3119+полный LAB53 runtime→те же8; schedules/merge-release0.
