# Сэмплинг и Разбиение на множества: этап 0 LAB-533

30.10.2026, mas3, база `v038@2098aafcf46eaea118b18cb529f6bf045a5704eb`.
Стенд: `https://app.loginom.ai/app/?testable=true`, Loginom **7.4.2**,
Chromium 1246, worker назначенной пары
`~/.config/loginom-multica/cards/01a124e5-1222-7d75-8447-c66208fc7459/`.
Сборка CLI и модельные run-check не запускались. Приведённые результаты —
нативное исследование UI; они не заменяют приёмку будущих обработчиков.

## Решение по объёму

По решению в комментарии LAB-533 от 30.10 текущий срез обоих узлов —
**только «Последовательный»** с явными размерами в строках. Смещение,
случайный, равномерный случайный и стратифицированный режимы исключены.
Критерии ниже предлагаются владельцу на утверждение до этапа 1.

Предыдущая остановка по смещению снята этим решением. Она не переносит
неподтверждённые предположения о факторе или seed в последовательный контракт.

## Native identity, палитра и мастер

| Факт | Сэмплинг | Разбиение на множества |
|---|---|---|
| ID назначения | component.preprocessing.Sampling | component.preprocessing.DataPartition |
| Runtime proposal | preprocessing.sampling | preprocessing.data_partition |
| Единственный mode этапа 1 | sequential | sequential |
| Палитра Предобработка | Сэмплинг | Разбиение на множества |
| Иконка | bg-vendor-icon-sampling | bg-vendor-icon-partition |
| Native engine type | **TBGSamplingEngine** | **TBGPartitionEngine** |
| VendorGuid | c1f70531-6c5e-42f1-a249-53a7ff269e26 | b2161dca-d25a-440e-8833-813d4af7c5f6 |
| Страница | SamplingComponentWizard | PartitionComponentWizard |
| Заголовок | Сэмплинг данных | Разбиение на множества |
| Табличные порты | input 0, output 0 | input 0, outputs 0/1/2 |

Native fulltype подтверждён как `Engine/@xsi:type` в штатной сериализации
сохранённого собственного пакета (`Unit_0/Unit.xml`), узлы сопоставлены по
собственным native GUID и VendorGuid. Пакет скачан через data-tid
`FileStorageForm;colName_checkpoint.lgp` → `btnDownload` → `mniDownload`.
Это тип нативного движка сохранённой конфигурации; отдельное свойство
`FullType` серверного прокси не читалось. В собственном мастере Сэмплинга
наблюдён UI-прокси `bg.rpc.TIBGSamplingEngine_Proxy` и `IBGSampling`.
ID `component.preprocessing.*` и предлагаемые runtime-имена задают другой
уровень контракта, их не следует записывать в native type.

Префикс сценария исследования: `MF;TF-1`. Палитра адресуется
`MF;TF-1;ModelForm;colVendors_Компоненты>Предобработка>Сэмплинг;TreeText`
и аналогично `Разбиение_на_множества;TreeText`. Служебный вход переменных
не считается вторым табличным входом.

Корень оболочки — `MF;TF-1;WizrdMCF`; далее обозначения S/P означают
его `SamplingComponentWizard` / `PartitionComponentWizard`.
Без подготовленного входа наблюдалась `TuneDataSourceInputPortWizard`,
затем параметры и настройка соответствия столбцов. При уже подготовленной
связи страница входа пропускается, а после параметров возможно сразу
`DoneWizard` («Описание узла»). Длину мастера не фиксировать константой.
В DOM остаются скрытые страницы; видимость корня ещё не доказывает загрузку
значений, необходимо дождаться фактического значения метода/размера.

`btnNext`, `btnPrev`, `btnDone`, `btnExecute`, `btnClose` относятся к оболочке.
Настройка активного узла спрашивает подтверждение деактивации. Отмена
спрашивает «Вы действительно хотите закрыть мастер настройки?».
Применение автоматически меняет подпись графа. При одинаковых подписях
native data-tid получает суффикс `@1`; адресовать следует свой GUID и свежий
DOM, а не конструировать старый data-tid из пользовательской подписи.

## Параметры последовательного режима

| Параметр | data-tid относительно S/P | Семантика |
|---|---|---|
| Единицы размера | SizeGridForm;colSizeType_N, дочерний img[role=button] | переключение проценты/строки; в контракте только строки |
| Размер | SizeGridForm;colAbsoluteSize;FloatPropEdit…;ValueControl | у S одна строка, у P train (0) и test (1) |
| Второй размер P | SizeGridForm;colAbsoluteSize;FloatPropEdit-1…;ValueControl | явное число тестовых строк |
| Метод | pedSamplingMethod;ValueControl;trg_picker | выбрать «Последовательный» |
| Порядок групп | SequenceMethodForm;grdSequence | S: sampled/unused, P: train/test/unused |
| Положение группы | SequenceMethodForm;btnGroupPositionUp/Down/Reset | вверх, вниз, восстановить |

В P `colSizeType_1` встречается также в строке итогов. Для жеста брать
именно экземпляр с дочерним `img[role=button]`; суммарная ячейка не управляющая.

