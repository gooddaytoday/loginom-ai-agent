# Приёмочный комплект режимов — предложение LAB-972

Уточнение C9/C10/C13 от 08.11.2026: [LAB-1145](../../penalty-discovery.md). Старые LASSO/Elastic expected остаются историческими предложениями; использовать новый комплект после утверждения владельцем.

**Кроме раздела «Комплекты C5/C6/C8/C11/C12», ни один новый критерий здесь не утверждён.** Это этап 0 на
`4b202757f6d0021160dd4dfc104ee788ae33cbec`, без изменений runtime/SKILL.md и
без регистрации сценариев run-check. Live-факты и ограничения находятся в
[modes-discovery.md](../../modes-discovery.md). Утверждение владельца нужно до
первой правки обработчика. UI-пробелы и математические вопросы не маскируются PASS.

## Комплекты C5/C6/C8/C11/C12 для v0.4.0 (LAB-1559)

Основание — решение владельца `v040-open-scope` (13.11.2026). Комплекты готовы
по документам: task, fixture, oracle и expected лежат здесь, `oracle.py --check`
проходит, решений владельца, правки публичного контракта или общего кода циклы
не требуют. Первый шаг каждого цикла — native-проба разработчика на своей паре
(вопросы ниже). Авто-λ (C13) и привязки (C14) остаются blocked.

Модели передаются только `<цикл>/task-*.md` и указанный CSV из
`../../fixtures/modes/`. Каждый `expected.json` проходит `parseExpectedOutputs`
и `parseExpectedVariableInventory` из `scripts/node-acceptance/expected-outputs.mjs`
(после подстановки меток `linreg_forward`). Регистрация сценария `linreg-<цикл>`
по образцу `linreg-coefficients` — в PR цикла: `source=acceptance/modes/<цикл>`,
`data=fixtures/modes`, `input_files=[CSV]`, `linreg_forward=True`.

| Порядок | Цикл | Польза для аналитика | Комплект | Что ловит | Оценка |
|---|---|---|---|---|---|
| 1 | C6 | Честная проверка модели на отложенных строках | `partition-sequential/`, partition.csv | Обучение на всех 18 строках: Y=±999 меняет все числа; тест получает 6.5 и 9.5 | 1 цикл; L context/procedure/readback + S, 120–200 строк |
| 2 | C8 | Качество модели: R², F и p, AIC/BIC | `summary/`, design.csv | 15 переменных порта 2, Enter k=4: R²=0.985507, F=272, DFE=12 | 1 цикл; L output/node/readback, 80–160; чтение — существующий `read.variable_ports` |
| 3 | C11 | Категориальный фактор в модели | `categorical/`, categorical.csv | Индикаторы B=3, C=1 при опорной A=0; полный порт 1 из 9 столбцов (форма C7) | 1–2 цикла; L parameters/context/procedure/output/readback + S, 220–380 |
| 4 | C6b | Разбиение по готовому признаку | `partition-column/`, partition.csv | Те же числа, что C6; IsTest=true — тест | 1 цикл; +60–120 к C6 |
| 5 | C5 | Сравнение вклада факторов в разных единицах | `standardization/`, units.csv | Без денормализации: константа 3, Price 2.065591, Distance 0.516398 (в сырых единицах 0.02 и 0.25) | 1 цикл; L context/procedure/readback/output + S, 180–300 |
| 6 | C12 | Модель через начало координат | `no-intercept/`, design.csv | Наклоны 2/0.5/0, прогнозы сдвинуты на −3; строки константы нет | 1 цикл; L parameters/procedure/readback/output, 60–120 |

Итого 6–7 циклов. C6b идёт после C6 (те же файлы). C5 и C12 снимают один и тот
же запрет `pedDenormalize===true` в `linregression-procedure.mjs`; при выдаче
обоих — последовательно. C11 расширяет `input_fields` дискретными строковыми
полями: сейчас `linregression-parameters.mjs` принимает только непрерывные
числовые; это локальная правка обработчика, не общий контракт.

Справка `datamining.lin_regression.md` — 5590/6000 Б, запас 410 Б. Строка
нового режима — 150–250 Б, поэтому второй по счёту цикл почти наверняка сожмёт
файл без потери правил; это часть его PR. SKILL.md не меняется.

### Что проверяет oracle

