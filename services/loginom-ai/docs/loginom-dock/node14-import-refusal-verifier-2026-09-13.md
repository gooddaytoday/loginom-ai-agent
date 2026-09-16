# Node14: проверка отказа размещения текстового импорта — 13 сентября 2026

**Scoped PASS; готов комплект следующей автономной приёмки. Полная цель не принята.**
Фаза координатора: `node14:import-refusal-verifier:1:841d6443`.
Реализовано согласованное [предложение](node14-import-placement-refusal-proposal-2026-09-13.md).
Код зафиксирован в `7bef361cf5320e553d68fc020493717c6e50683e`.

## Что изменилось

Добавлен `tools/loginom-acceptance/import_placement_refusals.py`, подключённый
к существующему partition-аудитору. Область строго `imports.text / delimited / new`.
Источник здесь — доставленный CSV; Missing Values source-node preflight не применяется.

Проверяются artifact/grant/overwrite/destination/bytes/SHA, исходная загрузка,
нативное скачивание, host byte verification и завершение transfer/delivery.
Связаны исходная выдача артефакта через prepare, публичная доставка и начало node.apply.
Принимается только подтверждённая в этой fixture внутренняя цепочка загрузки;
произвольные recover/resume и альтернативные непроверенные цепочки запрещены.

Загрузка ранее изменила хранилище (`upload_effect_possible=true`). Отказанный
`node.apply` отдельно имеет общий и вложенный **NOT_APPLIED**, effect=false,
cleanup=true, node=null, pending_phase=null, execution=not_requested,
output=not_refreshed, package_saved=false. Обе законченные фазы source/workflow
имеют effect=false. Workflow trace должен показывать уже активный исходный сценарий.
Общее утверждение «эффектов не было во всём прогоне» не делается.

Для каждой из 1–3 попыток требуются исходный полный граф и равный ему post-refusal
граф, правильные идентификаторы, реальные координаты и unreachable geometry.
Нет полученного target, target receipts, pending или завершённого target state.
Whitelist фаз не допускает настройку, mapping, мастер, исполнение, сохранение,
восстановление или события другой операции внутри отказанного node.apply.

Преемник единственный, успешный, с новым ID; после исключения только ID/position
запросы должны совпасть. Он начинается после durable completed и публичной доставки
терминального результата. Все call/result и user-v1 projection проверяются целиком;
inspect связывается с exact resolved outcome и verification_delivered.

Только явно доказанный terminal_outcomes mapping допускает NOT_APPLIED в общей
нормализации/проверке публичных ответов. По умолчанию терминальные ошибки
по-прежнему отклоняются. Классификатор не объявляет отказ успехом и не удаляет
операции, события либо публичные вызовы. Native save и full-goal gates сохранены.

## Живая проверка и тесты

На Loginom 7.4.2, test-4, отдельная source-сессия
`be958249-da06-4dbe-902a-dbb7dcc454fa` выполнила:

1. Загрузку одного CSV и успешный импорт для непустого исходного графа.
2. `refusal-placement` в (80,880): три NOT_APPLIED, граф не изменился.
   Graph rect (324,100,1178,756), viewport1508×862, экранная точка (404,980).
3. Status и inspect после отказа; `refusal-corrected` в (300,80): SUCCEEDED.
4. Native `package.save_checkpoint`: SUCCEEDED.

Отдельный аудитор проверил оба успешных импорта, исполнение и данные пяти колонок.
Scoped accounting, публичная проекция и native save receipt прошли.
Окно развёрнуто: viewport=null, inner1508×862, outer1508×949 при доступных1512×949.
После завершения найдено0 процессов собственной сессии.

Сохранены все **114 calls / 114 replies / 1264 events**. Новая gzip-fixture
распаковывается в точные исходные79 692 030 байт журнала; ничего не отфильтровано.
SHA исходного evidence: `098e40ac4c9cd80563c5c6f0837dc8516d920744bf4d611127d9d504a1da0291`.

Итоговые проверки: **43 test methods PASS** — новые import refusal7,
Missing Values18, public receipts8, user-v1 projection6, runtime4.
Отрицательные случаи покрывают source/owner/schema/grant, bytes/geometry/ports,
partial effects/pending, пропавшие и повторные квитанции, запрещённые фазы/вызовы,
подменённые public/inspect, раннего преемника и согласованно изменённые параметры.
Тесты обязательных full-goal gates не допускают пропуска save/reopen/финальных результатов.
Синтаксис обоих затронутых MJS и diff whitespace проверен.
Первоначальный отрицательный тест с заменой пустого списка портов на пустой
оказался no-op; исправлен на фактическую подмену. Его FAIL-log сохранён.

## Pins и следующий комплект

[Полный индекс и pins](node14-import-refusal-verifier-pins-2026-09-13.json).
Приватные доказательства: `.dock/node14-import-refusal-verifier/`,33 индексированных файла.
Индекс SHA: `45e05e50e6e48a9f11cae9230a228b990bec5d9768ec7df9cc927fc9b761cd30`.

- Runtime: `71f73d81d758c746bd2111c93de08691c85aebddf80a411f294b8ed3f56ab4ff`,156 inputs.
  Production JS в этой фазе не менялся; сохранено предыдущее исправление NULL-picker.
- Source inventory395: соответствует коммиту7bef361c.
- Harness256: `abda18113fd92027a3eac6e48c26bcc982875b8262991bc808fe092e1fe3b2c1`.
  Новые verifier/test и полная fixture/live harness включены в freeze.
- Candidate2 test4.2 повторно прочитан с сервера: все4 файла совпали байт-в-байт.
  Manifest `cadd80dfd8490f40c851475008a1ccd68d7a617dbcf6a77de25034ff8da7b2ad`.
  Новые stage/activate не выполнялись; оба save roots остаются /test-4.
- Goal SHA `35a23e9aeb6a37c408e249aec54e12ca1f230cbc219392e5cabe9b6d4675a836`,
  fixture manifest `0f2927617fe47e84db3ae3500f735a560002c509a091dd7611aa9ca7f455b1cf`.
  Проверены8 входных файлов,14 содержательных этапов и12 финальных результатов.

`acceptance-launch-plan.json` сохраняет `launch_authorized=false`, один будущий
прогон, лимит3600с/200turns, существующую подписку `openai-codex / gpt-5.6-sol / low`
и каталог `.dock/node14-autonomous-acceptance-4/runs`. Read-only subscription
preflight прошёл без модели/MCP/браузера; freeze после коммита повторно совпал.
Перед запуском требуется свежая проверка комплекта и отдельный слот координатора.
Текущая диагностическая сессия не является подготовкой всех8 artifacts для нового run.

Требования полной приёмки остались **ровно27 успешных операций /9 импортов /
12 финальных результатов /native save /независимый reopen**. Все отказы добавляются
к полному учёту prepared; преемник учитывается один раз. Нынешний scoped PASS
не заменяет автономную приёмку или независимое повторное открытие пакета.

Старые FAIL не изменены: проверено13/13 квитанций acceptance2 и14/14 acceptance3;
также48/48 файлов предыдущего configure follow-up. Hermes, новое ревью, VPS build,
активация, main, push, установка общего клиента и маршрутизация памяти не запускались.
Пользовательские `.gitignore` и `AGENTS.md` остались вне коммита.
