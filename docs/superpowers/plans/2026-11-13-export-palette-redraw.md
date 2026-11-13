# Repair первого аналитического эталона

## Результат

Продолжить полный путь A01 после конкретного отказа `Graph changed after palette reveal` перед созданием TextExport. Сохранить исходную неудачную попытку, её pending operation, профиль и удержанный writer. Бюджет A01 остаётся 1/3 использовано, 2 доступны только после проверенного исправления причины.

## Проверяемые шаги

- [x] В существующем VM fixture TextExport воспроизвести перерисовку SVG существующего узла при прокрутке палитры: исходный `mutateGraph` должен отказать до drag.
- [x] После reveal сравнить граф существующим `sameGraph`, разрешив только изменение node drawing epochs, и обновить `gestureBefore`. Сохранить строгую следующую проверку drag, document/root/native graph, owner scroll, canvas bounds и hit-test.
- [x] До drag сверить текущие scale/translate/scroll с исходным `placementNavigation.view`: изменение transform при том же canvas rect должно отказать. Семантическое изменение узла, root/document или links также отказывает до drag.
- [x] Выполнить focused Node tests `text-export-create`, `text-export-palette`, `node-target-viewport`, `node-placement` закреплённым Node. Проверить код независимым SPEC+QUALITY review.
- [ ] Собрать и установить отдельную квалифицированную CLI-поставку штатными build/staging/install средствами от фактически принятой source-базы `29ea34e27b8f96ed27b744f639c9f48933f52443` и только reviewed palette patch, сохранить actual source/runtime/manifest pins. Исходная принятая поставка остаётся отдельной.
- [ ] Использовать чистый отдельный Authoring-контекст с новыми собственными Server/Studio/storage/user/profile и проектным аккаунтом, сохранив старый заблокированный контекст целиком. Провести подготовку/verify штатными средствами, затем A01 attempt2 в исходном общем бюджете. До контрольных запусков закрепить одинаковую исправленную CLI-поставку для D/B Benchmark.

## Проверки и ограничения

Реальный A01 receipt подтверждает отказ после palette scroll и до drag. Конкретный post-palette JSON diff в нём отсутствует. Regression проверяет допустимую перерисовку; установленный новый путь должен отдельно доказать устранение фактического препятствия.

Реальные graph/root/document/link/transform изменения сохраняют отказ. Дополнительные retries, новые универсальные helpers, изменение public schema и ослабление cleanup/ownership guards не входят в repair. Старые failure receipts и budget не переписываются. Холодный повтор, калибровка и контрольные попытки сохраняют прежние критерии.

Существующий CLI не умеет освобождать этот writer: nonce-bound closure завершившегося процесса недоступен, а итоговый cleanup unconfirmed. Прямое удаление writer нарушает контракт. Чистый изолированный контекст использует существующие provision/profile механизмы и сохраняет данные старого. Если потребуется интерактивный вход проектного аккаунта, запросить только его.

Оценка source diff — три файла, около 100–150 строк с тестами и этим планом. Приватные installed/build evidence и новые профили находятся вне Git. План source-правки прошёл независимое review с обязательной защитой transform; установка и возобновление требуют проверки фактической поставки.
