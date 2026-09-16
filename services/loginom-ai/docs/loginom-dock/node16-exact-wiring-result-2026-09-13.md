# Узел 16: ограниченное exact-full чтение подключено

Дата: 13 сентября 2026. Назначение `node16:exact-wiring:1:7e1bbab9`.
Ветка `codex/node-16-collapse-columns`; исходная база
`7e1bbab9acf6361bf2efd5d399080b5e251b8b30`.

Этап подключения к исходникам завершён. Полная автономная приёмка узла и подплана
не объявлена. Проверенная runtime revision:
`72c76df421d15424ea3a6ef289a6a1af23566b46a22c5a483bb6aa1c7cd241fc`.

## Что изменилось

`read.coverage=full` у выполненной Свёртки на порту 0 возвращает всю таблицу
до 50 строк и 8 столбцов либо явный отказ. Обычный sample сохраняет прежний путь.
Допуск строится из закрытой истории выполнения импорта, проверенного файла и
фактических связей текущего графа. Пользовательские флаги не заменяют provenance.
Поддержан только проверенный собственный статический текстовый импорт и одна
Свёртка; неизвестные, дополнительные и динамические источники отвергаются.

Native reader использует fixed method 321/interface 116, закреплённые frontend
scripts и count-loader methods. Перед запросами и публикацией проверяются
документ, workflow, источник и execution, owner/port, схема, число строк и кеш.
Для пустого результата отдельно подтверждены завершённые native count/schema
пути: полная схема сохраняется, запросов значений нет.

Строгий контракт разделяет тип столбца и native тип ячейки, coverage, binding,
precision и consistency. Поддержаны tags 1/5/7/8/11/20. Int64 и binary64 передаются
строками с native bytes, включая значения вне 2^53 и −0. Для tag 8 исправлено
сохранение U+FEFF. Даты имеют только `native_serial_only`: эпоха, timezone и
гражданское время не выводятся из неподтверждённых предположений.

Реальные compactNodeResult и MCP serializer сохраняют exact_table целиком.
Ограничен как накопительный native buffer, так и весь сериализованный MCP reply
(1 MiB); превышение приводит к отказу без усечения. Исправлена проверка journal
acknowledgement с учётом нормализации origin URL настоящим redacting journal.

## Проверено

- Полный client regression: **1477 PASS, 0 FAIL, 1 SKIP**. Первые 9 sandbox
  failures были EPERM локального listen; разрешённый повтор прошёл.
- Финальные focused tests: **78 PASS**. Проверены schema/compactor/serialization,
  provenance, BOM, native decoding, lifecycle, deadline/cancel и journal.
- Независимый Python verifier: **7 public cases, 244 native cells, PASS**.
  Mixed — 15×4, ignore-empty — 11×4, empty — 0×4, reopened mixed — 15×4,
  all-null — 5×4, all-null-ignore — 0×4, restored mixed — 15×4.
  13 видов подмен доказательств отвергнуты независимым mixed audit.
- Сохранение через package.save_checkpoint, новый браузерный документ, повторное
  открытие того же пакета и выполнение сохранили все 60 ячеек, полную схему,
  настройки импорта, роли и mappings Свёртки. IDs чтения/выполнения обновились.
- Default sample: 10 из 15 строк, без exact_table и без ложной native precision.
- Production native negatives: stale source execution и чужой Preview owner
  отвергнуты до RPC; деактивация во время чтения отвергла весь результат.
  Все 4 начатых запроса/ответа освобождены, pending=0, published=false.
- Все собственные диагностические браузеры/MCP закрыты; оставшихся PID нет.

Live проводился в Loginom под `test-1`, в собственном хранилище.
Сохранённый пакет: `/test-1/node16-20260913-a56c2488/Node16-exact-wiring.lgp`.
MCP проверен через SDK InMemoryTransport operator harness, использующий общий
production serializer и настоящий user-v1 compactor. Это не проверка установленного
плагина или развёрнутого сетевого bridge.

## Доказательства и воспроизведение

[Манифест](../../tools/loginom-acceptance/collapse/exact-wiring/provenance.json)
закрепляет 166 runtime source files, 65 evidence files, аудиторы, тесты и harness.
[Машинный итог](node16-exact-wiring-2026-09-13.json).
Проверка: `python3 tools/loginom-acceptance/collapse/exact-wiring/verify.py`.
Команда не запускает браузер или модель; локальные доказательства находятся
в `.dock/node16` и не включены в Git. Для воспроизведения проверки нужны эти файлы.
Исторические manifests сохранены; изменённые prototype sources закреплены новым
манифестом. Исторический replay требует соответствующих исторических исходников.

## Сохранённые инциденты и ограничения

Два ранних public outcome остались AMBIGUOUS из-за journal acknowledgement;
они не переименованы в успех. ENOSPC прервал отдельную доставку
`node16-wiring-upload-nulls` в phase=destination. Исходная неопределённая операция
не повторялась и не переобозначалась; пустой browser-1256.json сохранён как пробел
доказательств. Ранее успешные артефакты проверены. После освобождения места
координатором выполнена новая разрешённая диагностическая подготовка; all-null
использовал другой fixture. Подробности и объём очистки собственных закрытых
Chromium caches сохранены в [checkpoint](node16-exact-wiring-progress-2026-09-13.md).
Дополнительная очистка после указания координатора не проводилась.

Первое ожидание ignore-empty audit ошибочно исключало пустую строку. Исправлено
ожидание по ранее установленному контракту: исключается Null; empty string, 0 и
false сохраняются. Runtime поведение для этого не менялось.

Серверные atomic snapshot, устранение ABA и гарантированная отмена серверного
вычисления не обещаются. Проверенные guards и локальное retirement предотвращают
публикацию обнаруженно устаревшего/неполного чтения; transport uncertainty сохраняется.
Входные variant-поля и общий динамический граф остаются вне этого этапа.
Hermes, повторное review, merge, push, deploy, shared plugin и VPS не запускались.
Следующий этап определяется координатором; Hermes требует отдельного слота.
