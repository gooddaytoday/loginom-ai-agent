# Сравнение контейнеров по подтверждённой версии Loginom

**Цель:** разрешить baseline-сравнение разных container ID при точном совпадении фактически наблюдённой версии Loginom и сохранении остальных условий сравнения.

**База:** ветка `v02-evals` от `loginom`, SHA `d781f390e5`. Утверждённый пользователем план реализуется внутри `evals/`, без новых модельных прогонов и пересоздания baseline.

## Подготовка и граница интеграции

В базе `loginom` отсутствует `baseline-comparison.ts`; он находится в `eval-runner`. Перенос всего harness не входит в задачу. Минимальная реализация состоит из самостоятельного `src/container-comparison.ts`, файловых тестов через его публичный интерфейс и `patches/container-version.patch` для точечного подключения к comparator и проверки экспорта `comparison.json`.

Patch проверяется на закреплённой базе `eval-runner` (`c78ed0cdb9488492281fc269620c6153245aa480`) в изолированном worktree `/home/kiselev/storage/tmp/v02-evals-validation-c78ed0cdb9`. После отдельного переноса harness потребуется применить patch и повторить проверки на итоговой базе. Обычный `src/compare.ts` остаётся неизменным.

После переноса harness в эту ветку, из корня репозитория:

```sh
git apply --check evals/patches/container-version.patch
git apply evals/patches/container-version.patch
```

Затем из `evals/`:

```sh
TMPDIR=/home/kiselev/storage/tmp bun test test/container-comparison.test.ts test/baseline-comparison.test.ts test/compare.test.ts test/compare-analysis.test.ts test/compare-cli.test.ts
bun typecheck
```

Patch подключает уже находящийся в этой ветке модуль; на исходном `loginom` до переноса зависимости он ожидаемо не применяется. Ни ветка `eval-runner`, ни её рабочая копия этой задачей не изменяются.

## Контракт допуска

- Одинаковые container ID сохраняют прежнее поведение, включая старые manifests без наблюдённой версии.
- При разных ID источник версии — только `target.loginom_build` из зарегистрированных архивных `diagnostics/*-execution-events.jsonl`. SHA проверяется по тем же байтам, которые затем разбираются.
- Проверяются журналы всех продуктовых executions серии, включая инфраструктурные повторы и recovery. На каждую сторону требуется хотя бы одно известное значение; все найденные значения стороны должны совпадать. Ранняя попытка без версии допустима, если другие попытки дают согласованное наблюдение.
- Две версии должны совпадать точно: без нормализации и удаления build suffix. Отсутствие подтверждения, повреждённый журнал, неверный SHA и противоречивые наблюдения сохраняют `INCOMPARABLE`.
- Ожидаемый compatibility profile, имя контейнера, Docker tag и текущий живой стенд не служат доказательствами версии.
- `imageDigest`, остальные условия и существующий `operationalEquivalence` остаются строгими. Совпадение версии не объясняет изменившиеся isolation/config hashes.
- `comparison.json` содержит основание исключения: оба ID, наблюдённые версии и архивные ссылки на доказательства с SHA.

Публичный `compareContainerIdentity({ containerId, executions }, { containerId, executions })` возвращает `compatible`, `basis` (`container-id`, `loginom-version` или `null`) и `before`/`after` с `containerId`, `version`, `evidence`, `error`. В baseline-отчёте результат добавляется как `containerIdentity`; остальные причины несовместимости сохраняются. Некорректные SHA, JSON/UTF-8 и redacted версии не подтверждают равенство. `executions` должен происходить из проверенного `checkBaseline`; файлы вне зарегистрированного набора не читаются.

`BaselinePins`, immutable manifests, scoring fingerprints, admission, cleanup и recovery не меняются. Исходные manifests и evidence сохраняются побайтно.

## Реализация и приёмка

- [x] TDD: падающие тесты поведения через публичный интерфейс и зарегистрированные файлы → минимальная реализация → зелёная проверка.
- [x] Покрыты разные ID с одинаковой версией; разные, отсутствующие и противоречивые версии; ранняя попытка без версии; конфликт в инфраструктурном повторе и recovery; старые manifests с одинаковым ID.
- [x] Подтверждены блокировка другого image digest и необъяснённых isolation/config hashes, обнаружение подмены журнала и побайтная неизменность источников.
- [x] Подключение patch проверено в изолированной копии через публичный baseline comparator и экспорт `comparison.json` внутри delivery archive.
- [x] Из `evals/` выполнены целевые container-comparison, baseline-comparison и legacy compare suites, затем `bun typecheck`. Тесты использовали `TMPDIR=/home/kiselev/storage/tmp`.
- [x] Причина прежнего таймаута установлена; интеграционный сценарий завершился успешно с бюджетом 300 секунд.

### Результаты 2026-10-15

- На `v02-evals`: **81 PASS / 0 FAIL**, 297 assertions; `bun typecheck` — PASS.
- На `eval-runner` с интеграцией: **83 PASS / 0 FAIL**, 1193 assertions, 157.72 с; `bun typecheck` — PASS. Сам интеграционный сценарий — 156.53 с.
- RED: старый comparator с теми же новыми fixtures дал `INCOMPARABLE`, единственная причина — `containerId`, за 143.08 с. GREEN: после точечного подключения сценарий проходит.
- Прежний таймаут воспроизведён 2/2 раза на неизменённом тесте: 90.09 и 90.12 с. Две серии по 144 durable admissions/records ожидают filesystem journal (`jbd2_log_wait_commit`) при `fsync`; отказ происходил до comparator. Увеличен только бюджет интеграционного теста с 90 до 300 с, durability и assertions сохранены.
- Узкий review модуля и интеграции завершён без оставшихся замечаний. Новые исходники и патч проходят `git diff --check`; применение и обратное применение patch проверены на закреплённой базе.
- Модели, судья и живой Docker не запускались. Baseline, pins и lifecycle не мигрировались; legacy compare и evaluator fingerprint не менялись.

## Ограничения

Исходные diagnostics LAB-55 локально не найдены, публичный экспорт их исключает. Разблокировка именно LAB-55 зависит от наличия подходящих архивных доказательств в исходной серверной серии; синтетические fixtures этого не подтверждают. Реализация в `loginom` готовит модуль и проверяемый patch, а активация baseline-сравнения зависит от отдельного переноса harness.
