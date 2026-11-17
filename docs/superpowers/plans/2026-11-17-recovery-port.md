# Browser recovery: план выборочного переноса

> **Для исполнителей:** выполнять по этапам через `subagent-driven-development` или `executing-plans`; изменения кода — по `tdd`. Каждый этап предназначен для отдельной карточки Multica. Сейчас подготовлен план, выполнение не начато.

**Цель:** перенести полезное поведение `recovery-build-flag` в новую ветку от `loginom` и проверить результат на полном сопоставимом eval-прогоне.

**Архитектура:** сохраняем текущие контракты Dock, runtime, Host и агента. Переносим поведение по одному, с проверкой потребителей и независимым ревью. Для анализа используем существующие campaign controller, журналы и архивы.

**Технологии:** TypeScript/Bun, Node.js, Playwright/MCP, установленный standalone CLI, eval harness, systemd, Multica.

**Спецификация:** [согласованные решения и требования](../specs/2026-11-17-recovery-port-design.md). Она определяет объём работы; этот документ — порядок выполнения, карточки и checkpoint.

## Общие ограничения

- Ветка: `recovery-port`, база `ae89c43b57b98decde1ef287e01dc501d0da495f`; донор `1ab348a91d7c8ae180744293ff746f859d49145a`.
- Оцениваемый агент: `openai/gpt-6.1-terra`, reasoning `high`.
- На каждую версию: **146 кейсов × 3 раунда = 438 измерений**; вместе **876**.
- Судья: `gpt-6-sol/xhigh`; порог 70; judge timeout 300000 мс. Узловые code-oracle проверки сохраняются.
- Quality FAIL окончателен. Судейский повтор использует сохранённый артефакт; технический повтор не скрывает исходную попытку и не обнуляет счётчики.
- Реализация, карточки и evals начинаются по отдельному поручению. Слияние и выпуск требуют отдельной команды владельца.
- Реальные credentials, адреса стендов, личные пути и сырые архивы не входят в Git. Временные данные — в закрытом `$HOME/storage/tmp/`.

## Как передавать этапы через Multica

Для каждой строки следующей таблицы создаётся одна карточка. В её описание включаются цель и соответствующий раздел плана, ссылка на спецификацию и следующий паспорт:

| Поле карточки | Как определить |
| --- | --- |
| Вход | Полный SHA принятого результата предыдущей карточки; получить `git rev-parse recovery-port` и сверить с её checkpoint |
| Зависимости | ID предшествующих карточек из таблицы; начать только после их принятого результата |
| Владение | Один исполнитель с правом записи в `recovery-port`; остальные — read-only review |
| Область | Файлы и поведение своего этапа; соседние инструкции `AGENTS.md` обязательны |
| Проверки | Команды этапа, RED/GREEN evidence, соседние регрессии, независимое ревью |
| Выход | Полный SHA, список принятых/отклонённых переносов с причиной, результаты проверок, ссылки и hashes закрытых артефактов |
| Завершение | Критерий своего этапа; checkpoint до 20 строк: вход/выход, результат, ограничения, следующий этап |

Карточки с кодом выполняются последовательно на одной ветке, без параллельных writers. Перед записью проверять фактический branch/HEAD и незавершённые изменения; чужую работу не сбрасывать. Если другой этап продвинул ветку, сначала принять его результат и обновить входной SHA. Не создавать отдельную систему очередей поверх Multica.

| Этап / тема карточки | Зависит от | Самостоятельный результат |
| --- | --- | --- |
| S0. Общая диагностика и условия контрольной серии | Этот план | Разбор построений, одинаковые средства инъекции сбоев; контрольный SHA B |
| S1. Свежие UI refs экспорта | S0 | Экспорт не использует устаревший ref списка |
| S2. Готовность файлового хранилища | S1 | Ограниченное ожидание/поиск файла и достоверная причина отказа |
| S3. Основания для browser recovery | S2 | Допуск только после подходящего отказа, без устаревших предложений |
| S4. Проверка результата recovery | S3 | Подтверждённый результат или честный неподтверждённый исход, включая NO_BASELINE |
| S5. Metadata и контекст задачи | S4 | Агент получает состояние текущей попытки при успехе и ошибке |
| S6. Освобождение runtime и лимиты | S5 | Корректное завершение, очереди и бюджет без второго владельца состояния |
| S7. Установленные сборки и управляемые сбои | S6 | Проверенные B/C, общий harness H, полные логи предварительной серии |
| S8. Контрольные 438 измерений | S7 | Ledger и архивы `loginom/high` |
| S9. Новые 438 измерений | S8 | Ledger и архивы `recovery-port/high` при тех же условиях |
| S10. Анализ и предложение для loginom | S8, S9 | Разбор 876 ключей, всех recovery-эпизодов и рекомендация по каждому переносу |