Для S first — порядок sampled → unused; last — unused → sampled.
У P исследован порядок **test → train → unused**, размеры test=5/train=10.
Параметры `cntTestPriority` и `pedTestPriorityPosition` в последовательном
режиме скрыты: test в начале здесь задаётся перестановкой групп.
В parameter_schema и задании не следует требовать эти скрытые параметры.
`Random seed` не входит в детерминированный контракт.

После настройки использован обычный Execute. Обучаемая модель и отдельный
train/apply не требуются этому срезу и не вводятся в обработчик.

## Полные численные наблюдения на rows.csv

Независимый вход до выполнения: RowID integer=1..20, Class string=A для
1..10 и B для 11..20, Value integer=RowID*10. Поля RowID, Class, Value.
Читались отдельные полные «Таблицы» через штатный runtime reader с явной
точностью чисел, включёнными типами/NULL и выключенным фильтром.
Stock `matchesExpectedOutput` подтвердил все пять основных результатов.

| Узел/порт | RowID в точном порядке | Число строк | Сумма Value |
|---|---|---:|---:|
| S first, 0 | 1..5 | 5 | 150 |
| S last, 0 | 16..20 | 5 | 900 |
| P общий, 0 | **6..15, затем 1..5** | 15 | 1200 |
| P train, 1 | 6..15 | 10 | 1050 |
| P test, 2 | 1..5 | 5 | 150 |

Native подписи P: «Общий выходной набор», «Обучающий выходной набор»,
«Тестовый выходной набор». На порте 0 схема:
**IsTestSet boolean («Тестовое множество»), RowID integer, Class string,
Value integer**. Признак false для 10 train, true для 5 test.
Порты 1/2 имеют только исходные поля RowID, Class, Value.
Неиспользуемые 16..20 не входят в общий выход; четвёртого порта нет.

Общий выход в исследованной конфигурации — конкатенация **train + test**
при порядке выделения test → train → unused. Глобальный порядок входа на порте 0 не сохраняется;
внутри каждого множества сохраняется. Oracle задаёт эту конкатенацию
срезами Python; ошибочное предварительное ожидание rows[:15] заменено
описанным контрактом до модельных приёмочных прогонов.

У нового S последовательный режим сохранил исходный порядок полей.
У старого узла после перевода biased → sequential остался сохранённый
выходной mapping Class, RowID, Value. Поэтому изменение существующего узла
должно сохранять незапрошенный mapping; для канонического порядка полей
приёмочный task явно требует его задать. Настройка mapping не подменяется
изменением алгоритма выбора строк.

Адрес таблиц: `MF;TF-1;ViewsForm;BrowseView` (и native суффиксы `-1`, `-2`);
колонки — `normalHeaderCt;RowID`, `Class`, `Value`, `IsTestSet`, ячейки —
те же имена с `_N`. Наличие Quick Preview само по себе не доказывает полный
выход. Полнота читалась штатным табличным reader для каждого порта.

## NULL и пустой вход

Дополнительные fixtures и независимые expected подготовлены до их
диагностических выполнений. `null.csv` содержит RowID integer, Class string,
Value real, Flag boolean, Stamp datetime. Первая строка Class="", Value=0.5,
Flag=false; во второй Class/Value=NULL, Flag=true; в третьей Flag/Stamp=NULL,
Value=-12.25. NULL-маркер `?`, пустая строка отдельно от NULL.

NULL/empty **не подтверждены**: подготовка остановлена после трёх одинаковых
потерь соединения в новых профилях, включая второй аккаунт назначенной пары.
DOM `msgbox;p.h;p.t` = «Восстановление сессии», `msgbox;cnt;cnt;cmp` =
«Обнаружен разрыв связи. Восстановить сессию?». Первое событие также есть
в execution-events.jsonl процедуры подготовки импорта. Это отказ окружения,
не доказательство ошибки S/P и не PASS; загрузка ниже12 ядер, не класс нагрузки.
Восстановление неизвестного выполнения не выполнялось, профили сохранены,
свои браузеры завершены. По регламенту после трёх одинаковых отказов — stop.
До завершения живых NULL/empty `ready_for_development` не заявляется.
`empty.csv` имеет тот же заголовок из5 полей, что null.csv; ожидаемые нулевые
выходы с явными типами и native IsTestSet у P остаются предложением.

## Наблюдённые отказы подготовки

В первой части discovery попытка активации без подтверждённой связи дала
`S;txtActivationPortStatus` = «Ошибка». В input `data-errorqtip` прочитана
причина: к обязательному порту «Входной источник данных» не подключена связь.
Отдельная btnError на этой странице не наблюдалась. Затем штатный link.create
подтвердил подключение собственного источника. Это не дефект продукта.

## Контракт и видимость для модели

S: count и position first/last, только sequential. Выбираются строки без
арифметических преобразований ячеек; сохраняются настроенные поля, их типы,
NULL и порядок. P: train_count/test_count, порядок выделения групп, только
sequential; общий порт имеет IsTestSet первым и train+test в этом порядке.
До утверждения не расширять режимы, единицы размеров, переменные или mapping.

