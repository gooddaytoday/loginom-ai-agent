> Исторический документ, адаптированный для навигации в Loginom AI Agent. Даты, версии, SHA и результаты относятся к прежним проверкам. Пути к коду указаны относительно нового репозитория; это не доказательство проверки текущих файлов. Исходник `source-8b1138b629fd` и изменения: [происхождение](../../../../docs/node-development/provenance.json). `unavailable:artifact-*` означает [неперенесённый материал](../../../../docs/node-development/history/unavailable.md). Актуальная работа: [регламент](../../../../docs/node-development/README.md).

# Узел 13 «Дата и время»: development-проверка

Статус на 2026-09-13: **development и прямые проверки завершены, готов к отдельному ревью**.
Ревью и автономная Hermes-приёмка ещё не проводились.
Ветка: `codex/node-13-date-time`. Полная история:
[checkpoint](node-13-checkpoint.md), [контракт подплана 13](../plans/loginom-dock/13-date-time.md).

## Поведение

`transform.date_time`, режим `calendar`, поддерживает 12 преобразований:
`year`, `quarter`, `month`, `day_of_month`, `hour`, `year_start`, `year_end`,
`quarter_start`, `quarter_end`, `month_start`, `month_end`, `date`.
Первые пять возвращают целое число, остальные — Дата/Время.
Конец периода в Loginom 7.4.2 — последний календарный день в **00:00:00.000**.
Null сохраняется; преобразование часового пояса не добавляется.

Для выбранного поля список преобразований заменяется целиком; `[]` снимает его
поддержанные преобразования. Другие поля и StringFmt сохраняются. Пустые
parameters существующего узла сохраняют настройки. Новый узел требует минимум
одно преобразование. Одинаковые метки исходных дат допустимы: адресация идёт по
точным именам/native record ID, происхождение выходов — по исходному имени,
суффиксу, метке и типу, а не по положению строки.

При удалении преобразования предварительно читаются реальные связи выходного
порта и закрываются без применения. Это проверка принадлежности будущего
удаления; она нужна только для existing + непустого parameters.fields, не для
нового узла, пустых parameters или Close. Удаляется исключительно соответствующий
orphan, остальные источники и выходы сравниваются полностью.

Два штатных эффекта Loginom учтены явно:

- При первом получении источников autosync может добавить отсутствующий сквозной
  столбец. Для Date/time допускается только точная копия native source в конце
  при неизменном исходном префиксе и уже включённом autosync. Общий verifier
  Группировки сохранил строгий режим.
- Удаление столбца выключает autosync. После точной проверки удаления исходное
  значение восстанавливается, если пользователь не задал другой output layout.

Для сохранения точного порядка входа требуется input autosync=false: при true
нативная синхронизация после повторного открытия может переставить поля.
Явный выходной layout отключает autosync; сочетание layout и autosync=true
отклоняется до изменений. Close не применяет mappings и не переключает флаги.
Повтор неопределённого переключения не выполняется автоматически.

## Проверенные результаты

Среда: реальный Loginom **7.4.2**, аккаунт **test-3**, хранилище `/test-3`;
собственные копии пакетов и browser profiles. Видимое развёрнутое окно,
viewport=null, 1508×862. Node **24.19.0** из установленного закреплённого release.

Текущий source runtime:
`dd0979bf175bd4164ab0d0647daecd69782b1c8ab0d10b2e690d313b9704b6d0`.
Клиент: **1415 PASS / 1 SKIP**, Python acceptance unit tests: **511 PASS**.
Логи: `unavailable:artifact-4ed31893b79c8b68`,
`unavailable:artifact-be5dc14b06693e6a`.

