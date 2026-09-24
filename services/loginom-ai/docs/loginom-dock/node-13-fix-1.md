> Исторический документ, адаптированный для навигации в Loginom AI Agent. Даты, версии, SHA и результаты относятся к прежним проверкам. Пути к коду указаны относительно нового репозитория; это не доказательство проверки текущих файлов. Исходник `source-133d74687f74` и изменения: [происхождение](../../../../docs/node-development/provenance.json). `unavailable:artifact-*` означает [неперенесённый материал](../../../../docs/node-development/history/unavailable.md). Актуальная работа: [регламент](../../../../docs/node-development/README.md).

# Узел 13: единственный раунд доработки после ревью

Команда: `node13:fix:1:4d6f632e61b7a183fb63bb090e93ab3e29bf52a5:N13-R3`.
Ветка `codex/node-13-date-time`, исходный report-only HEAD
`d316b2f41bb444825a1009cf4b2905d1dcff914b`. Дата: 2026-09-13.

Итог: N13-R3 закрыто. Исправленный независимый аудитор прошёл позитивный live
mapping, 89 отрицательных проверок и свежий save/reopen/execute: все значения
4×27 и сохранение настроек подтверждены. Ревью повторно не запускалось.

| Замечание | Статус | Основание |
| --- | --- | --- |
| N13-R3 | closed | Независимый baseline до редактирования, сравнение всех requested name/label/excluded; live positive, 89/89 negatives, fresh 4×27 и strict persistence PASS |
| N13-R1 | dependency, открыто | Нужна configure recovery исходного ID; владелец общей части 14, интеграции нет |
| N13-R2 | dependency; live Date/time unconfirmed | Общий terminal-failure source/model finding; интеграции и живой проверки Date/time нет |

## Изменение аудитора

`date_time_output_evidence.py` берёт первое полное наблюдение отдельного
выходного порта внутри фазы output_mapping, с точным document/workflow/node и
port 0. Это состояние предшествует редактированию выходных полей. В нём
сохранены имена и метки существующих вычисленных и сквозных столбцов.

Expected строится из этого baseline, независимо восстановленного происхождения
вычислений и запроса. Ссылка configured_field разрешается до переименования.
Для каждого поля проверяются source identity, name, label, type и excluded;
порядок и полный охват также обязательны. Из финального actual имена/метки для
expected не копируются. При native exclusion сервисная метка равна имени
источника; требование пользователя к исходной метке сверяется отдельно.

Проверены параметры={}, отсутствие output mapping, переименование сохранённого
computed и сквозных полей, назначение имени в parameters перед output override,
повторные/чужие ссылки, неполный набор, изменение source и исключения.
`date_time_negative.py` добавляет подмены только requested name/label/excluded
для каждого поля полного output mapping, учитывая сохранённое excluded при
отсутствии явного значения в запросе. Эти подмены — тест аудитора, **не ошибка Loginom**.

## Живое подтверждение и pins

Loginom 7.4.2, test-3, /test-3; отдельные профили, viewport=null,
inner 1508×862/outer 1508×949. Собственный source harness, публичный MCP dispatcher.
Клиентские исходники не менялись в fix round; обе новые сессии закрепили
runtime `dd0979bf175bd4164ab0d0647daecd69782b1c8ab0d10b2e690d313b9704b6d0`.
Python audit pins записаны отдельно в `unavailable:artifact-d66253ffc41189d8`.
Сводный SHA256 отсортированных строк `filename:sha256\n` восьми audit-файлов:
`af91c8bfa81dbe051550f7dc01021a5f580d6220907b0c8627d322b50b61c35a`.
Использован прежний immutable диагностический каталог
`2026.09.11-parallel-pilot.1-candidate`, manifest SHA256
`4ac827fc9e0cefa609bf2cb8fd7d3d79318dd3fe92999decc7e385fae51fc6e2`;
это не новый admission. archiveActive=false.

1. Сессия `dcb8e87c-e32f-4030-b2a7-e3026f74494a`: fresh base-open
   `/test-3/N13-f7cf52c5.lgp`, собственная копия `/test-3/N13-dcb8e87c.lgp`.
   В живом выходном порту подтверждены все28 определений (27 активных + DateB
   excluded), имена/метки/типы/excluded совпали с исходным fcccbde6
   `node13-layout-fixed`. Наблюдения `r3-observe-output.json`,
   `r3-read-bindings.json`, сравнение `r3-original-mapping-comparison.json`.
   Порт закрыт без применения. После Close обычный выбор узла восстановил
   отрисовку портов; неудачное чтение графа произошло до public node.apply,
   повторного неопределённого жеста не было.
