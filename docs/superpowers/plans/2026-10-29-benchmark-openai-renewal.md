# Benchmark PRIVATE_ACCOUNT: один разрешённый headless OpenAI login

> Сведения о локальном окружении обезличены. Приватные подтверждения, упомянутые в документе, не включены в репозиторий.

Цель — восстановить OAuth только существующего Benchmark `PRIVATE_ACCOUNT` штатной командой установленного CLI, сохранив pins, историю и результаты. Владелец 29.10.2026 явно разрешил один новый headless-вход с кодом как исключение из исходного запрета повторного OAuth. Это не разрешение повторить P27B: её измерительная попытка 1/1 сохранена.

Основание: основной analytics-expansion plan и SDD `p27-benchmark-auth-native-path-review.md`. Installed prod0.3.4 не имеет refresh-only команды; новый login использует существующий provider flow. Authoring и Benchmark имеют отдельные auth-записи. Первый результат этой задачи — terminal `Login successful`/exit0, подтверждённый cleanup и свободный профиль; работоспособность inference подтверждает следующая разрешённая неиспользованная форма, без отдельного model probe.

## Исполнение и проверяемые результаты

- [x] Независимое review этого плана и точных параметров existing `superviseProcess`; устранить обязательные замечания до запуска. Root сохраняет serial ownership; Authoring P41 должен сначала завершиться с подтверждённым cleanup.
- [x] Перед входом проверить existing `waitProfileIdle(5000)` и `writerIdentity=null` для точного `benchmark-rebuilt/profiles/PRIVATE_ACCOUNT`. Сохранить private intent: одна попытка, timeout900000ms, установленный CLI и explicit profile/env. Никакой launch поверх неизвестного процесса.
- [x] Из принятого private harness выполнить только `loginom-ai-agent-cli providers login --provider openai --method "ChatGPT Pro/Plus (headless)"`. Использовать `childEnvironment`, pinned Bun PATH/существующий прокси-клиент gate, explicit `LOGINOM_AI_AGENT_CLI_PROFILE` этого PRIVATE_ACCOUNT, prod/PURE и отключение project/Claude config. Continuous `superviseProcess` с profileDir и private0700 outDir сохраняет stdout/stderr0600; показать пользователю только штатные URL/device code. Пользователь вводит код на стороне OpenAI; токены не печатать.
- [x] Дождаться terminal результата той же операции. Принять login только при exit0/`Login successful`, без timeout/interruption/sandboxError, с confirmed continuous process cleanup, capture_complete=true/error=null/unknownProcesses=[]; затем fresh idle/writerabsent. Проверить только тип OAuth, наличие и0600 существующего auth-файла, без копирования/ручных token edits. Failed evidence сохраняется; новой попытки автоматически нет.
- [x] Независимое review actual login/cleanup receipt; обновить основной checkpoint/исключение и private measurement intent. Перед следующим неиспользованным измерением штатный admission и полный memory read-back остаются по основному плану. Успешный login не называется успешным измерением или доказательством inference.

## Границы, стоимость, остановка

Изменения: этот план и owning campaign plan, ориентир 2 файла/40–70 строк; private intent/login evidence вне Git. Нового source-кода, wrapper, инфраструктуры, зависимости или auth store нет. Изменения двух документов проверяются `git diff --check`; source-тесты без source-изменений не нужны.

Исключено: setup, smoke/model probe, смена CLI/model/judge pins, Authoring/default/PRIVATE_ACCOUNT/judge/старый карантин, перенос auth между ролями, декодирование/вывод токенов, переписывание failed P27B, commit/push/merge/release. Root использует существующий supervisor и helpers; отдельный login controller не создаётся.

Риски: код может истечь до подтверждения пользователем; provider может отказать; process cleanup может остаться неизвестным. При любом таком отказе сохранить конкретный результат и условие продолжения, не запускать следующий CLI поверх него. Новый OAuth не гарантирует ответ модели; следующий measurement сохраняет свой единственный бюджет и любой FAIL.

Checkpoint: P41 A1/cleanup завершены; первая локальная ошибка caller до dispatch сохранена отдельно, исправлен обязательный аргумент childEnvironment(process.env). Единственный actual login PRIVATE_ACCOUNT завершён exit0/Login successful, continuous cleanup confirmed/capturecomplete/errornull/unknown0, fresh idle/writerabsent, OAuth0600. Inference не проверялся; independent actual review APPROVE без замечаний. Private benchmark-oauth-renewal/receipt.json — источник фактов.
