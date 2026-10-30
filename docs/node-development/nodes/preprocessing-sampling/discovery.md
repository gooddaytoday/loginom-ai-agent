# Сэмплинг и Разбиение на множества: этап 0 LAB-533

30.10.2026, база `v038@2098aafcf46eaea118b18cb529f6bf045a5704eb`, mas3.
Живое исследование только `https://app.loginom.ai/app/?testable=true`,
Loginom **7.4.2**, Chromium 1246, worker назначенной пары
`~/.config/loginom-multica/cards/01a124e5-1222-7d75-8447-c66208fc7459/`.
Использован собственный пакет; после сохранения закрыт, выполнен logout,
изменения не отброшены. Сборка CLI и модельные run-check не запускались.

**Checkpoint, blocked.** Назначенный детерминированный контракт «Отбора со
смещением» не подтверждён. Наблюдение ниже опровергло гипотезу точных квот
с выбором первых строк группы. Для завершения этапа 0 нужно решение владельца
о допустимом oracle этого режима либо исключении режима из данного среза.
`ready_for_development` не заявляется; сокращённые предложения acceptance
не подменяют полный назначенный объём.

## Компоненты и границы наблюдения

| Параметр | Сэмплинг | Разбиение на множества |
|---|---|---|
| ID из назначения | `component.preprocessing.Sampling` | `component.preprocessing.DataPartition` |
| Предлагаемый runtime | `preprocessing.sampling` | `preprocessing.data_partition` |
| Палитра | Предобработка → Сэмплинг | Предобработка → Разбиение на множества |
| Наблюдённая иконка | `bg-vendor-icon-sampling` | `bg-vendor-icon-partition` |
| Корень страницы параметров | `SamplingComponentWizard` | `PartitionComponentWizard` |
| Заголовок | Сэмплинг данных | Разбиение на множества |
| Табличные порты | вход 0, выход 0 | вход 0, выходы 0, 1, 2 |

Префикс исследованного сценария `MF;TF-1`. Палитра адресуется через
`MF;TF-1;ModelForm;colVendors_Компоненты>Предобработка>Сэмплинг;TreeText`
и аналогично `Разбиение_на_множества;TreeText`; порты — через
`MF;TF-1;Graph;<наблюдённая подпись>;Input_Data-0` / `Output_Data-N`.
Есть служебный вход переменных, он не считается вторым табличным входом.

Отдельное native **fulltype не считано**. ID назначения не выдаётся за
наблюдённый fulltype; совпадение подписи/иконки/мастера его не доказывает.
Сопоставление полного типа остаётся незавершённой частью discovery.

Оболочка обоих мастеров: `MF;TF-1;WizrdMCF`. На неподключённом узле сначала
наблюдалась `TuneDataSourceInputPortWizard`; далее страница параметров.
У Сэмплинга без готовой связи наблюдалась также страница настройки
соответствия столбцов; с настроенным входом переход после параметров шёл
сразу в `DoneWizard` («Описание узла»). Единую неизменную длину мастера
не предполагать. Страницы могут оставаться в DOM скрытыми, видимый корень
ещё не означает, что значения загрузились.

Кнопки: `btnNext`, `btnPrev`, `btnDone`, `btnExecute`, `btnClose` под корнем
`WizrdMCF`. Отмена спрашивает «Вы действительно хотите закрыть мастер
настройки?»; настройка активного узла предварительно требует подтверждения
деактивации. После применения подпись автоматически меняется, например
«Сэмплинг: Отбор со смещением, 14»; прежний data-tid узла становится неактуален.

## Наблюдённые параметры

Далее `S = MF;TF-1;WizrdMCF;SamplingComponentWizard`,
`P = MF;TF-1;WizrdMCF;PartitionComponentWizard`.

| Параметр | data-tid относительно S или P | Наблюдение |
|---|---|---|
| Размер | `SizeGridForm;colSizeType_0` | переключение проценты/строки |
| Размеры | `SizeGridForm;colRelativeSize…`, `colAbsoluteSize…` | встроенные FloatPropEdit; у S одна строка, у P две — обучающее/тестовое |
| Метод | `pedSamplingMethod;ValueControl;trg_picker` | Случайный, Равномерный случайный, Стратифицированный, Последовательный, Отбор со смещением |
| Последовательный | `SequenceMethodForm;grdSequence` | порядок Сэмплированное/Неиспользуемое у S; Обучающее/Тестовое/Неиспользуемое у P |
| Перестановка групп | `SequenceMethodForm;btnGroupPositionUp`, `btnGroupPositionDown`, `btnGroupPositionReset` | вверх, вниз, восстановить |
| Поле смещения | `S;BiasedMethodForm;colDisplayName_Class` | на данном входе предлагается дискретный Class |
| Значения | `S;BiasedMethodForm;btnGetUniqueValues` | для Class получены A/B, исходные количества 10/10 |
| Фактор/количество | `S;BiasedMethodForm;colBiasedFactor_0`, `colBiasedCount_0` | оба редактируемые, количество 4 пересчитывает фактор A в 0,40 |
| Seed | `RandSeedEdit;edtRandSeed;ValueControl` | редактируемый integer, у S сохранён 42 |
| Приоритет test | `P;cntTestPriority;cnt;chb;InputEl` | флаг приоритета тестового множества |
| Положение test | `P;pedTestPriorityPosition;ValueControl` | исходно «Определяется алгоритмом»; остальные значения не переподтверждены |

