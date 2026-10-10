# EvalRunner: результаты локальных проверок

Дата: 2026-10-09. Код `8379d835a`, инструкции `50cd54cc6`, ветка `eval-runner`.
Все команды выполнялись из отдельного worktree, в `evals/`. Живые модели и судья
не вызывались. Серверные конфигурация, профили, службы и LAB-55 не изменялись.

## Приёмка 2026-10-10 (stage B)

Gate LAB-55 подтверждён собственным аудитом: 144 измерения/48 кейсов, обязательные
оценки, cleanup, 144 distinct private history, owner-bound release и свежий download
доставленного архива с проверкой полного manifest/хэшей. Status/idle/PID не заменяли gate.
Первый baseline принят по согласованному решению владельца, CAS `expected-current none`.

Финальная immutable поставка `6f5b40f8722cd253cc4459d4c71dc42ce1362a63`: 751 файл,
manifest SHA256 `904c675afbcc12f37649b3e948cca82d6eb6eb551da8d9f2c6d86ece03fcb510`.
TDD replay: RED на полном многокейсовом source, GREEN после проверки всего run и
отдельного positive fixed-sum; product FAIL другого кейса остаётся в proof. Cleanup
error любого кейса блокирует replay. Исходные evidence не редактируются.

| Проверка | Фактический результат | Граница |
| --- | --- | --- |
| Финальный полный `bun test` | 572 PASS / 9 SKIP / 0 FAIL, 560.24 s | Локальные fixture/offline, без живых моделей |
| Целевые 8 suite после TDD | 123 PASS / 0 FAIL, 68.69 s | Baseline, registry, comparison, replay, recovery, comparators |
| Финальный `bun typecheck` | PASS | Из `evals/` |
| 9 локальных SKIP | Закрыты отдельно на свободном сервере | В первом целевом серверном запуске 50 PASS/2 FAIL; два отказа из-за отсутствующего `bun` в PATH вызова; повтор только этих двух с правильным PATH — 2 PASS/0 FAIL; критерии/skip guards не менялись |
| Настоящий offline replay | VERIFIED / live / modelCalls=0 | Закрытые binary calc и positive fixed-sum Rich evidence; hashes до/после совпали |
| Scorer fingerprint | 22 файла, совпадает с LAB-55 | `cb0971d04fa3cfd53cdcff38acebce9faee7ec7aa3de818d32b2410fc38a0f16` |
| Old/current pins | CLI/corpus/judge/limits/Dock/container/isolation неизменны | Разница только operational harness/config/role/paths, сохранён operator proof |
| Live own profile boundary | VERIFIED, modelCalls=0 | Реальная bwrap с установленным CLI/own profile/current input; 8 sensitive roots скрыты, профиль writable |
| Серверная поставка | Hash/file-set/mode/Git verify PASS; own checkout clean | Старые checkout/roles сохранены, private backups config/helper/AppArmor; controlled stop/start только при FREE/пустых очередях |
| LAB-55 compatibility и evidence | Complete 144 читается новым helper; manifest/journal hashes совпали | Raw results, оценки, leases, card/comments/monitor не менялись |
| Агент EvalRunner | Создан, readback PASS, 2 squad проверены: memberships=[] | Codex(eval-tests), gpt-6.1-sol/xhigh, concurrency1, workspace invocation; own MCP cwd/automatic Git Peer |
| Реальный server MCP | health и actor search успешны | Peer `github.com-gooddaytoday-loginom-ai-agent`; profile-independent own checkout |
| Два отдельных live smoke и доставка | **Выполняются, НЕ подтверждены** | Назначенная LAB-74; 1×1 каждый, no infra retry, product medium; полная 48×3 не запускается |

Goal ACTIVE; heartbeat `evalrunner-lab-55` остаётся ACTIVE до полного аудита готовности.
Более ранние результаты и ограничения ниже являются историей этапа A.

## Подтверждённые результаты этапа A

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
