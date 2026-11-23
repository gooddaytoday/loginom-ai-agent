# Browser recovery: план выборочного переноса

> **Для исполнителей:** выполнять по этапам через `subagent-driven-development` или `executing-plans`; изменения кода — по `tdd`. Каждый этап предназначен для отдельной карточки Multica. Сейчас подготовлен план, выполнение не начато.

**Цель:** перенести полезное поведение `recovery-build-flag` в новую ветку от `loginom` и проверить результат на полном сопоставимом eval-прогоне.

**Архитектура:** сохраняем текущие контракты Dock, runtime, Host и агента. Переносим поведение по одному, с проверкой потребителей и независимым ревью. Для анализа используем существующие campaign controller, журналы и архивы.

**Технологии:** TypeScript/Bun, Node.js, Playwright/MCP, установленный standalone CLI, eval harness, systemd, Multica.

**Спецификация:** [согласованные решения и требования](../specs/2026-11-17-recovery-port-design.md). Она определяет объём работы; этот документ — порядок выполнения, карточки и checkpoint.

## Общие ограничения

- База `recovery-port` — `c5e652bfa3da10afbb6850b4adafdbde696a8c5c`. Донор — `1ab348a91d7c8ae180744293ff746f859d49145a`.
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

Команды ниже выполняются из указанного каталога. `LOGINOM_AI_AGENT_TEST_NODE` указывает на закреплённый Node (24.19.0 на текущей базе), `LOGINOM_DOCK_TEST_BROWSER` — на Chromium из той же поставки. Для runtime установлены зависимости `client/package-lock.json`. `TMPDIR` указывает на закрытый рабочий каталог. Модель в unit-тестах и тестах судьи не вызывается.

## S0. Общая диагностика и условия контрольной серии

**Область:** `evals/src/{config,preflight,cli,process-supervisor,profile,profile-archive,diagnostics,analytics-measurements,report}.ts`; при доказанном пробеле — `packages/opencode/src/{cli/cmd/run,session/processor,session/message-v2,session/llm}.ts`, `packages/loginom-runtime/client/lib/{execution-journal,browser-recovery}.mjs`. Подготовка управляемых сбоев использует существующий private acceptance путь runtime/Host. Обычный запуск сохраняет своё recovery-поведение.

Цепочка private control: `packages/loginom-host/src/host.ts` → `supervisor.ts` → `packages/loginom-runtime/src/start-input.mjs` (`validateStartInput`) → `managed-entry.mjs` → `client/lib/bridge.mjs` → `executor.mjs` → `node-apply.mjs`. Нужен узкий private test launcher/Host input для текущего CLI: одни поля supervisor через продуктовый путь сейчас не проходят. Модель не управляет этой настройкой.

**Вход/выход:** текущие events, DB/history, tool-output и native journal → индекс измерений и recovery-эпизодов по спецификации. B — принятый SHA после общей продуктовой диагностики. Если продуктовых изменений не потребовалось, это исходное поведение `loginom` с документацией.

