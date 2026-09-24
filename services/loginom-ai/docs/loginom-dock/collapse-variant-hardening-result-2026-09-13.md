> Исторический документ, адаптированный для навигации в Loginom AI Agent. Даты, версии, SHA и результаты относятся к прежним проверкам. Пути к коду указаны относительно нового репозитория; это не доказательство проверки текущих файлов. Исходник `source-fcd506a8093e` и изменения: [происхождение](../../../../docs/node-development/provenance.json). `unavailable:artifact-*` означает [неперенесённый материал](../../../../docs/node-development/history/unavailable.md). Актуальная работа: [регламент](../../../../docs/node-development/README.md).

# Node16: изолированная проверка variant lifecycle и datetime

Разрешение: `node16:variant-hardening:1:direct-user-20260913`. Продолжение
ограниченного прототипа из `bff616f3`, не интеграция в публичный handler.
Полный variant_io остаётся **BLOCKED**: нет серверного snapshot token,
нативная отмена не доказана, теги int32/real32 в живых данных не получены.

## Проверенные изменения reader

Фиксированный method321/interface116, ≤50 строк×8 столбцов, прежние
origin/build/document/workflow/package/node/port/execution/cache/schema guards.
Добавлен локальный diagnostic lifecycle: один читатель, уникальные operation IDs,
общий срок 1–30000 ms, явная отмена только текущего ID, запрет последующих чтений
после отмены, deadline или ошибки после отправки RPC. Это собственное состояние
на странице, не hooks/перехват transport и не установка plugin.

Отменённая операция не декодирует и не публикует поздний ответ, не читает следующую
ячейку. Native callback освобождает буферы, когда ответ/ошибка действительно
приходит. До этого request buffer остаётся у transport: освобождать используемый
буфер по одному лишь timeout нельзя. После отказа диагностический browser/process
должен быть закрыт. `nativeCancelled:false` не меняется на основании timeout.

Результат явно содержит `atomic_snapshot_verified:false` и
`consistency:observed_local_only`. Запрос `requireAtomicSnapshot:true` отклоняется
до RPC. Сравнение UI identities до/после не исключает невидимый серверный ABA;
fixed321 не обеспечивает единого снимка всей таблицы.

## Живые наблюдения

### Изменение состояния во время чтения

В run `live-1789294747254` чтение 15×5 пересеклось с реальной деактивацией
Node16Mapped: UI gesture 1789295182219–1789295182234, отказ reader
1789295182333, причина `loaded cache`. Результат не принят. Проверялся исходный
snapshot guard, сохранённый в hardening.

Первый F9 при фокусе Preview ничего не изменил и не засчитан как гонка.
Кнопку деактивации в модальном Preview перекрывала маска; после штатного
«Закрепить внизу» действие стало доступно. Повторное публичное выполнение
получило AMBIGUOUS: панель процессов перекрыла проверку выбранного узла, хотя
native process4 завершился. Resume отклонён; старый checkpoint не исправлялся
задним числом. Logout/browser close выполнены. Это не доказательство атомарной
конкурентной reexecution/ABA-защиты.

### Отмена и поздний ответ

В run `live-1789295696452` отмена произошла при первом pending RPC.
Started1789296183450, cancel1789296183458, end1789296183491.
После неё зафиксированы requests1, releasedRequests1, releasedResponses1,
lateResponses1, pending0, published=false, retired=true. Повторный reader
отклонён до нового RPC. Это реальный ответ Loginom после локальной отмены,
а не имитация задержки. Серверная отмена не заявлена.

### Разрыв связи, deadline и очистка

В новой собственной сессии `live-1789296218513` после успешного public execution
reader отправил один RPC. Только её одностраничный browser context переведён
в offline; закрыт именно WebSocket её проверенного datasource/session, через
локальный WebSocket.close, без изменений server/OS/network/shared transport.
Фиксированные native RPC не расширялись. Origin host и socket identity проверены.

Started1789296381879; close requested1789296381887. Socket перешёл OPEN→CLOSING,
подтверждённого close event за2s не было — это не выдано за закрытие. По сроку1s
reader вернул deadline_exceeded: pending1, releasedRequests0, published=false.
После восстановления online пришла ошибка native callback: pending0,
releasedRequests1, releasedResponses0. Результат и повторное чтение запрещены;
Loginom показал «Произошёл разрыв связи с сервером». Это live pending/hang до
срока, не доказательство отмены на сервере или бесконечного сетевого зависания.