Здесь B — контрольная продуктовая ревизия после S0, C — итоговая продуктовая ревизия после S6, H — единый принятый harness/анализатор. Это выходы этапов, а не изменяемые branch aliases. Перед S7 записать их полные SHA и hashes артефактов. Если продуктовая диагностика меняется после фиксации B, сопоставимость пересматривается до кампаний; скрыто включать её только в C нельзя.

## Правило для каждого изменения кода

1. Прочитать текущую реализацию и её потребителей. По донору брать идею и поведенческие тесты; не заменять файлы целиком.
2. Записать пробел, ожидаемый результат и сохраняемые гарантии. Если база уже решает задачу, приложить доказательство и завершить перенос без лишнего кода.
3. Выполнять по одному циклу RED → GREEN → REFACTOR: тест наблюдаемого отказа, подтверждённое падение, минимальная адаптация, успешная проверка и упрощение. Не писать весь набор тестов заранее.
4. Проверить перечисленные соседние контракты. Затронутые TypeScript-пакеты проверять через `bun typecheck` из их каталогов; тесты из корня запрещены.
5. Независимый reviewer проверяет корректность, совместимость и необходимость каждого нового механизма. Исполнитель устраняет технические замечания; предпочтения reviewer не становятся новыми критериями.
6. Подготовить только свои файлы, выполнить `bun run secrets staged`, затем conventional commit. Перед первым коммитом в checkout проверить hooks и закреплённый Gitleaks по [инструкции](../../security/secret-protection.md).

Команды ниже выполняются из указанного каталога. `LOGINOM_AI_AGENT_TEST_NODE` — закреплённый Node из принятого product release; на исходной базе 24.19.0. `TMPDIR` указывает на закрытый рабочий каталог. Модель в unit-тестах и тестах судьи не вызывается.

## S0. Общая диагностика и условия контрольной серии

**Область:** `evals/src/{cli,process-supervisor,profile,profile-archive,diagnostics,analytics-measurements,report}.ts`; при доказанном пробеле — `packages/opencode/src/{cli/cmd/run,session/processor,session/message-v2,session/llm}.ts`, `packages/loginom-runtime/client/lib/execution-journal.mjs`. Подготовка управляемых сбоев — существующий private acceptance путь runtime/Host и его tests. Не менять recovery-поведение обычного запуска.

Цепочка private control: `packages/loginom-host/src/host.ts` → `supervisor.ts` → `packages/loginom-runtime/src/start-input.mjs` (`validateStartInput`) → `managed-entry.mjs` → `client/lib/bridge.mjs` → `executor.mjs` → `node-apply.mjs`. Нужен узкий private test launcher/Host input для текущего CLI: одни поля supervisor через продуктовый путь сейчас не проходят. Модель не управляет этой настройкой.

**Вход/выход:** текущие events, DB/history, tool-output и native journal → индекс измерений и recovery-эпизодов по спецификации. B — принятый SHA после общей продуктовой диагностики. Если продуктовых изменений не потребовалось, это исходное поведение `loginom` с документацией.

- [ ] Составить карту «нужный факт → существующий файл/поле → связь». Проверить обычный успех, обычный отказ, start без действий, recovery с действиями, unknown/stop и незавершённую попытку. Не использовать сокращённый `run.json` как единственную историю.
- [ ] Через тест существующего parser/audit воспроизвести потерю конкретного нужного факта. Добавлять только недостающую связь/событие, сохраняя redaction. Для полного tool output проверить доступность архива после truncation в UI; для изображения — связь tool attachment с исходящим model request по ID/hash.
- [ ] Адаптировать `recoveryToolsCovered` / `auditMeasurement` для обычного corpus campaign, не переносить ограничения специализированного analytics runner. Индексировать все попытки, включая error до первого assistant message. Знаменатель — 876 measurement keys; retries вложены в соответствующий ключ.
- [ ] Проверить анализатор на существующих небольших fixtures: обычное построение без recovery; start без browser action; подтверждённое восстановление; missing journal/image; unknown cleanup. Неполный архив должен давать явный evidence gap, а не «recovery не было» или PASS.
- [ ] Сохранить раздельно метрики `requested`, `started`, `browser_used`, `verified`, `scenario_passed`. Счётчик донора «успех после start» можно получить из индекса; не вводить второй источник истины.
- [ ] До фиксации B адаптировать донорские private `phase_stop`/`release_refusal` для P1–P4 через эту цепочку. `phase_stop` срабатывает после фактического действия до durable phase receipt: configure/open, execute, exports.text. Для P5 нужна отдельная узкая точка «Save выполнен, подтверждение потеряно» перед receipt/ACK; node hooks её не покрывают. Привязать control к назначенной acceptance попытке, операции/фазе и ограниченному счётчику; журналировать каждое срабатывание. Не создавать общий fault framework, не публиковать настройку модели и не менять обычные повторы. В штатном запуске без private acceptance настройки поведение полностью прежнее. Сбой release/close в операторе не глотать.
- [ ] Проверить fixtures всю проводку CLI → Host → managed runtime, срабатывание ровно в назначенной фазе, неверное назначение и отключение по умолчанию. До B живые/model пробы не нужны; они остаются в S7. Owning tests: Host `browser-recovery-capability`, `managed-work-entry`, при IPC-изменениях `node-host`; runtime `start-input`; client `node-apply`, `node-apply-runtime`, `browser-recovery-save-bridge`.
- [ ] Выполнить проверки ниже. Провести review, зафиксировать B и версию формата отчёта. Уточнить disk estimate после S7, до допуска к 876.

