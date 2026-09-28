# JavaScript: следующий шаг после source audit D

Дата: 2026-09-28. Решение ROOT в рамках исполнения согласованного plan.md.
Основание: [source audit](native-output-schema-witness-design.md), revision44,
SHA256 `774407b4a13e15eeb9084e7a49f46e86e7353a35d1cd4a69833a604cab8cff32`.
32 referenced hashes независимо проверены; это статическая проверка, не live proof.

## Выбор подхода

1. Продолжать искать реализацию сервера в клиентском JavaScript нецелесообразно:
   getter2351 непрозрачен, конечная inspected closure документирована.
2. Сначала реализовать узкое штатное metadata чтение на контрольном случае,
   проверить actual socket/collection associations; затем добавить code-side telemetry.
   **Выбран этот путь:** он проверяет необходимую часть будущего обработчика и позволяет
   отделить ошибки чтения схемы от поведения непривычных имён.
3. Сразу добавить двухколоночную telemetry можно, но это одновременно меняет схему,
   source и reader. Такой диагностический family остаётся следующим этапом; он не
   подменяет прежние одноколоночные D cases и не закрывает их задним числом.

## Реализация source94: один metadata diagnostic

Новый явно включаемый private diagnostic допускается только вместе с существующим
фиксированным `C-set-index` source и его exact hash. Source93 default behavior и
остальные cases остаются прежними. Это новый эксперимент чтения metadata, не повтор
неясного выполнения и не переоценка прежнего сохранённого report.

После единственного owned completed child и открытия его physical output reader:

- Удержать N/W/D, owner/process/source/Done/session/graph/cookies по прежнему контракту.
- Прочитать штатными selectors только описанный в audit native graph W→N→Component→
  Engine→OutputPorts→Port=P. Проверить socket identity W/P в одной session; не
  сопоставлять порты по имени или одному номеру. Engine port count для этого
  diagnostic ровно1; неподдержанный count/cast/association даёт отказ без fallback.
- Выполнить пять schema selections из audit: P source/target/socket/output;
  D.ColumnDefs; source field; target с mapping Source/SourceIndex; physical field.
  Снять реальные scalar metadata внутри синхронных callbacks. Selected getters вне
  callback не использовать. Зафиксировать counts1, Integer/index0 и реальные связи.
- Один раунд, максимум7 select API operations; только один pending API operation,
  ≤10s на операцию, ≤60s суммарно и не дольше исходного operation deadline.
  Это лимит API calls, не утверждение о равном числе wire RPC. Конкретный descriptor
  tree должен быть сверён с actual PropertySelector API; скрытые дополнительные
  calls/getters, selectAll, dynamic caller paths и UI wizard reopening запрещены.
- Ограничения DTO: Name/DisplayName≤128UTF-16/512UTF-8 каждое, ≤32 held objects,
  сериализованный итог≤16KiB. Это post-decode limits, не гарантия wire allocation cap.
- До/после каждого API проверить owner/process/source/session и существующий cache.
  Результат одного раунда называется point-in-time metadata observation; он не
  доказывает schema continuity, отсутствие ABA или code-generated provenance.

Необходимо отделить завершённый diagnostic от обычной semantic acceptance:
`metadata_observation_complete` описывает только этот раунд; `D_case_complete=false`,
`G5_complete=false`. Даже совпадение Source/Target/physical Name не доказывает, где
произошло переименование. Старый payload reader сохраняет Value/Value/Integer guard;
новый diagnostic не передаёт ему наблюдённое имя как expected name.

## Уточнение review: происхождение загруженных функций

До первого metadata API call нужно проверить реализации новых используемых
`bg.select`, `bg.selectAsync`, `bg.selectRangeAsync` и штатного
`rpc.TBGSession.GetPropertyValues`/`GetPropertyValues$1` по reviewed source.
Существующая проверка native runtime не включает эти функции; сохранение их
references и сравнение с ними же не подтверждает совместимость с reviewed API.

Использовать reflection-only сбор Function.prototype.toString и сравнение хешей
с ожидаемыми, полученными из сохранённых reviewed sources, а не со стенда в момент
проверки. Дополнительно удерживать проверенные function identities в том же
owner/document/session и проверять их перед применением. Это не дополнительный
metadata RPC и не разрешение менять global functions. Замена реализации до
первого запроса должна отклоняться без metadata RPC. Такой отпечаток публичных
функций не доказывает содержимое всех lexical closures — этот предел сохранить
в отчёте. Тесты synthetic transport должны явно отделять эту границу от production
attestation; обход проверок в live mode недопустим.

## Отказ и ресурсы

Не менять глобальные функции Loginom, allocator или buffer Release. Использовать
штатный selector; на успешном пути скопировать DTO до удаления временных descriptors.
Timeout/decode error/смена владельца/неподтверждённый pending переводят capability
в retired. Late completion не публикует DTO и не возвращает capability в active.
Не повторять metadata read, Execute, Apply, Done, Sync или Activate.

При uncertainty интегрировать запрет последующих data/UI действий с существующим
nativeReadUncertain cleanup: закрыть только собственный browser context, сохранить
CLEANUP_UNCONFIRMED, не объявлять logout, отмену на сервере или освобождение всех
внутренних buffers подтверждёнными. При обычном завершении сохранить прежнюю полную
проверку package close/logout/browser close. Исходные evidence не переписывать.

## Проверка и последующий live

Разработчик реализует и локально проверяет source94 в существующем worktree. Нужны
тесты actual production capability: correct ownership/association, mismatch socket,
changed owner/process/session, unsupported cast/count, callback lifetime, deadlines,
late completion, malformed/oversized DTO и отсутствие replay. Проверить интеграцию
uncertainty в реальный cleanup driver. Не писать тесты, лишь повторяющие ожидаемую
реализацию. Сохранить source93 baseline, freeze manifest/import closure и точный handoff.

ROOT независимо проверяет candidate, затем выполняет один fresh headed diagnostic
на закреплённых Ubuntu Node/Chromium в свободной browser lease. Текущий документ
разрешает реализацию, но не утверждает, что она готова или прошла live. На момент
решения браузер закрыт; source94 executable ещё отсутствует.

После observation выбрать следующий реализуемый шаг по фактам: code-side telemetry
с двумя полями (Integer + bounded String JSON) даёт прямое наблюдение metadata API
в коде. Оно не требует выдуманного server implementation proof. Полный public handler,
оба schema modes, lifecycle/persistence, knowledge и CLI acceptance остаются целью.