`oracle.py` (stdlib, Fraction) решает OLS заново по CSV и не читает Loginom.
Самопроверки сверяют формулы с округлёнными native-превью из
[modes-discovery.md](../../modes-discovery.md): Forward на design.csv —
F=442, AIC≈0.44, AICc≈0.57, BIC≈0.59, HQC≈0.45 (критерии делятся на n);
categorical.csv — константа≈2.99, X≈2.02, B=3, C=1. Допуск `abs=1e-8, rel=1e-10`,
имена, типы, NULL и порядок строк точны; незаданные задачей метки — `label_any`.

- C6/C6b: OLS на строках 1–16, прогноз для всех 18 строк в исходном порядке.
- C8: Gaussian log-likelihood `−n/2(ln 2π+1+ln(RSS/n))`, StdDev `√(RSS/DFE)`,
  ModelDF=k−1, AIC/AICc/BIC/HQC на одну строку; порядок — как в native-превью.
- C11: матрица `[1, X, I(B), I(C)]`; SE/t/p/CI — OLS, DF=n−4. Строка опорной A:
  коэффициент 0, статистики NULL (OLS их не определяет).
- C5: `z=(x−mean)/SD`, SD выборочное (n−1), как в LogReg ц.4 (решение
  `v040-native-semantics-0711`); коэффициент `βj·SDj`, константа
  `β0+Σβj·meanj = mean(Y) = 3`. Прогнозы равны сырому OLS. Fixture units.csv —
  design.csv в других единицах: Price=200+100·X1, Distance=3+2·X2, Promo=(X3+1)/2.
- C12: OLS без константы; на design.csv суммы факторов нулевые, поэтому наклоны
  те же, а прогноз смещён на −3. Это ловит переключатель, который ничего не делает.

### Вопросы native-пробы (первый шаг разработчика)

Правило: проба может уточнить только форму, которую oracle не определяет —
наличие строки константы, статистики опорной строки (NULL или 0), DisplayName
категорий, порядок и integer/real переменных порта 2, точные `data-tid`.
Такая правка вносится в oracle и expected **до прогонов** в PR цикла.
Расхождение в числах (коэффициенты, прогнозы, статистики) или отсутствие
режима — стоп: `blocked` с одним вопросом, expected не подгонять.

- **C6.** `LearnPartitionWizard`: при последовательном способе размеры задаются
  в строках 16/2/0 и после Next/Back, Save и cold остаются строками? Порт 0 —
  все 18 строк в исходном порядке, у тестовых есть прогноз, нового столбца нет?
  Порт 1 после Teach — 3; 2; 0.5; 0 (±999 не учтены)?
- **C6b.** `ByColumnMethodForm;pedPartitionColumn` принимает Boolean IsTest, и
  true — это тест? Если нужен Integer/строковый флаг — стоп, тип не подменять.
- **C8.** `read.variable_ports:[2]` после Execute даёт полный `VariablesForm`
  из 15 переменных (complete, fresh)? Порядок и integer у TotalSamples,
  TotalSelectedSamples, TrainSamples, DFE, ModelDF? StdDev = 0.288675 (`RSS/DFE`),
  а не 0.25 (`RSS/n`)? LogLikelihood = −0.522307?
- **C11.** Строковая дискретная Category получает роль «Входное», нормализатор —
  только «Индикатор», опорная «первое значение» = A, показ опорного
  коэффициента включён? Порт 1 — строки константа, X, A, B, C; DisplayName
  строк категорий = `Category`; у A статистики NULL или 0? Порт 0 без индикаторных
  столбцов?
- **C5.** `ColumnsEditForm;cbxNormType` «Стандартизация» для integer Price:
  SD выборочное (Price 2.065591) или генеральное (2.0)? При `pedDenormalize=false`
  константа = 3, а прогноз порта 0 — в шкале Y? Y по умолчанию не нормализован?
- **C12.** `pedIntercept` редактируется только при `pedDenormalize=false`?
  Без константы порт 1 не содержит строки `<Константа>` или показывает её 0/NULL?

## Циклы этапа 1: по одному PR, в порядке пользовательской ценности