Из `evals/`:

```sh
bun --no-env-file test --isolate --timeout 30000 test/output-redaction.test.ts test/cli.test.ts test/diagnostics.test.ts test/profile.test.ts test/profile-archive.test.ts test/analytics-measurements.test.ts
bun typecheck
```

Для private control: из `packages/loginom-runtime/`, затем из `packages/loginom-host/` соответственно:

```sh
"$LOGINOM_AI_AGENT_TEST_NODE" --test --test-concurrency=1 test/start-input.test.mjs client/test/node-apply.test.mjs client/test/node-apply-runtime.test.mjs client/test/browser-recovery-save-bridge.test.mjs
```

```sh
bun test test/browser-recovery-capability.test.ts test/managed-work-entry.test.ts test/node-host.test.ts
bun typecheck
```

При изменении session/provider boundary добавить поведенческую проверку в существующий owning test и package-local typecheck. Проверять факт отправки image part, а не только наличие PNG. Секреты/request headers и скрытые рассуждения не сохранять.

**Готово:** из fixtures восстанавливаются полные цепочки и явно видны gaps; общая диагностика не меняет prompts/tools/повторы; средства controlled series подготовлены одинаково для B/C и отключены в обычном режиме; reviewer принял B. Результат — `test(evals): audit recovery evidence` и отдельные commits общей продуктовой диагностики/acceptance, если они нужны.

## S1. Свежие UI refs экспорта

**Файлы:** `packages/loginom-runtime/client/lib/text-export-procedure.mjs`; тест `client/test/text-export-lifecycle.test.mjs`. Ориентир донора: `fdd8c5613d`.

**Интерфейс:** существующая процедура настройки Export text, те же входные параметры, receipts, deadline и форма ответа.

- [ ] Добавить тест: открытие dropdown меняет ref option; допустим только ref из наблюдения после открытия. Старый ref должен привести к RED на базе.
- [ ] Адаптировать получение option ref из свежего snapshot. Не добавлять второй клик по уже выполненному действию или бесконечное обновление snapshot.
- [ ] Проверить отсутствие нужного пункта, отмену и истечение deadline перед жестом; проверить существующие переходы Next и overwrite.
- [ ] Пройти тест, независимое ревью и commit `fix(runtime): refresh export option refs`.

Из `packages/loginom-runtime/client/`:

```sh
"$LOGINOM_AI_AGENT_TEST_NODE" --test --test-concurrency=1 test/text-export-lifecycle.test.mjs test/text-export-next.integration.test.mjs
```

**Готово:** обновление refs воспроизведено тестом, повторного эффекта нет, контракт не изменён.

## S2. Готовность файлового хранилища и причина отказа

**Файлы:** `client/lib/text-export-output.mjs`, `workspace-ui.mjs`; тесты `client/test/text-export-virtual-storage.test.mjs`, `storage-scan.test.mjs`, `storage-download.test.mjs`. Все пути внутри `packages/loginom-runtime`. Ориентиры донора: `12b83b05d7`, `3253a1e7ee`, `aab1268b88`, `8ac386b603`.

**Интерфейс:** существующий поиск/скачивание Export output с привязкой к исходным папке, документу, workflow и вкладке.

