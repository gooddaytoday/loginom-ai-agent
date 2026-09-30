# JavaScript

Устойчивый ID: `component.programming.JavaScript`. Slug: `programming-javascript`.
Исторического номера подплана нет. Runtime type `programming.javascript`
описан в оболочке ветки `node-javascript`; **apply handler ещё не зарегистрирован**.

[Подплан](plan.md) · [исследование](research.md) · [данные и oracle](fixtures/README.md) ·
[рекомендации ревью](review-recommendations.md) · [перепроверка ускорения](acceleration-review.md) ·
[реестр](../../registry.json) ·
[один узел](../../workflow/single-node.md).

[Результаты перепроверки рекомендаций](review-verification.md) отделяют
подтверждённые факты, новые проектные решения и ещё не выполненные live-пробы.
Учтены бюджеты доставки, точность редактора, перенос docs в worktree,
source-read без исполнения и отдельное declared-задание.

Исходный пользовательский [справочник JavaScript/ChakraCore](references/js_node_loginom_system_prompt.md)
для Loginom 7.4.2 сохранён в Git без изменения содержимого. Его аудит находится в
[исследовании](research.md); подготовка проверенной runtime-редакции и её
доставка модели предусмотрены фазой 1B подплана.

## Состояние и границы

**discovery_required**, 2026-09-29. Проведено исследование исходников,
официальной справки, приложенного системного справочника и e2e-репозитория.
Продуктового apply handler JavaScript пока нет. В child code
`f8ceebcac9` реализован ограниченный injected existing-code handler:
headed `public-node-apply-03` подтвердил публичный configure/Done,
независимый source-read и cleanup 3/3. Output mapping остался
`configured_only` (полная source identity не доказана); Execute, Save/cold и
полный продуктовый handler этим не доказаны. Краткая актуальная
сводка и SHA — в [checkpoint](checkpoint.md#текущее-состояние).
Для C child `4d70ea22fb` составил новый Code lifecycle. Headed public run02
подтвердил новый узел, source/Done, полные native mappings5/5 и4/4 и две разные
owned completed execution identities; output read остановился до Table Add.
Его пакет/сеанс закрыты отдельным recovery, original status сохранён. В отдельном run05 на `97098322a1` owned Views и полный typed UI 6×4,
две owned Execute и независимый output-only oracle подтверждены. Исходный run
не принят целиком: operator schema ошибочно требовала input `excluded`; пакет
закрыт отдельным recovery. Контракт исправлен в `e615f4df7f`; `ed56268a6d`
подключил owner-bound Save после полного public Code/source-read. Свежий headed
Code → Save прошёл полный независимый audit и обычный cleanup3/3; отдельный
cold reader без source/oracle подтвердил source/settings, fresh Execute и
результат6×4; cleanup3/3 проверен. D05/source `418abc95c0` также прошёл полный
public declared6×4/metadata/default usage/Save audit и cleanup3/3;
отдельный cold reader без source/oracle подтвердил source/settings/new Execute/
все6×4 cells и cleanup3/3. В первой части E/source `467da5ab9a` isolated public
existing comment edit/Execute/read прошёл отдельно для code и declared:
полные native settings/mappings/graph, fresh6×4 и independent public source
проверены, cleanup3/3/process absence подтверждены. На `e1fd122320` отдельно
приняты public existing changed/reordered input freshness для обоих modes:
все input6×5/output6×4 cells, fresh executions и cleanup проверены.
На `bccc8a0a08` fixed public Code scalar output5/5, named access и empty
output также прошли independent typed audits и cleanup. Следующий шаг — E
one-row/empty input и точный остаток J06–J08, затем остальные J.
Точная текущая точка — в checkpoint; частичная поддержка не зарегистрирована
в продуктовом каталоге.

Исследование мастера проводится в Ubuntu headed-браузере; private
пробы подтвердили real/boolean/string/safe-int64 и Date civil/native identity,
а также keep2/odd/duplicate cardinality с сохранением исходных данных и отдельно
изменение точности outside-safe int64. Для двух фиксированных режимов сохранения
частный writer/cold/package-byte цикл подтверждён вместе с чистым состоянием
после Save; публичный G7-контракт этим не принят. UI declared-empty и ОС
сервера Linux подтверждены отдельно. Доказательства и ограничения — в
[checkpoint](checkpoint.md).
Разработка публичного обработчика, сборка кандидата и автономная CLI-приёмка
ещё не завершены.
Состояния реализации, аналитической проверки, интеграции и выпуска в реестре
остаются прежними. Планирование не запускает очередь.

Внешние e2e/TestCafe используются как источник сценариев и примеров;
их запуск не является условием разработки или приёмки. Обязательны адресные
тесты обработчика, live-проверки и автономная CLI-приёмка по подплану.

Предлагаемый первый этап — синхронное табличное ядро: один вход/выход,
создание и редактирование кода, пять scalar-типов, заданная в мастере или коде
схема, configure/execute/read/save/reopen, диагностические ошибки и восстановление.
Выбор этого объёма — рекомендация плана, не объявление всего узла поддержанным.
Несколько таблиц, переменные, `builtIn/Calc`, внешние модули, Fetch, FS и async
учтены как отдельные расширения с собственными условиями приёмки.

Исследованная продуктовая база: `a8ad59766dbdb4f2da0b54367a755ce00891dd71`.
Этот SHA остаётся закреплённой продуктовой базой кампании. Ветка документации
`javascript` уже перебазирована на `loginom` commit `3f35c5f232`, который добавил
общее правило [чтения кнопки ошибки мастера](../../workflow/lifecycle.md#отказ-мастера-и-кнопка-ошибки).
Перебазирование документации не меняет закреплённую продуктовую базу; её смена
требует отдельной проверки и обновления назначения.

Живой стенд назначен пользователем:
[http://logi-test-plan.bg.local/app/](http://logi-test-plan.bg.local/app/).
Целевой build обучения — Loginom 7.4.2: к нему относится справочник, и его же
допускает текущий graph adapter. Доступность, build7.4.2 и вход выделенным
пользователем `jsteach` подтверждены live-прогонами на Ubuntu. ОС сервера
Linux установлена отдельным чтением `Session.Version.IsWindows=false`, а не
по Ubuntu оператора; дистрибутив и версия ядра не установлены.

## Главные условия продолжения

- Сверить текущие docs/code и обработанные указания в каноническом checkpoint;
  допуск Ubuntu/worktree/памяти повторять только при изменении предпосылок/сбое.
- Результат **B — публичный configure existing code-table** подтверждён
  только для fixed comment-only source в изолированном runtime; частичный
  handler не включён в продуктовый registry. Повторять этот run без
  затронувшего изменения не требуется.
- Private G3 fixed code bridge GetColumn → native mapping → physical output0
  подтверждён live01/source `1965b71edd`; остальные name/type/declared случаи
  и public lifecycle открыты. Остаток 0B — G1 identity/assistant, G5 API/J24
  и G6; точные границы — в [discovery](discovery.md).
- Private P1 бизнес 6×4 проверен для code/base, declared/base и code
  changed/reordered с неизменным oracle и cleanup 3/3; точные SHA и границы
  в checkpoint. Private конечный native Stop, отдельный local read cancel и
  short same-node rerun 6×4 подтверждены run08/source `0328cadfc9`, cleanup 3/3.
  Fixed public C/D writer/Save и independent cold подтверждены; следующий
  fixed E existing source edit/Execute/read для code/declared также принят;
  public input freshness 4/4 также принят на `e1fd122320`; следующий
  результат — one-row/empty input и точный остаток J06–J08 после
  принятых fixed Code typed7/7, затем остаток J и F.
  Полный G6 и product candidate/CLI
  приёмка остаются открытыми.
- После ревью проверить knowledge/budgets и J27 на immutable CLI candidate,
  затем две автономные попытки Sol low только на назначенном стенде.
  Source fix explicit URL уже есть; альтернативный fix согласовать до сборки.

Порядок A–F, уровни J01–J27 и правила итераций закреплены в [подплане](plan.md).
Режим браузера — обычный headed по последнему указанию пользователя; правило
остановки при недоступной памяти сохранено. Текущий документ не разрешает
подменять пользовательский клиент, публиковать выпуск или сливать ветку.
