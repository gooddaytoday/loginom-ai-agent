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

- [ ] Проверить существующие refs/PR и настройки workflows.
- [ ] Создать локальный checkpoint, обычный push `autonomus-eval` без force.
- [ ] Создать draft PR `autonomus-eval → loginom` по шаблону и прикрепить к чату.
  PR описывает весь новый автономный runner, поэтому тип `feat(evals)`.
- [ ] Дождаться автоматических test/typecheck/secrets/PR проверок.

## 2. Устранение локальных и CI отказов

- [ ] Проверить pins: Bun 1.3.14, Node 24.19.0 как в product CI; evals
  использует настоящий Node, fixture tools и собственный frozen lockfile.
- [ ] По существующему сигналу измерить setup и probes isolated-storage
  приватным transparent docker wrapper, не меняя tracked исходники.
- [ ] Отличить ошибки runtime от тестового scope/окружения. Исправлять
  первый неверный шаг через RED → минимальный GREEN → упрощение; не
  повышать timeout, не менять ожидания и не добавлять retry без причины.
- [ ] Стабилизировать оставшиеся sandbox/judge случаи по установленной
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
