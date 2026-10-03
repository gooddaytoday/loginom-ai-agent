# Выполнение программы: подплан полного покрытия

[Карточка](README.md) · [Реестр](../../registry.json) · [RUNBOOK](../../RUNBOOK.md), [жизненный цикл](../../workflow/lifecycle.md), [CLI-приёмка](../../workflow/acceptance-cli.md).

Статус: **discovery_required**. Component ID: `component.integration.ExecCmd`. Runtime type и native controls: **discovery_required**, новый handler не зарегистрирован. Основание: статический код базы `5f772aea9`, официальная Help 7.4, прочитана 2026-10-02. Каталожный статус: `current_help`.

Цель — поэтапно закрыть все нижеуказанные режимы. Первый этап не означает полноту узла. Документ не повышает implementation/acceptance readiness; живой Loginom, автономная модель и приёмочные проверки при его подготовке не запускались.

## Контракт и источники

Windows-only. Необязательные входные и управляющие переменные → исходные переменные плюс целый результат выполнения и строка ошибки. Сам узел может успешно завершаться при неуспешной внешней программе.

| ID источника | Официальная документация | Версия | Дата чтения |
| --- | --- | --- | --- |
| `integration-execcmd:help-01` | [Выполнение программы](https://help.loginom.ru/userguide/processors/integration/exec-program.html) | 7.4 | 2026-10-02 |

## Требования и независимые проверки

Ниже — функциональная матрица; ожидания проверяющий фиксирует до автономной попытки. Статус каждой строки сейчас NOT_RUN. Входы и expected не генерировать кодом будущего handler; reference package/внешний клиент допустимы только независимо квалифицированные.

| ID / этап | Требование | Проверка и ожидаемый результат | Источник |
| --- | --- | --- | --- |
| `integration-execcmd:r01`<br>`integration-execcmd:s1` | Командная строка с абсолютным executable и аргументами, %variable% подстановка. | Exit0 создаёт ровно один marker с ожидаемыми аргументами; пробелы/кириллица/кавычки сохраняются. Отсутствующая переменная/файл не меняет намерение команды. | `integration-execcmd:help-01` |
| `integration-execcmd:r02`<br>`integration-execcmd:s1` | Выходной код и сообщение ошибки при успешной активации узла. | Exit7 и missing executable обнаруживаются проверкой выходных переменных; status узла сам по себе не даёт PASS. | `integration-execcmd:help-01` |
| `integration-execcmd:r03`<br>`integration-execcmd:s2` | Timeout 0, положительный и бесконечность; флаг завершения программы. | При 0 узел завершается сразу; bounded ожидание с kill on/off проверяет отдельно завершение узла и child. Бесконечность тестировать только с самостоятельно завершающейся программой. | `integration-execcmd:help-01` |
| `integration-execcmd:r04`<br>`integration-execcmd:s2` | cwd сохранённого/несохранённого и производного пакета; desktop/server разрешение. | Marker содержит ожидаемый cwd текущего пакета, не базового; без admin допуска на server наблюдать отказ, настройки не менять неявно. | `integration-execcmd:help-01` |
| `integration-execcmd:r05`<br>`integration-execcmd:s2` | Управляющие timeout-переменные и cold reopen. | Повторно открытый пакет сохраняет текст/настройки; новая попытка использует новый marker, сохраняя evidence предыдущей. | `integration-execcmd:help-01` |

### Самостоятельные fixtures

Безопасные локальные fixture-программы в выделенной Windows директории: запись marker и exit 0; exit 7; вывод пути cwd; контролируемое ожидание. Проверяющий независимо читает marker и процессный статус; никаких произвольных системных команд.

Подготовить в этом каталоге `acceptance/task.md` и `acceptance/input/`; независимые `acceptance/expected/` и verifier хранить вне workspace модели. Это запланированные материалы, а не уже созданные доказательства. Для внешней системы использовать отдельный namespace/schema/topic/project на попытку. Парный обработчик импорта/экспорта не является hard dependency.

## Этапы и реализация

| ID | Результат этапа | Приоритет | Hard dependencies | Environment gates |
| --- | --- | --- | --- | --- |
| `integration-execcmd:s1` | Команда и независимое доказательство exit; покрывает `integration-execcmd:r01`, `integration-execcmd:r02` | 5 | `foundation:typed-variables`, `foundation:external-effects` | Windows; администратором разрешённый ExecCmd |
| `integration-execcmd:s2` | Timeout, cwd и восстановление; покрывает `integration-execcmd:r03`, `integration-execcmd:r04`, `integration-execcmd:r05` | 5 | `integration-execcmd:s1` | окружение предыдущего этапа |

Общие зависимости: [foundation:typed-variables](../../foundations/typed-ports/plan.md), [foundation:external-effects](../../foundations/external-systems/plan.md). Приоритет задаёт рекомендуемую волну после зависимостей, не разрешение запуска. Наличие credentials/БД/ОС — environment gate, не искусственная зависимость от соседнего узла.

Использовать `node-context.mjs`, `node-procedure.mjs` и `node-operation-runner.mjs`; типизированный reader переменных требует принятого foundation, табличный `node-read-driver.mjs` не считать готовым variable reader.

Общие точки проверены статически: [диспетчер handler](../../../../packages/loginom-runtime/client/lib/node-support.mjs), [ownership операции](../../../../packages/loginom-runtime/client/lib/node-operation-runner.mjs), [сохранение пакета](../../../../packages/loginom-runtime/client/lib/package-persistence.mjs). В dispatcher есть 14 обработчиков; этот компонент среди них отсутствует.

В реализации предусмотреть отдельные `integration-execcmd-node.mjs`, `integration-execcmd-parameters.mjs` и native configure/readback по форме существующих обработчиков; это предлагаемые новые файлы в `packages/loginom-runtime/client/lib`, пока они отсутствуют. До кодирования закрепить фактический runtime type, порты, controls, поддержанные сочетания и ошибки в discovery evidence. Не придумывать data-tid и не использовать raw UI обход отсутствующего контракта. Общие изменения Host/Agent/typed ports принадлежат владельцу foundation и принимаются отдельно; публичный API не меняется этим документом.

Реализовывать stage за stage: сначала validation/target binding, затем configure/readback, исполнение, полный result reader или external/file evidence, сохранение и cold check. Existing patch сохраняет неуказанные настройки только после подтверждённого чтения. Configure-only не должен выполнять бизнес-операцию; если discovery схемы требует выполнения, это отдельный явно учитываемый эффект.

## Ошибки и восстановление

Повтор операции может дважды запустить программу. На timeout без kill child остаётся жив: сначала проверить PID/marker, затем завершать только собственный тестовый процесс по регламенту; cleanup обязан подтвердить отсутствие orphan.

На каждом переходе сохранять operation/document/package/workflow/node/execution identity. Различать отказ до эффекта, подтверждённую ошибку и неизвестный результат. Повтор того же operation_id не создаёт второй узел/выполнение. Обнаружив окно ошибки, собрать причину, закрыть только принадлежащий текущей операции диалог и подтвердить возврат; не удалять исходную неуспешную попытку. Timeout ожидания клиента не является отменой на сервере. Cleanup подтверждается отдельными receipts и не превращает FAIL в PASS.

## Проверки, CLI и критерии завершения

Добавить адресные тесты `client/test/integration-execcmd.test.mjs` и `client/test/integration-execcmd-lifecycle.test.mjs` (пока не существуют): валидация режимов/типов, identity mismatch, ошибки до/после эффекта, lost reply, cancel, existing patch, пустой набор и сохранение. Проверять настоящую реализацию; expected не импортирует handler. Для oracle обязательны отрицательные проверки: подменённое значение, схема, mapping, execution или старый артефакт должны приводить к FAIL.

После реализации запускать из `packages/loginom-runtime/client`:

```sh
node --test test/integration-execcmd.test.mjs test/integration-execcmd-lifecycle.test.mjs
node --test test/node-operation-runner.test.mjs test/node-operation-failure.test.mjs test/node-read.test.mjs test/package-persistence.test.mjs
```

Это команды будущей проверки, сейчас они не запускались. Первая требует добавленных адресных тестов; вторая использует существующие source tests и не доказывает аналитическую приёмку. Проверки типов затронутых TypeScript-пакетов выполнять только через `bun typecheck` из соответствующего пакета.

CLI-задание: выполнить бизнес-задачу над подготовленными входами, получить требуемый результат узла «Выполнение программы» и сохранить пакет в уникальном месте. Для каждого этапа задание включает все его modes/cases, но не UI-команды, oracle, source-код verifier или готовые expected. Модель/effort берутся из назначения; допустимое время одной попытки — **7200 секунд** по RUNBOOK. Перед приёмкой закрепить чистый candidate SHA и все runtime/client/model/platform/provider pins.

Независимый проверяющий другим аккаунтом/браузерным профилем читает сохранённые настройки, все связи/порты и полный небольшой результат, затем проверяет новый execution и повторное открытие через `scripts/node-acceptance/cold-check.mjs` из того же checkout. Для sink нужен внешний/файловый oracle; существующий табличный cold-check не объявлять автоматически достаточным. Внешние destructive cases повторять только на новой fixture-цели: их долговечные настройки и результат проверяются отдельно. `package_closed=true` и `logged_out=true` обязательны; отсутствие этих receipts оставляет приёмку незавершённой.

К ревью этап готов после выполнения всех его требований и адресных проверок; к CLI-приёмке — после исправлений и фиксации SHA. Полное покрытие узла возможно только после всех stages и заявленных environment profiles. NOT_RUN, FAIL и discovery_required не подменять configure/build/HTTP200/старым SHA. Integration, merge и release остаются отдельными действиями владельца.

## Точка продолжения

- SHA основания: `5f772aea9`; результат: документированный scope, реализации и live приёмки нет.
- Открыто: Точное quoting, native статус cancelled и process ownership требуют discovery; ошибка вне логов узла должна передаваться модели из output variables.
- Следующий шаг: назначить первый stage с pins и окружением; провести targeted discovery, закрепить controls/схемы и независимые fixtures, после чего решать readiness этапа.
- Существенное изменение общих контрактов или критериев согласовать с владельцем; checkpoint исполнения ограничить 20 строками.

<!-- parallel-execution:start -->

## Параллельная работа

При подготовке этого плана новые задачи и прогоны не запускались; существующие карточки могут уже выполняться. При назначении используются [правила Multica](../../workflow/multica-parallel.md); наличие строки не подтверждает доступность ресурса или готовность этапа.

| Этап | Направление | Группа карточки | Разработка | Интеграция | Модель | Независимая проверка | Примечание |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `integration-execcmd:s1` | Серверный код, процессы и специальные источники | integration-execcmd | — | runtime-registration<br>readiness-publication<br>base-branch | legacy-oauth (legacy OAuth) | oracle-profile | Одна активная карточка разработки на узел; независимые узлы этой дорожки не образуют цепочку. Общая регистрация — отдельное короткое окно перед проверкой итогового SHA. |
| `integration-execcmd:s2` | Серверный код, процессы и специальные источники | integration-execcmd | — | runtime-registration<br>readiness-publication<br>base-branch | legacy-oauth (legacy OAuth) | oracle-profile | Одна активная карточка разработки на узел; независимые узлы этой дорожки не образуют цепочку. Общая регистрация — отдельное короткое окно перед проверкой итогового SHA. |

<!-- parallel-execution:end -->
