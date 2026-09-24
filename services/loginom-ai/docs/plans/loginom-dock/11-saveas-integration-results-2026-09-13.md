> Исторический документ, адаптированный для навигации в Loginom AI Agent. Даты, версии, SHA и результаты относятся к прежним проверкам. Пути к коду указаны относительно нового репозитория; это не доказательство проверки текущих файлов. Исходник `source-6ad5c4e51b14` и изменения: [происхождение](../../../../../docs/node-development/provenance.json). `unavailable:artifact-*` означает [неперенесённый материал](../../../../../docs/node-development/history/unavailable.md). Актуальная работа: [регламент](../../../../../docs/node-development/README.md).

# Узел11: Save As интегрирован и проверен

Статус: **integration_complete_focused_pass / awaiting_coordinator**.
Команда `node11:saveas-integration:1:direct-user-20260913` выполнена на основании
прямого разрешения пользователя на пакет `55ccc7b6`.
Клиентский коммит: `b05715340937f9c828e03bc6ec7a88f3adf086da`.
Полная автономная приёмка узла11 остаётся непройденной; исходный **FAIL55/59** сохранён.

## Что перенесено

Из `0e11a3fb24ca40a9f855008d2b0d1856d6f771ad` перенесены ровно:

- Единственный hunk `packages/loginom-runtime/client/lib/executor.mjs`: ожидание завершения native Save As,
  проверка ошибки и `save_flow_completed` перенесены перед `if (keepOpen)`.
- Один overwrite race test в `packages/loginom-runtime/client/test/executor.test.mjs`, добавленный отдельно
  после проверки известного различия EOF-контекста.

Исходные целевые blobs совпали с согласованным пакетом. Runtime hunk совпал с
исходным diff, кроме закономерно отличающихся blob IDs в заголовке; тело нового
теста совпало буквально, прежние тесты не изменились. Полного cherry-pick,
semicolon-label изменений, пяти аудиторов12 и других runtime-исправлений нет.

## Проверки

**38/38 executor tests PASS** явным Node24.19.0, включая перенесённую гонку,
keepOpen, конфликт файла, точность пути/графа и delayed Open. Полный набор клиента,
полное ревью и принятые A1–A3 повторно не запускались.

Перед переносом в отдельном своём браузере проверены текущие команды меню пакета
и реальная геометрия. Основной smoke проведён уже на исправленном runtime:

- Loginom7.4.2, учётная запись/storage `test-2`/`/test-2`.
- Сессия `b66417e1-30c2-4e8b-bf97-6a102ad05677`, adapter `node11-saveas-integration`.
- Отдельный profile; viewport=null, страница1508×862, окно1508×949,
  доступный экран1512×949; размеры измерены в собственной странице.
- Уникальный CSV124 bytes, SHA
  `0e0151318f8307267dc1ed61b396c869303331dc8f1831cac8b7b5a73d2e2e4b`,
  доставлен и проверен через artifact API.
- Новый пакет Main→Typed, два узла и одна связь. Typed настроен по неизменённым
  `parameters-multi.json`/`expected-multi.json`: весь результат6×11.
- Путь: `/test-2/packages/Node11-saveas-integration-b66417e1-30c2-4e8b-bf97-6a102ad05677.lgp`.

Checkpoint `integration-checkpoint` завершился SUCCEEDED, пакет остался открытым,
`reopened:false`, точный path/graph подтверждён. Следующая отдельная операция
`integration-overwrite-reopen` действительно перезаписала этот же файл и прошла:

`overwrite_confirmed` → `save_flow_completed` → `saved_package_closed` →
`package_open_command_ready` → `reopened_package_observed` → `postcondition_verified`.

Результат SUCCEEDED/reopened:true. Native tab сменился с `tb-1` на `tb-4`,
workflow ID изменился, document/node IDs сохранились. Повторная подготовка
подтвердила именно сохранённый путь и persisted package; нового черновика не создала.
Main и Typed выполнены вновь. Для Typed переданы пустые parameters/mappings/inputs,
его configure receipt имеет effect_possible:false; полные настройки до/после совпали.

**Независимый component audit: 10/10 PASS**:
Typed до/после, двухэтапная save chain нового пакета, повторный Main, настройки,
свежесть выполнения, identity после reopening, native порядок событий,
runtime/session/catalog binding и две публичные операции сохранения.
Использованы существующие `replacement_evidence_audit`, `verify_save_chain`,
`_verify_existing_import_output` и прямое сравнение настроек/identity/событий.
Это focused Codex diagnostic, не допуск полного Hermes goal11.

### Уточнения диагностического пути

Первый вызов повторного Main с parameters={} был отклонён до браузерных действий:
`Exact import source and settings required`. Исходный отклонённый request сохранён.
Повторный вызов использовал обязательные прежние source/settings без изменения
значений; existing import handler прошёл через свой мастер. Обход мастера импорта
не внедрялся. Это отличается от Typed, для которого настройки вообще не передавались
и изменение правил не выполнялось. Проверка Main подтвердила прежний источник и выход.

При финальном закрытии после выполнения Loginom запросил сохранение изменений.
Старый диагностический helper ожидал Home и получил timeout; затем прочитан
фактический вопрос именно о нашем пакете. Штатно выбран «Не сохранять», чтобы
не переписывать уже проверенный файл: graphCount=0, закрытая вкладка отсутствует,
осталась только собственная страница файлов test-2. Browser/bridge завершились с0;
проверка процессов обоих собственных профилей вернула пустой список.
Принудительного unlock, действий в соседних браузерах или старом acceptance-пакете нет.

## Pins и готовность к новому candidate

- Source commit: `b05715340937f9c828e03bc6ec7a88f3adf086da`.
- Runtime: `8d6d4b3cd7f5d19a3ac1e9ac6537ff8219f97f9898326227df3f3ae55dcb1380`.
- Goal SHA не изменён: `d283e683fe61298a9273365ca485d63e16fb582d08b45d42dfefb70c65952a9c`.
- Harness input-map SHA: `427cf196518020fed8be9f72076e76cdca61bc498763e1e0f32a2fe9e0c98b0b`.
- Архив `unavailable:artifact-6d1689c6c531187b`,
  **392 файла / 1 020 063 байта**, SHA
  `396026de516792499c9d21f00981ea0044d9d47fced7f052b65c307150ebbf50`.
  Байты и inventory проверены, исходники совпали с source commit; capability ABI
  и файлы для сборки каталога включены штатным packager.

Launch pins и `replacement-stage-vps.sh` обновлены под этот source/archive.
Прежний комплект `7de7f23e` сохранён как история и для следующей сборки устарел.
Предложенный URI остаётся
`viking://resources/loginom-dock/catalogs/executor-preview/releases/2026.09.13-node11.2-candidate/manifest.json`;
новый manifest SHA неизвестен, stage/readback не выполнялся.

Живой smoke использовал source runtime и ранее проверенный диагностический catalog
node11.1 (`28434c4b…`), обе save revisions2. Это не проверка новой серверной сборки.
Теперь необходимы разрешённая координатором VPS-сборка, stage/readback и новый
candidate pin; старый pin launch gate отклонил. Hermes11 не запускался, слот остаётся
у14. Current/activation, shared plugin, main, push, memory routing не изменялись.

Все восемь хешей опубликованных артефактов первоначального FAIL и все артефакты
принятого A1–A3 follow-up сверены и остались прежними. Новых полных аудитов не было.
[Машинный отчёт, hashes и пути evidence](../../loginom-dock/replacement-saveas-integration-2026-09-13.json).