- [ ] Для установленного CLI этой базы исправить binary preflight. Сейчас он ещё требует `LOGINOM_DOCK_API_KEY`, вызывает удалённые `/health` и Skills API, хотя продукт использует локальные Help и `loginom-automation`. До запуска проверить manifest и digest установленных ресурсов без отдельного вызова `dock_prepare`. В аудите сверить `source: bundled` и `skillRevision` по фактическому `dock_prepare` попытки, опираясь на существующую проверку в `evals/src/node-selection.ts`. Если инструмент не вызван, указать `not_observed`. Проверить работу без удалённого ключа и отказ при несовпадающем digest. Сохранить проверки Loginom, storage, isolation и model preflight, а также режимы judge-only и dry-run.
- [ ] Обновить проверку профиля в `evals/src/profile.ts`. Пустой прежний `apiKey` для локальных ресурсов допустим и не повод вызывать `loginom setup` повторно. Сохранить проверки явного URL, пользователя, состояния пароля и незавершённого recovery. `View.state` описывает готовность Help, а проверка входа в браузер имеет отдельный результат. Проверить отказ браузера и повторное использование корректно настроенного профиля без ключа.
- [ ] Составить карту «нужный факт → существующий файл/поле → связь». Проверить обычный успех, обычный отказ, start без действий, recovery с действиями, unknown/stop и незавершённую попытку. Новый `diagnostics export` ограничивает файлы, размер и число попыток. Полная история берётся из архивов профиля и runtime, включая данные, которых нет в сокращённом `run.json`.
- [ ] Через тест существующего parser/audit воспроизвести потерю конкретного нужного факта. Для полного browser output проверить ответ с суммарным текстом **больше 46000 байт**: `browserCall` уже вызывает `boundText` внутри runtime, а `describeContent` пишет в журнал только тип/размер текста. Сначала найти пригодный существующий источник полного ответа; если его нет, сохранять его в существующий закрытый архив до runtime-обрезки с действующим redaction. Проверить сохранность хвоста, отсутствие секретов и прежний лимит модельного ответа. Позднего `tool-output` после contributor недостаточно.
- [ ] Для изображения проверить связь tool attachment с исходящим model request по ID/hash. Учитывать, что `describeContent.sha256` — hash base64-строки, а `bytes` — длина декодированных байтов; не сравнивать первый напрямую с hash PNG. Тест должен отличать разные представления одного изображения от реально отсутствующей доставки.
- [ ] Адаптировать `recoveryToolsCovered` / `auditMeasurement` для обычного corpus campaign, не переносить ограничения специализированного analytics runner. Индексировать все попытки, включая error до первого assistant message. Знаменатель — 876 measurement keys; retries вложены в соответствующий ключ.
- [ ] Проверить анализатор на fixtures: обычное построение без recovery; отказ start до browser phase; start без действий; подтверждённое восстановление; полностью записанные unknown/transport failure/`retained_uncertain`; реальная потеря журнала/изображения; `continuable` при незавершённой исходной операции. `recoveryToolsCovered` отвергает часть полных неуспешных цепочек — его boolean нельзя использовать как общую полноту evidence. Gaps определяются по отсутствующим обязательным фактам достигнутой фазы, а не по неуспеху операции.
- [ ] Сохранить раздельно `requested`, `started`, `browser_used`, фактический verification status (`continuable/completed/unresolved`), состояние исходной операции, качество артефакта, CLI status/exit и cleanup. Если нужен агрегат `verified`, явно определить, какие status он включает; `continuable` не считать завершением исходной операции. Fixture `exit=1` + пригодный `score=100/pass=true` сохраняет обе оси без изменения judge/CLI policy. Счётчик донора «успех после start» получать из индекса, без второго источника истины.
- [ ] До фиксации B адаптировать private `phase_stop`/`release_refusal` для P1–P4 там, где они воспроизводят нужную границу. `phase_stop` срабатывает после действия до записи квитанции фазы. В P4 проверка скачивания должна отказать после подтверждённого экспорта. Для browser T4 в P5 отдельная узкая точка должна сорвать чтение saved state после подтверждённой квитанции Save. Поведение при reconnect проверяют существующие fixtures S3. Привязать control к назначенному chat, операции, фазе и ограниченному счётчику. Журналировать срабатывание и сбои release/close.
- [ ] Проверить проводку CLI → Host → managed runtime в fixtures, включая отказ на чужой операции и отсутствие инъекций в validation/dashboard и в обычном чате. Сохранить `validationHttpCache`, идентичность resource manifest/cache и сроки запуска. Проверить сверку ACK с `journalCopy(event)`. Живые пробы остаются в S7.
- [ ] Выполнить проверки ниже. Провести review, зафиксировать B и версию формата отчёта. Уточнить disk estimate после S7, до допуска к 876.

Из `evals/`:

```sh
bun --no-env-file test --isolate --timeout 30000 test/config.test.ts test/preflight.test.ts test/output-redaction.test.ts test/cli.test.ts test/diagnostics.test.ts test/profile.test.ts test/profile-archive.test.ts test/analytics-measurements.test.ts test/report.test.ts
bun typecheck
```

Для private control: из `packages/loginom-runtime/`, затем из `packages/loginom-host/` соответственно:

```sh
"$LOGINOM_AI_AGENT_TEST_NODE" --test --test-concurrency=1 test/start-input.test.mjs client/test/node-apply.test.mjs client/test/node-apply-runtime.test.mjs client/test/ack-diagnostic.test.mjs client/test/browser-recovery.test.mjs client/test/browser-recovery-save-bridge.test.mjs
```

```sh
bun test test/browser-recovery-capability.test.ts test/managed-work-entry.test.ts test/node-host.test.ts
bun typecheck
```

При изменении session/provider boundary добавить поведенческую проверку в существующий owning test и package-local typecheck. Проверять факт отправки image part, а не только наличие PNG. Секреты/request headers и скрытые рассуждения не сохранять.

**Готово:** из fixtures восстанавливаются полные цепочки и явно видны gaps; общая диагностика не меняет prompts/tools/повторы; средства controlled series подготовлены одинаково для B/C и отключены в обычном режиме; reviewer принял B. Результат — `test(evals): audit recovery evidence` и отдельные commits общей продуктовой диагностики/acceptance, если они нужны.

## S1. Свежие UI refs экспорта

**Файлы:** `packages/loginom-runtime/client/lib/text-export-procedure.mjs`. Тесты `client/test/text-export-lifecycle.test.mjs` и `workspace-ui-export-combo.integration.test.mjs`. Ориентир донора — `fdd8c5613d`.

**Интерфейс:** существующая процедура настройки Export text, те же входные параметры, receipts, deadline и форма ответа.

