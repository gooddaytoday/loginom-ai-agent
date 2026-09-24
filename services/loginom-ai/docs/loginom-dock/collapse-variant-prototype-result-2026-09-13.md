> Исторический документ, адаптированный для навигации в Loginom AI Agent. Даты, версии, SHA и результаты относятся к прежним проверкам. Пути к коду указаны относительно нового репозитория; это не доказательство проверки текущих файлов. Исходник `source-3489cdfba633` и изменения: [происхождение](../../../../docs/node-development/provenance.json). `unavailable:artifact-*` означает [неперенесённый материал](../../../../docs/node-development/history/unavailable.md). Актуальная работа: [регламент](../../../../docs/node-development/README.md).

# Node16: результат разрешённого variant-прототипа

**Фиксированный метод пригоден как источник typed bytes для проверенных случаев
Loginom7.4.2. Полный variant_io остаётся BLOCKED; reader не интегрирован в продукт.**

Прямое разрешение пользователя в задаче координатора от13сентября:
`node16:variant-prototype:1:direct-user-20260913`. Отдельные test-1 process/profile,
пакет `/test-1/node16-20260913-a56c2488/Node16-variant-prototype.lgp`, скопированный
через штатный UI из собственного диагностического пакета. Native RPC применяется
только внутри `packages/loginom-runtime/tools/loginom-acceptance/collapse/variant-prototype/raw-read.mjs`.
Общий plugin, hooks, память, transport configuration и публичные handlers не менялись.

## Что проверено

| Значения в variant при DataTypes-off | Ответ fixed method321/interface116 |
| --- | --- |
| integer1 / real1.0 / string«1» | соответственно tags20/5/8, независимо от Names/source schema |
| boolean true/false, Null, empty string | tags11/1/8; Null не использует содержимое резервного восьмибайтного слота |
| integer2147483647 и ±9007199254740993 | signed64 bytes, точный decimal через BigInt |
| int64 max9223372036854775807 / min−9223372036854775808 | границы действительно импортированы в integer и сохранены в variant, tag20 |
| real1.2345678901234567, −0, max finite binary64, min subnormal binary64 | tag5, исходные IEEE bytes; −0 сохранён в bytes/representation, JSON number сам знак не сохраняет |
| значение1.0000001192092896, представимое в binary32 | Loginom всё равно вернул tag5/binary64; native real32 этим не доказан |
| datetime29.02.2024 23:59:58.123 | tag7, OADate45351.99997827546, bytesLE ba70d2ffff24e640; ms совпадают с Date в собственном Preview |

Datetime семантика подтверждена для этого случая в Europe/Moscow: SysUtils.js
FromOADate округляет `(oa−25569)×86400000` до ms, затем AddBias создаёт локальную
дату из полученных UTC-компонентов. В tagged payload timezone/offset отсутствует;
это локальное гражданское время, не доказанный UTC timestamp. UI epoch1709240398123,
local[2024,2,29,23,59,58,123],offset−180. DST gaps/folds, другие зоны и исторические
диапазоны не проверены; общий decoder честно сохраняет temporal_semantics:unverified.

Проверены15variant-значений смешанного набора и8значений набора numeric bounds.
Финальный decoder повторно прочитал все23сохранённых payload без расхождений.
Всего exploratory и final версии отправили54одиночных fixed reads в пределах
15×5 и8×4 таблиц; ни один выбор не превышал50строк×8столбцов. Чтения через
другие native методы, QueryInterface/GetValues/getters не выполнялись прототипом.
Обычная подготовка/выполнение/Preview продолжали использовать штатный Loginom UI.

## Привязка и формат

До чтения подтверждены completed public execution и актуальный native process
root/group/owned child. Проверяются prepared document/workflow/tab/package,
Preview node/port/index, одна и та же datasource reference у controller/table/store,
interface116 и фиксированные remote owner/object IDs, schema/count/bounds,
node/port active и loaded cache. До/после каждого response заново сравниваются
эти references, полный process fingerprint и cache object; появление нового
выполнения/сброса cache останавливает операцию.

