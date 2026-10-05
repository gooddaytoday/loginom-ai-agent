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

- [ ] Добавить fake CLI: task `infra-retry-success` в первый запуск пишет
  `LOGINOM_HOST_TIMEOUT` без событий и stale writer, во второй проверяет
  отсутствие writer и выдаёт `group-sum-qty` fixture. Счётчик запусков хранится
  во временном workspace, не в глобальном окружении.
- [ ] Через `main(["--skip-judge", "--tasks", tasks], env)` подтвердить RED:
  `metrics.total === 1`, `completed === 1`, `infra_error_count === 1`;
  исходный результат и stderr сохранены; один task/attempt и два запуска.
- [ ] Добавить второй проход существующего цикла, только после `afterAttempt`;
  архивировать первый каталог и передать initial result в `runAttempt` до
  dispatch. Optional `infra_retry: { initial: AttemptResult }` сохраняется
  также при ошибке повторного запуска и persistence.
- [ ] Операционные метрики считают `[initial, final]`, качество только final.
  Report показывает initial с пометкой исходного запуска.
- [ ] Проверить два timeout: два infra_error, quality total 0, третьего запуска
  нет. Проверить последующие обычные repeat и переход к следующей задаче.
- [ ] Проверить no_artifact/failed/harness_error без повторов, ошибку cleanup
  без нового dispatch, отсутствие сессии и токенов у первого запуска.
- [ ] Fake judge и `--judge-only` сохраняют initial result, score/pass и
  infra_error_count; compare принимает итоговую структуру.
- [ ] Из `evals/`: `bun test test/infra-retry.test.ts`, затем `bun test` и
  `bun typecheck`; из root: `git diff --check`.
- [ ] Обновить README и remaining-work по фактически выполненным проверкам;
  зафиксировать conventional commit.

## Checkpoint

2026-10-05: контракт определён; реализация и проверки ещё не выполнены.
