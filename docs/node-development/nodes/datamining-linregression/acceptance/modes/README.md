# Приёмочный комплект режимов — предложение LAB-972

**Ни один новый критерий здесь не утверждён.** Это этап 0 на
`4b202757f6d0021160dd4dfc104ee788ae33cbec`, без изменений runtime/SKILL.md и
без регистрации сценариев run-check. Live-факты и ограничения находятся в
[modes-discovery.md](../../modes-discovery.md). Утверждение владельца нужно до
первой правки обработчика. UI-пробелы и математические вопросы не маскируются PASS.

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
| C5 | Непрерывная нормализация, диапазоны и денормализация; [task-normalization](task-normalization.md) | design.csv + holdout.csv | `normalization-minmax` → expected/normalization-minmax.json; остальные варианты тот же denormalized OLS | L context/procedure/readback/output + S, 220–380; range error/winsorize отдельно доуточнить |
| C6 | Train/test с исключением контрольных выбросов; [последовательно](task-partition.md), [по флагу](task-partition-column.md) | partition.csv | `partition-sequential` / `partition-column` → expected/partition-sequential.json | L context/procedure/readback + S, 150–260; случайный split — C13 |
| C7 | Полные девять столбцов коэффициентов; [task-coefficients](task-coefficients.md) | design.csv | `coefficients` → expected/coefficients.json | L output/parameters/readback + S, 130–220; существующий table reader |
| C8 | Сводка модели на выходе переменных 2; [task-summary](task-summary.md) | design.csv | `summary` → expected/summary.json | L node/output/parameters + additive type metadata, 160–280; проверить пригодность существующего variable reader, без нового W4 |
| C9 | Ручной LASSO; [task-lasso](task-lasso.md) | regularization.csv | `lasso` → expected/lasso.json | L parameters/procedure/readback + S, 100–180; **условно: objective/константа не подтверждены** |
| C10 | Ручной Elastic Net; [task-elastic](task-elastic.md) | regularization.csv | `elastic` → expected/elastic.json | L parameters/procedure/readback + S, 120–200; **blocked по численной семантике λ** |
| C11 | Индикатор категорий и опорная строка; [task-categorical](task-categorical.md) | categorical.csv | `categorical` → expected/categorical.json | L parameters/context/procedure/output/readback + S, 220–380; повторяющийся Name, нужен UniqueValues |
| C12 | Модель без константы, epsilon/доверие и ручные приоритеты; [task-details](task-details.md) | design.csv | `no-intercept` → expected/no-intercept.json; статистика при 95% — C7 | L parameters/procedure/context/readback/output + S, 120–220; константу менять только при denormalize=false |
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

Все 45 вариантов генерируются независимо; 13 общих JSON не дублируют одинаковые
таблицы. Для каждого из C1–C3 предложены F, R², adjusted R², AIC, AICc, BIC,
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

C5 проверяет предсказания и денормализованные коэффициенты OLS; такое равенство
само по себе не доказывает, что нормализатор применён. Обязателен readback
сохранённого normalizer/диапазона и повторное открытие. Для преобразованных
коэффициентов при denormalize=false и clamp/error на holdout пока **нет точного
утверждённого expected**; `holdout.csv` — только заготовка будущего apply.
Метод статистического SD, нулевой делитель, NULL и ручные границы не угаданы.

C6: первые 16 строк train, две последние — test. OLS на train предсказывает
6.5 и 9.5 на test независимо от Y=±999; обучение на всех 18 строках нарушит
ожидания. `IsTest=true` означает test. Перестановка сегментов и rows/percent
должны подтверждаться сохранённой конфигурацией; отдельные отличающиеся
ожидания для всех перестановок ещё не предложены.

C7: все имена/типы/NULL точны; SE/t/p/CI по OLS с константой, DF=n−4.
C8: 15 native переменных, счётчики целые, остальные real. Использован уже
существующий `variable_inventory` с допусками, не новый verifier.
Log-likelihood — Gaussian MLE по RSS/n; AIC/AICc/BIC/HQC делятся на n.
Проверка всего набора типа и точных значений остаётся этапу 1.

C11: независимая dummy-матрица `[1,X,I(Category=B),I(Category=C)]`, опорная A;
ожидание не придумывает имена Category_A. Показываемая опорная строка равна 0;
порядок A/B/C задан fixture/первой категорией. Точные типы всех passthrough,
порядок после cold, редкая/частая при tie ещё нужно подтвердить.

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

`node --test test/model-schema-budget.test.mjs` на базовом коде PASS;
его `model_tool_bytes=14539`, `full_input_schema_bytes=63280`. Уменьшение/рост
полной схемы не интерпретируется как model-visible бюджет. Проекция будущей
схемы вычислена существующим `userNodeTool`, а не длиной full schema.
Попытка добавить длинную новую строку прямо в SKILL.md при запасе **46 Б**
не предлагается. Проект справки лежит здесь, продуктовый файл не изменён.

Основные изменения помещаются в L и аддитивные type-specific S. Изменения
`packages/agent`, общей логики бюджетов/deadline или нового общего binding
контракта запрещены без решения владельца. Для C8/C14 пригодность существующих
variable helpers ещё не доказана; необходимости общей правки нельзя обещать ноль.

Нужное решение: утвердить границы C1–C14 и предложенные математические критерии,
исключить отсутствующие native кодировки, отдельно определить приёмку C13 и
путь для data-tid привязок C14. До этого handler не меняется.