В графе у обоих узлов наблюдалась команда выполнения. Для Сэмплинга выполнен
один нативный диагностический Execute и повторное открытие настроек.
Отдельные train/apply не проверены; модельную приёмку и обучение не заявлять.
Для P выполнение, смысл отдельных портов и их схемы пока `not_checked`.

## Причина остановки: размер и фактор не являются проверенными квотами

До диагностического исполнения подготовлены вход 20 строк (`fixtures/rows.csv`)
и независимая гипотеза: 14 строк = первые 4 A + все 10 B, исходный порядок.
Её нельзя считать утверждённым критерием или менять под наблюдённый ответ.

Настройки S после применения и **повторного открытия**:

- размер 14 строк, соответствующее значение процентов 70;
- метод «Отбор со смещением», поле Class;
- A: фактор 0,40, количество 4; B: фактор 1,00, количество 10;
- seed 42.

Полная отдельная «Таблица» (не только Quick Preview) показала 10 строк:
RowID **1, 3, 5, 11, 15, 16, 17, 18, 19, 20**.
Адреса: `MF;TF-1;ViewsForm;BrowseView;normalHeaderCt;RowID_0` … `_9`;
в `BrowseView;grdData` также отображён итог 10. Class — 3 A и 7 B,
Value равен исходному RowID × 10. Порядок и три поля в этом наблюдении сохранены.

Это наблюдение UI, **не FAIL продукта и не PASS приёмки**: обработчика ещё нет,
критерий не утверждён. Из одного seed нельзя заключить ни повторяемость,
ни зависимость результата от seed. Нельзя также назвать «Количество» квотой
выхода или заменить фактор смещением позиции. Нужны иной независимый oracle
и решение владельца по точному составу/числу строк. Случайные и
стратифицированные режимы не исследовались и не добавляются в объём.

## Наблюдённый отказ входа

При диагностической попытке активации до подтверждённого подключения входа
`S;txtActivationPortStatus` показал «Ошибка». DOM его input, атрибут
`data-errorqtip`, содержал причину:
«При активации узлов возникла ошибка. К обязательному порту
\"Входной источник данных\" не подключена связь».
Отдельной `btnError` на этой странице в данном состоянии не наблюдалось;
причина находится у поля ошибки. Штатный runtime `link.create` затем подтвердил
связь от собственного импорта. Это ошибка подготовки исследовательского узла,
а не неизвестный исход выполнения и не основание менять общий runtime.

## Предлагаемый контракт, ещё не утверждённый

Последовательный S: целое число строк, начало/конец; сохранять исходную
последовательность, имена, порядок и типы полей. NULL и пустая строка различны;
не заменять NULL нулём. Для переноса real предлагать точность исходного значения,
abs=0/rel=0; алгоритм не выполняет арифметику над ячейками. Основной fixture
содержит integer/string. NULL, real, Boolean, datetime, пустой вход и границы
пока только предложены в fixtures, не проверены живым выполнением.

Последовательный P: явные train/test размеры без конфликта; порядок выделения
test → train → unused, приоритет test из начала. Предложение портов:
0 — общий, 1 — train, 2 — test; общий содержит только выбранные строки и
Boolean-признак test. Имена/типы/порядок этого признака **не наблюдались**;
expected предлагает свободное имя и расположение после входных полей.
Владелец должен утвердить это до реализации; три графических выхода сами
по себе не доказывают такую схему.

Предлагаемые `NODE_TYPES.semantics`:

- S: “Select an explicit number of input rows from the start or end using
  sequential group order. Retain row order, columns, types and NULLs. Biased
  factors are not row offsets or verified exact quotas; biased acceptance pending.”
- P: “Sequential train/test allocation with explicit row counts and unused
  remainder. Read all three ports: combined, train, test. Preserve input order
  within each port; no random or stratified modes. Port schemas pending confirmation.”