- [ ] RED: FileStore уже открыт, но native строки ещё не отрисованы; текущий поиск преждевременно сообщает отсутствие файла. GREEN: дождаться связанного rendered window в пределах исходного deadline.
- [ ] Следующий цикл: окно с непригодным/пустым scroll anchor. Продолжать только по пригодным anchors, сохраняя предел 40 прокруток; отсутствие прогресса/конец окна не превращать в бесконечный поиск.
- [ ] Следующий цикл: файл найден, но запись диагностики падает. Сохранить подтверждённый результат, отдельно сообщить диагностическую ошибку. При реальном отказе оставить whitelisted причину и точную проверку таблицы/имени, без приватных данных.
- [ ] Проверить смену папки/вкладки и отмену во время ожидания; затем review и commit `fix(runtime): await export storage readiness`.

Из `packages/loginom-runtime/client/`:

```sh
"$LOGINOM_AI_AGENT_TEST_NODE" --test --test-concurrency=1 test/text-export-virtual-storage.test.mjs test/storage-scan.test.mjs test/storage-download.test.mjs test/text-export-read-refusal.test.mjs
```

**Готово:** поздняя отрисовка и безопасная прокрутка работают, ownership/deadline сохранены; успешный export не теряется из-за диагностики.

## S3. Основания для browser recovery

**Файлы:** `client/lib/executor.mjs`, при достаточной самостоятельности правил — новый `browser-recovery-basis.mjs`; `client/test/browser-recovery-executor.test.mjs`, новый `browser-recovery-basis.test.mjs` только вместе с модулем. Пути внутри `packages/loginom-runtime`.

**Интерфейс:** сохранить текущий `browserRecoveryBasis(operationId)` и ответ `dock_browser_recovery`. Донорские `state`, `attempt_id`, `finish.report` не становятся новым публичным API автоматически.

- [ ] По одному воспроизвести: одинаковый отказ той же фазы/узла после завершённого обычного восстановления; execution unknown после подтверждённого release; неоднозначный Save после inspect. Уточнять основание по настоящим receipts, не только тексту ошибки.
- [ ] Минимально адаптировать классификацию и историю в executor. Не добавлять отдельный хранитель состояния поверх executor/runtime.
- [ ] Отрицательные тесты: user cancel, неизвестный transport, upload, уже settled effect, новая pending-операция и поздний ответ старой. Предложение recovery не должно переживать смену целевой операции.
- [ ] Сохранить все текущие page/tab guards и безопасное повторное наблюдение после no-effect refusal. Review и commit `fix(runtime): qualify recovery from operation evidence`.

Из `packages/loginom-runtime/client/`:

```sh
"$LOGINOM_AI_AGENT_TEST_NODE" --test --test-concurrency=1 test/browser-recovery-executor.test.mjs test/node-pending-release.test.mjs test/node-early-release.test.mjs test/browser-recovery.test.mjs
```

Если выделен новый classifier, его тест добавляется к этой команде. **Готово:** положительные и отрицательные основания различаются по evidence, старые отказы не открывают browser tools.

## S4. Проверка результата и NO_BASELINE

**Файлы:** `client/lib/executor.mjs`, `node-execution-procedure.mjs`, `node-procedure.mjs`, `node-read-contract.mjs`, `collapse-native-output.mjs`, Save-адаптер в `bridge.mjs`; тесты `browser-recovery-executor.test.mjs`, `node-read.test.mjs`, `owned-native-preview.test.mjs`, `browser-recovery-bridge.test.mjs`, `browser-recovery-save-bridge.test.mjs`. Пути внутри `packages/loginom-runtime`.

**Интерфейс:** текущий `verifyBrowserRecovery` и публичный finish; проверка остаётся операцией runtime с receipt/ACK. Настройки, сообщённые моделью, не подменяют подтверждённое исполнение или правильность значений.

- [ ] RED/GREEN: старый execution group не завершает новую попытку; для каждого запрошенного output port нужна подтверждённая схема. Сохранить native index и уникальность tree path, проверить исходный узел и тихий граф.
- [ ] RED/GREEN для NO_BASELINE: configure/open отказал до baseline, агент исправил существующий узел. Проверка сначала устанавливает ownership и отсутствие незавершённого жеста; затем получает свежую исходную точку перед собственной проверочной execution, без повторного configure. Если нельзя исключить прошлый неизвестный Execute или привязать узел к заданию, оставить неподтверждённый результат и явный следующий безопасный шаг.
- [ ] Отдельный тест доказывает, что этот путь не возвращает агента к сломанному configure и не выполняет второй неизвестный Execute. Не обещать отсутствие будущего свежего запуска в `dock_node_read`: его текущий контракт требует исполнения.
- [ ] Проверочная операция сохраняет свой receipt до освобождения. Тестировать сбой записи receipt, поздний ответ и точный durable ACK; отсутствие/несовпадение ACK оставляет ownership неопределённым.
- [ ] Сохранить идентичность исходного export/Save, включая защиту от подмены существующего файла. Схему/настройки/значения результата отражать отдельными доказательствами.
- [ ] Если принятому пути нужен новый общий контракт, сначала доказать ограничение текущего и согласовать изменение по правилам проекта; не вводить донорский протокол целиком. Review и commit `feat(runtime): verify recovered execution`.