Предлагаемые `NODE_TYPES.semantics`:

- S: “Select an explicit row count from the start or end using sequential group
  order. Retain configured columns, types, NULLs and row order. No random,
  stratified or biased methods. Read table output 0; ordinary Execute, no training.”
- P: “Sequential train/test allocation with explicit row counts and unused
  remainder. Read all ports: 0 combined, 1 train, 2 test. Combined prepends
  Boolean IsTestSet and concatenates train then test. Preserve row order within
  each subset. No random modes, seed, or training.”

Descriptions каждого поля и строковые enum — в parameter-schema.proposal.json.
Compact readback: метод sequential, размеры в строках, порядок групп/position;
привязка к своему node/source и запрошенным output_port. Полные таблицы и
списки исходных значений в compact readback не включать. Не требовать seed
или скрытый приоритет test. Несовместимые параметры отклонять до UI.

Fixtures rows/update/empty/null и пользовательский task подготовлены для
каждого типа. Oracle — Python stdlib, срезы/конкатенация исходных строк;
не читает Loginom, runtime или actual. `--case rows|null|empty|update`
воспроизводит соответствующие expected-файлы. Ordered=true, явный output_port,
точный порядок колонок; integer/string/Boolean/NULL точны, real abs=0/rel=0.
В workspace продуктовой модели передавать только task и нужные data/CSV,
никогда oracle или expected. Критерии утверждает владелец до этапа 1.

## Этап 1 и размер схемы

Для последовательных режимов новая общая семантика не обнаружена. На базе
уже есть многопортовое чтение одного узла, ordered matching, численные допуски.
План: аддитивная регистрация, свой обработчик/раздел skill и сценарий run-check.
Если потребуется общая правка сверх разрешённого — stop, не разрешение из docs.

Оценка: S — 1 цикл реализации + 1 приёмочный; P — 1–2 + 1. Приёмка этапа 1:
обязательные проверки изменённых путей, cold, 2/3 исполнителя и 2/3 reviewer
на одном SHA, модель openai/gpt-6.1-sol medium/1800 с. Сейчас модельные
run-check и cold NOT_RUN, обработчиков в runtime нет.

Полная inputSchema dock_node_apply базы — **45 891 Б**. В памяти к клону
добавлены runtime type, mode sequential и вложенный JSON параметров:

| Предложение | Полный размер отдельно | Приращение |
|---|---:|---:|
| S, sampling | 46 276 Б | **385 Б** |
| P, data_partition | 46 519 Б | **628 Б** |
| Оба, общий sequential enum один раз | 46 891 Б | **1 000 Б** |

Оба типа ≤1 050 Б. Для порога 46 000 требуется резерв 891 Б, обеспечиваемый
F2; это не stop этапа 0. Runtime-реестры, NODE_TYPES и публичные схемы в docs-PR
не меняются; регистрация — этап 1. Output/readback отдельно не оценивался,
он не входит в inputSchema проверяемого node-caption-schema.test.mjs.

Воспроизведение измерения из корня checkout с зависимостями client:

```sh
node --input-type=module <<'JS'
import {readFileSync} from 'node:fs';
import {nodeApiTools} from './packages/loginom-runtime/client/lib/node-api.mjs';
const base = nodeApiTools.find(t => t.name === 'dock_node_apply').inputSchema;
const bytes = s => Buffer.byteLength(JSON.stringify(s));
const combined = structuredClone(base);
console.log('base', bytes(base));
for (const [slug, type, key] of [
  ['preprocessing-sampling', 'preprocessing.sampling', 'sampling'],
  ['preprocessing-datapartition', 'preprocessing.data_partition', 'data_partition'],
]) {
  const candidate = structuredClone(base);
  for (const schema of [candidate, combined]) {
    schema.properties.target.properties.type.enum.push(type);
    if (!schema.properties.mode.enum.includes('sequential'))
      schema.properties.mode.enum.push('sequential');
    schema.properties.parameters.properties[key] = JSON.parse(readFileSync(
      `docs/node-development/nodes/${slug}/parameter-schema.proposal.json`));
  }
  console.log(type, bytes(candidate), bytes(candidate) - bytes(base));
}
console.log('combined', bytes(combined), bytes(combined) - bytes(base));
JS
```

## Следующие этапы: смещение и остальные методы

«Отбор со смещением» исключён из v0.3.8 решением в LAB-533 как режим,
использующий случайный отбор. В первой пробе сохранены размер 14 строк,
Class A factor=0.4/count=4, B factor=1/count=10, seed=42. Повторное открытие
подтвердило настройки. Полная Таблица дала 10 строк с RowID
**1,3,5,11,15,16,17,18,19,20**, 3 A и 7 B. Это опровергает гипотезу квот
«первые 4 A + все B»; повторяемость/зависимость от смены seed не проверялись.
Наблюдение не объявляется дефектом продукта. Для будущей отдельной карточки
нужны согласованные семантика размера/фактора и независимый oracle;
точный состав строк или инварианты не подбирать по actual.
