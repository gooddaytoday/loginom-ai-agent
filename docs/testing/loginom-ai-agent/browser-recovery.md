# Восстановление через браузер: проверки

Дизайн: [browser recovery](../../superpowers/specs/2026-10-19-browser-recovery-design.md), редакция 3.
Ветка `browser-recovery` от `demo-022` `d64cd92aa7`. Ниже различаются проверки из исходников,
приёмочная сборка CLI с явно заданным флагом и упакованный release-артефакт.

## Модульные и контрактные проверки (mas, 2026-10-19)

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
