# Node13: исправленный комплект полного прогона — 14 сентября 2026

Подготовлен по команде `node13:prepare-corrected-full-admission:90fe26a0`.
Модель не запускалась. Слот, run ID и бюджет должен назначить координатор.
Запрашиваемый бюджет:14400с/100 ходов, существующая подписка
`openai-codex / gpt-5.6-sol / low`, без fallback.

Код исправления: `90fe26a0`; итоговый source HEAD и его полный Git archive
фиксируются в новом `.dock/node13-live-preflight/final-admission-3/admission.json`
после сохранения этого документа. Runtime:
`d5fd1ba79586069c27b9f5c8626cf885f9a5fe7e28e6274b01bc0081ada9558f`.
Inputs275:
`3040f93c1c6d8db2cd4c4b05dec2fd49a3b4f20c2847ca37d62796882d8e7d34`.
Goal frozen-v4/prompt_revision2:
`711d1cec738c444e9c90bc806218fe36dc1feeb877ee1f23d13f38e7c386e750`.
Candidate:
`viking://resources/loginom-dock/catalogs/executor-preview/releases/2026.09.13-node13-acceptance.1-5a4c46fc-candidate/manifest.json`,
SHA `db38f7f249c0c051d8b77a22e0ac80a817ecb96a9820bfb0f74b8199a496c634`,
save_checkpoint revision2. Только test-3, /test-3, новый отдельный пакет run ID.

Проверены фактические итоги логов: Python548 PASS, Client1478 PASS/1skip,
31 continuation PASS. В клиентском прогоне9 sandbox-отказов были отдельно
перепроверены в четырёх системных файлах:14/14 PASS. Прежний ошибочный
regression receipt не используется. Полная сохранённая история не изменена.

Новый environment snapshot проверил текущие исполняемые файлы, версии,
подключённую подписку без модели и полный runtime pin. Свежий read-only
remote snapshot проверил skill и18 frontend assets. Candidate checker PASS.
Ранние R1/R2 live доказательства явно помечены как полученные на2488fdaa;
runtime delta содержит только workspace-ui.mjs. Модули восстановления и
Date/time не менялись; текущие тесты и15/15 независимый live persistence
после overflow fix указаны отдельными доказательствами нового runtime.
Это не утверждение о новом полном Hermes или полном reopen6 на d5fd1ba7.

В том же каталоге подготовлен post-run kit. `audit-full.py RUN [DIAGNOSTICS]`
читает исходный evidence и проверяет только точную ссылку Hermes на прежний
running poll перед неизменным полным аудитором. Произвольные/чужие/settled
ссылки отклоняются;10 отрицательных случаев пройдены. Происхождение адаптации
записывается в отчёте, оригинал не изменяется. `prepare-reopen-projection.py RUN`
выделяет18 необходимых событий из большого JSON; `reopen-full.mjs` проверяет
хеши оригинала и выборки, затем вызывает существующий адаптер полного reopen6.
Завершение: `close-reopen.mjs`, `seal-reopen.mjs`, закрытие harness, полный аудит.
Скрипты закреплены в post-run-kit.json; синтаксис проверен без UI/модели.

Обычная команда после назначения и проверки полного admission:

```sh
python3 tools/loginom-acceptance/date_time_launch.py --admission .dock/node13-live-preflight/final-admission-3/admission.json --run
```

Без `--run` выполняется только проверка документа. Pending-проверка закономерно
отказывает по explicit_identity/run_id, coordinator_budget и coordinator_slot;
остальные проверки PASS. Подставлять искусственный слот или заявлять готовую
автономную приёмку нельзя. После назначения launcher вновь проверит локальное
окружение, актуальные remote pins и точное совпадение команды/допуска.

Старый holder01027: локальные процессы отсутствуют, серверное закрытие не
подтверждено. Новый run использует другое уникальное имя пакета и не требует
административного вмешательства в старую сессию. Исторический пакет не заменяется.
