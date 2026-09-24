> Исторический документ, адаптированный для навигации в Loginom AI Agent. Даты, версии, SHA и результаты относятся к прежним проверкам. Пути к коду указаны относительно нового репозитория; это не доказательство проверки текущих файлов. Исходник `source-f0241323fdf3` и изменения: [происхождение](../../../../docs/node-development/provenance.json). `unavailable:artifact-*` означает [неперенесённый материал](../../../../docs/node-development/history/unavailable.md). Актуальная работа: [регламент](../../../../docs/node-development/README.md).

# Node16: смена файла существующего импорта

Статус: **целевое исправление проверено; Node16 не принят**.
Source `8cd5c2811a216b45ae50a16a4ed1930e4e87fa59`, runtime
`17b0ede0035452a2e9481a3ba007b97a8d1b1b47fdd13ffd4e9153b90dc8daed`.

Четвёртый Hermes run `20260913-234616-4ac1a433` завершился exit=0, но full audit
остался FAIL. Экспорт содержит 64 calls и 5110 events. Пять канонических случаев
прошли; на existing `import-mapped` выполнение остановилось с
`AMBIGUOUS/configure: Patch column is absent from the parsed source: Zone`.
Исходные request/scenario/evidence/audit неизменны; SHA256 повторно сверены и
сохранены в соседнем JSON. Слот освобождён координатором и передан Node17.
Новый Hermes не запускался, повторного полного review не было.

## Причина и исправление

В отдельной собственной копии пакета, Loginom 7.4.2 / ru / test-1, воспроизведено:
путь all-null.csv меняется на mapped.csv, строки нового файла загружаются,
но при выключенном автоопределении остаются шесть прежних определений столбцов.
Повторные чтения не добавляют Zone. Штатная кнопка «Обновить все» перестраивает
семь определений. Это подтверждено видимым UI, E2E
`bg/sels/import/sColumnDefsTuning.ts: toolbar.RefreshAll` и
[официальной справкой импорта](https://help.loginom.ru/userguide/integration/import/txt/index.html).
Исходная диагностическая сессия `unavailable:artifact-eefe805efb170914`, снимки
`source-change-visible.png` и `source-change-after-refresh.png` сохранены.

Теперь только при фактической смене пути существующего источника обработчик
после настройки формата нажимает точную кнопку владельца и читает полную новую
схему. Он проверяет неизменность параметров разбора и восстанавливает настройки
сохранившихся полей по именам. При том же пути, включая пустой patch, обновление
не выполняется. Для новых полей по-прежнему обязательны name/label/type/data_kind/used.
В положительной диагностике Zone получил явный data_kind; исходный запрос модели
его не содержал. Успешное выполнение исходного запроса без этой поправки не заявляется.

## Свежая проверка исправления

Сессия `unavailable:artifact-9d4cd0f11b0e9c17` запущена на новом runtime, с видимым
максимизированным окном и viewport=null. Исходные пакеты модели не изменялись.

- Existing import all-null → mapped: SUCCEEDED; определения Zone,S,Id,D,B,R,I,
  типы сохранены, у S/I одинаковая метка «Общий». Output mapping синхронизирован
  на семь полей; источник выполнен, прочитаны три строки.
- Старый Collapse сохранил собственные шесть входных полей и правильно отказал
  при запросе Zone до изменений. Это не скрыто под upstream schema fallback.
- В собственной копии создан новый Collapse с семью входными полями: full output
  15 × 5 = **75 ячеек**, замороженный oracle mapped дал CASE_PASS. Проекция raw
  результата для oracle диагностическая, не доказательство actual user-v1 MCP.
- `package.save_checkpoint` сохранил
  `/test-1/node16-20260913-a56c2488/Node16-source-fixed-complete-20260914-4ac1a433.lgp`:
  save_completed=true, workflow_preserved=true, reopened=false.
  Независимая проверка содержимого после повторного открытия здесь не выполнялась.
- Менеджеры upload/download пусты, logout=true; обе собственные диагностические
  сессии закрыты, отсутствие их процессов проверено.

Восемь новых тестов смены источника прошли; полный клиентский набор:
**1533 PASS / 1 SKIP / 0 FAIL**. Production diff ограничен одним обработчиком.

## Проверяющий скрипт и будущий запуск

Первичный upload AMBIGUOUS/UPLOAD_SERVER_VERIFICATION_REQUIRED в пяти доставках
этого run завершился проверкой скачанных байтов, transfer_completed SUCCEEDED
и успешным публичным ответом. Future auditor принимает только такую полностью
связанную цепочку: параметры/grant/artifact, размер/digest/путь, native download,
порядок событий, session/runtime/manifest, terminal public result. User-v1 проекция
сравнивается с исходным journal; настоящий AMBIGUOUS импорта по-прежнему отклоняется.
Две проверки на неизменном export прошли, включая 20 отрицательных подмен.
Ещё 5 методов future auditor / 28 подмен и 14 runner/admission проверок прошли.
Исходный full audit не переписан и не переобозначен как PASS.

Шесть package.save_as исходного run отмечены как поведение модели, без заявления
о дефекте сохранения. Будущее задание явно требует обычный save_checkpoint,
полное описание новых полей и отдельную пару Import → Collapse для разных CSV.
Исходные frozen goal/fixtures/case oracle не изменены; scope остаётся 10 случаев,
470 ячеек, Done/Close, negatives, fresh persistence и current-run loss.

## Передача координатору

Минимальный пакет `unavailable:artifact-0471a4bd6724427e`: 184 файла, 1 958 721 байт;
каждая запись tar сверена с manifest. От candidate-b0709ec0 изменены один
production-файл и ранее закоммиченный план `16-collapse-columns.md`.
Четыре разрешённых служебных файла остались прежними; новые verifier-файлы
остаются локальными. Credentials, приватные конфиги, `.dock` и тесты не включены.

- Manifest SHA256: `f434cf802b196b0939bc93e6d5b7208be6f183cbd6624e59851889981333e3e7`.
- Tar SHA256: `51ed89fd470839c6931c49f17a2f22a52f1b9249c09821f7e814a61b23a12cb2`.
- Harness: 272 inputs, manifest SHA256
  `bb80a1a432c99aaede5818e21ef12ee0a1fadc9288a05d9ad60e42e84f7d28f6`.

Нужны новый candidate stage/readback, свежий actual user-v1 rehearsal и новый
эксклюзивный слот перед моделью. Admission сейчас BLOCKED: старый candidate3
не соответствует новому source. Затем необходимы полный модельный goal,
десять независимых свежих открытий и current-run loss audit. Main, сервер и
общий установленный plugin в этом этапе не менялись.

## Candidate4: допуск к пятому полному запуску

Координатор выдал phase `node16:hermes-full:5:8cd5c281`, слот
`node16-hermes-20260914-0badbd69`, candidate SHA256
`0badbd69238af677d85da3ac9bc8a52fc889f303fcdd8c06bb75ff8773ee5514`.
Свежий actual MCP private user-v1/executor-replay rehearsal
`unavailable:artifact-23cfadba2de61a19`, session
`ba858355-4955-4445-b1e3-9e71ce9b9f1d`: READY7.4.2, точные runtime/manifest/
action/selectors и разрешённый storage root подтверждены. Окно1508×862,
outer1508×949 при available1512×949, viewport=null/start-maximized.
Bridge/browser закрыты; отсутствие процессов этой сессии проверено.
Обновлены stage/admission/harness pins. Production source8cd5c281 неизменен.
