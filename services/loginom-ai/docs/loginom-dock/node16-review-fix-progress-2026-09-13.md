# Node16: correction R16-1–3 — checkpoint

Назначение `node16:review-fix:1:6d086da4:R16-1-3`, reviewed HEAD
`6d086da4be8439679ae351ce2a25c57cca42c19f`. Один correction round, без нового full review.

- R16-1 live подтверждён на отдельной копии
  `/test-1/node16-20260913-a56c2488/Node16-review-fix-20260913.lgp`:
  `.dock/node16/live-1789303045205/fix-reproduce-upload.json`. A SHA9aac…,
  B SHA76da… по одному новому собственному пути. Старые import/exact SUCCEEDED
  возвратили9007199254740995 изB при source proofA.
- R16-2 отражены реальные53critical functions,8constants и session/socket объекты.
  Controlled wrapper на собственной странице отклонён доRPC1224→1224,
  восстановленные53functions проверены. Сервер/frontend/чужие страницы не менялись.
  `fix-runtime-negative-fresh-pins.json`. Первые diagnostic Missing DispatchMessage
  и cached empty pins failures сохранены; native dispatch в них не выполнялся.
- Добавлены private ordered upload history (включая pending/uncertain), lineage
  при import preflight и completed execution. Same-byte replacement допускается;
  changed/unknown after execution отказывает. Добавлены loaded runtime pins и
  непрерывная проверка объектов/функций/request/response.
- TypeScript5.2.2 из e2e-tests доступен; type-client.mts strict noEmit PASS.
  Начальные ошибки module extension/legacy display_text исправлены.
- Source focused154PASS; полный client1483PASS/0FAIL/1SKIP.
- Свежий live runtime c39c198a18abd1ba2810bd5754bc98a2e0aabc0bcb40a4b6101a7f6c87f0d48b
  в `.dock/node16/live-1789303712898`: stale A послеB NOT_APPLIED,
  cleanuptrue/effectfalse; currentB и same-bytes restoredA imports SUCCEEDED.
  Новая deliveryD остановилась AMBIGUOUS destination, `UI_ROOT_STALE`,
  upload_submitted_or_unknownfalse и underlying upload неизвестен.
  Старая D не повторялась/не переобозначалась; текущие настройки и данныеC
  проверяются отдельным node read. Это не подтверждённый ENOSPC: на диске2GiB,
  координатору отправлен запрос проверки свободного места, сам ничего не очищал.

Итоговый source runtime `db6d957169c50bcd5cb169db80d744fd846b8ffa4eee683178619c001fb22bab`
(169 files) добавляет безопасные nonsecret binding_id вместо token: прежний
runtime c39… прочитал60cells, но journal redactor скрыл token и публикация
закончилась AMBIGUOUS. Исходный отказ сохранён; actual journal test29PASS,
fullclient1483PASS/1SKIP/0FAIL.

В `.dock/node16/live-1789304119268` итоговый source подтвердил mixed60cells,
ignore44cells, default sample10of15, save собственной копии. Same-byte upload
после выполненного импорта допускается. Loaded function wrapper отклонён без
RPC2585→2585; восстановленные53functions проверены. Header-only delivery
остановилась destination AMBIGUOUS при двух Files tabs, не повторялась.
После наблюдаемого закрытия собственных Files tabs другой all-null fixture
загрузился и импорт выполнился; collapse остановился finish AMBIGUOUS,
execution not_requested, console_not_ready. Операция не повторялась,
all-null/all-null-ignore/restored не засчитываются как финальные PASS.

Все собственные диагностические сессии закрыты, процессов их браузеров нет.
Новая `.dock/node16/live-1789304875513` подтвердила save/newsession: одинаковые
настройки и все60cells, settings={}, parameters={}, mappings=[]. Отдельная
`.dock/node16/live-1789305127771` сохранила настоящую lost-upload-ack uncertainty
и production source lineage отказ. First diagnostic callback exclusion и
несработавшая прежняя fault-инъекция сохранены, не засчитываются за этот PASS.

Final-source verifier PASS:3public cases/164cells,53loaded functions,
R16-1/2/3 PASS, fullclient1483PASS/1SKIP/0FAIL, TypeScript5.2.2 PASS.
Один correction round завершён; никакого повторного review/Hermes.
Полная node acceptance не завершена; дополнительные header-only/all-null
остановки явно перечислены в итоговом отчёте. Исходники готовы к commit,
чужие .gitignore/AGENTS/coordination docs не включать.

[Итог](node16-review-fix-result-2026-09-13.md),
[manifest](../../tools/loginom-acceptance/collapse/review-fix/provenance.json).
