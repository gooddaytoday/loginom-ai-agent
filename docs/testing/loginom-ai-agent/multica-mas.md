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

CLI OAuth задаётся по [shared-oauth](shared-oauth.md), отдельно от native Codex.
Служебная установка фиксирует artifact SHA/checksum/manifest/capability и private
пути вне checkout/GC; затем один новый headless login. Проверка параллельности:
8 штатных test cards, отдельный профиль/аккаунт каждой, 8 overlapping реальных
CLI model requests и девятая задача в native очереди. Независимый reviewer
проверяет результаты. Публикуются нормализованные отчёты без секретов;
старые OPS/provider pool/publisher на mas не устанавливаются.

## Checkpoint — 07.10.2026

- Shared CLI ветка от loginom@f9bf332cc; изменение в отдельном PR, merge/release не выполнены.
- Три агента и инструкции переключены на mas с API readback; WatchDog member удалён.
- GitHub resource ref обновлён на f9bf332cc; штатный чистый checkout LAB-27 и API readback PASS.
- Bun1.3.14/build toolchain установлены; Node24.19.0 hash совпал с pin. HTTPS app.loginom.ai TLS EOF.
- Владелец указал app.loginom.ai и предоставил сервисный ключ; административный доступ не подтверждён.
- Старые LAB24/25 cancelled, wakeups нет; новые LAB29 LGD / LAB30 XLSX Backlog, 0 запусков.
- Стенды/MCP и новые Loginom-аккаунты отложены владельцем; 8 реальных циклов/queue9 NOT_RUN.
- Следующее: закончить Linux фиксы/сборку; после доступа — login, аккаунты и parallel qualification.
