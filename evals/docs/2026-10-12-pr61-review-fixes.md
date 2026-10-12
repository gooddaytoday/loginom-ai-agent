# PR #61: исправления замечаний review

**Цель:** обновить checkout после rebase, проверить все сообщения об ошибках,
исправить подтверждённые дефекты и проверить CI на отправленном head.

**Исходное состояние:** `origin/evals` / PR head
`888740f5101a974d1fd00c839a04e50afd90759c`, base `loginom` /
`a3d8e294763342edc4bb0a6e194ea5afa6a63304`. Рабочий checkout чистый,
ветка `evals-review` создана от актуального remote. Существующий checkout
`evals` и два его untracked документа сохранены.

## Дизайн и контракт

Все четыре inline замечания подтверждены; других сообщений об ошибках в
review и общей дискуссии на момент проверки нет. Изменения остаются внутри
`evals/`, без изменения продуктового кода и CI workflows.

- P1: проверки версии `preflight()` и `judgeInfo()` используют то же
  фильтрованное окружение, что `judgeTask()`. Наследуемые `LOGINOM_*`,
  `EVAL_*`, `JUDGE_*`, `FAKE_CODEX_*` удаляются; явный `judge.env`
  применяется последним. Обычное окружение, включая PATH, сохраняется.
- P2: три процентных порога допускают только целые `1..100`; прежний
  нижний предел и defaults `70/90/40` сохраняются. Повторы и таймауты
  остаются положительными целыми без процентного верхнего ограничения.
- P2: run/calibrate создают каталог через атомарный `mkdtemp` с прежним
  читаемым префиксом и уникальным суффиксом. Существующий каталог не
  переиспользуется, run_id выводится из реально зарезервированного пути.
- P2: задачи с повторяющимися basename входных файлов отклоняются
  при `loadTasks()` до dispatch с `EvalFailure` / exit 2. Плоские имена
  workspace сохраняются: смена структуры могла бы нарушить prompts,
  которые ссылаются на `dataset.csv` без каталога.

Это уточнение исходной спеки хранится здесь и в `evals/AGENTS.md` согласно
ограничению на изменение остальных каталогов репозитория.

## План реализации и проверки: состояние перед финальным CI

- [x] Fetch актуального `origin/evals`; сверить с head PR и сохранить
  незавершённые изменения других worktrees.
- [x] Прочитать все inline threads, reviews и conversation comments;
  воспроизвести дефекты и определить минимальные исправления.
- [x] Судья: один regression тест публичного probe → RED → общее
  окружение → GREEN; затем второй probe и явный override. Файлы
  `src/judge.ts`, `src/preflight.ts`, соответствующие tests/fixtures.
- [x] Пороги: rejection 101 через `loadConfig()` → RED → ограничение
  сверху → GREEN; затем границы 100/0/отрицательное/дробное/NaN/Infinity
  и сохранение больших timeout/repeat. `src/config.ts`, `test/config.test.ts`.
- [x] Каталоги: независимые run/calibrate сохраняют разные результаты
  при одинаковом временном префиксе → RED → атомарная резервация → GREEN.
  `src/run.ts`, `src/calibrate.ts`, соответствующие tests.
- [x] Inputs: задача `left/data.csv` + `right/data.csv` отклоняется с
  обоими путями → RED → проверка collision → GREEN. Проверить уникальные
  basename и пустые inputs. `src/task.ts`, `test/task.test.ts`.
- [x] Выполнить `bun typecheck` и CI gate `bun run test:unit` из `evals/`;
  проверить diff отдельным reviewer, устранить подтверждённые регрессии.
- [x] Commit scoped исправлений, push `HEAD:evals`, сверить SHA PR.
- [ ] Проверить все тесты/сборки на отправленном head; при сбое изучить
  логи, исправить в рамках PR и повторить CI до успеха.

## Проверенные исправления

- Пороги: RED **12 PASS / 3 FAIL**, GREEN **33 PASS / 0 FAIL**,
  113 assertions. Проверены defaults, обе границы, некорректные значения
  каждого из трёх порогов и большие непроцентные настройки.
- Судья: два отдельных RED → GREEN для публичных `judgeInfo()` и
  `preflight()`; затем четыре новых проверки фильтра и overrides через
  реальные fake subprocess. В основном test runner окружение не меняется.
