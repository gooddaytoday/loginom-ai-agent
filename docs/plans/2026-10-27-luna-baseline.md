# Baseline Luna/xhigh/high speed

## Цель и фиксированные условия

Согласованный владельцем полный baseline: 78 готовых кейсов по три
независимых раунда, всего 234 измерения, в шесть потоков. План независимо
проверен отдельным агентом до выполнения; итоговый verdict — принят.

- Ветка `baseline-luna` создана от `autonomus-eval`, исходный SHA
  `05bb48274f53f510fb19c4d79a6272a8ee474178`.
- Оценивается полная CLI-сборка из этой ветки, исходная версия 0.3.4.
  Product source SHA, installed artifact manifest/hash и acceptedHarness
  фиксируются отдельно. Глобальная установка CLI не заменяется.
- Product model `openai/gpt-6-luna-fast`, variant `xhigh`: API model
  `gpt-6-luna`, requested service tier `priority`. Фактический tier
  сообщается только при наличии provider metadata; явный downgrade — блокер.
- Корпус: 3 ordinary, 65 analytic, 10 node; drafts исключены. Порядок:
  round-major, внутри ordinary → analytic → node. `parallel=6`,
  `batchSize=6`, `repeat=1`; round находится в ключе manifest.
- Судья `gpt-6-sol/xhigh`, threshold 70, timeout 5 минут; node оценивается
  кодовым checker. Task timeouts 15/30/60 минут берутся из task.json.
- Исполнитель EvalBaseline, управляющая модель сохраняется. Карточка
  назначается EvalOps без squad; одно native-поручение EvalBaseline из
  настоящей задачи EvalOps с подтверждённым delegated_from_task_id.
- EvalOps periodic 1800 секунд до прочитанного итога измерений. Затем
  событийный надзор доставки и отдельного ответа исполнителя. Scoped
  blocked rule и native delegation failure; дополнительный scheduler нет.
- Бюджет: 281 started measurement attempts, 3 последовательные технические
  ошибки, 24 часа без прогресса включая readiness/ожидание/ремонт,
  batch timeout не более 8 часов.

LAB-262 и её результаты/конфигурация/незавершённая доставка сохраняются.
Основной сервер runner1: использовать только после свежей проверки units,
процессов, native reservations и ресурсов. Чужие retained claims не трогать.
При занятости ждать, автоматически на другой сервер не переносить.

## Выполнение

- [x] Создать чистую ветку от согласованного SHA.
- [x] Сохранить этот план и исходные решения до acceptedHarness freeze.
- [ ] Подтвердить обязательные offline checks закреплённого исходного кода.
  Использовать применимые exact-SHA/tree evidence; при необходимости из
  evals выполнить `bun typecheck`, unit/full suite и native fixtures.
- [ ] Собрать/получить полный CLI штатным build-cli.ts: Bun 1.3.14,
  Node 24.19.0, Chromium 1246, channel prod, browser recovery включён.
  Локальная версия `0.3.4-baseline.<SHA>`; CI candidate допустим при
  совпадении source SHA, architecture, manifest и build options.
  Вариант Bun baseline выбирать только при отсутствии AVX2 на runner.
- [ ] Выполнить verify-cli-candidate, проверить payload/archive/hash,
  доставить полный artifact в новый immutable каталог и проверить снова.
- [ ] Зафиксировать harness/corpus/input/rubric/checker, каталог моделей,
  skills, judge executable/config и Loginom images/resource pins.
- [ ] После build/offline checks создать отдельную карточку и campaign ID,
  новые manifest/journal/results и ровно 234 уникальных ключа.
- [ ] Опубликовать несекретный паспорт сборки и проверить upload/download.
  Маленький файл не доказывает доставку большого архива.
- [ ] Создать scoped wakeups (periodic 1800 + blocked), перечитать их.
- [ ] Первый reserve выполнить с authenticated issue.created_at через
  `--initial-progress-at` до remote readiness. Срок и issue ID сохранять.
- [ ] Подтвердить доступ EvalOps/EvalBaseline из их runtime и native delegation.
- [ ] Подготовить fresh scoped slots и штатные native prepare/verify N6 с
  новым binary, browser, bwrap, auth и подтверждённым cleanup.
- [ ] Проверить READY всех шести слотов штатным requestPreflight. Первые
  ordinary3 и первый analytic6 являются baseline-измерениями; подтвердить
  события/историю/артефакты/судью/очистку и реальный N6 overlap.
- [ ] Довести службой все 234 ключа без ручной остановки после первых batch.
- [ ] Подтвердить финал, доставку, отдельный ответ и post-final no-op.
- [ ] Сохранить сравнение с LAB-262 и итоговый checkpoint.

Новый bundled catalog не содержит Luna: одинаковый актуальный public
snapshot и его hash установить во всех шести profile/cache/models.json.
Использовать per-slot auth.json без auth.sharedDir; обычный CLI run
сохраняет совместимый формат auth/events/history. Shared OAuth новой
сборкой не поддерживается. Штатный gate требует не менее 8,25 часа до
expiry; seed обновлять только при отсутствии собственных active batches.

После измерительного admission продукт и экспериментальные условия
заморожены. Quality FAIL завершает свой ключ без повторов ради PASS;
technical ERROR отделён от качества. Восстановление продолжает missing,
судейство готового артефакта — без новой генерации. Ремонт harness только
по установленной причине, TDD и отдельное независимое ревью до поставки;
исходные результаты/receipts/clock сохраняются. Journal вручную не править,
ownership/cleanup guards не обходить. Partial не завершает цель 234.

## Приёмка и сравнение

- Учтены все 234 уникальных ключа; проверены обязательные Results/artifacts,
  отдельно указаны PASS/quality FAIL/technical errors.
- Native cleanup/release и освобождение своего owner подтверждены.
- Машинный итог прочитан обратно. EvalBaseline опубликовал отдельный ответ
  в parent reportCommentId с точным `eval-executor-final:CAMPAIGN` marker.
- Полный архив скачан обратно, SHA-256 совпал, статус `in_review`, scoped
  wakeups выключены. Повторный вход не создаёт admissions/publications.
- Сравнение описательное: одновременно меняются CLI, модель, reasoning,
  tier и evaluator. LAB-262 raw 208/234 показывать отдельно от diagnostic
  corrected replay 221/234; старые verdict не переписывать.
- Сопоставить качество, устойчивость трёх раундов, no_artifact, время,
  токены и technical errors. Cost указывать только по достоверному учёту.

LAB-262 завершила 234 измерения (208 PASS/26 FAIL), но архив около 57 МБ
не доставлен. Причина неизвестна; HTTP timeout publisher 30 секунд.
Новый протокол публикует измерительный итог до архива, но сам upload-сбой
ещё не доказан исправленным. При реальном отказе установить и исправить
причину, сохраняя готовые результаты и отчёт.

## Checkpoint

27.10.2026: реализация начата по явному поручению владельца. Ветка создана,
runtime/agent models не менялись; карточка и новые измерения ещё не созданы.
Параллельно проверяются artifact build, offline evidence и read-only runner1.
Private evidence: `/home/kiselev/storage/tmp/luna-baseline-20261027/`.
Следующий шаг: принять проверенный полный CLI и свободную совместимую
среду, затем создать карточку и выполнить anchored reserve.
