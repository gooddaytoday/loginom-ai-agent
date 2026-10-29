# Node evaluator fixes — implementation plan

**Goal:** устранить девять ложных Import FAIL и четыре ложных AutoSync FAIL LAB-262, сохранив проверки целостности и источников.

**Architecture:** восстановить два условия из `68686f224a`; передать сохранённый `SyncThroughColumns` из XML inspector и один раз вычислить эффективные output columns в `checkNodeEvidence`. Только неизменённые ключи CrossTable (`utActive`) наследуются при явном AutoSync; собственные определения сохраняют приоритет, использованный source не наследуется повторно. Оба существующих mapping validator используют этот результат.

**Tech Stack:** существующие Bun/TypeScript и Python stdlib; без новых зависимостей.

**Spec:** пользовательское поручение и `docs/testing/loginom-ai-agent/reports/2026-10-27-lab122-lab262-quality-comparison.md`, разделы о 9 Import и 4 AutoSync FAIL. Выполнение в текущей ветке `lab262-analysis` от `60a82320a9`.

## Ограничения

- Изменения только в `evals/` и относящейся документации; без исправления UI, новых модельных прогонов, публикации и изменения исходных verdict.
- Сохранить bytes/hash/upload-completion/upload-operation checks, native identity/readback, точные имена/типы/источники, graph/export/save/oracle.
- Не материализовывать Region по имени из теста или наблюдённого результата; источник наследования — сохранённые ключевые поля XML и явный AutoSync.
- Собственный неправильный mapping, повторный source, отсутствие ключа/AutoSync и лишние поля должны оставаться FAIL.
- Временные файлы и `TMPDIR` — `/home/kiselev/storage/tmp`; команды тестов только из `evals/`.
- Чужие незавершённые файлы не включать в коммиты. План независимо проверяет другой агент до правок кода.

## 1. Необязательные метаданные Import

Files: `evals/test/node-evidence.test.ts`, `evals/src/node-evidence.ts`.

- [x] RED: в существующий positive evidence test перенести optional metadata assertions из `68686f224a`: удалить `source.bytes` и `source.sha256`, ожидать `{ errors: [], failures: [] }`; отдельно wrong bytes/hash должны вернуть input FAIL.
- [x] Запустить `TMPDIR=/home/kiselev/storage/tmp bun test test/node-evidence.test.ts`; подтвердить, что omission падает именно по input proof.
- [x] GREEN: заменить оба `contract.native && src.… === undefined` на `src.… === undefined`, не меняя delivery guards.
- [x] Повторить адресный тест и закоммитить только этот тест и исправление: `6d7614544b`, 2 tests / 13 assertions PASS.

## 2. Сохранённый AutoSync в output mapping

Files: `evals/script/inspect-node-package.py`, `evals/src/node-xml.ts`, `evals/src/node-evidence.ts`, `evals/test/node-output-autosync.test.ts`.

- [x] RED: через `validateNodeAttempt` проверить реальный multi-facts fixture с удалённым только output Region и `SyncThroughColumns="true"`. Сохранить protocol/native/CSV из существующих fixtures; упаковать и распаковать один и тот же изменённый XML. Ожидать полный PASS.
- [x] GREEN: inspector возвращает `output_autosync`, тип NodeXml принимает boolean; evidence дополняет явные output columns только ключами `UsageType="utActive"`, чьи name/source не заняты. Заменить чтения `cross.output_columns` в двух mapping validators на вычисленную схему; проверку automatic output local-variable case не менять.
- [x] Последовательно проверить min-max с тем же способом наследования; явные формы обоих fixtures также PASS. Отрицательные проверки через тот же публичный validator: AutoSync false/отсутствует; изменённый source/type ключа; явный неправильный Region; renamed key; duplicate/extra output; ошибочная числовая привязка; отсутствующий числовой override. Каждый должен остаться FAIL. Добавлять следующую проверку после зелёного предыдущего цикла. Итого 2 tests / 52 assertions PASS.
- [x] Запустить все `test/node-*.test.ts`, `test/text-import-*.test.ts` и `test/campaign-admission.test.ts`, а также `bun typecheck` из `evals/` с настоящим Node в PATH. Результат: 334 PASS / 5 SKIP / 0 FAIL, 2036 assertions / 31 files, exit 0; typecheck exit 0. Не включать opt-in live/proc-denial flags. Широкий `bun run test` дал прежний flaky version probe; после независимого review прекращён в пользу всех затронутых callers.
- [x] Вызвать новый `validateNodeAttempt` для всех 27 сохранённых completed node attempts LAB-262, сохранив новые диагностические результаты отдельно. Проверить ровно 13 новых PASS и отсутствие других изменённых verdict; исходники evidence до/после должны совпасть по hashes. В публичном архиве LAB-122 нет полных events/result/native attempts, поэтому полный replay старой кампании недоступен; совместимость явной формы проверяется существующими reference fixtures и тестами.
- [x] Независимое итоговое review diff и отрицательных проверок — ACCEPT. Короткий checkpoint обновлён с выполненными проверками и границами; AutoSync fix/tests/plan/checkpoint фиксируются коммитом `fix(evals): resolve inherited CrossTable keys`.

## Completion evidence

Кодовые тесты и typecheck зелёные; replay снимает только 13 известных ложных отказов. Live cold evidence четырёх исходных пакетов уже существует; нового live Export и исправления UI это поручение не требует.

Независимые plan/diff review и review области проверки — ACCEPT. Широкий suite остановлен после FAIL `offline-admission > run admission`, воспроизведённого на исходном `60a82320a9` (baseline FAIL/PASS/PASS, current PASS/PASS/PASS). Это прежняя гонка version probe, её исправление не входит в поручение. SIGINT поглотил установленный тестом обработчик main и вызвал отдельный interruption failure `transition > completed`; для остановки завершено только собственное дерево тестовых процессов, все три PID подтверждены отсутствующими. Raw logs: `/home/kiselev/storage/tmp/lab122-lab262-analysis/failure-signal/`, `fix-full-tests-stop.json`. Полный suite не объявляется пройденным; все затронутые группы завершились успешно.