Из `packages/loginom-runtime/client/`:

```sh
"$LOGINOM_AI_AGENT_TEST_NODE" --test --test-concurrency=1 test/browser-recovery-executor.test.mjs test/node-read.test.mjs test/owned-native-preview.test.mjs test/browser-recovery-bridge.test.mjs test/browser-recovery-save-bridge.test.mjs test/browser-recovery.test.mjs
```

**Готово:** успех подтверждается новым собственным исполнением и нужными схемами; NO_BASELINE не создаёт цикл; uncertain не превращается в completed.

## S5. Metadata и контекст текущей задачи

**Файлы:** producer — `packages/loginom-runtime/client/lib/browser-recovery.mjs` и `bridge.mjs`, их `client/test/browser-recovery.test.mjs` и `browser-recovery-bridge.test.mjs`; consumers — `packages/opencode/src/product/tool-contributor.ts`, `product/turn-lifecycle.ts`, `session/browser-recovery.ts`; owning tests `test/product/tool-contributor.test.ts`, `product/turn-lifecycle.test.ts`, `session/browser-recovery.test.ts`, `session/tools.test.ts`, `session/prompt.test.ts`.

**Интерфейс:** в базе runtime ещё не публикует `_meta`, а reminder читает phase из текста. Добавить минимальную совместимую metadata для связи состояния с попыткой/задачей, сохранив действующий text/structuredContent и публичный API. Policy одного напоминания сохраняется; донорский формат целиком не обязателен.

- [ ] RED/GREEN: настоящий recovery reply из runtime проходит через contributor до task state/reminder. Producer добавляет необходимые metadata, consumer сохраняет их у успешного и ошибочного ответа независимо от text truncation; ошибочный вызов не становится успешным из-за metadata. Тест с искусственно вставленным `_meta` без проверки producer недостаточен.
- [ ] Следующие циклы: новая пользовательская задача, compaction/replay, revert и поздний ответ предыдущей задачи. Старое напоминание не должно оживать или привязываться к новой задаче.
- [ ] Проверить продолжение текущей попытки и одно напоминание на неё. Сверить публичные tool schemas/permissions; не перестраивать session core.
- [ ] Пройти проверки, review и commit `fix(opencode): scope recovery metadata to active task`.

Из `packages/opencode/`:

```sh
bun test --timeout 30000 test/product/tool-contributor.test.ts test/product/turn-lifecycle.test.ts test/session/browser-recovery.test.ts test/session/tools.test.ts test/session/prompt.test.ts
bun typecheck
```

Из `packages/loginom-runtime/client/` также выполнить:

```sh
"$LOGINOM_AI_AGENT_TEST_NODE" --test --test-concurrency=1 test/browser-recovery.test.mjs test/browser-recovery-bridge.test.mjs
```

**Готово:** агент видит правильное состояние текущей попытки при обоих исходах инструмента; предыдущая задача не влияет на новую.

## S6. Освобождение runtime, очереди и лимиты

**Файлы:** `packages/loginom-runtime/client/lib/browser-recovery.mjs`, `bridge.mjs`, `src/managed-entry.mjs`; `packages/loginom-host/src/host-port.ts`; инструкция `packages/product/skills/loginom-automation/SKILL.md`. Тесты runtime: `browser-recovery.test.mjs`, `browser-recovery-matrix.test.mjs`, `browser-recovery-bridge.test.mjs`; Host: `browser-recovery-capability.test.ts`, `managed-work-entry.test.ts`, новый `browser-recovery-release.test.ts` при переносе release notification.

**Интерфейс:** освобождение через существующий private IPC; источник состояния — runtime, Host получает факт и не запускает второй публичный stop.

- [ ] RED/GREEN: release во время handoff, browser call и verification; поздний ответ не возвращает tools/lease. Уведомление release само по себе не доказывает cleanup.
- [ ] Следующий цикл: queued invocation старой попытки после release или нового start отклоняется. Привязать admission к попытке и generation, используя существующее владение.
- [ ] Следующий цикл: finish входит в общий бюджет шагов. Сохранить 30 вызовов и действующий временной предел `loginom`; timeout verification не должен продлевать lease. Не переносить незаметно донорские «10 минут только browser + отдельные 4 минуты verification» как больший общий бюджет.
- [ ] Обязательные тесты порядка: неверная страница отсекается до handoff/первого жеста; закрытая подготовленная вкладка отсекается даже при том же аккаунте и DOM; no-effect refusal требует наблюдения, unknown gesture не повторяется.
- [ ] Согласовать bundled skill с фактическим API: после execution unknown сначала проверка/finish, не новый эффект. Проверить inventory/digest по `packages/product/AGENTS.md`, без внешнего skill fallback.
- [ ] Проверить весь затронутый набор, review и commit `fix(runtime): own recovery release and budgets`. Зафиксировать C.

