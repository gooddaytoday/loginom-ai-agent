# Browser recovery: packaged re-entry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. До Task 1 требуется независимое ревью плана; исполнение последовательно.

**Goal:** Установить, что из недостающих historical case IDs, slow-host association и фактических catalog/image evidence packaged Task3 можно восстановить из уже сохранённых источников, и зафиксировать остаточные блокеры до решения о новых запусках.

**Architecture:** Один ограниченный аудит чтением существующих документов, локальной Git-истории и адресно связанных private evidence. Результат дополняет существующий packaged report; новые сборки, инструменты сбора и модельные попытки не входят в план.

**Tech Stack:** `rg`, `git log/show`, обычное чтение файлов; существующие JSON/events/messages/receipts и локальные архивы. Новых зависимостей нет.

**Spec:** [дизайн §11](../specs/2026-10-19-browser-recovery-design.md), [план5 Tasks3–4](2026-10-19-browser-recovery-5-acceptance.md#task-3-упакованные-cli-и-desktop-доступность-и-естественные-отказы), [packaged подплан](2026-10-20-browser-recovery-packaged.md).

## Global Constraints

- Планы1–4 и план5Tasks1–2 завершены. Принятые native S5 и test-only upstream не повторять; исторические FAIL, cleanup и OS UNKNOWN сохраняются. Актуальный источник состояния — [master checkpoint](2026-10-19-browser-recovery.md#checkpoint--30102026-active).
- Task3 остаётся открытой; Task4/release flag выключен. Аудит не меняет критерии приёмки и не разрешает merge/release. Availability на старых установленных артефактах не подтверждает текущую сборку.
- Только существующие данные: без model/CLI/browser/runtime, tests/build/install, сети, изменений auth/профилей/guard и каких-либо hooks/API/collector. Собственные прежние установки удалены без purge; retained evidence читаются без их восстановления.
- Нет выдуманных ID, fault injection, замены естественного отказа бизнес-PASS или доказательства screenshot через capabilities/source filter. Не требовать отсутствующий старый timestamp/snapshot от уже установленного WIZARD-кейса.
- Raw logs, токены, персональные данные и image bytes остаются private. В Git — минимальные подтверждённые выводы и ссылки; источники с секретами не печатать целиком.

## Результат, объём и проверка завершения

Первый дешёвый сквозной результат: одна недостающая строка «класс → точный исторический case/run ID → локальное свидетельство» либо проверяемая запись, почему конкретный доступный источник её не подтверждает. Это результат аудита, не новый recovery PASS.

Task1 завершена, когда для четырёх missing-ID классов, slow-host association и catalog/image обоих известных model runs записаны подтверждённый вывод или BLOCKED, конкретный прочитанный источник/граница поиска и условие возобновления. Недоступность источника допускает завершение аудита, но сохраняет незавершённость packaged Task3. Новые требования к продукту не вводятся.

Оценка всего среза: 5 tracked docs, около +130/−20 строк (этот план ~80; report ~40; owning progress/checkpoint ~10 и удаление устаревшего next-S5). Production/test source: 0. Короткий design report в ignored `.superpowers/sdd/2026-10-30-browser-recovery-packaged-reentry/` — ~25 строк, вне `git diff --stat`. Checkpoint не более20 строк. При удвоении оценки пересмотреть подход, не расширять аудит автоматически.

## Review Focus

1. Четыре общих названия отказов не становятся case IDs по сходству текста; нужна явная связь в существующем источнике.
2. `100909-r1` доказывает download failure, но сам по себе не slow-host; при отсутствии связи оставить BLOCKED.
3. Список model capabilities и фильтрация исходников не являются опубликованным provider tool catalog.
4. `screenshot calls0`, сохранённая картинка вне tool reply и отсутствие task runtime не доказывают доставку image content модели.
5. Старые успешные business/native/availability проверки сохраняют свои identities и границы; новые исходники не переименовывают их в текущую packaged приёмку.

---

### Task 1: Восстановить доступные доказательства и остановиться на остаточном блокере

**Files:**
- Read: перечисленные выше планы/дизайн и [packaged report](../../testing/loginom-ai-agent/reports/2026-10-20-browser-recovery-packaged/report.md).
- Read: [срез18.10 и ссылки S1–S8](../../node-development/nodes/integration-restrequest/large-graph-interaction.md); адресная локальная история этих документов и указанного в дизайне `docs/investigations/2026-10-19-loginom-tool-recovery/`, если она существует.
- Read: `/tmp/loginom-browser-recovery-task3-4wmxpueb/evidence/{preflight,image-summary,text-summary,teardown-before,teardown-after}.json` и только связанные ими image/text evidence, profiles/messages и локальные копии названных исторических архивов. Task1/2 evidence подключать лишь по прямой ссылке для нужной identity, без повторной проверки availability/cleanup.
- Modify: packaged report, текущий packaged подплан, план5 progress и master checkpoint. Этот план отмечает завершение Task1; другие runbooks/checkpoints без необходимости не менять.

**Interfaces:** Consumes существующие case/run/session/attempt identities и сообщения/трассы. Produces дополнение существующего report с выводом по каждому пробелу и одним ближайшим обоснованным действием либо конкретным blocker/resumption condition. Нового каталога или формата evidence нет.

- [x] **Step 1: Независимое ревью перед аудитом.** Проверить необходимость источников, запрет новых механизмов и неизменность приёмки. Обязательные замечания должны указывать нарушенное требование/конкретный риск; устранить их до Step2. Результат: GO либо конкретное обязательное замечание, без нового выполнения.
- [ ] **Step 2: Один проход по локальным historical источникам.** Начать с четырёх missing-ID классов в report, среза18.10 и адресной истории указанных документов (`rg`, `git log --all -- <точные пути>`, затем `git show <найденный ref>:<путь>`). Читать только найденные прямые ссылки и явно связанные локальные архивы; проверить сохранённый input/source, если найден ID. WIZARD уже установлен; его не расследовать заново. Для download отдельно проверить явное свидетельство slow-host. Результат: у каждой строки есть подтверждённая связь или точная причина BLOCKED. Остановить ветку при отсутствующем/неподтверждённом источнике; не сканировать чужие проекты/HOME и не повторять HTTP401.
- [ ] **Step 3: Один проход по сохранённым model evidence.** От сводок image/text перейти только к указанным session/attempt и сообщениям/trace. Искать фактически сохранённый полный outbound tools catalog для соответствующего provider turn; для image — фактический screenshot tool reply с image payload и его связь с доставкой в model turn. Для text — отсутствие screenshot в полном опубликованном каталоге, а не отсутствие вызовов. Если raw request/response не сохранялись, установить это по доступным файлам/формату и закончить ветку BLOCKED; code path объясняет хранение, но не заменяет historical evidence. Существующие `packages/agent/src/session/llm.ts` (`prepared.tools`, `activeTools`) и `message-v2.ts` (tool attachments) читать только при необходимости понять найденный формат, с учётом фактического source запуска. Никаких новых логгеров или включения telemetry. Результат: отдельно catalog/image выводы обоих runs; screenshot0 и text0tools/0task не переоценены.
- [ ] **Step 4: Записать вывод и завершить срез.** В report кратко указать найденное и границы исчерпанного локального поиска; owning docs ссылаются на него. Устаревший next-S5 заменить текущим выводом, сохранив исторические результаты. Проверить `git diff --check`, `git diff --stat` и точность ссылок/claims по прочитанным источникам. Независимое factual review проверяет только новые выводы; обязательные замечания устранить. Результат: audit COMPLETE, Task3 OPEN, release OFF и один следующий шаг/блокер. Коммиты/index данным планом не выполняются.

## Остановка и последующее решение

При исчерпании перечисленных источников остановиться. Условие возобновления missing IDs — конкретная доступная локальная копия/точная ссылка с новым подтверждённым доступом; повтор запроса к прежнему HTTP401 без новой гипотезы не является следующим шагом. Для потерянного catalog/image evidence честно указать, что historical доказательство не восстановлено.

Любой будущий live run требует отдельного решения/плана с конкретной новой гипотезой, current build identity, фактическим catalog и независимым preflight; отсутствие старого evidence само по себе не обосновывает запуск. Desktop model остаётся зависимым от eligible CLI recovery transition. Сборка, установка, смена модели, обход rate limit, native S5, release и дополнительные механизмы исключены из этого среза.

**Статус:** независимое ревью Approved/GO, mandatory0/optional0; Task1 audit pending. GO разрешает только описанный read-only срез.
