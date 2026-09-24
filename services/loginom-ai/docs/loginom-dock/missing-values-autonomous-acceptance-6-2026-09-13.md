> Исторический документ, адаптированный для навигации в Loginom AI Agent. Даты, версии, SHA и результаты относятся к прежним проверкам. Пути к коду указаны относительно нового репозитория; это не доказательство проверки текущих файлов. Исходник `source-96bcb1b08762` и изменения: [происхождение](../../../../docs/node-development/provenance.json). `unavailable:artifact-*` означает [неперенесённый материал](../../../../docs/node-development/history/unavailable.md). Актуальная работа: [регламент](../../../../docs/node-development/README.md).

# Node14: шестая автономная приёмка — 13 сентября 2026

**FAIL.** Run `20260913-221602-99120ff2` выполнил 24 успешные операции
из требуемых 27 и остановился на `impute-sourcechange-001`. Сохранения нет;
независимое открытие не запускалось, поскольку полный предварительный аудит
не прошёл. Exit0 модели не принят за успешную приёмку.

Назначение `node14:hermes-full:6:138712ff`, эксклюзивный слот
`node14-hermes-20260913-3499a38b`. Использован точный args kit acceptance6.1,
HEAD `138712ffe3c5a799f0c9141a49f83c17df565bb7`, source `ad8a1a09`, runtime
`4111dfed253d484003d5fb48c09006ec70e3057d0a9cfacd8f025b189884fc31`,
harness `0da2ccdcad484d92ee70bf3b1cb229cdc95e12752799e4f7a0a099be85213264`.
Свежий штатный preflight подтвердил 412 файлов, auth более чем на 4200 секунд,
отсутствие другого Hermes-процесса и 81 049 710 592 свободных байта.
Четыре candidate-файла прочитаны заново; parser принял manifest `cadd80df…`.
Фактический приватный профиль user-v1/executor-replay и самостоятельный текст
задания проверены без вывода секретов. Goal, fixtures, oracle и аудитор не менялись.

## Результаты запуска

| Показатель | Наблюдаемый результат |
|---|---|
| Model runs / API calls | 1 / 83 |
| Provider / model / reasoning | openai-codex / gpt-5.6-sol / low |
| Timeout / max turns | 3600 секунд / 200 |
| Tool calls / replies | 90 / 90, pairing errors 0 |
| Events | 15 416 |
| Prepared node operations | 27 |
| SUCCEEDED / NOT_APPLIED / FAILED / AMBIGUOUS | 24 / 1 / 1 / 1 |
| Успешные imports / Missing Values | 9 / 15 |
| Native save / independent reopen | 0 / не запускался |
| Launcher / model returncode | 0 / 0, наблюдены |
| Timed out | false, наблюдено |
| Export | завершён, 1 031 353 836 байт |
| Полный аудит | FAIL, exit1 |

Импорт120 успешно размещён после первого NOT_APPLIED; его отдельный
no-effect placement proof подтверждён (3 внутренних попытки).
`impute-permuted-001` получил FAILED/cleanup=true на недоступной поверхности
размещения, следующая попытка успешна. Этот отказ сохранён; общий аудит
не принял всю совокупность событий из-за незавершённого следующего узла.
Полный результат сохранил terminal_refusal_accounting и incomplete_evidence.

«Только строка» и пороги40/41/42 прошли. На `impute-sourcechange-001:n144`
click обращался к **телу целевого узла** `MF;TF-1;Graph;Смена_источника`
после закрытия отдельного выходного мастера. Это этап finish, после успешных
target/input_mapping/configure/node_finish/output_mapping. До выполнения
результата и сохранения не дошло.

Внутри n144: UI_REFERENCE_STALE, NOT_APPLIED, effect_possible=false,
cleanup=true, без жеста и проверенных preconditions. Внешняя операция осталась
AMBIGUOUS/effect_possible=true/cleanup=false. Источник/целевой узел уже
существуют, поэтому отказ одного клика не отменяет эффекты всей операции.

До отказа ref тела заканчивается на75810, в снимке catch — на75895.
Подтверждённые document/workflow/node GUID и data-tid совпадают; обе
prepared contexts показывают unlocked graph. Это тот же класс замены SVG-тела,
но на целевом узле: opt-in исправления ad8a1a09 включён только для source
preflight, а общий finishGraph пока вызывает выбор без него. Точная первая
ложная проверка checkedHandle отдельно не измерена. Старый run6 не повторялся
и его результат не переоценивался.

## Сохранность и следующий шаг

Полный экспорт, DB/WAL, журналы, auth guard, исходные квитанции и FAIL сохранены.
Runtime/harness/native skill и подключение подписки после запуска совпали.
Экспорт штатный, без recovery. Процессы модели, launcher и браузера завершены;
локальная квитанция освобождения слота сохранена. Передача событий координатору
отклонена auto-review из-за отсутствия доверенного разрешения на внутренние
идентификаторы/PID; обход не выполнялся. Coordinator registry не изменялся.

По действующему автономному порядку продолжается узкая диагностика finishGraph
Missing Values и проверка применимости уже существующего доказательства замены
тела к целевому узлу. Общий UI retry и изменение публичной семантики не нужны.
Следующий Hermes run возможен после проверенной правки, новых pins и отдельного
выделения общего слота; модели этой фазой больше не запускались.

[Pins и 50 квитанций](missing-values-autonomous-acceptance-6-pins-2026-09-13.json).
Private root: `unavailable:artifact-1219b6ca4d4c519d`.
