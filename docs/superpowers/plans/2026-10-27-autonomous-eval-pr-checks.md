# Autonomus-eval: PR и успешные проверки

**Цель:** отправить `autonomus-eval` в origin, создать PR в `loginom` и
дождаться успешных применимых тестов и сборок на его итоговом SHA.

**Исходное состояние:** `374fe21d49`, чистое дерево. `loginom` на origin —
`db13009886`; ветки `autonomus-eval` и открытого PR на origin ещё нет.
Предыдущая локальная проверка: typecheck и затронутые tests PASS; полный
suite 1364 PASS / 84 SKIP / 4 FAIL / 1 error. Три сбоя не повторились,
isolated-storage timeout воспроизведён на исходном `60a82320a9`.

**Границы:** исправление этих сбоев теперь входит в поручение владельца.
Assertions, native ownership/cleanup и проверки целостности сохраняются.
Без реальных модельных eval, живых Multica изменений, merge PR или релиза.
Временные файлы только `/home/kiselev/storage/tmp`; tests из package dirs.
План независимо проверяется до правок кода.

## 1. Публикация и CI

- [x] Проверить существующие refs/PR и настройки workflows.
- [x] Создать локальный checkpoint, обычный push `autonomus-eval` без force.
- [x] Создать draft PR `autonomus-eval → loginom` по шаблону и прикрепить к чату.
  PR описывает весь новый автономный runner, поэтому тип `feat(evals)`.
- [ ] Дождаться автоматических test/typecheck/secrets/PR проверок.

## 2. Устранение локальных и CI отказов

- [x] Проверить pins: Bun 1.3.14, Node 24.19.0 как в product CI; evals
  использует настоящий Node, fixture tools и собственный frozen lockfile.
- [x] По существующему сигналу измерить setup и probes isolated-storage
  приватным transparent docker wrapper, не меняя tracked исходники.
- [x] Отличить ошибки runtime от тестового scope/окружения. Исправлять
  первый неверный шаг через RED → минимальный GREEN → упрощение; не
  повышать timeout, не менять ожидания и не добавлять retry без причины.
- [x] Стабилизировать оставшиеся sandbox/judge случаи по установленной
  причине; проверить подходящее чистое окружение/PID namespace.
- [ ] Из `evals/` выполнить typecheck, `bun run test:unit` и полный suite
  без opt-in live/proc-denial flags; проверить отдельные обязательные native
  systemd fixtures. После изменений повторять зависимые проверки.
- [ ] Исправлять наблюдённые отказы CI, выполнять независимое review
  содержательных правок и отправлять обычные commits/push.

## 3. Сборки и завершение

- [ ] На итоговом SHA запустить существующий `release.yml` с
  `mode=candidate`, `channel=prod`: Linux/Windows/macOS Desktop+CLI,
  Linux matrix и reusable tests/typecheck. Это не создаёт tag/release.
- [ ] Дождаться всех применимых checks/builds на итоговом SHA. Не считать
  SKIP успешной приёмкой пропущенного поведения; отличать ожидаемые
  release-only SKIP от failed/cancelled требуемых jobs.
- [ ] Обновить PR body фактическими результатами, снять draft после PASS.
- [ ] Сохранить SHA, ссылки на PR/runs и границы проверки в этом checkpoint.
  Проверить clean status и соответствие origin; сообщить результат владельцу.

## Checkpoint

- Предыдущие исправления и их evidence:
  [план завершения](2026-10-27-autonomous-eval-completion.md).
- CI карта независимо прочитана агентом: `evals-unit`, workspace unit,
  desktop/e2e, Chromium на трёх ОС, probe cleanup на двух ОС, typecheck,
  secrets и PR metadata. Evals не входит в root workspaces, отдельной
  сборки harness нет. Candidate используется для всех продуктовых сборок.
- План прошёл независимое review: Approved. PID namespace не заменяет
  отдельную host-проверку native ownership/systemd fixtures.
