# Обработка узлов на mas

Оркестрация штатная: один проект LoginomAi, один сквад «Обработчики узлов»,
Генератор Тасок → Тест-Манки #1 → Ловец Галюцинаций. Карточки назначаются вручную.
WatchDog исключён из сквада; его агент и история сохранены. Сквад Eval не меняется.

Runtime Codex (mas): 24aa980b-b8c3-43e2-b087-bad8f79c9517.
По подтверждению владельца config max_concurrent_tasks=8 и daemon restart
--max-concurrent-tasks 8 выполнены. Служебный preflight LAB-27 подтвердил argv=8,
Ubuntu26.04 x64/glibc2.43, Multica0.6.1, Codex0.160.1. Caps ролей 1/8/8 API-readback PASS.
Общий daemon cap учитывает все роли; одна задача имеет максимум один внутренний
модельный прогон одновременно. Дополнительных очередей/брокеров/semaphore нет.

Основной интерфейс — API/CLI Multica. При необходимости разрешён SSH
user@10.200.13.132; реквизиты доступа не включать в документацию или журналы.
Использовать отдельные штатные task checkout GitHub-ресурса; card branch/exact SHA
имеют приоритет над ref проекта. Старые LGD/XLSX результаты и рабочие данные
не переносятся и не возобновляются. Новые ветки lgd-research/xlsx-research и
карточки imports-lgd/imports-excel начинаются Stage0 и остаются Backlog.

Каждая карточка фиксирует slug, stage, исходный SHA, ветку/PR target, критерии и
разрешённые изменения. Читать docs/node-development/RUNBOOK.md и подплан узла.
Для каждой карточки новая пара Loginom worker/reviewer, отдельные browser/CLI
profiles и доказательства. До первой команды CLI новый профиль пуст: private logs размещаются рядом,
после инициализации допустимы внутри него. Иначе CLI отказывает PROFILE_FORMAT_INVALID.
Повтор занятого аккаунта ждёт завершения предыдущей
попытки; cleanup только собственных пакетов/сессий после остановки процессов.
Технические проблемы исправлять; вопрос владельцу — изменение критериев,
общего контракта, нехватка доступа или 3 последовательные попытки без прогресса.
Передача роли требует clean SHA, evidence и cleanup; история попыток immutable.
Stage0 принимается как исследование; model/full handler acceptance остаются NOT_RUN.
Merge/release — отдельная команда владельца.

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

Проверка выключения обеих служб Xray/sing-box: public IPv4 с фиксированным DNS и proxy blocked, physical publicIPv4/IPv6 blocked, после восстановления служб egress151.244.228.56 PASS. `trojan-fail-closed.json` содержит metadata. Старый endpoint185.21.15.251 остаётся разрешённым для rollback до завершения CLI проверки; удалять его согласованно из DNS/route исключений и firewall после успешного переключения. Не переиспользовать retired CLI profile.

LAB38 options cleanup независимо PASS_PROCESS_AND_CALIBRATED_SERVER_ABSENCE, task01a11c86-eae9-7846-94f3-ebcc92bd79fe завершён,0 новых моделей; evidence-private/options-diagnostic-recovery.json. Guard/history сохраняются. Подготовлена отдельная LAB39 fresh CLI попытка на candidate597 с прежними параметрами и DISABLE_PROJECT_CONFIG=true; изменён сетевой путь. Native task01a11c9a-76fc-746c-90ed-a84a2a7bfa2d завершён: attemptc03ae120-dd65-421f-9469-1faa3874ea6a, full CLI exit0/HTTP200/usage10540, elapsed15329ms. Headers пришли за2153ms после dispatch58092bytes. Отдельный calibrated cleanup LAB44 task01a11c9f-2c17-750a-82a5-ee9997bc4917 завершён PASS. Обычная repoConfig проверена отдельной LAB40 task01a11ca0-dcc1-77df-8f11-1ba27364eacf (project-disable=false); результат приведён ниже. Готовность восьми реальных модельных потоков не объявлена.

## Разделение Git-копии и рабочего каталога CLI

После переключения VPN LAB40 с обычной конфигурацией Git-репозитория завершилась `BadRequest` до auth/dispatch. Отдельная немодельная проверка в фактической вложенной Git-копии подтвердила `ERR_MODULE_NOT_FOUND`: отключённые в проекте `github-triage` и `github-pr-search` импортируют отсутствующий `@loginom-ai-agent/plugin`. `ToolRegistry.all` импортирует файлы до фильтрации отключённых инструментов; ошибка затем преобразуется в `BadRequest`. Реестр в рамках диагностики не изменён. Proof: private `round3/control/disabled-tool-import-proof-v2.json`; первая проверка с неверным корнем не засчитывается.