- Каталоги/inputs: три отдельных RED → GREEN. Проверены сохранность
  уже существующих config/summary/calibration, два параллельных dry-run
  с разными labels/workspaces и fail-fast диагностика обоих input paths.
- Объединённый набор затронутых модулей на **Bun 1.3.14**:
  **120 PASS / 0 FAIL**, 599 assertions, 6 файлов, 24.68 с.
- `bun typecheck` на Bun 1.3.14 и `git diff --check` — PASS.
- Полный CI unit gate в отдельном PID namespace, Bun 1.3.14:
  **528 PASS / 0 FAIL / 3 SKIP**, 2780 assertions, 531 тест, 49 файлов,
  416.36 с. Три clean-stand теста пропущены существующим `nativeBusy`
  guard; узкий повтор в свежем PID namespace — **3 PASS / 0 FAIL**,
  14 assertions, 1.65 с. Пропуски не записываются как PASS первого набора.
  Четыре Docker/bubblewrap suites, исключённые из `test:unit`, не повторялись.
- CI push `evals-unit` на кодовом head `e1e40d0389`:
  **531 PASS / 0 FAIL**, 2794 assertions, 49 файлов, 427.76 с,
  **Bun 1.3.14**. [Job и логи](https://github.com/gooddaytoday/loginom-ai-agent/actions/runs/38277791634/job/114907414027)
  прочитаны отдельно; все этапы install/types/tests завершены успешно.
- Независимый read-only review: **No findings**; отдельно проверены
  consumers run_id, фильтр окружения и реальные subprocess tests.

## CI кодового head

Прогоны привязаны к `e1e40d03896c46aa6ab08c8d48517ff675165eb5`:

- [push test](https://github.com/gooddaytoday/loginom-ai-agent/actions/runs/38277791634),
  [PR test](https://github.com/gooddaytoday/loginom-ai-agent/actions/runs/38277797721) — PR SUCCESS;
- [push typecheck](https://github.com/gooddaytoday/loginom-ai-agent/actions/runs/38277791802),
  [PR typecheck](https://github.com/gooddaytoday/loginom-ai-agent/actions/runs/38277797655) — SUCCESS;
- [Windows build/package test](https://github.com/gooddaytoday/loginom-ai-agent/actions/runs/38277797650) — SUCCESS;
- [macOS candidate](https://github.com/gooddaytoday/loginom-ai-agent/actions/runs/38277797643) — SUCCESS;
- [PR standards](https://github.com/gooddaytoday/loginom-ai-agent/actions/runs/38277795214) — SUCCESS.

В 20:10 МСК проверены **23/24 SUCCESS**, единственный незавершённый check —
push `unit`: сами unit tests и generated client уже SUCCESS, HttpApi gates
выполнялись более 16 минут. Текущий PR того же head прошёл эти gates за
2:55: каждый режим coverage/auth/effect дал **208 PASS / 0 FAIL / 0 SKIP**,
без missing/extra. Предыдущие успешные gates занимали 2:37–3:07.
Архив активной job возвращает `404 BlobNotFound`; live browser surface
недоступна. Причина задержки пока не установлена, исправления runner/CI
на основании предположений не делались.

## Контрольная точка перед финальным CI

Исправления отправлены обычным fast-forward push в `evals`; кодовый head
`e1e40d03896c46aa6ab08c8d48517ff675165eb5`. Все четыре исходных review
threads закрыты как исправленные. PR остаётся открытым, без merge.
Полный offline unit gate завершён. Этот отчётный commit меняет только
документацию; исходный код и тесты остаются теми же, что на `e1e40d0389`.
Обычный push отчёта запускает CI заново и отменяет устаревший push test
через существующую concurrency policy. После отмены доступный архив
проверяется отдельно. Итоговая приёмка требует успеха **всех checks нового
head** и отсутствия новых незакрытых замечаний; старый незавершённый
check не считается успешным. Статус этого датированного checkpoint
фиксирует момент отправки отчёта; итоговый статус хранится в PR checks.
Авторитетное текущее состояние — [PR checks](https://github.com/gooddaytoday/loginom-ai-agent/pull/61/checks).

Frozen install harness прошёл. Первые TDD slices выполнены на Bun 1.4.2,
объединённая проверка — на закреплённом для CI Bun 1.3.14. Живой
Loginom/модель/судья для этих offline исправлений не запускались;
новая калибровка и live baseline этой приёмкой не подтверждаются.
