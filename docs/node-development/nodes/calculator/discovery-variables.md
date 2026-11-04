# Калькулятор: Var.* от обычного входа переменных

LAB-837, этап 0, 04.11.2026, mas/Linux. База назначения и исследования кода:
`origin/v040@5d3860bfd542c44a2875ae61d03dab6ecdb64ec6`.
Loginom **7.4.2**, Chromium **1246**, pinned Node **24.19.0**.
Только `https://app.loginom.ai/app/?testable=true`, worker назначенной пары
`fca26310-b42b-43ed-b004-39a566e99e30`, собственный новый пакет/CSV.
Сборки CLI и модельной приёмки не было. Готовый кэш этой же базы использован
только для pinned браузера и read-only измерения схем, `sourceDirty=false`.

## Наблюдаемый режим

Это тот же Калькулятор из палитры «Трансформация», иконка `calcdata`, мастер
`MF;TF-1;WizrdMCF;CalcDataWizard`. Режим API **остаётся `expression`**.
Отдельного переключателя «переменные сценария» нет: обычный вход переменных
добавляет доступные имена в язык выражений Loginom. JavaScript не нужен.

| Что | Наблюдение по `data-tid` | Источник |
|---|---|---|
| Порты нового узла | `Graph;Калькулятор;Input_Data-0`, `Input_Var-1`, `Output_Data-0` | `ui.jsonl:7` |
| Пользовательский источник | `Graph;Переменные_сценария;Output_Var-4` → «Настроить порт», `VariablesEditValuesWizard` / `EditVariableForm` | `ui.jsonl:8–14` |
| Обычная variable-связь | `Graph;Переменные_сценария\|Output_Var-4\|Калькулятор\|Input_Var-1` | `ui.jsonl:16`, `ui.jsonl:40` |
| Одновременно табличная связь | `Graph;variables.csv\|Output_Data-0\|Калькулятор\|Input_Data-0` | `ui.jsonl:40` |
| Выражение и тип | `CalcDataWizard;cmpExpression`, `ExprDataEditForm;cbxDataType`; integer native DataType=4 | `ui.jsonl:46–49` |
| Просмотр переменных | `CalcDataWizard;btnVariables`, `colFieldName_Var.Amount`, `colFieldValue_Var.Amount` при конфликте имён | `ui.jsonl:43`, `ui.jsonl:45` |
| Принятие синтаксиса | `Amount + Var.Amount`, `Var.Amount`; Next → «Описание узла», без `btnError` | `ui.jsonl:47–50` |
| Выходной mapping | `DerivedDataSourceOutputSocketWizard`: RowID, Amount, Shifted, ScenarioAmount; все DataType=4 | `ui.jsonl:52–53` |
| Сохранение исследования | Новый `lab837-calculator-vars-20261104.lgp` в собственном каталоге worker, native package inventory=1, running=false | `ui.jsonl:57` |
| Reopen настроек | Оба сохранённых integer-выражения перечитаны из native store после нового открытия мастера | `ui.jsonl:58` |
| Отсутствующая переменная | `Var.Missing` не проходит Next: `btnError`, «Неизвестная функция: VAR.MISSING»; после возврата `Var.Amount` Next снова проходит | `ui.jsonl:59–61` |
| Новое выполнение | Preview output 0: 4/4 строки, integer-схема, native NULL; совпадение с независимым начальным oracle | `ui.jsonl:63–67` |
| Обновление только источника | В редакторе прежние имя/метка/тип и 7; изменено только 7 → 11; прежние связи и обе формулы перечитаны | `ui.jsonl:68–73` |
| Повторное выполнение | После 7 → 11 тот же node/port GUID, полные 4/4 строки, прежняя integer-схема, совпадение с финальным oracle | `ui.jsonl:74–76` |
| Финальный Save и закрытие | Точный собственный путь, modified=false, running=false; затем native package inventory=0 | `ui.jsonl:77–78` |
| Logout | Видима исходная LoginForm; браузер закрыт | `ui.jsonl:79` |

Суффикс `Input_Var-1` — native-порядок среди портов разных видов.
Контракт W1 адресует его как **обычный variable input ordinal 0**, оставляя
табличный input ordinal 0 прежним. Отдельный control-вход не заменяет его.
Чтение источника переменных через `read.variable_ports` относится к W1;
результат этого Калькулятора читается прежним `read.ports:[0]`.

Таблица на входе: `RowID:integer`, `Amount:integer`, четыре строки — 10, 0,
−4, NULL в Amount. Пользовательская переменная тоже называется **Amount**,
тип integer, исходное значение 7. В мастере variable-source подтверждено 7
(`ui.jsonl:14`); автоматическая метка стала `AmountScenario amount`, поэтому
предложение не закрепляет свободные метки.

