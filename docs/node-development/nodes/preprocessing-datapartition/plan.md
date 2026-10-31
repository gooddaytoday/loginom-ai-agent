# Разбиение на множества: подплан LAB-533

Статус: **`ready_for_development`**, этап 0 завершён с оговоркой по NULL/empty, 30.10.2026.
Критерии предложены владельцу; этап 1 начинается после их утверждения.
База: `v038@2098aafcf46eaea118b18cb529f6bf045a5704eb`.
Component ID: `component.preprocessing.DataPartition`; runtime proposal:
`preprocessing.data_partition`, только mode `sequential`.

[Discovery](discovery.md) · [Приёмочный комплект](acceptance/README.md) ·
[Схема параметров](parameter-schema.proposal.json).

## Подтверждённый контракт

Sequential: train_count/test_count в строках, порядок test → train → unused.
Скрытые cntTestPriority/pedTestPriorityPosition не входят в последовательный контракт.
Native engine TBGPartitionEngine подтверждён сохранённым XML.

| output_port | Наблюдённый результат rows.csv | Строки | Сумма Value |
|---|---|---:|---:|
| 0 общий | IsTestSet boolean первым, RowID6..15 затем1..5 | 15 | 1200 |
| 1 train | RowID6..15, исходные3 поля | 10 | 1050 |
| 2 test | RowID1..5, исходные3 поля | 5 | 150 |

IsTestSet label «Тестовое множество», false для train, true для test.
Поля train/test: RowID integer, Class string, Value integer. Unused16..20
не входит ни в один выход. Общий выход concat train+test; глобальный порядок
входа не сохраняется, порядок внутри каждого множества точный.
Предложенный order train_test_unused ещё требует отдельной проверки до реализации.

Обычный Execute, обучение/train/apply не вводить. Предложение владельцу:
ordered=true, явный output_port, column_order=exact, точные типы/NULL,
real abs=0/rel=0. Независимый stdlib oracle.py воспроизводит rows/null/empty/update.
Генератор не читает Loginom/runtime/actual; модель получает только task и CSV.

## NULL/empty — проверяется на этапе 1 по oracle

По решению в комментарии LAB-533 от 30.10 (`01a18cca-1005-75d9-b35a-8c600acd10e2`)
разрывы ручных сессий mas3 считаются окружением; правило трёх одинаковых
отказов не блокирует завершение этапа 0. Выполнены четыре новые сессии:
подтверждённых таблиц NULL/empty не получено на подготовке импорта/мастера.
Подробности и граница доказанного — в discovery. Это не PASS и не дефект S/P.

**NULL/empty — проверяется на этапе 1 по oracle.** Обязательная матрица:
`fixtures/null.csv` и `empty.csv`, соответствующие `expected-null.json` и
`expected-empty.json`, сохранение явных типов, NULL отдельно от пустой строки
и false, exact column order, ordered=true, output_port и допуск 0.
Для P читать все три порта; для S first/last. Нулевой выход обязан сохранять
схему (у P общий порт дополнительно IsTestSet boolean). Случайные методы
и ослабление критериев этим решением не разрешаются. Критерии и эта оговорка
передаются владельцу на утверждение. Update, Save/cold и модельные прогоны
будущего обработчика остаются NOT_RUN; статус подплана не означает их PASS.

## Этап 1 после утверждения критериев владельцем

Действуют LAB-533 и регламент сквада вместо старых §0. Хост mas3, назначенная
пара `~/.config/loginom-multica/cards/01a124e5-1222-7d75-8447-c66208fc7459/`,
только app.loginom.ai/app/?testable=true, свои пакеты и data-tid.
Этап0 без runtime-кода и сборки CLI. В v0.3.8 только последовательный метод;
смещение, случайные и стратифицированные режимы — следующие этапы.

Создание и обновление того же узла сохраняет незапрошенные настройки,
source identity и mapping. Compact readback: метод, размеры в строках,
порядок, привязка к своему узлу/источнику/портам. Не включать таблицы значений,
проценты, seed или скрытый приоритет test. Несовместимые параметры отклонять до UI.
Descriptions и строковые enum предложены в parameter-schema.proposal.json.

Аддитивная регистрация, собственный обработчик, раздел skill и штатный сценарий
run-check. Образцы — Кластеризация и «Дата и время». Общей новой семантики
пока не требуется: база уже умеет несколько output_port и ordered matching.
Если потребуется общая правка сверх разрешённых — stop с вопросом.
Обязательные проверки — required-checks.py list/verify, полный client с pinned
Chromium под nice -n19; acceptance tests при изменении соответствующих путей.
Живая приёмка — run-check start + foreground wait, cold, 2/3 исполнителя и
2/3 независимого reviewer на одном SHA; openai/gpt-6.1-sol medium/1800с.
Сейчас обработчика нет; run-check/cold NOT_RUN. Merge/release/Done не входят в назначение.

## Оценка

1–2 цикла реализации + 1 приёмочный. Полная inputSchema базы 45 891Б, с типом 46 519Б,
приращение **628Б**, ≤1 050Б. Оба типа вместе +1 000Б, полная46 891Б.
Резерв891Б даёт F2, порог46 000Б не останавливает этап0. Регистрация — этап1.
