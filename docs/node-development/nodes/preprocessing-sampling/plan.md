# Сэмплинг: подплан LAB-533

Статус: `discovery_required`; этап0 **blocked по окружению**, 30.10.2026.
База: `v038@2098aafcf46eaea118b18cb529f6bf045a5704eb`.
Component ID: `component.preprocessing.Sampling`; runtime proposal:
`preprocessing.sampling`, только mode `sequential`.

[Discovery](discovery.md) · [Приёмочный комплект](acceptance/README.md) ·
[Схема параметров](parameter-schema.proposal.json).

## Подтверждённый контракт

Sequential: count в строках, position first/last; sampled → unused либо наоборот.
Выход0: first RowID1..5 / last16..20, по5 строк, суммыValue150/900.
Новый узел сохраняет RowID integer, Class string, Value integer и их порядок.
Старый mapping после смены biased→sequential может сохраниться; не сбрасывать
незапрошенные настройки. Native engine TBGSamplingEngine подтверждён сохранённым XML.
Смещение исключено из v0.3.8 текущим решением; наблюдение 10 строк вместо
гипотезы14/seed42 сохранено в discovery, раздел «Следующие этапы».

Обычный Execute, обучение/train/apply не вводить. Предложение владельцу:
ordered=true, явный output_port, column_order=exact, точные типы/NULL,
real abs=0/rel=0. Независимый stdlib oracle.py воспроизводит rows/null/empty/update.
Генератор не читает Loginom/runtime/actual; модель получает только task и CSV.

## Оставшееся исследование

Три новых профиля подряд дали native «Восстановление сессии» /
«Обнаружен разрыв связи. Восстановить сессию?», включая второй аккаунт пары.
Регламент требует остановки после трёх одинаковых отказов. NULL/empty не
объявляются PASS, `ready_for_development` пока не заявляется.
После восстановления стенда: выполнить null.csv и empty.csv, прочитать все
порты с типами/NULL, завершить подплан и передать критерии владельцу на утверждение.
Update, Save/cold будущего обработчика и модельные прогоны остаются NOT_RUN.

## Этап1 после завершения discovery и утверждения

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

1 цикл реализации + 1 приёмочный. Полная inputSchema базы 45 891Б, с типом 46 276Б,
приращение **385Б**, ≤1 050Б. Оба типа вместе +1 000Б, полная46 891Б.
Резерв891Б даёт F2, порог46 000Б не останавливает этап0. Регистрация — этап1.
