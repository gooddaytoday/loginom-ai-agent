# EvalRunner: результаты локальных проверок

Дата: 2026-10-09. Код `8379d835a`, инструкции `50cd54cc6`, ветка `eval-runner`.
Все команды выполнялись из отдельного worktree, в `evals/`. Живые модели и судья
не вызывались. Серверные конфигурация, профили, службы и LAB-55 не изменялись.

## Подтверждённые результаты

| Проверка | Результат | Граница результата |
| --- | --- | --- |
| Первый полный `bun test`, код `871068db1` | 570 PASS / 9 SKIP / 0 FAIL, 591.36 s | До расширения fingerprint оценивания на Python inspector и остальные readers |
| Последние fixture/offline проверки, код `8379d835a` | 91 PASS / 0 FAIL, 58.50 s | Baseline, registry, полный fixture comparison, replay и три comparator suite |
| `node-eval-ops`, pattern `v3 EvalRunner` | 1 PASS / 0 FAIL | Общий lease, чужой release, eval-only роль и изоляция путей; остальные 30 тестов отфильтрованы |
| `bun typecheck` | PASS, exit 0 | Финальное состояние кода |
| Scorer fingerprint на точных Git SHA | Совпадает | LAB-55 helper `ee7861513be1c4309fdf1678ccae78ad89522973` и новый код: 22 файла, SHA256 `cb0971d04fa3cfd53cdcff38acebce9faee7ec7aa3de818d32b2410fc38a0f16` |
| Локальная поставка | Проверена по receipt | Manifest, весь file-set, хэши и права payload/tar; `git bundle verify`. Не активирована |

Целевые команды:

```sh
bun test test/baseline.test.ts test/baseline-registry.test.ts \
  test/baseline-comparison.test.ts test/evaluator-replay.test.ts \
  test/compare-analysis.test.ts test/compare-cli.test.ts test/compare.test.ts
bun test test/node-eval-ops.test.ts --test-name-pattern 'v3 EvalRunner'
bun typecheck
```

Исходные журналы локальной проверки: `/tmp/evalrunner-all-tests.log`,
`/tmp/evalrunner-final-targeted.log`, `/tmp/evalrunner-final-role.log`.
Fixtures проверяют backward compatibility, immutable dispatch, повторное назначение,
CAS baseline, declared model experiment, UNKNOWN/infra/cleanup gates, no_artifact,
сохранность исходных evidence, закрытый экспорт и проверку скачанного fixture-архива.
Fixture replay не считается приёмкой live-среды.

## Диагностика повторного полного запуска

Повторный `bun test` на `50cd54cc6` **не пройден**. `isolated-storage.test.ts`
завис в `beforeAll` на первом `docker run`, ещё до получения ID fixture-контейнера
и проверки admission. Hook исчерпал 60 s; последующие Docker fixtures также
исчерпали бюджет. Запуск и принадлежащие ему Docker clients остановлены SIGTERM,
exit 143. Журнал: `/tmp/evalrunner-final-all-tests.log`.

Классификация: инфраструктурный блокер локального Docker. Стабильная регрессия
кода не установлена; breaking commit не определён. Diff `871068db1..50cd54cc6`
по `preflight.ts`, `artifact.ts`, `isolated-storage.test.ts` пустой.
Независимая проба собственного `docker create` с уникальными name/label также
не вернула ID или stderr за 12 s; её клиент остановлен. `inspect` и поиск по label
не обнаружили созданного объекта. `docker info`, `ps`, `image inspect` отвечают;
очевидного дефицита памяти и диска нет. Причина внутри Docker пока не установлена.

Новые повторы create/start/run остановлены, чтобы не накапливать незавершённые
запросы. Assertion, skip-условия и код не ослаблялись. Старые контейнеры, службы
и daemon не менялись. Для закрытия проверки требуется восстановить создание
локальных fixtures, выполнить узкий `isolated-storage` тест и затем `bun test`.
Успех предыдущего полного запуска не заменяет этот повтор.

## Отложенные проверки и этап B

Девять SKIP первого полного запуска — проверки ownership/settlement с Docker
и браузерными профилями; они не считаются пройденными. Профильная live-приёмка,
replay настоящих закрытых evidence, два smoke, создание агента без squad и
серверная поставка **отложены до завершения LAB-55**.

Чтение 2026-10-09 11:38 UTC: LAB-55 `in_progress`; журнал содержит 15 recorded,
1 running, 128 pending из 144. Release отсутствует, `operations/stand.lease`
существует. Manifest SHA256 `48b60d07dc71b3b6b528297a04cfd395fe9299507600acc2058e91031096d689`
совпадает с предыдущим чтением. Это не подтверждает завершение, доставку или
свободный стенд. Новые карточки, комментарии и мониторы не создавались.

Переходить к [runbook](runbook.md) только после свежей одновременной проверки
144 измерений и обязательных verdict, cleanup/history/release, download/hash
receipts и отсутствия active/queued задач, процессов, leases и recovery.
