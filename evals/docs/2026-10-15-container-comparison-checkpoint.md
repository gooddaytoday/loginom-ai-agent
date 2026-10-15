# Checkpoint: сравнение контейнеров — 2026-10-15

- Ветка `v02-evals` от `loginom` — `d781f390e5`; весь diff внутри `evals/`.
- Готов `src/container-comparison.ts`: разные ID допускаются по точной actual версии из зарегистрированных SHA-проверенных diagnostics; одинаковые ID сохраняют прежнее поведение.
- На сторону достаточно одного наблюдения, все версии product executions, включая infra retry/recovery, согласуются; missing/corrupt/conflicting evidence блокирует исключение.
- `imageDigest`, остальные gates и `operationalEquivalence` сохранены; manifests/pins/scoring/admission/cleanup/recovery не менялись.
- Из-за отсутствия baseline comparator в `loginom` подключение поставлено как `patches/container-version.patch`; весь harness не переносился.
- Patch проверен на `eval-runner` — `c78ed0cdb9488492281fc269620c6153245aa480` в отдельной временной копии; исходная рабочая копия не менялась.
- TDD RED: старый comparator отклонил новые зарегистрированные fixtures только по `containerId` (143.08 с).
- На ветке: целевые module + legacy compare — 81 PASS / 0 FAIL, 297 assertions; `bun typecheck` PASS.
- С интеграцией: 83 PASS / 0 FAIL, 1193 assertions, 157.72 с; `bun typecheck` PASS; экспорт и неизменность источников проверены.
- Таймаут 90 с воспроизведён 2/2: durable fixtures ждут filesystem journal при fsync до comparator; бюджет теста 300 с, проверки/durability сохранены.
- Узкий review без оставшихся замечаний; patch apply/reverse и `git diff --check` проверены.
- Новых модельных/judge/Docker вызовов нет; LAB-55 не проверялся: исходные diagnostics локально отсутствуют и исключены из публичного экспорта.
- Следующий шаг после отдельного переноса harness: применить patch и повторить проверки на итоговой базе; команды и контракт — в [плане](2026-10-15-container-comparison-plan.md).