- [ ] Воспроизвести перевыпуск ref уже открытого списка при повторном наблюдении перед выбором. Сейчас `channel.perform` замыкает `choice.ref` из первого наблюдения. Тест должен отвергнуть этот устаревший ref и проверить выбор через ref текущего списка того же поля.
- [ ] Разрешать пункт в `resolve(s)` по наблюдению, которое использует `channel.perform`. Сохранять привязку к полю, label и префиксу `boundlist`, единственность пункта и запрет повтора уже выполненного жеста.
- [ ] Проверить отсутствие пункта, отмену, deadline, переходы Next и overwrite. Сохранить новые режимы fixed width, UTF-16 с native BOM, filename variable и ввод пользовательской маски времени.
- [ ] Пройти тест, независимое ревью и commit `fix(runtime): refresh export option refs`.

Из `packages/loginom-runtime/client/`:

```sh
"$LOGINOM_AI_AGENT_TEST_NODE" --test --test-concurrency=1 test/text-export-lifecycle.test.mjs test/text-export-next.integration.test.mjs test/text-export-modes.test.mjs test/text-export-file-variable.test.mjs test/text-export-header-mask.test.mjs test/workspace-ui-export-combo.integration.test.mjs
```

**Готово:** обновление refs воспроизведено тестом, повторного эффекта нет, контракт не изменён.

## S2. Готовность файлового хранилища и причина отказа

**Файлы:** `client/lib/text-export-output.mjs`, `workspace-ui.mjs`; тесты `client/test/text-export-virtual-storage.test.mjs`, `storage-scan.test.mjs`, `storage-download.test.mjs`. Все пути внутри `packages/loginom-runtime`. Ориентиры донора: `12b83b05d7`, `3253a1e7ee`, `aab1268b88`, `8ac386b603`.

**Интерфейс:** существующий поиск/скачивание Export output с привязкой к исходным папке, документу, workflow и вкладке.

- [ ] RED: FileStore уже `observed`, но строки ещё не отрисованы и `findNativeStorageRow` сообщает `no_scroll_owner`. Дождаться готовности связанной таблицы в рамках `searchGuard`. Отличить пустую папку от ещё не отрисованного окна и проверить смену владельца во время ожидания.
- [ ] Сохранить уже работающие hit-testable anchors, наблюдение из собственной квитанции scroll и проход в обе стороны при отсутствии файла. Текущий бюджет зависит от `scroll.max_top` (общий потолок 964 жеста), у поиска есть запас до 60 секунд на возврат к графу. Проверить большой каталог, отсутствие продвижения и сохранность запаса времени. Фиксированный лимит 40 из старого плана больше не подходит.
- [ ] У базы уже есть точный lookup и очищаемая причина отказа перед восстановлением графа. Дополнить только отсутствующий факт в диагностике. Проверить отказ вспомогательной записи отдельно от обязательных записей `export_file_bytes_verified` и `export_file_read_completed`. Сбой обязательной записи сохраняет неопределённость до сверки с квитанцией, а сбой вспомогательной записи не стирает подтверждённый результат.
- [ ] Проверить смену папки/вкладки и отмену во время ожидания; затем review и commit `fix(runtime): await export storage readiness`.

Из `packages/loginom-runtime/client/`:

```sh
"$LOGINOM_AI_AGENT_TEST_NODE" --test --test-concurrency=1 test/text-export-virtual-storage.test.mjs test/storage-scan.test.mjs test/storage-download.test.mjs test/text-export-read-refusal.test.mjs
```

**Готово:** поздняя отрисовка и безопасная прокрутка работают, ownership/deadline сохранены; успешный export не теряется из-за диагностики.

## S3. Основания для browser recovery

**Файлы:** `client/lib/executor.mjs`, при достаточной самостоятельности правил — новый `browser-recovery-basis.mjs`; `client/test/browser-recovery-executor.test.mjs`, новый `browser-recovery-basis.test.mjs` только вместе с модулем. Пути внутри `packages/loginom-runtime`.

**Интерфейс:** сохранить текущий `browserRecoveryBasis(operationId)` и ответ `dock_browser_recovery`. Донорские `state`, `attempt_id`, `finish.report` не становятся новым публичным API автоматически.

- [ ] Воспроизвести два пробела донора: одинаковый отказ той же фазы/узла после завершённого обычного восстановления и execution unknown при подтверждённом release. База уже распознаёт повтор после browser recovery, отказ release, исчерпание Dock-вариантов и подтверждённый экспорт с неподтверждённым скачиванием. Расширять допуск только по квитанциям конкретной фазы и узла.
- [ ] Сохранить `releasePendingPhases`/`recoveryReleasePending`, особый terminal configure для Excel и отказ `exports.text/input_mapping` без живого продолжения. Для Save проверить существующий `SAVE_STATE_UNCONFIRMED` после подтверждённой квитанции и отказа чтения состояния. Не добавлять общий допуск для Save, который ещё восстанавливается штатным inspect после разрыва.
- [ ] Минимально адаптировать классификацию и историю в executor. Не добавлять отдельный хранитель состояния поверх executor/runtime.
- [ ] Отрицательные тесты: user cancel, неизвестный transport, upload, уже settled effect, новая pending-операция и поздний ответ старой. Предложение recovery не должно переживать смену целевой операции.
- [ ] Сохранить все текущие page/tab guards и пару проверок «подтверждённый no-effect refusal → свежее наблюдение → допустимое продолжение» / «неизвестный эффект → запрет слепого повтора». Исторический пример — E3 ниже; `Ref not found` и `page.ok` сами по себе не доказывают no-effect. Review и commit `fix(runtime): qualify recovery from operation evidence`.

