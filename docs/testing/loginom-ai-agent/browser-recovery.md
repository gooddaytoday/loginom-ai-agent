# Восстановление через браузер: проверки

Дизайн: [browser recovery](../../superpowers/specs/2026-10-19-browser-recovery-design.md), редакция 3.
Ветка `browser-recovery` от `demo-022` `d64cd92aa7`. Ниже различаются проверки из исходников,
приёмочная сборка CLI с явно заданным флагом и упакованный release-артефакт.

## Итог на финальном коде `b57d140df3` (с `demo-022` `31c70bc058`, исправления по ревью #231)

| Проверка | Где | Результат |
| --- | --- | --- |
| runtime client, все `test/*.test.mjs` | mas3 | 4387 pass, 0 fail |
| live-харнес T2 + T3, сборка `b57d140df3` | mas, app.loginom.ai | PASS |
| регрессия s3, s4, сборка `e5971b2ce6` | mas | CLI 0, cold-check PASS, recovery не вызывался |

Исправления по независимому ревью (Манки-У):
- handoff требует completed + cleanup;
- неизвестный исход действия оставляет Dock заблокированным;
- собственные ID квитанций при T4-перечитывании;
- запрет T4 после другого экспорта в тот же файл.

## Проверки на смёрженной ветке (с `demo-022` `d8d8400290`, 2026-10-19 вечер PT)

| Проверка | Где | Результат |
| --- | --- | --- |
| runtime client, все `test/*.test.mjs` на `33b2045682` | mas3 | 4371 pass, 0 fail |
| loginom-host: capability (вкл. stop при release), host-port, node-host на `97584c129e` | mas3 | 45 pass, 0 fail; `bun typecheck` чистый |
| agent: browser-recovery, profile-tools, prompt (вкл. одно сохранённое напоминание), CLI policy на `97584c129e` | mas3 | 108 pass, 0 fail; `bun typecheck` чистый |
| модель `gpt-6.1-sol/medium`, s1 с принудительной отменой чтения (`s1-cancel2`), сборка `e5971b2ce6` | mas, app.loginom.ai | PASS: модель сама прошла start → find → click «Сценарий» → finish, достроила сценарий через Dock; CLI 0, cold-check PASS, итог совпадает с s1 |
| live-харнес T2 + T3, сборка `e5971b2ce6` | mas, app.loginom.ai | PASS: T3 распознан как `REPEATED_PHASE_FAILURE`, `finish` → `dock_node_read` от квитанции с наблюдаемой схемой → SUCCEEDED |

Сверка с реальными журналами отказов 18–19.10 (fail-logs сквадов):
- T4-экспорт: в 4 журналах (q4, n19, q9; mas) есть `node_phase_refused` с `export_file_read_refused_restored`. Именно это состояние триггер превращает в `next_step` восстановления.
- T1: `NODE_RELEASE_REFUSED` с `user_action` («A prepared wizard is required for cancellation», q4, Фильтр) на текущем HEAD закрыт #210/#213. Путь T1 покрыт модульным тестом; проверка после него общая с T2.
- `saved_package_state: unavailable` в журналах не встречался.

## Модульные и контрактные проверки до слияния (mas, 2026-10-19)

| Пакет | Набор | Результат |
| --- | --- | --- |
| loginom-runtime client | все `test/*.test.mjs` на `3eb71da721` | 4309 pass, 2 fail в `artifact-delivery.test.mjs`; оба падают и на чистом `d64cd92aa7` |
| loginom-runtime | `start-input`, `call-timeout` | pass |
| loginom-host | capability, node-host, saved-package, cli-manifest, host-port | 67 pass |
| agent | `browser-recovery`, `profile-tools`, `tools`, CLI policy | pass; `bun typecheck` чистый (agent, host, desktop, core) |

Контрактный тест pinned Playwright MCP 0.0.82 подтверждает `snapshot.mode = none` и наличие
каждого инструмента allowlist в реальном каталоге MCP.

## Живая проверка runtime и host (app.loginom.ai)

Операторский харнес `packages/loginom-host/script/browser-recovery-live.ts` играет роль модели через
настоящий приватный Node Host приёмочной сборки CLI (`build-cli.ts` с `LOGINOM_AI_AGENT_BROWSER_RECOVERY=1`):

```
bun script/browser-recovery-live.ts <build-dir> <configured-cli-profile> <csv> <package-path> <evidence-dir>
```

CSV сопровождается `<csv>.settings.json` с настройками импорта. Сборка `8a720f8f40`, результат PASS:

1. Чтение, отменённое в фазе `read`, не оставляет штатного варианта Dock (T2): `next_steps[0]` — `dock_browser_recovery`.
2. `start` доводит аренду до `browser`; в каталоге появляются browser-инструменты.
3. `dock_node_read` отклоняется, пока аренда держит страницу; `browser_navigate` отклоняется host-гейтом.
4. `browser_snapshot` работает; `finish` проверен release-proof: `continuable`, квитанция `read-1:br1`,
   факты runtime отделены от `attested_by_model`.
5. Browser-инструменты сняты из каталога; Dock продолжает свежим `dock_node_read` (SUCCEEDED), пакет сохранён.

В `execution-events.jsonl` записаны `browser_recovery_started`, `_handoff`, `_action`, `_attested`,
`_verified`, `_receipt` и `node_operation_released`. Исход `recovered_via_browser` в отчётах
приёмки определяется по этим событиям.

## Регрессия демо на приёмочной сборке CLI с флагом

Модель `openai/gpt-6.1-sol/medium`, своя пара аккаунтов, cold-check сохранённого пакета.

| Сценарий | Сборка | CLI | cold-check | recovery |
| --- | --- | --- | --- | --- |
| s1-revenue | `8fe528f3b6` | 0 | PASS | не вызывался |
| s2-customers | `8a720f8f40` | 0 | PASS | не вызывался |
| s5-pivot | `8a720f8f40` | 0 | PASS | не вызывался |
| s6-abc | `8a720f8f40` | 0 | PASS | не вызывался |

s8 продолжает сессию s7 и в этой серии не запускался.

## Ограничения

- Упакованные release-артефакты не проверялись: приёмка DMG — в конце, по команде владельца.
- T4 покрыт модульными тестами (экспорт — executor, сохранение — managed bridge), живой проверки T1, T3 и T4 ещё нет.
- Доставка входного файла в режим не входит: её незакрытые состояния — это неустановленный исход вызова браузера (§5).
- Регрессия s3, s4 и полный прогон модели с искусственным отказом (`s1-cancel`: восстановление пройдено, задача не доведена)
  остановлены 2026-10-19 из-за нагрузки mas и будут повторены позже.
- `recovered_via_browser` в `summary.json` eval-харнеса не добавлен до окончания серий LAB-81.