Из `packages/loginom-runtime/client/`:

```sh
"$LOGINOM_AI_AGENT_TEST_NODE" --test --test-concurrency=1 test/browser-recovery.test.mjs test/browser-recovery-matrix.test.mjs test/browser-recovery-bridge.test.mjs
```

Из `packages/loginom-host/`:

```sh
bun test test/browser-recovery-capability.test.ts test/managed-work-entry.test.ts test/host-port.test.ts
bun typecheck
```

Новый release test добавить к команде, если создан. **Готово:** нет оживления закрытой попытки, дубликата состояния Host или ложного cleanup; старые safety guards сохранены.

## S7. Установленные сборки и управляемые сбои

**Область:** сборки/закрытые артефакты B и C, общий harness H, acceptance fixtures и оператор из S0. Сами средства инъекции уже входят в B/C; S7 использует их, не добавляет только в C. Исходный `packages/loginom-host/script/browser-recovery-live.ts` глотает ошибки release/close, поэтому неизменённый не доказывает cleanup и не является готовой приёмкой.

**Выход:** pins обеих сборок, общего H и корпуса; результаты 12 плановых модельных попыток предварительной серии; проверенный manifest для каждой основной кампании. Это не часть 876.

- [ ] Выполнить итоговые source checks затронутых runtime/Host/opencode/evals. Из runtime package запустить `bun run test:upstream` с закреплённым Node в PATH; из TypeScript-пакетов — `bun typecheck`. Известный ранее сигнал ENOENT в fake harness тесте сохранения generation перед delayed judge (`evals/test/run.test.ts`) классифицировать на принятом H: он проверяет harness, а не продуктовые B/C. Старые числа PASS не считать проверкой новых сборок.
- [ ] Собирать B и C в новых каталогах по [standalone runbook](../../testing/loginom-ai-agent/standalone-cli.md), с одинаковыми pinned Node/Chromium/Bun и каналом. Команда из `packages/loginom-host/`:

```sh
LOGINOM_AI_AGENT_CHANNEL=prod LOGINOM_AI_AGENT_BROWSER_RECOVERY=1 bun script/build-cli.ts "$recovery_artifact_dir"
```

`recovery_artifact_dir` — новый абсолютный каталог из закрытого задания сборки; `LOGINOM_AI_AGENT_NODE_SOURCE` и `LOGINOM_AI_AGENT_BROWSER_SOURCE` задаются из проверенных release resources. Проверить manifest, archive/binary hashes и установленный executable; source-only тест не доказывает installed поведение.

- [ ] Зафиксировать один H для обеих кампаний из принятой ревизии нашей ветки. Controller `evals/script/run-campaign.ts` уже есть в базе; новый scheduler/launcher не нужен. H работает вне агентской изоляции, а CLI B/C выбираются отдельными pins. Не переносить runtime JS fix из LAB-1747 ради совпадения harness.
- [ ] Получить авторитетный сохранённый корпус и original pins из материалов LAB-901/LAB-1747. Исторический source SHA `29ea34e27b8f96ed27b744f639c9f48933f52443` — provenance, локального Git object сейчас нет; он не заменяет доступ к файлам. Материализовать snapshot внутри clean H в ignored `evals/.bundle/lab901-corpus/tasks`, потому что campaign-preflight требует corpus внутри harnessRoot. Effective pins меняют только пути групп; hashes prompts/inputs/references/rubrics/oracle и timeouts сверяются с originals до freeze. При отсутствии архива остановить этот шаг, не подменять корпус текущим HEAD.
- [ ] Сверить состав: 3 ordinary, 65 analytic, 33 detailed, 33 business, 10 node, 2 local-path. В каждом раунде порядок этих групп и отсортированных ID одинаков; сохранить оригинальные task timeouts, включая 1800000 мс для 66 detailed/business. Разделить product source SHA, harness SHA и corpus source SHA: `experimentPins.sourceSha` в текущем campaign-preflight используется для корпуса, а не для CLI; продуктовую ревизию подтверждает CLI manifest.
- [ ] Установить проверенный model catalog с Terra; сохранить hash, реально применённые `EVAL_AGENT_MODEL=openai/gpt-6.1-terra`, `EVAL_AGENT_VARIANT=high`, judge и одинаковый service tier. Не подменять отсутствующую модель похожей. По архивной истории сверить фактические model/variant.
- [ ] Провести по одному модельному построению каждого сценария ниже на B и C. Порядок и инъекция одинаковы, каждому — отдельный чистый профиль/назначенный endpoint. Доступы — из Bitwarden через настроенный `scripts/codex/with-access.py` основного checkout; в замороженной базе этого файла ещё нет. До live проверить доступность обёртки, private карты и unlocked vault. Не читать корневой `local.env`, не делать fallback на env и не передавать эти доступы оцениваемому агенту/судье.