2. `node13-r3-positive`: parameters={}, input/output autosync=false;
   Id→RowId/«Идентификатор строки», Amount→SalesAmount/«Сумма продаж»,
   A_year→SavedYearA/«Год сохранённой даты A». Остальные поля сохранены,
   DateB excluded. Public SUCCEEDED, независимый configuration audit PASS,
   **89/89** negatives PASS (включая три свойства всех 28 полей).
3. Public `node13-r3-save` SUCCEEDED; первая сессия закрыта, harness exit0.
   Новая сессия `cef3cdde-a539-4500-bc4a-b671e4ba7ac4` открыла точно этот
   сохранённый пакет и собственную копию `/test-3/N13-cef3cdde.lgp`.
   `node13-r3-full-reopen` выполнен с parameters={}, mappings=[], без
   переустановки сохранённых параметров: public SUCCEEDED; независимые raw,
   configuration и values audits PASS, полный непустой выход **4×27**. Все 12
   операций по обоим полям дат проверены, включая границы периодов и NULL.
   Strict persistence audit dcb→cef PASS: package_persistence_verified=true.
   Дополнительные 8/8 отрицательных проверок свежего выхода PASS.

Логи fix round: `unavailable:artifact-b5204b73f32452dc`,
`positive-negative.json`, `full-reopen-audit.json`, `full-persistence.json`,
`full-negative.json`, `historical-audit-regression.json`, `python-tests.log`.
SDK strict schema проверила **180** публичных ответов двух новых сессий без ошибок
(`public-schema.json`). Все восемь audit pins повторно сверены после проверок.
Операционный raw audit сам не заявляет persistence; его отдельно подтверждает
указанная проверка save/reopen/execute.
Unit tests: **519 PASS**, в том числе 8 новых тестов независимого output verifier.
Старые 4×27/0×6 журналы повторно прошли исправленный аудитор; подменённые labels
Id, Amount и A_year в старом запросе теперь дают FAIL. Это не новые live исполнения.

## Контракт расширения configure recovery для владельца общей части 14

Это описание требуемой точки расширения, **не реализованный recovery API**.
Оно дополняет общий inspect/resume; input_mapping continuation не закрывает configure.

- Вход сверки: исходный operation_id/handler revision/signature и pending
  configure, внутренний ID жеста, его исходная квитанция и подписанные
  observations; точные document/workflow/node, активный wizard/его стадия,
  выбранное поле и native record ID. Исходный пакет должен оставаться открыт.
- Для Date/time требуется полная матрица 29 строк каждого поля: func/ISO,
  first/last/number/string и StringFmt. Восстановить исходный план и уже
  принятые шаги; на месте потерянного ответа проверить именно ожидаемое
  изменение одной ячейки и отсутствие посторонних изменений. Count не является
  подтверждением: native может оставить его устаревшим.
- Исторической квитанции SUCCEEDED недостаточно без живого owner/matrix и
  подтверждённого cleanup. При отсутствующем/чужом/изменённом черновике,
  незавершённом browser receipt или иной матрице — безопасный отказ, не
  исправление догадкой. Не сбрасывать pending и не повторять неопределённый click.
- Подходящая точка — фазовый verifier общего nodeApplyDrivers/inspectApply с
  Date/time-specific проверкой матрицы. Точное имя интерфейса согласует владелец узла 14.
  Верификатор не должен вызывать обычный configure с начала. Продолжение
  принимает исходную квитанцию ровно один раз, сохраняет её в том же журнале,
  затем выполняет только ещё не подтверждённую часть исходного плана в рамках
  того же operation_id, исходных deadlines и recovery budget.
- Фазу configure нельзя объявлять завершённой после одного флага: остаются
  другие поля, Next, возможная inline output mapping и проверка валидации.
  После полного восстановления нужно восстановить также driver-local
  `configured`/preconfiguration и данные для последующих output mapping и
  readback. Иначе снятие pending оставит следующие фазы без конфигурации.
- Приёмка расширения: настоящий потерянный ответ после click, inspect и resume
  того же ID, отсутствие повторного переключения, точные оставшиеся шаги и
  полный результат. Отдельные негативные варианты — иной node/document/field,
  посторонняя матрица, несовпадающая квитанция и утраченный черновик.

R2 остаётся source/model finding: требуется интегрировать общий terminal failure
receipt/cleanup и живо проверить Date/time. Новая операция или ручная отмена не
являются доказательством recovery исходной. Ни R1, ни R2 здесь не закрываются.

Hermes, stage каталога, cherry-pick/merge, push/deploy и общий плагин не запускались.

Обе собственные live-сессии fix round закрыты, harness exit 0. Финальная
диагностическая копия cef3cdde закрыта без сохранения повторного выполнения;
сохранённый baseline `/test-3/N13-dcb8e87c.lgp` не изменялся.