Из `packages/loginom-runtime/client/`:

```sh
"$LOGINOM_AI_AGENT_TEST_NODE" --test --test-concurrency=1 test/browser-recovery-executor.test.mjs test/node-pending-release.test.mjs test/node-early-release.test.mjs test/browser-recovery.test.mjs test/recover-resume-guidance.test.mjs test/connection-recovery.test.mjs test/browser-recovery-save-bridge.test.mjs
"$LOGINOM_AI_AGENT_TEST_NODE" --test --test-name-pattern='[Ss]ave|[Rr]econnect' test/executor.test.mjs
```

Если выделен новый classifier, его тест добавляется к этой команде. **Готово:** положительные и отрицательные основания различаются по evidence, старые отказы не открывают browser tools.

## S4. Проверка результата и NO_BASELINE

**Файлы:** `client/lib/executor.mjs`, `node-execution-procedure.mjs`, `node-execution-evidence.mjs`, `node-procedure.mjs`, `node-read-contract.mjs`, `collapse-native-output.mjs`, Save-адаптер в `bridge.mjs`. Границы `node-target.mjs` проверяются соседними регрессиями. Пути внутри `packages/loginom-runtime`.

**Интерфейс:** текущий `verifyBrowserRecovery` и публичный finish; проверка остаётся операцией runtime с receipt/ACK. Настройки, сообщённые моделью, не подменяют подтверждённое исполнение или правильность значений.

- [ ] RED/GREEN: старый execution group не завершает новую попытку. При завершении исполнения подтвердить схемы запрошенных output ports. Сохранить native index, уникальность tree path, variable outputs и отдельные file-only процедуры, включая `exports.lgd`. Проверить исходный узел и тихий граф.
- [ ] RED/GREEN для NO_BASELINE: configure/open отказал до baseline, агент исправил существующий узел. Сначала подтвердить выбранный узел, владение и отсутствие незавершённого эффекта. Если можно доказать свежесть существующего активного результата, использовать текущий `dock_node_read` без Execute. Если требуется новое исполнение и оно безопасно, получить исходную точку перед проверочным запуском. Не возвращаться к сломанному configure. При неизвестном прошлом Execute или неподтверждённой цели сохранить `unresolved` либо подтверждённое частичное продолжение в рамках текущего контракта.
- [ ] Исправить подсказку для читаемого T3, если она обещает новое исполнение через `dock_node_read` без `execution:"execute"`. Проверить обе политики текущего контракта. Без аргумента read ждёт уже запущенный процесс и читает активный результат с подтверждением свежести. Явный Execute разрешается только для проверенного владельца и после исключения незавершённого эффекта.
- [ ] Проверочная операция сохраняет свой receipt до освобождения. Тестировать сбой записи receipt, поздний ответ и точный durable ACK; отсутствие/несовпадение ACK оставляет ownership неопределённым.
- [ ] Отдельно от NO_BASELINE проверить ранний target effect из E4. В базе ACK уже сравнивается с `journalCopy(event)`, а не с исходным объектом до маскирования и JSON-преобразований. Сохранить это сравнение, pending guard и сопоставление частичного узла. Тихий граф без нужной квитанции не разрешает повторное создание. Если донор не решает остаточный случай, записать предел переноса.
- [ ] Проверить соседнюю регрессию E5: допустимое продолжение после release использует нужный существующий узел, сохраняет связи и не создаёт второй export, когда задача требует один выход. Это проверка продолжения, а не основание переделывать все node handlers или приписывать исторические FAIL browser recovery.
- [ ] Сохранить идентичность исходного export/Save, а также защиту от подмены существующего файла. Для Save сохранять штатную сверку исходного receipt после reconnect и разделение pending reconnect, подтверждённого Save и неподтверждённого состояния пакета. Для Save As сохранить действующую проверку пути, dirty state и навигации после восстановления. Схему, настройки и значения результата отражать отдельными доказательствами.
- [ ] Если принятому пути нужен новый общий контракт, сначала доказать ограничение текущего и согласовать изменение по правилам проекта; не вводить донорский протокол целиком. Review и commit `feat(runtime): verify recovered execution`.

Из `packages/loginom-runtime/client/`:

```sh
"$LOGINOM_AI_AGENT_TEST_NODE" --test --test-concurrency=1 test/browser-recovery-executor.test.mjs test/node-read.test.mjs test/owned-native-preview.test.mjs test/browser-recovery-bridge.test.mjs test/browser-recovery-save-bridge.test.mjs test/browser-recovery.test.mjs test/node-target.test.mjs test/node-early-release.test.mjs
"$LOGINOM_AI_AGENT_TEST_NODE" --test --test-concurrency=1 test/node-target-move.test.mjs test/execution-journal.test.mjs test/node-output-json-journal.test.mjs
```