| Проба | Сбой / наблюдаемый результат |
| --- | --- |
| P0 | Без инъекции: обычное построение полностью прослеживается, recovery отсутствует |
| P1 | Отказ configure/open до baseline: восстановление существующего узла и проверка без возврата в сломанный configure; при браузерном доступе — screenshot и доказательство его отправки модели |
| P2 | Повтор одинакового отказа после штатного восстановления: правильный допуск, действия и продолжение сценария |
| P3 | Неоднозначное исполнение: сначала inspect/finish, без слепого повторного эффекта; completed либо честный unknown по фактам |
| P4 | Задержка готовности FileStore/отказ сценарного экспорта: bounded ожидание или recovery с подтверждением нужного файла |
| P5 | Неоднозначный Save: исходная цель, собственный receipt и проверка сохранённого пакета |

- [ ] Инъецировать отказ существующим acceptance механизмом в конкретный шаг, записать точку/тип в журнал и проверить отключение вне этой серии. Для каждого browser episode восстановить всю цепочку из спецификации. Различия B/C могут быть результатом переноса; отказ B не маскировать требованием «все пробы PASS».
- [ ] Отрицательные проверки вкладки, отмены, unknown gesture, бюджета и release выполнить runtime/Host fixtures. Если настоящая browser integration выключена переменной окружения, SKIP явно записать, не считать PASS. Отдельно проверить installed tool catalog и image delivery: локальный fake этого не доказывает.
- [ ] Проверить полноту архивов и подтверждённый cleanup после каждой попытки. Ошибки legacy release/close должны остаться видимыми. Если доказательств не хватает, исправить соответствующий этап и повторить только затронутые пробы с сохранением предыдущих результатов.
- [ ] По размеру этих архивов зарезервировать место под обе кампании и разрешённые технические попытки, сохранить исходный free space/резерв и действующий disk guard. Не удалять чужие архивы ради запуска.
- [ ] До первого admission закрепить одинаковые пределы: N6/batch6 при наличии шести свободных совместимых слотов, максимум 526 started measurement attempts на каждую кампанию, 3 последовательные технические ошибки, 24 часа без прогресса, batch не более 8 часов. Если шесть слотов недоступны, ждать либо выбрать одинаковую меньшую параллельность для обеих кампаний до фиксации manifest; не менять её посреди сравнения. Каждая новая кампания получает собственный clock.
- [ ] Независимый reviewer принимает pins, полноту evidence, изоляцию, limits и сценарии. Затем передать S8/S9 manifests, без запуска в этой карточке.

**Готово:** B/C установлены и неизменны, controlled evidence достаточно для разбора, фактическая Terra/high и доставка изображений подтверждены; H/корпус/лимиты общие. Недостаток естественных recovery в будущих 876 не отменяет этот результат.

## S8. Контрольные 438 измерений

**Исполнитель:** EvalOps по принятому manifest; отдельная карточка. **Вход:** артефакт B, H, frozen corpus, принятые результаты S7. Никаких функциональных переносов в контрольной сборке.

- [ ] Сверить live unit/process/native reservations, свободное место и pins с S7. Выполнить штатный requestPreflight назначенных слотов с пределом 180 секунд; не добавлять отдельный модельный прогрев.
- [ ] Из `harnessRoot` принятого H (`evals/`) запустить штатный controller:

```sh
bun --no-env-file run script/run-campaign.ts --manifest "$campaign_manifest" --server "$campaign_server" --operation reserve
sudo systemctl enable --now "loginom-eval-campaign@$campaign_id.service"
```

Значения берутся из принятого manifest/server config; `campaign_id` равен его ID. Использовать [действующий runbook](../../../evals/docs/autonomous-campaigns.md), включая repair/resume, доставку итога и cleanup. Credentials не записывать в manifest или комментарии.