Cookie objects helper-а оказались подписками, а не счётчиками ревизии. Они не
выдаются за версии. Наблюдаемый helper ClearCache удаляет cache и сбрасывает
инициализацию при штатных data/state events; новых подписок прототип не создаёт.
Это проверки локальной наблюдаемой свежести, не серверная транзакционная блокировка
или snapshot token. Не наблюдаемая UI конкурентная мутация не покрыта отдельным
стресс-тестом и не должна объявляться исключённой. Отмена зависшего вызова
и обрыв связи live не проверены; внешний timeout сам по себе не доказывает
остановку native операции. Это дополнительная граница будущей интеграции.

Скопирована только конструкция fixed request321: Row int64/Col int32. Ответ
получается до ReadVariant, canRaiseExceptions=false запрещает unmarshalling
exception object через другую remote interface. Message ID сверяется; буферы
освобождаются локально. Ни global interception, ни proxy override не установлены.

Первый ответ имел48dynamic bytes вместо10байт variant. Дополнительные чтения
были приостановлены до разбора: rpc.js:3480–3487 и constants7279/7291 задают
минимум60байт transport frame; ReadVariant занимает2+8байт и дополнительную
строку для tag8. Дополнение не трактуется как данные, нулевым не предполагается.
Финальный decoder требует точный `max(60,12+logical_payload_size)`, отказывает
лишней длине/обрезке, unknown/interface tags, NaN/Infinity и неизвестной
кодировке. Для непустой строки допущен только подтверждённый UTF-8.

## Проверки и сохранённые ограничения

- 12направленных tests PASS: signed32/64, real32/64/−0, строка/Null/boolean/date,
  malformed payload, fixed method, cleanup, отказ при cache/new execution/stale reply.
  Post-response fault cases смоделированы локально, не выданы за live инъекцию.
- 16live подмен owner/port/index/datasource/workflow/document/execution/schema/
  bounds/method/interface отклонены до RPC: message counter1119→1119.
- После реального нового выполнения того же узла старый execution ID отвергнут:
  stale execution, message counter2777→2777.
- Независимый Python audit читает bytes через struct, проверяет23значения и
  local datetime, отклоняет8подмен; observed_cases PASS, full_variant_acceptance BLOCKED.
- Реальный tag4/real32 и tag3/int32 не получены; проверены только synthetic frames.
  Numeric corpus платформы в этом опыте возвращает real64/integer64.
- Полный UI caller-chain для пассивного перехвата не объявлен доказанным.
  Видимый AsVariant wrapper использует cached helper; разрешённый прототип
  намеренно отправляет321 напрямую. Другой путь не включён.
- Начальные ошибки диагностических scripts (устаревший TF-1 после Save As,
  sample_rows20 при публичном лимите10) сохранены; RPC в них не выполнялся.
  Все прежние FAIL/pending других фаз также сохранены неизменными.

## Provenance и возобновление

Run-dir `unavailable:artifact-804b907c92deb25b`, source-runtime pin
`7ed94630353fed483f53a029a3aea7828920235879569b83d303510213b3d239`.
Этот pin относится к public UI harness; отдельные prototype file SHA и exact
frontend SHA находятся в `packages/loginom-runtime/tools/loginom-acceptance/collapse/variant-prototype/provenance.json`.
Три обязательных frontend SHA совпали с исходным планом; SysUtils.js и
BitConverter.js дополнительно закреплены для проверки date/int64 semantics.
После live были только сужены string codepages до UTF-8; final decoder replay23PASS.

Основные artifacts: prototype-execution-valid, prototype-binding-complete,
prototype-complete-15, prototype-collapse-bounds, prototype-binding-bounds,
prototype-bounds-raw, prototype-date-cache, prototype-negative-bindings,
prototype-reexecution, prototype-stale-after-reexecution, prototype-save,
prototype-final-logout. Raw данные хранятся только в собственной .dock.

Пакет сохранён public save_checkpoint в собственную копию; повторная persistence
приёмка прототипа не заявлена. Logout подтверждён, browser/process закрыты.
Общие client tests не повторялись: public code не менялся, проверялся изолированный
prototype. Hermes/review/release не запускались. Следующее решение — оценка этих
границ и отдельное согласование возможной интеграции; автоматического перехода нет.


Последующее разрешённое исследование lifecycle/DST/разрыва связи описано отдельно:
[variant hardening](collapse-variant-hardening-result-2026-09-13.md).
Исторические непройденные проверки выше относятся к исходному run, а не к
последующему hardening; full variant по-прежнему BLOCKED.
