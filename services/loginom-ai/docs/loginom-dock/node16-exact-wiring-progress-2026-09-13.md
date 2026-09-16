# Узел16: checkpoint подключения exact-full

Назначение `node16:exact-wiring:1:7e1bbab9`. Только собственная ветка/source runtime.
Этап source wiring завершён; узел целиком не объявлен принятым.
Актуальный [итог](node16-exact-wiring-result-2026-09-13.md) заменяет промежуточные статусы ниже.
Ниже сохранена история наблюдений, включая первоначальные отказы.

- Исправлен tag8: `ignoreBOM:true`; U+FEFF сохраняется при декодировании.
- Первый полный native gate: `.dock/node16/live-1789297740900`, таблица15×4,
  все60ячееек при DataTypes-off. Независимый Python audit PASS. Native bytes3600.
  Reexecute отверг старый execution доRPC; смена owner отвергнута доRPC;
  deactivate во времяread отверг весьread после5запросов, все5ответов освобождены.
- Подключены черновые private client modules: provenance из host operations,
  fixed321/interface116 и frontend pins; additive coverage full; строгие native
  cells и реальный compactNodeResult. Обычный sample10 сохранён.
- `.dock/node16/live-1789299090417`: fresh reopen/verified import; все60клеток
  прочитаны, Preview закрыт. Public operation AMBIGUOUS из-за слишком строгого
  сравнения journal acknowledgement со служебными полями. Исправлено сравнение
  phase/operation_id/proof. Старый outcome сохранён, сессия logout/close завершена.
-41focused public/schema/value tests PASS; production reader lifecycle16PASS.
  Общий запуск в sandbox:1400PASS/9FAIL/1SKIP; все9FAIL требуют разрешённого
  локального listen, получен EPERM. Повтор без sandbox пока не выполнен.

Текущая live диагностика empty: `.dock/node16/live-1789299390039`.
Empty public admission пока явно выключен. Следующие gates: empty count/schema,
полный public result, actual MCP/user-v1, save/newsession/reexecute и независимый
аудит; затем общий regression и свежий manifest pins. Hermes/review/merge/plugin/
VPS не запускались. Чужие изменения AGENTS/.gitignore/общих планов не включать.

## Дополнительные подтверждения

Empty gate `.dock/node16/live-1789299390039`: header-only13bytes, две native
RowCount выборки (DataSetForm и DataSourceProxy),0/0/0/0 у controller/table/proxy/store,
полный mapping4fields,0pending; native result0×4 с0RPC. Три loader method SHA
закреплены. Кеш значений/подписки не создаются для0rows; специальный путь требует
fetch-completed metadata, не только исходный0.

Общий regression вне sandbox:1472PASS/1SKIP/0FAIL.
Следующий mixed run `.dock/node16/live-1789299953847` вновь сохранил AMBIGUOUS:
после60cells и закрытияPreview журнал нормализовал origin URL, добавив `/`.
Нормализация доказательства перед записью и проверка actual redacting journal
добавлены;5focused journal/public tests PASS. Последний полный regression
предшествует этой небольшой правке journal acknowledgement.

## ENOSPC / проверка сохранённых доказательств

`live-1789300238439`: public mixed60cells+13negative audit PASS, ignore_empty true
44cells (11×4) PASS, defaultsample10 при15rows PASS, publicempty0×4 PASS.
`package.save_checkpoint` сохранил mixed пакет до этих последующих probe-изменений.
При следующей доставке `node16-wiring-upload-nulls` произошёл ENOSPC до upload,
phase=destination; исходный AMBIGUOUS неизменён. Underlying upload ID отсутствует,
resume implementation требует uploadStarted=true и здесь не применим.
Все1371JSONL records валидны,1272rootJSON валидны; только browser-1256.json пуст
из-за ENOSPC. Файл сохранён как evidence hole; ранее успешные артефакты целы.
Проверка: `.dock/node16/enospc-evidence-integrity.json`.

До ответа координатора очищены только126cache directories закрытых собственных
Chromium profiles,272401205bytes; активный profile и evidence сохранены.
Координатор затем освободил npm download cache, подтвердил7.9GiB свободно и
разрешил продолжить текущее назначение с подтверждённым состоянием или новой
собственной диагностической подготовкой. Дополнительная очистка не выполнялась.
Новая подготовка проверит сохранённый mixed пакет; uncertain nulls delivery
повторять или переобозначать нельзя.

Первое ожидаемое число строк independent ignore audit ошибочно исключало также
пустую строку. Ожидание исправлено по ранее установленному контракту
`collapse-columns-development-2026-09-13.md:55`: empty string/0/false сохраняются,
исключается Null. Live подтверждает15−4=11. Это исправление expected audit,
не изменение поведения продукта.

## Финальная точка возобновления

Verifier PASS:7public cases/244native cells; save/newsession полное равенство.
Финальный client suite1477PASS/0FAIL/1SKIP, focused78PASS. Runtime72c76df421d15424ea3a6ef289a6a1af23566b46a22c5a483bb6aa1c7cd241fc.
Свежая сессия live-1789301001593 открыла сохранённый mixed пакет, подтвердила
тот же импорт и проверила all-null/ignore, затем восстановила mixed результат.
Production stale-source/foreign-owner отклонены доRPC, deactivation отвергла
результат и освободила4/4requests/responses; pending0, publishedfalse.
Браузеры закрыты, собственных PID нет. ENOSPC AMBIGUOUS оставлен неизменным.
Исходники и локальные доказательства закреплены exact-wiring/provenance.json.
Следующий шаг — событие координатору; review/Hermes самостоятельно не запускать.
