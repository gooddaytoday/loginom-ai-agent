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

## Checkpoint — 08.10.2026

- Client base loginom@f9bf332cc; PR40 draft, installed 66f0956bc, 0.0.0-dev-202610081319.
- Current archive SHA256 b9eeaecd52e2b1094127d5430408fd466b2694a50db755b33190f7e3c04304b7; clean source/manifest/roundtrip verified.
- Native mas daemon argv=8; три role runtime привязки/caps 1/8/8 и instructions API-readback PASS.
- WatchDog membership removed/history preserved; Eval untouched; GitHub f9bf332cc / LAB27 checkout PASS.
- Bun1.3.14, Node24.19.0, Chromium1243 hashes совпали с pins; Linux проверки exact bd4951803: 133 PASS, 0 FAIL/skip.
- Localhost browser/installed CLI rejection sandbox+cleanup PASS; независимый source/runtime LAB28 PASS.
- LAB24/25 cancelled, wakeups отсутствуют; LAB29 LGD / LAB30 XLSX Backlog, 0 запусков.
- Свежий отдельный ChatGPT login PASS; shared auth.json regular/nonlinked0600, dir0700, uncertainty отсутствует.
- HTTPS app/MCP restored; authenticated MCP initialize/tools-list PASS, certificate verification enabled.
- Generator LAB33: пары LAB29/30 ready; identity/nonadmin/sandbox/logout/server inventory/cleanup PASS; ранний AMBIGUOUS сохранён.
- Direct HTTPS VPN exceptions app/MCP/Multica, DNS/routes/firewall/services/native CLI PASS; pinned IPv4 требуют обновления при смене DNS.
- LAB34–41 — восемь model fixtures; LAB42 — queue9; LAB43: 16 identities ready/login/logout и Dispatcher zero PASS до fixtures; ранние AMBIGUOUS сохранены.
- Исправление password focus 3bcf645a7: readonly воспроизведён, явный focus дал live login/logout PASS; 5 tests и 32 pre-push typechecks PASS.
- LAB44: installed setup/check и SIGKILL account/profile guard PASS; старые AMBIGUOUS/writer сохранены.
- Round2: три полных модельных ответа из восьми; пересечение восьми streams FAILED, cleanup проходит независимую сверку.
- Queue9: восемь Workers running, девятая Reviewer queued/null; стартовала после освобождения слота, независимая сверка продолжается.
- Source 66f0956bc: explicit WEBSOCKETS=false теперь действует на dev; 39 tests/32 typechecks PASS, Linux build/installed candidate PASS; round3 FAILED по180sec без model replies; причины исследуются.
- Round3: восемь simultaneous CLI/false flag/shared dir/inherited Loginom flocks PASS; реальные completed model streams отсутствуют.
- Отдельные tiny API и source SDK probes completed за1.3/1.5sec; shared-plugin usage GET200/0.6sec; это не CLI acceptance.
- Общая готовность восьми потоков не объявлена; node acceptance/merge/release NOT_RUN.