- [ ] Провести 146 × 3. После quality FAIL сохранить результат; при техническом отказе действовать по принятой retry policy, без обнуления counters/clock и повторной генерации ради судьи.
- [ ] Сохранить все попытки, 438-ключевой ledger, quality/verdict, history, journals, пакеты и файлы. Проверить cleanup отдельно от exit code. Запустить общий evidence audit; его сбой не удаляет уже полученный verdict.
- [ ] Review полноты/сопоставимости. Если кампания закончилась частично, перечислить missing/invalid и причину; 438/438 не заявлять. Передать evidence и состояние ресурсов в S9/S10.

**Готово:** все 438 ключей имеют учтённые результаты и подтверждённый cleanup. Частичная серия остаётся незавершённой: карточка возвращает технический блок с точным условием продолжения. Логи не заменены сводным процентом PASS.

## S9. Новые 438 измерений

**Исполнитель:** EvalOps, отдельная карточка. **Вход:** артефакт C и ровно те же H/corpus/model/judge/limits, что S8; подтверждённое освобождение ресурсов S8.

- [ ] Сверить manifest с контрольным: разрешённые отличия — продуктовые source/artifact hashes, ID кампании, пути собственных результатов и время запуска. Состояние внешней среды записать для оценки временного сдвига.
- [ ] Выполнить штатный preflight и `reserve`/systemd запуск теми же командами S8 с manifest новой кампании. Активная control-кампания или неподтверждённый cleanup не разрешают takeover.
- [ ] Провести 146 × 3 без изменения C, корпуса или правил. Сохранить каждую техническую попытку и окончательный quality FAIL. Ошибка logging/cleanup отмечается отдельно от качества, соответствующий слот не продолжает работу без требуемого подтверждения.
- [ ] Получить 438-ключевой ledger и все evidence, выполнить общий audit, подтвердить cleanup и независимый review. Передать S10; при неполноте перечислить ключи и условие завершения.

**Готово:** то же требование полноты, что S8, для C. Отсутствие browser recovery в части или всех обычных кейсах — наблюдаемый результат, а не повод внедрять сбои в основную серию.

## S10. Разбор и предложение для loginom

**Область:** существующие `evals/src/report.ts`, `analytics-measurements.ts` и подготовленный S0 анализатор; новая итоговая записка `docs/testing/loginom-ai-agent/recovery-port-report.md`. Индексы/полные логи — вне Git; в записке только обезличенные выводы и hashes.

- [ ] Сверить 876 measurement keys с обоими ledgers, присоединить все их attempts. Отдельно показать missing, invalid, technical и evidence gaps. Не превращать отсутствие данных в FAIL качества или нулевую стоимость.
- [ ] Для каждого из 146 кейсов сопоставить три раунда: PASS/FAIL, score/oracle, время, tokens/cost, technical attempts. Показать улучшения и ухудшения с исходными значениями; не делать причинный вывод по одному удачному раунду.
- [ ] Разобрать каждое построение по timeline и результату, включая сценарии без recovery. Для каждого recovery episode связать причину, native recovery, start, действия, проверку, возврат/stop, итог сценария и cleanup. Сохранить доказательства по конкретным tool calls и operation IDs.
- [ ] Для всех ухудшений и неподтверждённых recovery указать первый неправильный переход либо конкретный отсутствующий факт. Отличать сбой скрипта, решения модели, runtime verification, инфраструктуры, судьи и evidence capture.
- [ ] Дополнительно перечитать LAB-1747, проверить фактическую полноту архивов и сравнить только совпадающие валидные ключи. Вынести различия xhigh, source/harness и времени в отдельную таблицу; исторические результаты не входят в основной знаменатель.
- [ ] По S1–S6 дать решение «оставить / исправить / исключить», доказательство пользы, обнаруженные регрессии и ограничения. Не требовать произвольного процента прироста; не считать counter start доказанным восстановлением.
- [ ] Независимое итоговое ревью проверяет выводы по архивам и отсутствие потери guards. Зафиксировать отчёт, обновить checkpoint и передать владельцу предложение для `loginom`. Слияние не выполнять.

**Готово:** на любой вывод можно перейти к конкретному построению/эпизоду; полнота обычной серии и controlled series указана раздельно; понятно, какие изменения стоит включить в `loginom` и почему.

## Checkpoint

- 2026-11-17: согласованы перенос, отдельные карточки, полные логи и 876 измерений high/high; LAB-1747 — дополнительное сравнение.
- `recovery-port` создана от `ae89c43b57`; согласованная спецификация прошла независимое ревью.
- План прошёл независимое ревью runtime/agent и evals; устранены пробелы producer metadata, общих acceptance-точек и получения frozen corpus.
- S0–S10 ещё не выполнялись. Продуктовый код и eval-результаты этой работой не изменены.
- Следующий шаг: по поручению создать карточку S0 с SHA итогового коммита этого плана и владельцем записи в ветку.