Оценка — изменённые строки production-кода + адресных тестов, не обязательство
заранее поменять весь перечисленный код. `L` ниже означает существующие
`packages/loginom-runtime/client/lib/linregression-{parameters,procedure,context,readback,node,output}.mjs`;
`S` — **аддитивные** описание/схема/режимы типа в `node-api.mjs`, `node-contracts.mjs`,
`node-result-schema.mjs`, `node-read-contract.mjs` и справка типа.
Никакого рефакторинга общих модулей: необходимость неаддитивной правки — stop.
Список S — кандидаты по контракту, не предписание менять каждый файл.

| Цикл | Пользовательское поведение / задача | Вход | Oracle / документ ожиданий | Оценка и граница |
|---|---|---|---|---|
| C1 | Forward с F/прочими критериями; [task-forward](task-forward.md) | selection.csv | `--case forward-f` → expected/forward-f.json; R² → forward-r2.json | L parameters/procedure/context/readback/node + S, 180–300 строк; local + additive |
| C2 | Backward; [task-backward](task-backward.md) | selection.csv | `backward-f`, тот же forward-f.json; R² тот же forward-r2.json | L procedure/context/readback + S, 70–140; после C1 |
| C3 | Stepwise; [task-stepwise](task-stepwise.md) | selection.csv | `stepwise-f`, тот же forward-f.json; R² тот же forward-r2.json | L procedure/readback + S, 80–150; после C1 |
| C4 | Ручной Ridge; [task-ridge](task-ridge.md) | regularization.csv | `ridge` → expected/ridge.json | L parameters/procedure/context/readback/node + S, 130–230; численно самый ясный регуляризатор |
| C5 | Стандартизованные коэффициенты без денормализации; [standardization](standardization/task-standardization.md) | units.csv | `standardization/expected.json` | см. [комплекты v0.4.0](#комплекты-c5c6c8c11c12-для-v040-lab-1559) |
| C6 / C6b | Train/test: [последовательно 16/2 строки](partition-sequential/task-partition-sequential.md); [по полю IsTest](partition-column/task-partition-column.md) | partition.csv | `partition-sequential/expected.json`, `partition-column/expected.json` | см. [комплекты v0.4.0](#комплекты-c5c6c8c11c12-для-v040-lab-1559); случайный split — C13 |
| C7 | Полные девять столбцов коэффициентов; [task-coefficients](task-coefficients.md) | design.csv | `coefficients` → expected/coefficients.json | L output/parameters/readback + S, 130–220; существующий table reader |
| C8 | Сводка модели на выходе переменных 2; [summary](summary/task-summary.md) | design.csv | `summary/expected.json` (+ `variable_inventory`) | см. [комплекты v0.4.0](#комплекты-c5c6c8c11c12-для-v040-lab-1559) |
| C9 | Ручной LASSO; [task-lasso](task-lasso.md) | regularization.csv | `lasso` → expected/lasso.json | L parameters/procedure/readback + S, 100–180; **условно: objective/константа не подтверждены** |
| C10 | Ручной Elastic Net; [task-elastic](task-elastic.md) | regularization.csv | `elastic` → expected/elastic.json | L parameters/procedure/readback + S, 120–200; **blocked по численной семантике λ** |
| C11 | Индикатор категорий, опорная A; [categorical](categorical/task-categorical.md) | categorical.csv | `categorical/expected.json` | см. [комплекты v0.4.0](#комплекты-c5c6c8c11c12-для-v040-lab-1559) |
| C12 | Модель без константы; [no-intercept](no-intercept/task-no-intercept.md) | design.csv | `no-intercept/expected.json` | см. [комплекты v0.4.0](#комплекты-c5c6c8c11c12-для-v040-lab-1559); epsilon и приоритеты исключены |
| C13 | Авто-λ/автометод, K-fold/Монте-Карло, фиксированный/случайный seed; [task-auto](task-auto.md) | zero.csv для smoke; design.csv для будущей проверки качества | все `auto-*` → expected/auto-method.json — **только smoke, не приёмка качества** | L context/procedure/readback + S, 220–380; **blocked: требуется критерий качества/неизвестная сетка поиска** |
| C14 | Управляющая привязка λ и повторное обучение; [task-bindings](task-bindings.md) | regularization.csv; переменная Alpha | `bindings` → ridge.json, после Alpha=2 — bindings-updated.json | L context/procedure/readback/node + S, 200–350; **blocked: data-tid управляющего порта/реальная связь не воспроизведены** |

Ожидаемая суммарная величина 2.2–3.9 тыс. строк с тестами, распределённая по
14 PR; это оценка без исследования blocked-частей. Проверки по S могут потребовать
полный client/acceptance набор независимо от небольшой локальной правки.
Каждый PR содержит только законченный пользовательский цикл с его red→green.
Не объединять C1–C14 в один PR и не регистрировать недоступные native кодировки.

## Матрица критериев и независимость чисел

`oracle.py` читает только CSV из `../../fixtures/modes/`, не читает Loginom,
сохранённые пакеты, observed CSV или expected.json. Python stdlib: Fraction
для нормальных уравнений/обратной матрицы, неполная beta для t/F и бисекция
квантилей. Алгебраические самопроверки: β=(3,2,0.5,0), RSS=1,
F(2,13)=442 и t(0.975,13)=2.160368656461013.

```sh
python3 docs/node-development/nodes/datamining-linregression/acceptance/modes/oracle.py --write
python3 docs/node-development/nodes/datamining-linregression/acceptance/modes/oracle.py --check
python3 docs/node-development/nodes/datamining-linregression/acceptance/modes/oracle.py --case backward-aicc
```

Все 34 варианта генерируются независимо; 8 общих JSON не дублируют одинаковые
таблицы, 6 комплектов циклов v0.4.0 пишутся в `<цикл>/expected.json`. Для каждого из C1–C3 предложены F, R², adjusted R², AIC, AICc, BIC,
HQC: F/adjusted/информационные критерии выбирают X1/X2; R² — X1/X2/X3.
В selection.csv есть малый ненулевой эффект X3=0.01, поэтому это **не tie**.
В отличие от него, живой design.csv использовался для базового F без эффекта X3.
Точные пороги и оба знака границы требуют дополнительных адресных fixtures
перед расширением приёмки на равенство порогу; молча их не утверждать.

Для C4/C9/C10 математическое **предложение**:
`RSS + λ1 Σ|βj| + λ2 Σβj²`, j>0, константа не штрафуется. Centered fixture
убирает сдвиг свободного члена из основной численной проверки. При ΣX²=16:
Ridge β=(0,32/17,8/17,0), LASSO β=(0,63/32,15/32,0),
Elastic β=(0,63/34,15/34,0). Последнее не подтверждено native-опытом λ=1
на design.csv; expected/elastic.json **не является accepted oracle Loginom**.
Сдвиг свободного члена в LASSO тоже нужно исследовать отдельным ненулевым
fixture: centered-сценарий не доказывает правило обработки константы.

C5, C6, C8, C11, C12 — в разделе [комплекты v0.4.0](#комплекты-c5c6c8c11c12-для-v040-lab-1559).

C7: все имена/типы/NULL точны; SE/t/p/CI по OLS с константой, DF=n−4.
Метки наблюдены только у Name и Y_coefficients (их подставляет run-check);
у остальных семи столбцов порта 1 — `label_any`, задание метки не задаёт.

C13: zero.csv имеет Y=0 и нулевой optimum при любом неотрицательном штрафе.
Smoke-expected проверяет только прогнозы: число строк коэффициентов зависит
от автоматически выбранного метода и здесь не выдумано.
Это повторяемая независимая **проверка исполнения**, но не выбора хорошей модели.
Её нельзя предъявлять как 2/3 PASS всего C13. Нужен отдельный критерий владельца
по независимому validation loss и допустимой сетке/набору кандидатов либо другой
проверяемый контракт; неизвестный native PRNG и найденную λ не выдавать за oracle.
Фиксированный seed требует повторного обучения с одинаковым результатом;
«всегда случайно» не проверяется требованием обязательно получить другое число.

C14: изменение Alpha=1→2 должно изменить коэффициенты на 16/9 и 4/9.
Нужны совпадение binding с именем/типом/источником, Save/cold и отказ на
несовместимый тип. Двух таблиц без доказательства самой привязки недостаточно.

## Доставка модели и критерии следующего этапа

В отдельный workspace модели копируются **только выбранный task-*.md и нужный
CSV**. Не копировать эту README, discovery, oracle, expected, manifest, card
или sizes. `task-auto.md` до согласования — исследовательская smoke-просьба,
не зарегистрированная приёмка качества. Существующая схема `--case-root`/`--cases`
run-check пригодна для упаковки; совместимость конкретного oracle CLI с
контрактом runner нужно обеспечить в соответствующем этапе 1 (сейчас он
намеренно не принимает actual.csv и не является drop-in runner oracle).

Для утверждённых циклов предлагается стандарт сквада: red→green на production
ветке, tests затронутых пакетов, один SHA, ≥2/3 у исполнителя и ≥2/3 при
независимой проверке, Save и cold PASS с настоящим скачанным CSV и cleanup.
Живые модельные прогоны — `run-check start`, затем foreground `wait`; модель,
1800 с и лимиты не менять. Нынешнее discovery не увеличивает эти счётчики: **0/3**.

Допуск вычисляемых real в предложении `abs=1e-8, rel=1e-10`; он требует
достаточной native solver accuracy, readback сохранённого epsilon и точного
reader, не округлённого preview. Не повышать допуск после неудачной попытки.
Имена/типы, IDs, Boolean и NULL сравниваются точно. Незапрошенные метки узлов —
`label_any`; порядок столбцов не фиксирован до cold-подтверждения, строки упорядочены.
Пограничные null/rank-deficient fixtures приложены для будущего исследования
отказов, их результаты не заявлены и ожидаемые сообщения не выдуманы.

## Бюджеты и архитектурная граница

`measure.mjs` только клонирует текущие схемы/карточку в памяти. Не регистрирует
тип, не открывает браузер. Итог — [sizes.json](sizes.json),
[proposed-card.json](proposed-card.json), [parameter-proposal.json](parameter-proposal.json).
Во всех hash-полях карточки 64 нуля. Новые настройки вложены в
`parameters.linear_regression`, чтобы аддитивное расширение не перезаписало
одноимённые настройки других типов. Роли остаются прежними input_fields/target_field.
Схема — проект для обсуждения, не доступный API.

| Поверхность | Сейчас | Предложение | Лимит |
|---|---:|---:|---:|
| Одна карточка типа, JSON UTF-8 | 3 073 Б | 9 426 Б | 12 000 Б |
| Сжатый model-visible dock_node_apply | 14 539 Б | 14 576 Б | 20 000 Б |
| Полная inputSchema, только диагностика | 63 280 Б | 69 841 Б | нет лимита |
| SKILL.md | 39 954 Б | **без изменения** | 40 000 Б |
| Проект строки маршрутизации | существующая строка не менялась | 133 Б | около 200 Б |
| Файл справки типа | 560 Б | 5 727 Б | 6 000 Б |

Столбец «Сейчас» и sizes.json сняты на 4b202757. На v040-batch-12@f20bac7f:
карточка (все режимы) 10 876 Б, model-visible 8 051 Б, справка типа 5 996 Б.
node-reference-proposal.md заменяет старый файл 560 Б и напрямую не применим.

`node --test test/model-schema-budget.test.mjs` на базовом коде PASS;
его `model_tool_bytes=14539`, `full_input_schema_bytes=63280`. Уменьшение/рост
полной схемы не интерпретируется как model-visible бюджет. Проекция будущей
схемы вычислена существующим `userNodeTool`, а не длиной full schema.
Попытка добавить длинную новую строку прямо в SKILL.md при запасе **46 Б**
не предлагается. Проект справки лежит здесь, продуктовый файл не изменён.

Основные изменения помещаются в L и аддитивные type-specific S. Изменения
`packages/agent`, общей логики бюджетов/deadline или нового общего binding
контракта запрещены без решения владельца. Для C14 пригодность существующих
variable helpers ещё не доказана; необходимости общей правки нельзя обещать ноль.
C8 читает порт 2 существующим `read.variable_ports` (`node-support.mjs`); полнота
этого чтения для типа — вопрос native-пробы, а не новый reader.

Нужное решение: утвердить границы C1–C14 и предложенные математические критерии,
исключить отсутствующие native кодировки, отдельно определить приёмку C13 и
путь для data-tid привязок C14. До этого handler не меняется.

Старые `expected/lasso.json` и `expected/elastic.json` из LAB-972 помечены
`obsolete_invalid_do_not_use`: их штраф/константа не соответствуют уточнению
LAB-1145. Они сохраняются только как исторические артефакты и не являются
приёмочным oracle. Генератор воспроизводит эту пометку. Для новых циклов
использовать утверждённый комплект `../penalty`; C10 требует новой независимой точки.