**Готово:** требуемый эффект подтверждён доказанно свежим исполнением и нужными схемами. NO_BASELINE не возвращает к сломанному configure. Неопределённые исходы остаются явными.

## S5. Metadata и контекст текущей задачи

**Файлы:** producer — `packages/loginom-runtime/client/lib/browser-recovery.mjs` и `bridge.mjs`, их `client/test/browser-recovery.test.mjs` и `browser-recovery-bridge.test.mjs`; consumers — `packages/opencode/src/product/tool-contributor.ts`, `product/turn-lifecycle.ts`, `session/browser-recovery.ts`; owning tests `test/product/tool-contributor.test.ts`, `product/turn-lifecycle.test.ts`, `session/browser-recovery.test.ts`, `session/tools.test.ts`, `session/prompt.test.ts`.

**Интерфейс:** runtime ещё не публикует recovery `_meta`, а reminder читает phase из текста. Добавить минимальную metadata для связи состояния с попыткой и задачей. Сохранить публичные text/structuredContent, существующий `_meta.outputFiles` и одно напоминание на попытку.

- [ ] RED/GREEN: настоящий recovery reply из runtime проходит через contributor до task state/reminder. Producer добавляет необходимые metadata, consumer сохраняет их у успешного и ошибочного ответа независимо от text truncation; ошибочный вызов не становится успешным из-за metadata. Тест с искусственно вставленным `_meta` без проверки producer недостаточен.
- [ ] Проверить сочетание recovery metadata с `_meta.outputFiles`. Сохранить приватные сведения о файлах в tool metadata и прежний вид квитанции экспорта для модели.
- [ ] Следующие циклы: новая пользовательская задача, compaction/replay, revert и поздний ответ предыдущей задачи. Старое напоминание не должно оживать или привязываться к новой задаче.
- [ ] Учитывать действующий профиль сессии из `sessions.getForExecution` / `DashboardSession.profile` в `TaskScope.derive`. Проверить, что следы прежней automation-задачи не выдают dashboard-чату recovery tools или reminder и что обычный dashboard-ход не захватывает Loginom Host.
- [ ] Проверить продолжение текущей попытки и одно напоминание на неё. Сверить публичные tool schemas/permissions; не перестраивать session core.
- [ ] Пройти проверки, review и commit `fix(opencode): scope recovery metadata to active task`.

Из `packages/opencode/`:

```sh
bun test --timeout 30000 test/product/tool-contributor.test.ts test/product/turn-lifecycle.test.ts test/session/browser-recovery.test.ts test/session/tools.test.ts test/session/prompt.test.ts
bun test --timeout 30000 test/session/task-scope.test.ts test/session/message-v2.test.ts test/product/tool-policy.test.ts test/product/dashboard-session.test.ts
bun typecheck
```

Из `packages/loginom-runtime/client/` также выполнить:

```sh
"$LOGINOM_AI_AGENT_TEST_NODE" --test --test-concurrency=1 test/browser-recovery.test.mjs test/browser-recovery-bridge.test.mjs
```

**Готово:** агент видит правильное состояние текущей попытки при обоих исходах инструмента; предыдущая задача не влияет на новую.

## S6. Освобождение runtime, очереди и лимиты

**Файлы:** `packages/loginom-runtime/client/lib/browser-recovery.mjs`, `bridge.mjs`, `src/managed-entry.mjs`; `packages/loginom-host/src/host-port.ts`; `packages/product/skills/loginom-automation/SKILL.md` и `references/browser.md`. Тесты runtime: `browser-recovery.test.mjs`, `browser-recovery-matrix.test.mjs`, `browser-recovery-bridge.test.mjs`; Host: `browser-recovery-capability.test.ts`, `managed-work-entry.test.ts`, новый `browser-recovery-release.test.ts` при переносе release notification.

**Интерфейс:** освобождение через существующий private IPC; источник состояния — runtime, Host получает факт и не запускает второй публичный stop.

- [ ] RED/GREEN: release во время handoff, browser call и verification; поздний ответ не возвращает tools/lease. Уведомление release само по себе не доказывает cleanup.
- [ ] Привязать private `run-released` к существующему владельцу recovery и поколению runtime. Проверить изоляцию отдельной dashboard-операции, отсутствие запуска нового runtime и повторного публичного `stop`. Сохранить текущий порядок shutdown, `workState`, правила reuse и подтверждение фактического выхода процесса.
- [ ] Следующий цикл: queued invocation старой попытки после release или нового start отклоняется. Привязать admission к попытке и generation, используя существующее владение.
- [ ] Следующий цикл: finish входит в общий бюджет шагов. Сохранить 30 вызовов и действующий временной предел `loginom`; timeout verification не должен продлевать lease. Не переносить незаметно донорские «10 минут только browser + отдельные 4 минуты verification» как больший общий бюджет.
- [ ] Обязательные тесты порядка: неверная страница отсекается до handoff/первого жеста; закрытая подготовленная вкладка отсекается даже при том же аккаунте и DOM; no-effect refusal требует наблюдения и сохраняет допустимое продолжение (E3), unknown gesture не повторяется. Любой `isError` не становится автоматически terminal.
- [ ] Согласовать bundled `references/browser.md` с фактическим API. Сохранить подсказки про ненастроенное подключение и штатный inspect исходного Save после разрыва. Для execution unknown использовать проверку/finish после исчерпания предложенных штатных действий. Проверить inventory и digest собранного skill по `packages/product/AGENTS.md`.
- [ ] Проверить весь затронутый набор, review и commit `fix(runtime): own recovery release and budgets`. Зафиксировать C.