- Создан и прикреплён [PR #466](https://github.com/gooddaytoday/loginom-ai-agent/pull/466),
  `autonomus-eval → loginom`; начальный push — `19fcea7126`, без force.
  Текущие результаты CI, candidate builds и их SHA фиксируются в этом PR;
  после запуска проверки исходники не меняются без новой причины и цикла.
- Первый push новой ветки дополнительно запустил Windows native checks
  на windows-2022 и windows-2025: push filter отличается от PR diff.
  Эти фактически запущенные проверки также учитываются, не отменяются как
  «неожиданные». Release candidate штатно пропускает только cut/release jobs.
- Node 24.19.0 скачан из nodejs.org в
  `/home/kiselev/storage/tmp/autonomus-eval-pr-20261027/`, SHA256 архива
  проверен по официальному SHASUMS256. Typecheck с этим Node — PASS.
- Один transparent Docker trace исходного теста: 8 assertions PASS;
  setup 6,05 с, проверки/смена состояния 4,92 с, cleanup 1,36 с,
  50 реальных Docker-команд exit 0. В прошлых отказах запуск контейнеров
  занимал 14–18 с из общего 20-секундного бюджета.
- Прежние четыре отказа проверены пять раз в независимых PID namespaces
  с Node 24.19.0: **5/5 PASS**, каждый 4 tests / 34 assertions,
  22–24 с. Таймауты, assertions и runtime не менялись. Отдельное влияние
  Node, PID namespace и текущей нагрузки не разделялось. Основания менять
  guards или fixture hooks по полученному сигналу отсутствуют.
- Полный suite выполняется из `evals/` с настоящим Node в PATH,
  `TMPDIR=/home/kiselev/storage/tmp`, тремя opt-in flags = 0 и
  `unshare --user --map-current-user --pid --fork --mount-proc bun test --isolate --timeout 30000`.
  Host systemd fixtures проверяются отдельно с `EVAL_SYSTEMD_TESTS=1`.
- Локальные логи и результаты серии:
  `/home/kiselev/storage/tmp/autonomus-eval-pr-20261027/`;
  Docker trace: `/home/kiselev/storage/tmp/isolated-storage-trace-1JUJGwzr/`.


### Проверка окружения и fixture fixes

- Полный диагностический прогон на `05bb48274f` завершился: **1370 PASS /
  77 SKIP / 7 FAIL**, 1454 tests / 112 files / 7296 assertions, 1927,67 с.
  Это не успешный полный прогон. Шесть отказов требуют настоящего host:
  root UID/initial user namespace, Docker host PID в `/proc`, видимый чужой
  браузер для существующего guard у двух node-eval-ops tests и чужой PID 1.
  В приватном namespace сам runner был PID 1; его ancestry test на host —
  **1 PASS / 5 assertions**. Позитивные root witness/host anchors на host —
  **9 PASS / 1 root-only SKIP / 44 assertions**. Остальная host-группа
  проверяется отдельно, без изменения guards. Седьмой отказ — timeout
  unactivated-observation test; для него требуется отдельный тихий прогон.
- Подтверждены только fixture-дефекты: heartbeat читался до появления и
  проверялся через произвольные 80 мс; finally использовал неподдержанный
  `--kill-whom`. После RED исправлены initial heartbeat до ready, ожидание
  продвижения в прежнем 8-секундном deadline и `--kill-who=all`. Runtime,
  ownership assertions и production deadlines не изменены. Архивная копия:
  initial **7 PASS**, затем **5 независимых запусков по 7 PASS**; все own
  unit/cgroup/PID/temp cleanup проверены. Независимый review: APPROVED.
- CI push `40494448958`: 8 product jobs PASS, evals-unit **1305 PASS /
  65 SKIP / 1 FAIL** — watcher подписывался после записи 2000 файлов и
  пропускал archive event. PR job `40494455427` на том же SHA без изменений:
  **1306 PASS / 65 SKIP / 0 FAIL**, что подтверждает flaky fixture.
  Одобрен минимальный reorder подписки перед записью; все assertions,
  2000 файлов и deadlines сохраняются. Fixture передаёт существующий
  `TMPDIR` дочернему CLI для соблюдения правил временных файлов.
- На `05bb48274f` typecheck/secrets/PR metadata, workspace unit, Desktop,
  app e2e, Chromium на трёх ОС и probe cleanup на двух ОС — PASS. Candidate
  `40494523716`: Linux build и Linux OS matrix — PASS; macOS ещё идёт;
  Windows Desktop+CLI собраны, затем DPAPI roundtrip завершился отказом
  около существующего 15-секундного process deadline. Такой же native
  codec/test прошёл на Windows 2022 и 2025 в `40493706267`; причиной
  production defect это пока не признано. На итоговом SHA требуется новый
  candidate без изменения timeout и ожиданий. Cut/release jobs не запускаются.
- Полные логи/точные source hashes, команды и cleanup evidence хранятся в
  `/home/kiselev/storage/tmp/autonomus-eval-pr-20261027/`.

- Финальные fixture patches независимо проверены двумя агентами: APPROVED.
  Infra-retry: **5 независимых narrow PASS** по 8 assertions и весь файл
  **11 PASS / 79 assertions**. В shared-копии native fixtures: **7 PASS /
  58 assertions**, units отсутствуют после finally; `bun typecheck` PASS.
- Correct-host группа завершилась **37 PASS / 6 SKIP / 3 FAIL**: root
  witness, native host anchors и node-eval-ops guards корректны; три Docker
  resource fixtures получили свои прежние 15/30/15-секундные timeouts.
  Первые два уже PASS в полном namespace-прогоне, третий требует host PID.
  На момент отказа I/O pressure full avg10 24–37%, storage tmp — HDD
  `/dev/sda2`; Docker version отвечает за 19 мс. Задержка исследуется узко;
  оснований менять assertions, storage guards или deadlines нет.
- Candidate macOS build/verify/offline-smoke обоих продуктов — PASS.
  После отправки fixture commit итоговые SHA/run links и результаты
  обновляются в PR #466, чтобы запись проверок сама не запускала новый CI.
