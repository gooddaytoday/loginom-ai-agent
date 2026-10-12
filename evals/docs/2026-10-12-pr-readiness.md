# PR evals → loginom — 2026-10-12

[PR #61](https://github.com/gooddaytoday/loginom-ai-agent/pull/61).
База: `loginom` `a3d8e294763342edc4bb0a6e194ea5afa6a63304`.
Исходная ветка: `41bbb1fa73f4e7b61b742ac1ec90f3361a37cc07`;
она уже основана на этой базе. Подготовка выполняется в отдельном checkout;
незакоммиченные файлы основного рабочего дерева сохраняются.

## Согласованный объём CI

По уточнению пользователя в CI включены **только unit-тесты инфраструктуры evals**
и проверка типов. Job `evals-unit` находится в reusable `test.yml`, поэтому
входит в push/PR и candidate gates. Bun 1.3.14, pinned Node 24.19.0,
frozen `evals/bun.lock`; системные зависимости только для offline fixtures.
`bun run test:unit` выбирает 49 файлов; четыре набора Docker/bubblewrap
(`isolated-storage`, `node-eval-ops`, `node-skill`, `sandbox`) остаются
в полном локальном `bun test`. Живые Loginom/модель/судья в CI не запускаются.

`local.env` добавлен в `.gitignore`.

## Локальная проверка и диагноз

- Frozen install и `bun typecheck` — PASS.
- `python3 script/check-calibration-corpus.py --tasks tasks/analytic` — PASS:
  35 задач, 114 кейсов; это независимый пересчёт данных, а не калибровка модели.
- `bun run src/run.ts --dry-run --repeat 1` — exit 0; ожидаемые fixture FAIL
  и `no_artifact` сохраняются в отчёте без обращения к живой модели/серверу.
- Первый полный `bun test` — 549 PASS / 5 SKIP / 4 FAIL, 558 тестов,
  53 файла, 627 с. Три отказы связаны с открытым Chrome; четвёртый —
  transient host process identity observation в process supervisor.

Три clean-stand случая (`writer-settlement` × 2, `owned-registration` × 1)
падали 3/3 на занятом host с `Writer-release processes busy or foreign` и
проходили 3/3 в чистом PID namespace. Native guard и исходные settlement-тесты
введены вместе в `96ca26ea4a`; owned registration — `eeeea57d9`.
Продуктовый guard корректно запрещает чужие native processes. Тестам добавлено
явное условие чистого окружения; assertions и тесты foreign-process rejection
сохранены. После изменения: занятый host — 18 PASS / 3 SKIP / 0 FAIL;
чистый namespace — все 3 PASS / 0 FAIL.

Отказ `supervisor: helper в свежей доказанной browser session не теряется после reparent`
в первом наборе связан с `Cannot inspect process identity` чужого, не входящего
в owned ledger PID. Helper ancestry, admission и browser binding в evidence
подтверждены; неизвестный эффект не замаскирован успехом. Пять последовательных
узких повторов — 5/5 PASS. Точная исходная syscall-причина после исчезновения
чужого PID неизвестна; код fail-closed сохраняется. Собственный оставшийся
compiled fixture browser удалён через экспортированный `signalProcess` только
после совпадения birth/executable/device/inode/UID/group/session; исходный failed
receipt сохранён. Подвид ошибки не объявляется исправленной продуктовой регрессией.

Итоговый полный набор запускается последовательно в локальном PID namespace:
`unshare --user --map-current-user --pid --fork --mount-proc bun test`.
Mapping сохраняет текущий UID и обычные права при exec; отдельная проверка
недоступного native process, protected fixture и helper дала 3 PASS / 0 FAIL.
Настройки sysctl и рабочие браузеры пользователя не менялись.

`actionlint` 1.7.10 проверяет изменённый workflow с единственным исключением
для существующей функции `case`, неизвестной этому валидатору; GitHub принял
workflow и запустил jobs. SHA-256 скачанного официального actionlint проверен.

## GitHub checkpoint

Первая кандидатная сборка: [run 38250159901](https://github.com/gooddaytoday/loginom-ai-agent/actions/runs/38250159901),
`mode=candidate`, `channel=prod`, commit `441bc032b84910516fae9eceb80703c92b254ffd`.
Release/tag/publish не создаются. Окончательный candidate и статус PR
будут закреплены после завершения исправлений.

## Границы доказательств

Пропуски окружения не являются PASS. Unit gate не заменяет Docker/bubblewrap
наборы или live eval. Исторический live smoke и его ограничения сохранены
в `2026-10-12-rebase-live-smoke.md`; новый полноценный live baseline и
калибровка нового судьи в этой подготовке PR не выполняются.
Native CI/static/offline builds не означают установленную live GUI-приёмку
на пользовательских машинах. PR не сливается автоматически.