Из `packages/loginom-runtime/client/`:

```sh
"$LOGINOM_AI_AGENT_TEST_NODE" --test --test-concurrency=1 test/browser-recovery.test.mjs test/browser-recovery-matrix.test.mjs test/browser-recovery-bridge.test.mjs
```

Из `packages/loginom-host/`:

```sh
bun test test/browser-recovery-capability.test.ts test/managed-work-entry.test.ts test/host-port.test.ts test/dashboard.test.ts test/parallel-calls.test.ts test/work-state.test.ts test/bundled-skills.test.ts
bun typecheck
```

Из `packages/loginom-runtime/` проверить `test/managed-entry-close.test.mjs` и `test/managed-resources-close.test.mjs` закреплённым Node. Из `packages/opencode/` запустить `bun test --timeout 30000 test/skill/bundled-skills.test.ts test/product/skill-source.test.ts`.

Новый release test добавить к команде, если создан. **Готово:** нет оживления закрытой попытки, дубликата состояния Host или ложного cleanup; старые safety guards сохранены.

## S7. Установленные сборки и управляемые сбои

**Область:** сборки/закрытые артефакты B и C, общий harness H, acceptance fixtures и оператор из S0. Сами средства инъекции уже входят в B/C; S7 использует их, не добавляет только в C. Исходный `packages/loginom-host/script/browser-recovery-live.ts` глотает ошибки release/close, поэтому неизменённый не доказывает cleanup и не является готовой приёмкой.

**Выход:** pins обеих сборок, общего H и корпуса; результаты 12 плановых модельных попыток предварительной серии; проверенный manifest для каждой основной кампании. Это не часть 876.

- [ ] Выполнить итоговые source checks затронутых runtime/Host/opencode/evals. Из runtime package запустить `bun run test:upstream` с закреплённым Node в PATH; из TypeScript-пакетов — `bun typecheck`. Известный ранее сигнал ENOENT в fake harness тесте сохранения generation перед delayed judge (`evals/test/run.test.ts`) классифицировать на принятом H: он проверяет harness, а не продуктовые B/C. Старые числа PASS не считать проверкой новых сборок.
- [ ] Собирать B и C в новых каталогах по [standalone runbook](../../testing/loginom-ai-agent/standalone-cli.md), с одинаковыми pins Node/Chromium/Bun, runtime lock и action catalog из текущей базы. Для Linux x64 сохранить стандартную baseline-сборку Bun. Проверить одинаковые установленные Help и флаг browser recovery. Канал `prod` сам флаг не включает. Команда из `packages/loginom-host/`:

```sh
LOGINOM_AI_AGENT_CHANNEL=prod LOGINOM_AI_AGENT_BROWSER_RECOVERY=1 bun script/build-cli.ts "$recovery_artifact_dir"
```

`recovery_artifact_dir` — новый абсолютный каталог из закрытого задания сборки; `LOGINOM_AI_AGENT_NODE_SOURCE` и `LOGINOM_AI_AGENT_BROWSER_SOURCE` задаются из проверенных release resources. Проверить manifest, archive/binary hashes и установленный executable; source-only тест не доказывает installed поведение.

- [ ] Зафиксировать один H для обеих кампаний из принятой ревизии нашей ветки. Controller `evals/script/run-campaign.ts` уже есть в базе; новый scheduler/launcher не нужен. H работает вне агентской изоляции, а CLI B/C выбираются отдельными pins. Не переносить runtime JS fix из LAB-1747 ради совпадения harness.
- [ ] Получить авторитетный сохранённый корпус и original pins из материалов LAB-901/LAB-1747. Исторический source SHA `29ea34e27b8f96ed27b744f639c9f48933f52443` — provenance, локального Git object сейчас нет; он не заменяет доступ к файлам. Материализовать snapshot внутри clean H в ignored `evals/.bundle/lab901-corpus/tasks`, потому что campaign-preflight требует corpus внутри harnessRoot. Effective pins меняют только пути групп; hashes prompts/inputs/references/rubrics/oracle и timeouts сверяются с originals до freeze. При отсутствии архива остановить этот шаг, не подменять корпус текущим HEAD.
- [ ] Сверить состав: 3 ordinary, 65 analytic, 33 detailed, 33 business, 10 node, 2 local-path. В каждом раунде порядок этих групп и отсортированных ID одинаков; сохранить оригинальные task timeouts, включая 1800000 мс для 66 detailed/business. Разделить product source SHA, harness SHA и corpus source SHA: `experimentPins.sourceSha` в текущем campaign-preflight используется для корпуса, а не для CLI; продуктовую ревизию подтверждает CLI manifest.
- [ ] Установить проверенный model catalog с Terra; сохранить hash, реально применённые `EVAL_AGENT_MODEL=openai/gpt-6.1-terra`, `EVAL_AGENT_VARIANT=high`, judge и одинаковый service tier. Не подменять отсутствующую модель похожей. По архивной истории сверить фактические model/variant.
- [ ] Провести по одному модельному построению каждого сценария ниже на B и C, в одинаковом порядке и с одинаковой инъекцией. Для каждой попытки использовать чистый профиль. Локальный endpoint сохранять явной настройкой текущей CLI после инициализации. Первый запуск v0.4.0 сбрасывает унаследованное локальное подключение из старого профиля. Получить доступы из Bitwarden через проектную обёртку `scripts/codex/with-access.py` в checkout с настройкой из `2247c34164`. До live проверить доступность обёртки, private карты и unlocked vault. Не читать корневой `local.env`, не делать fallback на env и не передавать эти доступы оцениваемому агенту/судье.