Для обработки узлов использовать штатное разделение: native Codex работает в собственной Git-копии карточки, а Loginom CLI получает через `run --dir` собственный новый каталог пакетов вне Git-копии и собственный профиль. Общий каталог содержит только OAuth. Отключать проектную конфигурацию не требуется. LAB41 на candidate597, с `DISABLE_PROJECT_CONFIG=false` и отдельным каталогом, выполнила один полный модельный запрос: HTTP200, exit0, usage10355, elapsed17122ms. Source checkout остался чистым. Это положительный одиночный контроль, не приёмка восьми потоков.

LAB39 independent cleanup завершён PASS_PROCESS_AND_CALIBRATED_SERVER_ABSENCE: native01a11c9f-2c17-750a-82a5-ee9997bc4917, private evidence-private/vpn-fixed-diagnostic-recovery.json. Независимый cleanup LAB40/LAB41: native01a11caf-dbd6-785c-94cd-4f674ea67ed6; ожидаемый private evidence-private/final-diagnostics-recovery.json. Cleanup завершён PASS_PROCESS_AND_CALIBRATED_SERVER_ABSENCE для обеих точных попыток; оригинальные guards/results сохранены до отдельного forward recovery. Все старые профили, результаты и записи попыток сохраняются.

## Checkpoint — диагностика сети и CLI, 08.10.2026

- Worktree `/Users/kartamyshev/.codex/worktrees/shared-oauth/loginom-ai-agent`, shared-oauth; база loginom f9bf332cc491baa784e6e04fdfda7c0f09151cb7; PR40 OPEN draft → loginom; merge/release NOT_RUN.
- Source597592f5d53f86beb69ffe318af2d4db52c5f416: safe diagnostics; Codex46/Agent typecheck/32 pre-push PASS. Не переносить PASS между SHA.
- Installed597592f5d53f86beb69ffe318af2d4db52c5f416/version0.0.0-dev-202610081651; archive1aa667f7d34bc066b7fb7e3c52f69f0b7db0f042351f9aedde6cf36afcf1dbaa; все5678 файлов checksum PASS.
- Candidate source/manifest/roundtrip PASS; replacement штатным uninstall/install после остановки задач, OAuth сохранён; operator dependency paths обновлены на installed payload.
- mas cap8/roles1/8/8; WatchDog excluded/Eval preserved; native Codex отдельно. LGD LAB29/XLSX LAB30 Backlog0; Stage0 NOT_RUN.
- Round3:8 overlapping CLI,0/8 replies за180sec. Queue9/account guards/calibrated cleanup проверены отдельно; full8 NOT_READY.
- Старые active архивируются только по exact independent receipt/hash/inode/current process absence; profiles/writers/results immutable. API empty stream не доказывает model0.
- LAB38 interrupted attempt13caa9f3-f044-4491-9eeb-435de78a7420 model1/AMBIGUOUS сохранена; own children stopped; independent cleanup01a11c86-eae9-7846-94f3-ebcc92bd79fe PASS.
- Old VPN:129/146 sockets data unACK/retransmit; MTU1200 не помог. Controlled Chrome10/12timeouts vsFirefox12/12success, including simultaneousAB; точное место потери не установлено.
- Trojan comparison: первый kartamyshev8/8success, второй obh1 1/8success/7timeouts. Temporary proxies/159route/firewall removed; secrets private.
- Первый Trojan установлен после backup/validation/2egress checks. Initial control failed/rolled back UNKNOWN; daemon/CLI/OAuth/Loginom не изменены.
- Shared provider nonmodel usage HTTP200/2753ms; VPN-down + physical publicIPv4/IPv6 blocked; recoveryegress151.244.228.56 PASS. Old185 endpoint reserved rollback до квалификации.
- LAB39 candidate597 fullCLI HTTP200/exit0/usage10540/15329ms; project-disable=true. Independent cleanup01a11c9f-2c17-750a-82a5-ee9997bc4917 PASS.
- LAB40 normal repoConfig: attemptbf2c3306-3015-4445-b774-346d50a1afef, exit1/BadRequest до auth/dispatch; disabled GitHub tools import отсутствующего plugin подтверждён немодельно.
- LAB41 own package --dir outsideGit/project-disable=false: attemptc3bab5ff-e7fa-4354-8a99-cf722976a275, HTTP200/exit0/usage10355/17122ms; source clean.
- CLI package workspace и profile отдельные для каждого запуска; native Codex Git checkout отдельный; shared directory только OAuth. Реестр инструментов не изменён.
- LAB40/LAB41 independent cleanup native01a11caf-dbd6-785c-94cd-4f674ea67ed6 completed PASS; evidence-private/final-diagnostics-recovery.json. Восемь worker active архивированы по exact proof/current checks в round4/control/worker-forward-recovery.json.
- Round4 восемь native задач запущены, модели ждут test-only start после ready8; queue9 task01a11cc4-4f59-7b8c-8ec1-a465227a2536 queued/start null при running8. Инструкции API readback/other settings PASS. Далее ready8→model gate→independent review; full8 NOT_READY.
