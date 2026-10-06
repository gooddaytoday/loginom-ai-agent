# Один повтор infra_error — Implementation Plan

**Goal:** закрыть задачу 3 remaining-work одним повтором после подтверждённой очистки.

**Architecture:** существующий цикл запускает максимум два CLI для одного
номера попытки. Итог остаётся одной записью, `infra_retry.initial` сохраняет
первый сбой; исходные файлы архивируются в `infra-error/`. Используются
`runAttempt` и `afterAttempt`, без нового supervisor или retry framework.

**Tech Stack:** Bun, TypeScript, fake CLI и fake judge, временные профили.

**Spec:** `docs/superpowers/specs/2026-09-18-evals-design.md`,
уточнение контракта стабилизации, пункты про `infra_retry`.

## Ограничения

- База: `evals` (`91984c36d`); ветка `infra-error-retry`.
- Runtime-изменения только в `evals/`; canonical contract и отчёт обновляются в docs.
- Повтор только для `infra_error` и только один, после confirmed cleanup.
- Номера попыток, входы, prompt, имя пакета и quality-метрики не удваиваются.
- Отказ cleanup, persistence или Ctrl+C запрещает новый запуск.
- Без живого Loginom, провайдера, судьи и изменения общих профилей.

## Один вертикальный цикл реализации

**Файлы:** `evals/src/run.ts` — цикл и архив первого запуска;
`evals/src/report.ts` — optional history, операционные счётчики и report;
`evals/fixtures/fake-cli.ts` — последовательный сценарий до/после startup error;
`evals/test/infra-retry.test.ts` — fake CLI через `main`; `evals/README.md` — формат.
`rejudge.ts` сохраняет history существующим spread итогового результата.

- [x] Добавить fake CLI: task `infra-retry-success` в первый запуск пишет
  `LOGINOM_HOST_TIMEOUT` без событий и stale writer, во второй проверяет
  отсутствие writer и выдаёт `group-sum-qty` fixture. Счётчик запусков хранится
  во временном workspace, не в глобальном окружении.
- [x] Через `main(["--skip-judge", "--tasks", tasks], env)` подтвердить RED:
  `metrics.total === 1`, `completed === 1`, `infra_error_count === 1`;
  исходный результат и stderr сохранены; один task/attempt и два запуска.
- [x] Добавить второй проход существующего цикла, только после `afterAttempt`;
  архивировать первый каталог и передать initial result в `runAttempt` до
  dispatch. Optional `infra_retry: { initial: AttemptResult }` сохраняется
  также при ошибке повторного запуска и persistence.
- [x] Операционные метрики считают `[initial, final]`, качество только final.
  Report показывает initial с пометкой исходного запуска.
- [x] Проверить два timeout: два infra_error, quality total 0, третьего запуска
  нет. Проверить последующие обычные repeat и переход к следующей задаче.
- [x] Проверить no_artifact/failed/harness_error без повторов, ошибку cleanup
  без нового dispatch, отсутствие сессии и токенов у первого запуска.
- [x] Fake judge и `--judge-only` сохраняют initial result, score/pass и
  infra_error_count; compare принимает итоговую структуру.
- [x] Из `evals/`: `bun test test/infra-retry.test.ts`, затем `bun test` и
  `bun typecheck`; из root: `git diff --check`.
- [x] Обновить README и remaining-work по фактически выполненным проверкам;
  зафиксировать conventional commit.

## Checkpoint

2026-10-05: задача завершена. Первый поведенческий тест прошёл RED → GREEN.
Коммиты: `2c5d59949` (контракт/план), `4a0769ded` (реализация и первый зелёный тест).
Контракт прошёл независимый read-only review без открытых замечаний.
`bun install --frozen-lockfile` и `bun typecheck` прошли.
Полный `bun test`: **297 pass, 0 fail, 1299 assertions, 20 файлов, 353.52 с**,
в том числе 10 новых тестов. `git diff --check` прошёл.

Новые сценарии: успешный retry после stale writer, два timeout, отсутствие
третьего запуска после no_artifact/failed/harness_error, failed cleanup,
архивная коллизия, настоящий SIGINT между исходным infra_error и повтором,
обычные repeat/следующая задача, fake judge, пересудейство и compare.
Логи — временные `/tmp/evals-infra-retry-*.log`; исходные файлы первого запуска
сохраняются в `infra-error/`, оба результата — в итоговом result и summary.
Quality-счётчики учитывают только итог, infra_error/cleanup — оба запуска.

Живой Loginom, provider/judge и новый baseline не запускались. Общий стенд,
основной checkout, ветка evals, bundle и общие профили не изменялись.
Исторические результаты не мигрировались. Отказ подтверждения cleanup
по-прежнему блокирует последующий dispatch.

## Исправления ревью 2026-10-06

- [x] RED → GREEN: настоящий SIGINT во время архива сохраняет корневой result.json;
  копировать результат вместо переноса, остальные файлы переносить как прежде.
- [x] RED → GREEN: malformed infra_retry.initial даёт compare exit 2;
  переиспользовать проверку полей попытки для initial, сохранить legacy summary.
- [ ] Проверить профильные тесты, полный bun test, bun typecheck и git diff --check;
  записать фактический результат в checkpoint и remaining-work.