### int32/real32 и datetime

`hardening.csv`: 5 строк×4 поля, после Collapse15×4, DataTypes исключён.
Типизированные I/R/D идут в variant Values; сырой tag не выводится из Names.
Int32 min/max/0 и значения float32 max/min-subnormal/точное float32/−0 возвращены
как tags20/5 (64 bit). Нативные tags3/4 остаются **NOT_OBSERVED**;
синтетические decoder tests не заменяют живое подтверждение.

| Исходное гражданское время | Свежий Preview Europe/Moscow | Свежий Preview America/New_York |
| --- | --- | --- |
| 10.03.2024 02:30 | 02:30, UTC+3 | **03:30**, UTC−4: DST gap нормализован |
| 03.11.2024 01:30 | 01:30, UTC+3 | 01:30, UTC−4: первая часть fold, epoch1730611800000 |
| 01.01.0100 00:00 | те же civil components | те же civil components |
| 31.12.9999 23:59:59.999 | те же civil components | те же civil components |
| 30.12.1899 06:00 | те же civil components | те же civil components |

Raw OADate bytes всех15 значений совпали до/после нового выполнения в New York.
UI Date после свежей конвертации изменился; данные сервера не переписывались.
Исторические offsets имеют секунды (например Moscow +02:30:17), которые
`getTimezoneOffset` сокращает до минут. Вычислять exact epoch только по нему нельзя.
Общий decoder по-прежнему возвращает `temporal_semantics:unverified`.

Отдельный опыт переключения зоны без нового выполнения подтвердил другую границу:
Preview повторно использует Date cache. Epoch оставался московским, локальные
компоненты менялись при смене зоны. Этот опыт не засчитан как свежая конвертация
в другой зоне. Свежий New York проверен отдельным успешным public execution
`1789295701469-xe0x53mfyyj:316:4`, исходный Moscow — `:316:2`.

## Сохранение, проверки и границы

Пакет `/test-1/node16-20260913-a56c2488/Node16-variant-hardening.lgp` сохранён
public save_checkpoint с verified completion, без заявления о полном persistence
аудите. Исходный prototype и чужие пакеты не изменялись.

19 focused tests прошли: в том числе late cancellation/deadline, бесконечно
ожидающий fake callback, transport error, wrong cancellation ID, concurrent reader,
повторный ID и strong atomic refusal. Бесконечный fake callback — синтетический
тест, не live hang. Python audit независимо декодирует bytes, проверяет свежие
DST/range данные и live cancellation; 14 подмен доказательств отклонены (10 для дат/отмены, 4 для разрыва связи).

Public client code не изменён, поэтому общий suite повторно не запускался.
Hermes, повторный review, mainmerge, deploy и общий plugin не запускались.
Исторические AMBIGUOUS/pending сохранены. Дополнительные ошибки operator scripts
(координаты вне видимого графа; ранний незагруженный cache; hover SVG над портом;
повторный diagnostic ID) не представлены как успешные опыты. Все повторные
подготовки выполнены только после закрытия собственной предыдущей сессии.

## Provenance и воспроизведение

Public runtime pin остался
`7ed94630353fed483f53a029a3aea7828920235879569b83d303510213b3d239`.
Закреплённые SHA frontend повторно совпали до опытов. Manifest
`packages/loginom-runtime/tools/loginom-acceptance/collapse/variant-prototype/hardening-provenance.json`
содержит отдельные SHA reader/decoder/fixture/audit и сохранённых evidence.
Исторический `provenance.json` относится к предыдущему commit и не перезаписан.

Основной аудит:
`python3 packages/loginom-runtime/tools/loginom-acceptance/collapse/variant-prototype/hardening-audit.py
unavailable:artifact-f8586dbe5e80eeae unavailable:artifact-c4efe75611600e43
unavailable:artifact-62351175bcc34784` (аргументы одной командой).

Run `live-1789295519956` сохранён как неуспешная подготовка с координатой вне
экрана; он не входит в положительную приёмку. Raw artifacts остались только
в собственной .dock, без credentials в Git. Все собственные harness/browser
сессии закрыты после выхода/разрыва. Общие hooks, память, plugin и VPS не менялись.

Следующая граница — решение координатора о дальнейшем контракте. Самостоятельного
перехода к публичному exact variant reader, иной RPC или Hermes acceptance нет.
