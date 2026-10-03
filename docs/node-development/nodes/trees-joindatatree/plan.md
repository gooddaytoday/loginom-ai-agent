# Слияние (дерево): подплан полного покрытия

[Карточка](README.md) · [RUNBOOK](../../RUNBOOK.md) · [Карта покрытия](../../coverage-map.json).

Component ID: `component.trees.JoindataTree`. Slug: `trees-joindatatree`. База исследования кода: `5f772aea9`. Источники: Help 7.4, дата доступа 2026-10-02. Статус всех новых этапов: `discovery_required`; каталог: `current_help`. Это подготовленный документ, а не выполнение этапов. В базовом `node-support.mjs` обработчик не зарегистрирован, runtime type и фактические native ports ещё требуется подтвердить. Реестр приёмки не повышается.

## Источники, результат и семантика

- `trees-joindatatree:help01` — [Слияние (дерево)](https://help.loginom.ru/userguide/processors/data-trees/join-tree.html) (Help 7.4, прочитано 2026-10-02).
- `trees-joindatatree:help02` — [Порт Дерево](https://help.loginom.ru/userguide/workflow/ports/mapping-trees.html) (Help 7.4, прочитано 2026-10-02).

Два обязательных tree inputs: main и attached; один tree output. Это структурное включение дерева в контейнер/массив, не табличное слияние по ключам. Старое initial_scope в реестре является предложением и не доказывает join keys. Receiver не находится внутри массива; контейнерный receiver сам не массив. Типовые конфликты схем создают суффиксы, одинаковые поля сохраняют metadata main.



Код и Help изучены статически; live discovery, модельная попытка и аналитическая приёмка сейчас не выполнялись. Перед реализацией наблюдать component/fulltype, портовые identities, каждую страницу мастера и различия редакции/платформы в собственном аккаунте. Неизвестное свойство остаётся вопросом с наблюдаемым условием закрытия, не вымышленным control/API.

## Этапы и зависимости

| Этап | Результат этапа | Приоритет 0–5 | Обязательные принятые этапы |
| --- | --- | ---: | --- |
| `trees-joindatatree:s1` | Контейнер и включение корня | 3 | `foundation:typed-trees` |
| `trees-joindatatree:s2` | Массив и объединение схем | 4 | `trees-joindatatree:s1` |
| `trees-joindatatree:s3` | Выходные mappings и сохранение | 4 | `trees-joindatatree:s2`, `foundation:file-artifacts` |

Схема и autosync дерева относятся к контракту `foundation:typed-trees`: после явной настройки читать фактические пути, типы и mapping; смену источника проверять отдельно для auto/manual и autosync on/off. Для режимов с изменяющейся схемой закрепить собственное разрешение по подтверждённому readback и независимый tree oracle. Строгая ручная схема остаётся строгой; табличная политика CrossTable sliding не является разрешением для дерева.

Общие результаты: [приёмка и oracle](../../foundations/acceptance/plan.md), [типизированные порты](../../foundations/typed-ports/plan.md), [динамическая схема](../../foundations/dynamic-schema/plan.md), [обучение](../../foundations/training/plan.md), [внешние ресурсы](../../foundations/external-systems/plan.md). Зависимость принимается с SHA и собственными доказательствами; чужая активная ветка не считается готовой основой. Самостоятельные fixtures устраняют необходимость ждать парный преобразователь или узел Разбиение на множества.

## Матрица всех режимов и требований

Каждая строка обязательна в указанном этапе; комбинации параметров проверяются по причинно значимым взаимодействиям, а не одним smoke-test. Строка источника обозначает документацию поведения, столбец проверки — будущую независимую проверку. Ни одна строка пока не PASS.

| Требование | Режимы и параметры | Этап и источник | Проверка и ожидаемое доказательство |
| --- | --- | --- | --- |
| `trees-joindatatree:r01` | Включение в container с root attached целиком/пропущенным | `trees-joindatatree:s1`; `trees-joindatatree:help01` | Main {id:1}, attached Details{active:true}: отдельные expected для вложения Details и добавления active. |
| `trees-joindatatree:r02` | Ограничения receiver и attached root, конфликты names в container | `trees-joindatatree:s1`; `trees-joindatatree:help01` | Нельзя receiver array/внутри array; skip-root несовместим с root-array. Одинаковые child names получают _1/_2, исходное значение main не теряется. |
| `trees-joindatatree:r03` | Включение в array: attached container как один элемент, attached array как все элементы | `trees-joindatatree:s2`; `trees-joindatatree:help01` | Число output items равно сумме, порядок и identity источников подтверждены; receiver должен быть array+container и не nested inside array. |
| `trees-joindatatree:r04` | Рекурсивное объединение схем, scalar NULL и отсутствие container/array | `trees-joindatatree:s2`; `trees-joindatatree:help01` | Недостающий scalar становится NULL; нет контейнера/массива — отсутствует. Конфликт type/container/array создаёт отдельное suffix поле; labels/kind/usage берутся из main при совместимости. |
| `trees-joindatatree:r05` | Полная схема дерева: имена/метки, scalar/variant, data_kind, container/array, обязательность, порядок, ручные связи и автосвязывание по имени+типу, autosync on/off, исключения и восстановление связей; загрузка JSON/XSD, namespace/root/recursion0..3, раскрытие рекурсивных узлов и метки xsd:documentation. | `trees-joindatatree:s3`; `trees-joindatatree:help02` | Независимый typed-tree oracle сравнивает пути, флаги, порядок массивов, точные значения и отсутствие контейнеров отдельно от NULL примитива; обязательный корень нельзя оставить несвязанным. Загрузка схемы проверяется как замена старой структуры, Cancel её сохраняет. |
| `trees-joindatatree:r06` | Смена типа receiver, filters подходящих узлов, output mapping и roundtrip | `trees-joindatatree:s3`; `trees-joindatatree:help01`, `trees-joindatatree:help02` | После смены режима нельзя применить старую неподходящую target identity; сохранённые mappings воспроизводят expected на новом execution. |

## Реализация в текущем runtime

Переиспользовать `packages/loginom-runtime/client/lib/node-apply.mjs`, `node-procedure.mjs`, `node-execution-procedure.mjs`, `node-process-context.mjs`, `execution-journal.mjs`: существующую операцию, deadline, ownership и отмену. `workspace-ui.mjs` расширять адресным наблюдением собственных страниц; не вводить общий интерпретатор сценариев и не обращаться к внутренним RPC Loginom.

Для дерева переиспользовать ownership/граф/журнал, а не табличный reader. `node-read-contract.mjs` допускает только завершённые table outputs; `node-api.mjs` описывает table read ports. Typed tree/variable evidence и расширение этих границ идут через общий подплан типизированных портов, с одним владельцем. `port-mapping-procedure.mjs` — образец транзакционной работы мастера, не готовый tree mapper.

Handler, параметры, context/readback и procedure добавлять в `packages/loginom-runtime/client/lib` по образцу `grouping-node.mjs`/`grouping-parameters.mjs` для скалярных ролей и `calculator-node.mjs`/`calculator-readback.mjs` для упорядоченных выражений. Эти образцы не доказывают готовность данного узла. После discovery добавить проверенный тип в `node-support.mjs`, публичный вариант в `node-api.mjs` и компактное развёртывание в `user-workflow.mjs`. Изменение общего контракта согласовать с владельцем соответствующего foundation; не вносить разрозненные новые train/tree/variable wire-формы в каждом handler.

Адресные проверки создаются рядом в `client/test` и выполняются из каталога пакета по его принятой команде. Пока тестов нового обработчика нет, их нельзя указывать как выполненные. Отдельно проверить совместимость 14 существующих типов и read/job/recovery на затронутых путях.

## Независимые fixtures и численные ожидания

Четыре независимых пары деревьев покрывают контейнер+skip on/off и массив+attached container/array. Конфликт: main value real=1.5, attached value integer=2; ожидать отдельное typed поле с native suffix, не implicit coercion. Для main items[{id:1}], attached[{id:2,extra:3},{id:3,child:{x:true}}] oracle строит unified schema отдельно от data: NULL extra у первого, child отсутствует у первых двух. Порядок именования suffix и порядок элементов устанавливаются перед acceptance, сравниваются exact. Сторонние ветви main сохраняются.

Expected, формулы oracle, допуски и отрицательные подмены (значение/тип/порядок/связь/модель/источник) закрепить до модельного прогона. Не вычислять expected импортом handler и не выводить их из фактического результата проверяемой попытки. Непрерывные допуски применяются только к указанным числам; identity, Boolean, NULL, строки, количество и схема сравниваются точно. Раздельно хранить входы для модели и oracle/expected вне её workspace. Для всех стадий нужны пустой вход, границы типов, Unicode, повторный запуск, смена исходника и save/reopen в релевантном режиме.

## Ошибки, восстановление и приёмка

Узловые отказы: Receiver внутри массива, invalid skip/root array, несовпавшие владельцы входов, потеря suffix данных, mandatory root mapping; ошибки не исправлять преобразованием receiver без исходного намерения.

Проверять запрос до эффекта; Done/Close/Execute имеют разные результаты. При отказе мастера прочитать его собственную причину, закрыть принадлежащий операции error dialog, затем подтвердить cleanup. Не повторять Execute/Train или загрузку схемы при lost reply/неизвестном эффекте; использовать status/inspect/recover той же операции, сохраняя исходный deadline и FAIL. Ошибка/отмена не должна выдавать старый output как свежий. Для меняющего схему режима проверить фактические выходы и downstream связи после каждого изменения.

Business task этапа описывает требуемое преобразование/модель, входные файлы и уникальный путь нового пакета. Модель и effort берутся из назначения; предел попытки **7200 секунд**. Приёмка — standalone CLI и независимый cold-check точного опубликованного SHA по [общему регламенту](../../workflow/acceptance-cli.md). Проверить параметры, все входы/выходы и типы, полноту малых результатов, происхождение модели/данных, сохранение и отдельное открытие; `package_closed=true` и `logged_out=true` обязательны. Текущий табличный cold-check расширять через foundation для дерева/переменных/обучения; до появления нужного oracle этап остаётся NOT_RUN. Сборка, exit 0, preview и cleanup отдельно не означают аналитический PASS.

Этап готов к разработке после закрытия его discovery вопросов и фиксации независимых expected; этап готов к приёмке после handler, адресных тестов и проверенного oracle; принимается только объявленный stage scope. Полное покрытие узла требует всех строк всех этапов. Исторические результаты другого SHA/режима не переносятся. Checkpoint не длиннее 20 строк: SHA, принятый scope, проверенные результаты, ограничения, следующий stage/trigger. Реализация, интеграция и выпуск остаются отдельными состояниями; слияние и выпуск требуют отдельной команды владельца.

<!-- parallel-execution:start -->

## Параллельная работа

При подготовке этого плана новые задачи и прогоны не запускались; существующие карточки могут уже выполняться. При назначении используются [правила Multica](../../workflow/multica-parallel.md); наличие строки не подтверждает доступность ресурса или готовность этапа.

| Этап | Направление | Группа карточки | Разработка | Интеграция | Модель | Независимая проверка | Примечание |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `trees-joindatatree:s1` | Деревья | trees-joindatatree | — | runtime-registration<br>readiness-publication<br>base-branch | legacy-oauth (legacy OAuth) | oracle-profile | Одна активная карточка разработки на узел; независимые узлы этой дорожки не образуют цепочку. Общая регистрация — отдельное короткое окно перед проверкой итогового SHA. |
| `trees-joindatatree:s2` | Деревья | trees-joindatatree | — | runtime-registration<br>readiness-publication<br>base-branch | legacy-oauth (legacy OAuth) | oracle-profile | Одна активная карточка разработки на узел; независимые узлы этой дорожки не образуют цепочку. Общая регистрация — отдельное короткое окно перед проверкой итогового SHA. |
| `trees-joindatatree:s3` | Деревья | trees-joindatatree | — | runtime-registration<br>readiness-publication<br>base-branch | legacy-oauth (legacy OAuth) | oracle-profile | Одна активная карточка разработки на узел; независимые узлы этой дорожки не образуют цепочку. Общая регистрация — отдельное короткое окно перед проверкой итогового SHA. |

<!-- parallel-execution:end -->