| Проба | Сбой / наблюдаемый результат |
| --- | --- |
| P0 | Без инъекции: обычное построение полностью прослеживается, recovery отсутствует |
| P1 | Отказ configure/open до baseline: восстановление существующего узла и проверка без возврата в сломанный configure; при браузерном доступе — screenshot и доказательство его отправки модели |
| P2 | Повтор одинакового отказа после штатного восстановления: правильный допуск, действия и продолжение сценария |
| P3 | Неоднозначное исполнение: сначала inspect/finish, без слепого повторного эффекта; completed либо честный unknown по фактам |
| P4 | Задержка готовности FileStore/отказ сценарного экспорта: bounded ожидание или recovery с продолжением до требуемого файла/сохранённого результата; один `finish=continuable` не завершает пробу |
| P5 | После подтверждённого Save управляемый отказ чтения состояния ведёт к browser T4 и проверке того же пакета с исходным `operation_id`. Если прервалось соединение, действует штатный inspect исходной операции |

- [ ] Инъецировать отказ существующим acceptance механизмом в конкретный шаг, записать точку/тип в журнал и проверить отключение вне этой серии. Для каждого browser episode восстановить всю цепочку из спецификации. Различия B/C могут быть результатом переноса; отказ B не маскировать требованием «все пробы PASS».
- [ ] В P1/P2 использовать реальный DOM выбранного мастера; объёмный Preview полезен, если подходит к сценарию, без расширения серии. Искусственная роль `button` не доказывает пригодность реального generic-контрола. В P4 проверить также нужные узлы/связи и отсутствие лишнего выхода. Если выбранная существующая приёмка включает cold readback, сохранить его отдельный исход и cleanup (E2); новый cold-прогон для всех 876 не вводить.
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
- [ ] Показать независимо evidence completeness, verification status, исходную операцию, artifact verdict, CLI status/exit и cleanup. Полный unknown не помечать отсутствующим архивом; `continuable` не считать completed; `pass=true/exit=1` не исправлять автоматически. По E6 проверить конкретные источники CLI failure: `run-outcome.ts` отдельно учитывает connection failure `loginom_dock_prepare`, а остальные `loginom_*` пропускает. Без полной цепочки причину оставить неустановленной.
- [ ] Для всех ухудшений и неподтверждённых recovery указать первый неправильный переход либо конкретный отсутствующий факт. Отличать сбой скрипта, решения модели, runtime verification, инфраструктуры, судьи и evidence capture.
- [ ] Дополнительно перечитать LAB-1747, проверить фактическую полноту архивов и сравнить только совпадающие валидные ключи. Вынести различия xhigh, source/harness и времени в отдельную таблицу; исторические результаты не входят в основной знаменатель.
- [ ] По S1–S6 дать решение «оставить / исправить / исключить», доказательство пользы, обнаруженные регрессии и ограничения. Не требовать произвольного процента прироста; не считать counter start доказанным восстановлением.
- [ ] Независимое итоговое ревью проверяет выводы по архивам и отсутствие потери guards. Зафиксировать отчёт, обновить checkpoint и передать владельцу предложение для `loginom`. Слияние не выполнять.

**Готово:** на любой вывод можно перейти к конкретному построению/эпизоду; полнота обычной серии и controlled series указана раздельно; понятно, какие изменения стоит включить в `loginom` и почему.

## Свидетельства для регрессионных проверок

Уточнения от 17 ноября переданы из отдельного исследования по поручению владельца. Там повторно прочитаны два архива Multica и три recovery-эпизода LAB-1747. При этой документационной правке архивы заново не скачивались; границы runtime-обрезки, hash, audit и CLI/quality сверены с кодом `dc829bc140`. Ниже — адресация evidence для исполнителей, не утверждение о текущих багах или новом результате eval. Приватные адреса и сырые логи остаются вне Git.