Предложенные `parameter-schema.proposal.json` у каждого типа содержат description
каждого поля и строковые enum. Проверка несовместимых полей по mode — в собственном
валидаторе обработчика до UI. Compact readback предлагается как метод, размеры,
порядок групп, приоритет test; у biased — точное поле и пары value/factor,
без полного списка исходных значений. Связать readback с node/source identity
и всеми запрошенными портами. Не добавлять seed в детерминированный контракт
без решения владельца. Реестры, NODE_TYPES и публичные схемы в этом PR не меняются.

## Приёмочные предложения и оценка этапа 1

В обоих каталогах подготовлены `fixtures/`, `acceptance/task.md`, отдельные
stdlib `oracle.py`, воспроизводимые `expected.json` и `acceptance/data/rows.csv`.
Это предложения после остановки, **не завершённый комплект полного парного среза**.
У S покрыт только sequential; biased намеренно не получает выдуманного oracle.

- S: первые RowID 1..5, последние 16..20; по 5 строк, суммы Value 150/900.
- P: общий 1..15 (15 строк, сумма 1200), train 6..15 (10, сумма 1050),
  test 1..5 (5, сумма 150); test true у 5 строк, unused 16..20.
- Все outputs имеют `ordered:true`, явный `output_port`, точный порядок полей;
  допуск 0. Oracle не читает Loginom и не берёт ожидаемые значения из результата.
- Только task и data передаются модели. Приёмка этапа 1: согласованная матрица,
  cold и 2/3 исполнителя + 2/3 reviewer на одном SHA; сейчас все NOT_RUN.

На базе уже есть несколько output_port одного узла, ordered matching и
допуски в `scripts/node-acceptance/expected-outputs.mjs`; старое W3
в подплане P устарело. Для sequential пока не найдено необходимости новой общей
семантики сверх аддитивной регистрации, собственного handler/skill и run-check
сценария. Это статическая оценка, не доказательство достаточности реализации.
Потребность общего изменения — отдельный stop, не разрешение в этом PR.

Оценка после снятия вопроса: sequential S — 1 цикл реализации + 1 цикл приёмки;
P — 1–2 цикла реализации + 1 цикл приёмки. Для biased оценка не дана до контракта.

## Размер полной inputSchema dock_node_apply

База `2098aaf`: `Buffer.byteLength(JSON.stringify(full.inputSchema))` = **45 891 Б**.
Адресный `node-caption-schema.test.mjs` на неизменённых исходниках: **3/3 PASS**,
включая порог 46 000 Б. Сборка CLI для измерения не нужна.

В памяти к клону полной схемы добавлены runtime type, недостающие mode и
вложенное свойство parameters из соответствующего proposal JSON:

| Предложение | Полный размер отдельно | Приращение |
|---|---:|---:|
| S, sampling; sequential/biased | 46 762 Б | **871 Б** |
| P, data_partition; sequential | 46 639 Б | **748 Б** |
| Оба, общий sequential enum один раз | 47 497 Б | **1 606 Б** |

По каждому типу ≤1 050 Б. Совместно нужно высвободить минимум 1 497 Б для
порога 46 000; запас обеспечивает F2, это **не stop этапа 0**. Измерение не включает
будущие неописанные поля: при изменении предложения пересчитать. Output/readback
не входит в inputSchema этого теста, его размер отдельно не заявляется.
Регистрация и её schema regression — этап 1, после решения по biased и портам P.

Воспроизведение измерения из корня checkout с установленными зависимостями
client; скрипт меняет только клоны в памяти:

```sh
node --input-type=module <<'JS'
import {readFileSync} from 'node:fs';
import {nodeApiTools} from './packages/loginom-runtime/client/lib/node-api.mjs';
const base = nodeApiTools.find(t => t.name === 'dock_node_apply').inputSchema;
const bytes = s => Buffer.byteLength(JSON.stringify(s));
const combined = structuredClone(base);
console.log('base', bytes(base));
for (const [slug, type, key, modes] of [
  ['preprocessing-sampling', 'preprocessing.sampling', 'sampling', ['sequential', 'biased']],
  ['preprocessing-datapartition', 'preprocessing.data_partition', 'data_partition', ['sequential']],
]) {
  const candidate = structuredClone(base);
  for (const schema of [candidate, combined]) {
    schema.properties.target.properties.type.enum.push(type);
    for (const mode of modes)
      if (!schema.properties.mode.enum.includes(mode)) schema.properties.mode.enum.push(mode);
    schema.properties.parameters.properties[key] = JSON.parse(readFileSync(
      `docs/node-development/nodes/${slug}/parameter-schema.proposal.json`));
  }
  console.log(type, bytes(candidate), bytes(candidate) - bytes(base));
}
console.log('combined', bytes(combined), bytes(combined) - bytes(base));
JS
```
