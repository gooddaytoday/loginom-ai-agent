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
profiles и доказательства. Повтор занятого аккаунта ждёт завершения предыдущей
попытки; cleanup только собственных пакетов/сессий после остановки процессов.
Технические проблемы исправлять; вопрос владельцу — изменение критериев,
общего контракта, нехватка доступа или 3 последовательные попытки без прогресса.
Передача роли требует clean SHA, evidence и cleanup; история попыток immutable.
Stage0 принимается как исследование; model/full handler acceptance остаются NOT_RUN.
Merge/release — отдельная команда владельца.

Пара Loginom аккаунтов и защита повторной попытки ещё не квалифицированы:
после получения административного доступа создать новые worker/reviewer,
проверить вход и read-back identity. Штатный flock отдельного аккаунта должен
охватывать CLI/browser и cleanup; имя lock задаёт Loginom username, не task slot.
Не удалять постоянный lock inode и не снимать неопределённый результат по возрасту.
Проверить повтор/отмену с работающим дочерним процессом в реальной квалификации.

CLI OAuth задаётся по [shared-oauth](shared-oauth.md), отдельно от native Codex.
На mas launcher — ~/.local/bin/loginom-ai-agent-cli, shared каталог —
~/.local/state/loginom-cli-oauth/shared-oauth-v1; авторизация ещё не создана.
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

## Checkpoint — 07.10.2026

- Client base loginom@f9bf332cc; PR40 draft, installed bd4951803, 0.0.0-dev-202610071848.
- Archive SHA256 61fe7a03766ca8aa406e66ca11aaf0b6ca3330a7ce9c96ee783649b5282932d2; clean source/manifest verified.
- Native mas daemon argv=8; три role runtime привязки/caps 1/8/8 и instructions API-readback PASS.
- WatchDog исключён из сквада, агент/история сохранены; Eval не менялся.
- GitHub resource f9bf332cc; штатный чистый checkout LAB27 PASS.
- Bun1.3.14, Node24.19.0, Chromium1243 hashes совпали с pins; Linux проверки exact bd4951803: 133 PASS, 0 FAIL/skip.
- Localhost browser/installed CLI rejection sandbox+cleanup PASS; независимый source/runtime LAB28 PASS.
- LAB24/25 cancelled, wakeups отсутствуют; LAB29 LGD / LAB30 XLSX Backlog, 0 запусков.
- lgd-research/xlsx-research созданы от f9bf332cc; Stage0 criteria сохранены, старый PASS не перенесён.
- Shared OAuth каталог подготовлен отдельно от native Codex; auth.json ещё не создан, свежий login NOT_RUN.
- Стенды/MCP и новые Loginom аккаунты отложены; 8 реальных циклов и queue9 NOT_RUN.
- Следующее после доступа: новая пара аккаунтов/защита повторов, 8 native test cards/queue9 и независимая приёмка.
- Общая готовность восьми потоков не объявлена; node acceptance/merge/release NOT_RUN.
