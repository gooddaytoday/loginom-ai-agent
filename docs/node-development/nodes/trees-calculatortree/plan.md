# Калькулятор (дерево): подплан полного покрытия

[Карточка](README.md) · [RUNBOOK](../../RUNBOOK.md) · [Карта покрытия](../../coverage-map.json).

Component ID: `component.trees.CalculatorTree`. Slug: `trees-calculatortree`. База исследования кода: `5f772aea9`. Источники: Help 7.4, дата доступа 2026-10-02. Статус всех новых этапов: `discovery_required`; каталог: `current_help`. Это подготовленный документ, а не выполнение этапов. В базовом `node-support.mjs` обработчик не зарегистрирован, runtime type и фактические native ports ещё требуется подтвердить. Реестр приёмки не повышается.

## Источники, результат и семантика

- `trees-calculatortree:help01` — [Калькулятор (дерево)](https://help.loginom.ru/userguide/processors/data-trees/calculator-tree/) (Help 7.4, прочитано 2026-10-02).
- `trees-calculatortree:help02` — [Калькулятор (дерево) — JavaScript](https://help.loginom.ru/userguide/processors/data-trees/calculator-tree/javascript.html) (Help 7.4, прочитано 2026-10-02).
- `trees-calculatortree:help03` — [Функции дерева](https://help.loginom.ru/userguide/processors/func/calc-func/data-tree.html) (Help 7.4, прочитано 2026-10-02).
- `trees-calculatortree:help04` — [Порт Дерево](https://help.loginom.ru/userguide/workflow/ports/mapping-trees.html) (Help 7.4, прочитано 2026-10-02).
- `trees-calculatortree:help05` — [Внешние модули JS](https://help.loginom.ru/userguide/processors/programming/java-script/external-modules.html) (Help 7.4, прочитано 2026-10-02).

Обязательный tree input, необязательные typed variables, tree output. Код выражений — JavaScript, не язык табличного expression-калькулятора. Выражение создаёт/заменяет leaf по абсолютному path, может быть intermediate/cached. References case-sensitive; имена уникальны внутри parent, arrays индексируются с0. Обучение отсутствует.



Код и Help изучены статически; live discovery, модельная попытка и аналитическая приёмка сейчас не выполнялись. Перед реализацией наблюдать component/fulltype, портовые identities, каждую страницу мастера и различия редакции/платформы в собственном аккаунте. Неизвестное свойство остаётся вопросом с наблюдаемым условием закрытия, не вымышленным control/API.

## Этапы и зависимости

| Этап | Результат этапа | Приоритет 0–5 | Обязательные принятые этапы |
| --- | --- | ---: | --- |
| `trees-calculatortree:s1` | Скалярные выражения и replacement | 3 | `foundation:typed-trees` |
| `trees-calculatortree:s2` | Иерархия, массивы и переменные | 4 | `trees-calculatortree:s1`, `foundation:typed-variables` |
| `trees-calculatortree:s3` | CommonJS и полная конфигурация | 5 | `trees-calculatortree:s2`, `foundation:programming`, `foundation:file-artifacts` |

Условия допуска `trees-calculatortree:s3`: Разрешённый доступ к собственным CommonJS/JSON fixtures в файловом хранилище.

Схема и autosync дерева относятся к контракту `foundation:typed-trees`: после явной настройки читать фактические пути, типы и mapping; смену источника проверять отдельно для auto/manual и autosync on/off. Для режимов с изменяющейся схемой закрепить собственное разрешение по подтверждённому readback и независимый tree oracle. Строгая ручная схема остаётся строгой; табличная политика CrossTable sliding не является разрешением для дерева.

Общие результаты: [приёмка и oracle](../../foundations/acceptance/plan.md), [типизированные порты](../../foundations/typed-ports/plan.md), [динамическая схема](../../foundations/dynamic-schema/plan.md), [обучение](../../foundations/training/plan.md), [внешние ресурсы](../../foundations/external-systems/plan.md). Зависимость принимается с SHA и собственными доказательствами; чужая активная ветка не считается готовой основой. Самостоятельные fixtures устраняют необходимость ждать парный преобразователь или узел Разбиение на множества.

## Матрица всех режимов и требований

Каждая строка обязательна в указанном этапе; комбинации параметров проверяются по причинно значимым взаимодействиям, а не одним smoke-test. Строка источника обозначает документацию поведения, столбец проверки — будущую независимую проверку. Ни одна строка пока не PASS.

| Требование | Режимы и параметры | Этап и источник | Проверка и ожидаемое доказательство |
| --- | --- | --- | --- |
| `trees-calculatortree:r01` | Создать/клонировать/заменить/переставить/удалить выражения; path/name/label/type/description | `trees-calculatortree:s1`; `trees-calculatortree:help01` | Вход Price=2,Qty=3 даёт Total=6; replacement меняет только нужный path, reorder зависимых выражений проверяет сохранённый смысл. |
| `trees-calculatortree:r02` | JavaScript expression или function-body return, scalar/variant/undefined, встроенные функции | `trees-calculatortree:s1`; `trees-calculatortree:help01`, `trees-calculatortree:help02` | Синтаксис/тип результата проверяются; не использовать табличный calculator parser. Invalid code возвращает native диагностику. |
| `trees-calculatortree:r03` | Абсолютные $Root и относительные Parent/$Parent/$Index, arrays и ItemIndex/ItemCount/Location/DisplayName | `trees-calculatortree:s2`; `trees-calculatortree:help02`, `trees-calculatortree:help03` | Две строки массива с разными Qty выявляют смешение контекстов; index0/1, count2, path/label сверяются независимо. |
| `trees-calculatortree:r04` | Входные переменные this.Var, одинаковое имя node/variable, ссылки на другие выражения | `trees-calculatortree:s2`; `trees-calculatortree:help01`, `trees-calculatortree:help02` | Имя узла приоритетно без префикса; this.Var однозначен; cycles и исчезнувший path дают отказ, а не чужое значение. |
| `trees-calculatortree:r05` | Intermediate/Cache, новые контейнеры, взаимные references и изменившийся source | `trees-calculatortree:s2`; `trees-calculatortree:help01`, `trees-calculatortree:help02` | Intermediate отсутствует в выходе, но доступен вычислениям; cache не переносит старое значение через новый execution без native правила. |
| `trees-calculatortree:r06` | CommonJS require, JSON module, относительный/абсолютный путь, require.resolve/cache; запрет ES6/Promise | `trees-calculatortree:s3`; `trees-calculatortree:help02`, `trees-calculatortree:help05` | Изолированный stateless fixture модуля и сохранённый/несохранённый пакет; не передавать state через cache из-за пула интерпретаторов. |
| `trees-calculatortree:r07` | Полная схема дерева: имена/метки, scalar/variant, data_kind, container/array, обязательность, порядок, ручные связи и автосвязывание по имени+типу, autosync on/off, исключения и восстановление связей; загрузка JSON/XSD, namespace/root/recursion0..3, раскрытие рекурсивных узлов и метки xsd:documentation. | `trees-calculatortree:s3`; `trees-calculatortree:help04` | Независимый typed-tree oracle сравнивает пути, флаги, порядок массивов, точные значения и отсутствие контейнеров отдельно от NULL примитива; обязательный корень нельзя оставить несвязанным. Загрузка схемы проверяется как замена старой структуры, Cancel её сохраняет. |
| `trees-calculatortree:r08` | Preview/console ошибок, метки/комментарии, save/reopen; представительные семейства встроенных функций | `trees-calculatortree:s3`; `trees-calculatortree:help01`, `trees-calculatortree:help02`, `trees-calculatortree:help03` | Preview не заменяет execution. Date/string/math/Boolean/tree functions проходят по одному независимому fixture; передаваемый код не ограничивать искусственным списком пяти функций. |

## Реализация в текущем runtime

Переиспользовать `packages/loginom-runtime/client/lib/node-apply.mjs`, `node-procedure.mjs`, `node-execution-procedure.mjs`, `node-process-context.mjs`, `execution-journal.mjs`: существующую операцию, deadline, ownership и отмену. `workspace-ui.mjs` расширять адресным наблюдением собственных страниц; не вводить общий интерпретатор сценариев и не обращаться к внутренним RPC Loginom.

Для дерева переиспользовать ownership/граф/журнал, а не табличный reader. `node-read-contract.mjs` допускает только завершённые table outputs; `node-api.mjs` описывает table read ports. Typed tree/variable evidence и расширение этих границ идут через общий подплан типизированных портов, с одним владельцем. `port-mapping-procedure.mjs` — образец транзакционной работы мастера, не готовый tree mapper.

Handler, параметры, context/readback и procedure добавлять в `packages/loginom-runtime/client/lib` по образцу `grouping-node.mjs`/`grouping-parameters.mjs` для скалярных ролей и `calculator-node.mjs`/`calculator-readback.mjs` для упорядоченных выражений. Эти образцы не доказывают готовность данного узла. После discovery добавить проверенный тип в `node-support.mjs`, публичный вариант в `node-api.mjs` и компактное развёртывание в `user-workflow.mjs`. Изменение общего контракта согласовать с владельцем соответствующего foundation; не вносить разрозненные новые train/tree/variable wire-формы в каждом handler.

Адресные проверки создаются рядом в `client/test` и выполняются из каталога пакета по его принятой команде. Пока тестов нового обработчика нет, их нельзя указывать как выполненные. Отдельно проверить совместимость 14 существующих типов и read/job/recovery на затронутых путях.

## Независимые fixtures и численные ожидания

Дерево Order с Items[(Price=2,Qty=3),(Price=5,Qty=0)] и Discount=1: per-item Total=6/0, aggregate=6, variable Discount=2 отдельно проверяет this.Var. Сгенерировать поля index/count/path/displayname с точными expected. Использовать intermediate массив и cached значение в нескольких выражениях, затем заменить Qty=4 и проверить новый execution. Independent oracle вычисляет арифметику и paths, не исполняет handler. CommonJS fixture exports add(a,b), отдельный JSON файл с rate; запрещены сеть/побочные внешние операции. Для Date — зафиксированный timestamp/timezone, для real atol=1e-10; неподдержанная Int64 точность JS явно отражается как ограничение, не маскируется.

Expected, формулы oracle, допуски и отрицательные подмены (значение/тип/порядок/связь/модель/источник) закрепить до модельного прогона. Не вычислять expected импортом handler и не выводить их из фактического результата проверяемой попытки. Непрерывные допуски применяются только к указанным числам; identity, Boolean, NULL, строки, количество и схема сравниваются точно. Раздельно хранить входы для модели и oracle/expected вне её workspace. Для всех стадий нужны пустой вход, границы типов, Unicode, повторный запуск, смена исходника и save/reopen в релевантном режиме.

## Ошибки, восстановление и приёмка

Узловые отказы: Syntax/reference/type errors, cycle, out-of-range index, неоднозначный path, missing module, Promise/ES6 import. Read error console до cleanup; не переписывать JavaScript автоматически ради успешного выполнения.

Проверять запрос до эффекта; Done/Close/Execute имеют разные результаты. При отказе мастера прочитать его собственную причину, закрыть принадлежащий операции error dialog, затем подтвердить cleanup. Не повторять Execute/Train или загрузку схемы при lost reply/неизвестном эффекте; использовать status/inspect/recover той же операции, сохраняя исходный deadline и FAIL. Ошибка/отмена не должна выдавать старый output как свежий. Для меняющего схему режима проверить фактические выходы и downstream связи после каждого изменения.

Business task этапа описывает требуемое преобразование/модель, входные файлы и уникальный путь нового пакета. Модель и effort берутся из назначения; предел попытки **7200 секунд**. Приёмка — standalone CLI и независимый cold-check точного опубликованного SHA по [общему регламенту](../../workflow/acceptance-cli.md). Проверить параметры, все входы/выходы и типы, полноту малых результатов, происхождение модели/данных, сохранение и отдельное открытие; `package_closed=true` и `logged_out=true` обязательны. Текущий табличный cold-check расширять через foundation для дерева/переменных/обучения; до появления нужного oracle этап остаётся NOT_RUN. Сборка, exit 0, preview и cleanup отдельно не означают аналитический PASS.

Этап готов к разработке после закрытия его discovery вопросов и фиксации независимых expected; этап готов к приёмке после handler, адресных тестов и проверенного oracle; принимается только объявленный stage scope. Полное покрытие узла требует всех строк всех этапов. Исторические результаты другого SHA/режима не переносятся. Checkpoint не длиннее 20 строк: SHA, принятый scope, проверенные результаты, ограничения, следующий stage/trigger. Реализация, интеграция и выпуск остаются отдельными состояниями; слияние и выпуск требуют отдельной команды владельца.

<!-- parallel-execution:start -->

## Параллельная работа

При подготовке этого плана новые задачи и прогоны не запускались; существующие карточки могут уже выполняться. При назначении используются [правила Multica](../../workflow/multica-parallel.md); наличие строки не подтверждает доступность ресурса или готовность этапа.

| Этап | Направление | Группа карточки | Разработка | Интеграция | Модель | Независимая проверка | Примечание |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `trees-calculatortree:s1` | Деревья | trees-calculatortree | — | runtime-registration<br>readiness-publication<br>base-branch | legacy-oauth (legacy OAuth) | oracle-profile | Одна активная карточка разработки на узел; независимые узлы этой дорожки не образуют цепочку. Общая регистрация — отдельное короткое окно перед проверкой итогового SHA. |
| `trees-calculatortree:s2` | Деревья | trees-calculatortree | — | runtime-registration<br>readiness-publication<br>base-branch | legacy-oauth (legacy OAuth) | oracle-profile | Одна активная карточка разработки на узел; независимые узлы этой дорожки не образуют цепочку. Общая регистрация — отдельное короткое окно перед проверкой итогового SHA. |
| `trees-calculatortree:s3` | Деревья | trees-calculatortree | — | runtime-registration<br>readiness-publication<br>base-branch | legacy-oauth (legacy OAuth) | oracle-profile | Одна активная карточка разработки на узел; независимые узлы этой дорожки не образуют цепочку. Общая регистрация — отдельное короткое окно перед проверкой итогового SHA. |

<!-- parallel-execution:end -->