Без одноимённого табличного поля UI показывает `Amount`, а двойной щелчок
вставляет **`Amount`**, без префикса (`ui.jsonl:23–24`). После подключения
таблицы cached store содержит `Fields:Amount` и `Variables:Var.Amount`
(`ui.jsonl:43`), список показывает явный `Var.Amount`. Поэтому приёмка требует
явный префикс и конфликт имён. Видимый список не является парсером формул.

## Наблюдённая причина отказа текущего обработчика

Вызван без изменения функции production-reader `readCalculatorBrowser` из
`client/lib/calculator-context.mjs` на собственном открытом мастере:

```json
{"verified":false,"reason":"calculator_input_filtered"}
```

До табличной связи — `ui.jsonl:21–22`; с обоими входами — `ui.jsonl:43–44`.
В последнем случае видимая коллекция содержит два Fields, а underlying source
содержит **эти два Fields и одну Variables**. Это штатный групповой фильтр
кнопок «Поля»/«Переменные», не доказательство обрезанного источника.

Текущий `calculator-context.mjs:65–72` требует равной длины видимой/source
коллекций, затем разрешает только `GroupType==='Fields'`. Один лишь W1 link
не устраняет отказ. Нельзя просто удалить проверки фильтра или смешать
переменные с `input_fields`: одноимённые Amount принадлежат разным группам,
а output-source builder использует `input_fields` как passthrough таблицы.

Аддитивное узловое решение этапа 1: отдельно и полностью читать обе native
группы из того же собственного bounded cached store, проверять ID, owner,
count/полноту и допустимый групповой фильтр, не включать Variables в
табличные поля. Имена/типы сопоставлять с W1 variable mapping; значение из
этого списка не объявлять exact-выходом: здесь до активации источника
`Value:null`, хотя сохранённое значение источника 7. Формулу сохранять как
наблюдённый текст, без своей интерпретации или замены Var на константу.

Отказ неизвестной переменной нативный: «Ошибка разбора выражения
\"ScenarioAmount\" / Неизвестная функция: VAR.MISSING» (`ui.jsonl:60`).
Не заменять его сообщением об OAuth/сети и не нажимать «Всё равно далее».
Исправленный `Var.Amount` принят тем же мастером; исходный пакет не заменялся.

## Выход и границы исследования

Узел имеет один табличный выход 0. В отличие от `variables.calculator`, он
сохраняет строки входной таблицы и добавляет/заменяет вычисляемые столбцы.
Var задаёт scalar для каждой строки, нового выхода переменных или строкового
размножения не требуется. **Первый ручной Execute выполнен** при load1/load5
6.13/7.97 (`ui.jsonl:63`). Полный cached preview — 4/4 строки, native схема
всех четырёх столбцов integer; значения и NULL совпали с независимым
`expected-initial.json` (`ui.jsonl:65–67`). Второй Execute при load1/load5
4.71/7.47 дал точный `expected.json` для 11, те же node/port GUID и схему
(`ui.jsonl:74–76`). Это native discovery, не модельный или CSV/cold PASS;
критерии обработчика всё ещё требуют утверждения владельца.

| RowID | Amount | Shifted при 7 / при 11 | ScenarioAmount при 7 / при 11 |
|---|---|---|---|
| 1 | 10 | 17 / 21 | 7 / 11 |
| 2 | 0 | 7 / 11 | 7 / 11 |
| 3 | −4 | 3 / 7 | 7 / 11 |
| 4 | NULL | NULL / NULL | 7 / 11 |

Порядок native выражений: Shifted, ScenarioAmount; integer, replace=false,
intermediate=false, cached=false (`ui.jsonl:48`). Выходной порядок в заданиях
явный: RowID, Amount, Shifted, ScenarioAmount, через существующий output mapping.
Старый режим без переменных и его правила замены/порядка не меняются.

Настройка активного пользовательского порта требует обычного подтверждения
деактивации. Выбрано «Да», без отключения будущих подтверждений
(`ui.jsonl:68`). Только значение заменено на 11; до нового Execute старый
выход не считается свежим. Имя/тип/метка источника, две связи, формулы и типы
выражений после изменения сохранены (`ui.jsonl:69–73`). После повторного
Execute весь новый выход перечитан заново (`ui.jsonl:75–76`).

Сырые DOM/native журналы и скриншоты не входят в Git; доказательства приложены
к финальному комментарию LAB-837. Все мутации выполнялись жестами UI по
наблюдённым `data-tid`, чтение — DOM/собственные локальные cached stores.
Внутренние методы Loginom/RPC для записи/вычисления не вызывались.

## Граница W1 и адресные файлы