| Проверка | Доказательство | Результат |
| --- | --- | --- |
| Все 12 операций на двух датах, границы года/квартала/февраля, Null | a52fd065, `node13-execute-24`, точный выход 4×27 | PASS; 8 исходных negative checks |
| Публичное создание узла и пустой вход | a52fd065, `node13-empty-new`, выход 0×6 | PASS; текущий аудитор обнаружил 11 подмен |
| Save/reopen/reexecute полного примера | fcccbde6 → a52fd065, autosync=false | PASS: параметры, порядок, типы, исключение DateB, значения |
| Удаление year DateA | 1e796919, `node13-small-remove` | public SUCCEEDED; raw removal audit PASS; 7/7 negatives |
| Добавление year/month_start и перестановка входов | 1e796919, `node13-small-add-reorder` | public SUCCEEDED; вход Id/Amount/DateB/DateA, выход 7 полей; 9/9 negatives |
| Close с последующим чтением без изменений | 1e796919, freeze-output → close → preserve | PASS: все матрицы/mappings/order совпали; 6/6 negatives |
| Неправильный тип поля | 1e796919, `node13-wrong-type` | NOT_APPLIED, cleanup=true/effect=false, граф сохранён |
| Чужая связь занятого входа | 1e796919, `node13-occupied-upstream` | NOT_APPLIED, исходная связь сохранена |
| Потеря ответа после реального click DateB/quarter | 1e796919, `node13-lost-flag` | AMBIGUOUS; replay/resume: 969→969→969 browser calls; матрица не инвертировалась; 6/6 negatives |
| Сохранённое состояние после отмены fault draft, input autosync=true | 1e796919 → f7cf52c5, `node13-small-reopen-execute` | Execute/raw/values PASS, 0×7; strict persistence FAIL: вход autosync=true переставил поля |
| Save/reopen/execute с input/output autosync=false | f7cf52c5 → 6e3aa7ff, `node13-small-reopen-execute` | public SUCCEEDED; raw/config/values и strict persistence PASS, 0×7; 9/9 negatives |

Сессии находятся в `unavailable:artifact-3d8353b5a5093cb6<UUID>/`.
1e796919: `1e796919-a7f3-4966-8339-b93a0f309734`;
f7cf52c5: `f7cf52c5-9dc4-41dd-a405-f4df805b9526`;
6e3aa7ff: `6e3aa7ff-33ff-4fd6-893e-2cffdb0ee11a`.
Последний сохранённый проверенный baseline: `/test-3/N13-f7cf52c5.lgp`.
Final logs: `unavailable:artifact-673b67078badc88b`, `unavailable:artifact-08835a6542838509`,
6e3aa7ff `date-time-persistence.json`. Диагностические пакеты закрыты, последний
harness завершился с exit0; собственные browser sessions освобождены.
Их точные pins и промежуточные отказы перечислены в checkpoint.
Старые 4×27 и 0×6 не выдаются за новые исполнения текущего runtime: их сырые
журналы повторно прошли обновлённый независимый аудитор.

Основные независимые verifiers находятся в `unavailable:artifact-6c9840df3f4b6129`:
`date_time_audit.py`, `date_time_negative.py`, `date_time_removal_evidence.py`,
`date_time_close.py`, `date_time_refusals.py`, `date_time_reply_loss.py`,
`date_time_persistence.py`. Источником служат сырые observations/receipts и
публичные ответы; handler summary не заменяет доказательство конфигурации.

## Границы и передача на следующий этап

- ISO/недели, новые строковые форматы и timezone остаются вне режима calendar.
  Снятие существующих неподдержанных ISO/string флагов безопасно отклоняется.
- Занятая чужим источником связь автоматически не заменяется.
- Потеря ответа доказала безопасный отказ от повторного переключения. Отмена
  черновика и повторное открытие выполнялись оператором; automatic recovery
  не заявляется.
- Диагностика использовала существующий immutable каталог
  `2026.09.11-parallel-pilot.1-candidate`, manifest SHA256
  `4ac827fc9e0cefa609bf2cb8fd7d3d79318dd3fe92999decc7e385fae51fc6e2`.
  Это не финальный candidate admission узла 13. ArchiveActive=false.
- Установленный клиент, VPS, production и публичный каталог не обновлялись.
  Push/merge не выполнялись. Чужие изменения `.gitignore` и `AGENTS.md` сохраняются
  отдельно от изменений этого узла.
- Следующий этап — отдельный dispatch review в этой задаче. Hermes запускает
  координатор после review и выдачи эксклюзивного слота/кандидата:
  существующая ChatGPT-подписка, `openai-codex / gpt-5.6-sol / low`.

Для последующей бизнес-приёмки предлагается сценарий из подплана 13: по DateB
получить суммы Amount по календарным месяцам и кварталам, сохранив год в ключе,
затем сохранить пакет и независимо открыть/выполнить его. На диагностических
четырёх строках ожидаются месяцы: 2023/02→20, 2024/02→10, 2024/03→30,
Null/Null→40; кварталы: 2023/1→20, 2024/1→40, Null/Null→40.
Точное задание и admission фиксирует координатор; выполнение не запускалось.
