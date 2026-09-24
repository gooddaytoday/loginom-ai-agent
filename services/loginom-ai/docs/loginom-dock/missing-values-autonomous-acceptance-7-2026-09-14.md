> Исторический документ, адаптированный для навигации в Loginom AI Agent. Даты, версии, SHA и результаты относятся к прежним проверкам. Пути к коду указаны относительно нового репозитория; это не доказательство проверки текущих файлов. Исходник `source-60c8b68e965c` и изменения: [происхождение](../../../../docs/node-development/provenance.json). `unavailable:artifact-*` означает [неперенесённый материал](../../../../docs/node-development/history/unavailable.md). Актуальная работа: [регламент](../../../../docs/node-development/README.md).

# Missing Values: седьмая автономная приёмка

**FAIL.** Run `20260914-114821-f7a403f6`: четыре успешных импорта,
один NOT_APPLIED и один AMBIGUOUS; до Missing Values, save и независимого
reopen не дошёл. Полный неизменённый аудитор завершился exit1:
terminal_refusal_accounting / incomplete_evidence.

Выделенный слот `node14-hermes-20260914-full7`, source `1b407882`, HEAD
`2c8b3781`. Исполнен точный launch-plan acceptance7.1. Fresh preflight:
412 совпавших файлов, 77 826 174 976 свободных байт, действующая подписка
более4200 секунд, нет других model/acceptance процессов. Четыре candidate-файла
повторно скачаны и проверены; настоящий parser принял test4.2/cadd80df….

Профиль openai-codex/gpt-5.6-sol/low, user-v1/executor-replay/test-4;
бюджет3600s/200turns. Ручной read-only config probe сначала отклонён из-за
пропущенного adapterRevision; он исправлен и подтвердил профиль до model_start.
Launcher уже начал работу; повторного запуска не было. Фактическая приватная
конфигурация, отсутствие fallback и неизменность полного scenario также сверены.

## Результат

Модель:33 API calls, 40 tool calls/40 replies, pairing errors0, 2783 события.
Model и launcher returncode0, timed_out=false, usage.completed=true.
Штатный полный экспорт182047880 байт сохранён вместе с DB/WAL и журналами.
Auth connection, runtime, harness и native skill после запуска не изменились.

`import-base`, `import-precision`, `import-skew`, `import-boundary` — SUCCEEDED.
Первый `import-120` отклонён на размещении: поверхность недоступна, внутренние
3 попытки, отдельный no-effect placement proof подтверждён.
`import-120b` создал узел и остановился в configure:
`Import field has no observed horizontal scroller`. Внешний результат
AMBIGUOUS/cleanup=false сохранён. Он не разрешает повтор всей операции.

Последний снимок показывает пять видимых столбцов, доступные ячейки data_kind
и preview-таблицу шириной719 без horizontal_scroll. Definition page полная
(5/5), но definition_coverage partial. Существующая проверка полного layout
использует именно coverage; далее требует горизонтальный scroller. Запущена
отдельная диагностика импорт120 на живом UI до правки продукта. Точная причина
partial coverage и безопасное правило геометрии ещё требуют проверки.

Начальная геометрия run7: viewport=null, outer2044×1122,
available2048×1122. Это развёрнутое окно; прежнее окно меньшего размера
не использовано как доказательство текущей геометрии.

## Завершение и продолжение

PID модели3919 и launcher3481 завершены; в08:58:27UTC отсутствие обоих и
собственного браузера проверено. Локальная квитанция освобождения слота сохранена.
Прямая пересылка координатору ранее заблокирована auto-review; повтор или обход
не выполнялись. Coordinator registry не менялся. Координатор может независимо
считать эту задачу и локальную квитанцию для передачи слота.

Исправление целевого тела Missing Values в run7 не достигнуто и не принято
автономно. Старые FAIL сохранены. Разработчик продолжает адресную диагностику
импорта в своей стадии; новый Hermes возможен только после обоснованной правки,
проверок, обновления pins и следующего выделения слота. Main/merge/push/deploy/
общий плагин не затронуты.

[Машинный итог и квитанции](missing-values-autonomous-acceptance-7-pins-2026-09-14.json).