Контракт: [variables/discovery.md](../../variables/discovery.md#предложение-w1-отдельная-адресация-переменных),
ветка `variables-w1@8ce21cb3c7dc825d5e14c1fc6768dcb15b34713d`, PR #719. Карта возможностей: PR #722,
`variables-capabilities@c3816399a1bfd12cbe5061f93960bfb4ec792591`,
`docs/node-development/variables/capabilities.md`, раздел «Калькулятор и
JavaScript». Карта на этой базе ещё не влита; её наблюдения не заменяют этот
прогон. Историческая вставка/reopen Var.Amount не доказывает новое вычисление.

| Владелец | Объём |
|---|---|
| W1 | `variables.user` и значения, inventory/refs, `variable_inputs`, kind `variables/control`, source/target ownership, mapping, `read.variable_ports`, typed cold источника |
| Калькулятор | Раздельное полное чтение Fields/Variables, сохранение Var-текста, сопоставление источника с W1, passthrough только Fields, readback обоих входов, повторное выполнение таблицы |
| Калькулятор: конкретные файлы | `calculator-context.mjs` — наблюдённый отказ; `calculator-readback.mjs` — variable-schema/связь из проверенной фазы W1; `calculator-parameters.mjs` — раздельные mapping kinds/лимиты; `calculator-preflight.mjs` — прежняя table schema, без вычисления формулы; `calculator-node.mjs` / `calculator-procedure.mjs` — маршрутизация W1 и preview |
| Только additive описание | `node-api.mjs` (текст схемы типа); существующие `SKILL.md` / `references/nodes/transform.calculator.md`; регистрация двух утверждённых задач в существующем run-check на этапе 1 |

Новых общих портов, парсера выражений, модулей верификации, `packages/agent`
или изменений лимитов не требуется по наблюдённому срезу. Это оценка:
потребность в общей неаддитивной правке — stop/blocked, не скрытое расширение.

## Измерение бюджетов модели

UTF-8; JSON — `Buffer.byteLength(JSON.stringify(value),'utf8')`, файлы —
их реальные байты. Точная база — SHA выше; чтение из готового pinned кэша
той же базы. Для карточки использованы реальные bundled catalog/skill pins:
`pinActionCatalog` → `createCandidateNodeSupport` → `createActionRuntime` →
`userActionInventory(runtime.describe({node_types:['transform.calculator']}))`.
Измерен `node_types[0]`; пустые/фиктивные pins дают заниженный размер.
Для apply берутся name+description+inputSchema после `userNodeTool`:
именно эти поля уходят модели, outputSchema исключается MCP catalog.

| Объект | База, Б | После предложенного текста, Б | Предел, Б |
|---|---:|---:|---:|
| Компактный dock_node_apply (три поля) | 13 331 | 13 331, W1 отдельно | 20 000 |
| Только compact inputSchema | 12 836 | Без узловой структурной добавки | — |
| Карточка Калькулятора с pins | 4 589 | 4 850 | 12 000 |
| Ответ describe с одной карточкой | 5 290 | 5 551 | Измерение оболочки |
| SKILL.md | 38 215 | 38 199 | 40 000 |
| Строка маршрутизации Калькулятора | 138 | 122 | Около 200 |
| references/nodes/transform.calculator.md | 1 915 | 2 316 | 6 000 |
| Полная внутренняя inputSchema | 53 748 | Только измеряется | Нет |
| Полный diagnostic tool (три поля) | 63 324 | Только измеряется | Нет |

Прогноз — точный размер **текстового предложения**, а не измерение ещё
не реализованного W1/обработчика. В этом PR schema и skill не меняются.
Перед выпуском этапа 1 повторно измерить объединённую голову с W1 и фактическим
patch. Узловая добавка не расходует общий compact schema: нового API mode нет.

Предлагаемая замена существующей строки SKILL (без новой длинной инструкции):

```markdown
| Формулы, Var.* | `transform.calculator` / expression | [читать](references/nodes/transform.calculator.md) |
```

Добавка в description `calculatorParametersSchema` — 261 Б:

```text
 Ordinary scenario variables use Var.Name in expression mode. Connect W1 variable_inputs kind=variables to input 0; control is separate. One table output, no row expansion. Reexecute the same node after changing a variable; preserve formulas and table mappings.
```

Добавка в существующий node reference — 401 Б, с начальным и конечным LF:

```text
Для переменной сценария используй Var.Name в режиме expression. Подключи обычный вход переменных через variable_inputs kind=variables; управляющий вход не заменяет его. После изменения значения выполни тот же узел заново и перечитай выход 0.
```

Оценка этапа 1 и предложенные критерии — [раздел 7 подплана](plan.md#7-var-от-переменных-сценария--предложение-v040-lab-837).
Размер 1–2 цикла относится к узлу после W1, включая red→green, обязательные
проверки изменённых путей и живые run-check; общее создание W1 сюда не включено.