| ID | Источник и наблюдение | Применение |
| --- | --- | --- |
| E1 | `browser-recovery.mjs`: `browserCall` → `boundText`, textBytes=46000; `describeContent` содержит только type/bytes текста и hash base64 для image. Другие внутренние browser-логи полностью не обследованы | S0: проверить полный ответ до обрезки и корректное связывание изображения |
| E2 | LAB-112, `308-full-logs.tar.xz`, attachment `01a15f0a-be23-7d40-be84-db9f6a57bc94`, SHA256 `c49d66c27848e845ebae0fc9e75bbcd31a7a44d9e44e1ca8f7284d4a9b6333d3`, 745888 байт. `evidence/candidate-s8-rename-follow-1-worker-1792595207383798899/events.jsonl`:54 start, :66 continuable; исходная операция FAILED, настройки/исполнение/export unverified; cold readback FAIL, cleanup BLOCKED | S0/S7/S10: отдельные исходы. Это не ложный completed |
| E3 | LAB-1747, batch70, `run20261117-115207-ae149d3f13-eRrp2p`, `retail-customer-readiness-detailed/1/events.jsonl`:119 start, :149 ref e41 not found, :154 find, :159 click, :164 snapshot, :169 click, :174 continuable; затем новая операция с существующим узлом. Артефакт score100/PASS. Ранее сопоставлены native records :1148 is_error/transport_error=null/page.ok, :1153 attested, :1159 receipt, :1161 continuable | S3/S6: сохранить безопасное наблюдение и продолжение; не обобщать no-effect по одному тексту ошибки |
| E4 | LAB-1747, batch49, `run20261117-054708-ae149d3f13-NPdL9r`, `retail-customer-readiness-business/1/events.jsonl`:140 start, :150 unresolved target effect, :160 stop. LAB-997, `analytic-business/wholesale-basket-concentration-business/2/events.jsonl`:100 start, :115 target ACK differs, :120 stop | S4: target-effect/ACK тупик отличен от NO_BASELINE; не пересоздавать частичный узел |
| E5 | LAB-997, `district-weighted-indicators/2` и `source-device-conversion/3`: обычное продолжение после отказа связи создавало второй export; нарушение одного выхода, score89/FAIL. Вызова browser recovery в этих эпизодах нет | S4/S7: соседняя регрессия структуры графа, без вывода о причине в browser recovery |
| E6 | LAB-1747: `service-digital-processing`, batch37/`run20261117-012747-ae149d3f13-xYldsB` — exit1, CLI_TOOL_FAILED, score100/PASS, cleanup confirmed; есть два webfetch HTTP404 (:49/:54). В E3 тоже exit1 при score100/PASS, но причина exit1 не установлена. `report.ts`/`run.ts` допускают оценку пригодного артефакта после failed CLI | S0/S10: независимые оси и доказательство причин вместо предположения |

Архив E4/E5: LAB-997, `lab997-fail-evidence.tar.gz`, attachment `01a1b64c-52da-73de-830d-937ae9b91ce5`, SHA256 `919fa4e57ee251b4bd7b93a225545f0fb93560e5bf41086c573e179088e3b6d7`, 3703257 байт. В переданном исследовании hash совпал с опубликованным.

Для выбора DOM в P1/P2 дополнительный ориентир — LAB-1702 (Calculator Preview/UI_SCAN_LIMIT) и `docs/superpowers/plans/2026-10-28-p50-product-recovery-fix.md:74` про generic `btnClose`. Логи LAB-1702 в повторном исследовании не открывались; это более слабое свидетельство, не доказательство текущей регрессии.

Ограничения: найденные 3 recovery-эпизода среди 393 сырых Terra-попыток и 6 среди 477 LAB-901 не являются оценкой надёжности или сопоставимыми знаменателями. В трёх проверенных Terra-эпизодах screenshot не использовался — image delivery остаётся задачей S7. Не все архивы/комментарии прочитаны; совпадения времени без traces не доказывают причины.

## Checkpoint

- 2026-11-17: согласованы перенос, отдельные карточки, полные логи и 876 измерений high/high; LAB-1747 — дополнительное сравнение.
- `recovery-port` создана от `ae89c43b57`; согласованная спецификация прошла независимое ревью.
- План прошёл независимое ревью runtime/agent и evals; устранены пробелы producer metadata, общих acceptance-точек и получения frozen corpus.
- 2026-11-17: уточнены pre-truncation evidence, независимые оси исходов и target/graph регрессии по переданному исследованию; независимое ревью — GO. 11 этапов, 12 предварительных попыток и 876 основных измерений сохранены.
- 2026-11-23: три коммита документации перенесены с `46dc320c47` на `loginom@c5e652bfa3` после `v0.4.0`. `range-diff` подтвердил сохранность правок.
- 2026-11-23: S0–S10 сверены с `c5e652bfa3`. План учитывает локальные ресурсы CLI, бюджет поиска файла, чтение без Execute, восстановление исходного Save и границы dashboard. Исторические наблюдения относятся к указанным в них ревизиям.
- S0–S10 ещё не выполнялись. Продуктовый код и eval-результаты этой работой не изменены.
- Следующий шаг: по поручению создать карточку S0 с SHA итогового коммита этого плана и владельцем записи в ветку.
