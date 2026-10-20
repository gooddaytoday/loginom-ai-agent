# Browser recovery, план 5: evals, приёмка и включение в release

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Учитывать `recovered_via_browser` отдельно от чистого PASS, довести сценарии на реальном Loginom до полного набора, проверить упакованные CLI и Desktop на Linux матрицей доступности и естественными отказами и только после гейта включить флаг в release для всех платформ.

**Architecture:** Source-level сценарии расширяют скрипт плана 3 (`browser-recovery-acceptance.ts`) и используют `acceptanceFault` из плана 2. Упакованные сборки с флагом проверяются матрицей доступности и прогонами реальной модели. Evals читают попытки из потока событий CLI. Последней правкой `release.yml` ставит флаг для `prod` на Linux, Windows и macOS.

**Tech Stack:** Node 24.19.0, Bun, `supervise()` из `@loginom-ai-agent/loginom-host`, evals harness, GitHub Actions.

**Spec:** [дизайн, разделы 4, 11](../specs/2026-10-19-browser-recovery-design.md); [общий контракт](2026-10-19-browser-recovery.md#общий-контракт).

## Global Constraints

- `acceptanceFault` никогда не передаётся продуктом (план 2, Task 7): `host.ts` его не читает, Node handshake и Desktop его не принимают; validation и readiness его отклоняют.
- «Искусственно вызванный отказ допустим для воспроизводимости, но успешный unit-тест или вызов Playwright сам по себе не доказывает выполнение задачи.» Каждый сценарий доводит задачу до сохранённого пакета и прочитанного результата или проверенного файла.
- Упакованные CLI и Desktop проверяются только на естественных отказах (решение владельца от 19.10). Строка матрицы, которой нужен отказ, без наблюдённого отказа получает `BLOCKED` с идентификаторами прогонов, а не PASS.
- «Исход `recovered_via_browser` учитывается отдельно от чистого PASS»; `pass_rate`, `completion_rate` и `compare` не меняются.
- Отчёты различают проверенные установленные артефакты и проверки из исходников. Приёмка — на Linux; Windows и macOS получают флаг без отдельной приёмки (решение владельца от 19.10), отчёт это называет.
- Секреты и сырые журналы в git не попадают; в отчёт идут выдержки и SHA-256.

## Результат, объём, исключения

- Готово, когда Tasks 1–4 закрыты, гейт Task 4 выполнен и владелец дал команду слияния и выпуска.
- Первый проверяемый сквозной результат — Task 1: completed start в CLI events → сохранённый результат попытки → счётчик и строка отчёта через существующий fake/dir путь. Native Task 2 отложена до проверенного активного входа текущего runtime; это не блокирует независимую Task 1.
- Объём: ~11 файлов, ~+500 / −10 строк (evals с интеграционной фикстурой/проверкой ~170, скрипт приёмки ~150, отчёты и runbook ~170, workflow ~3).
- Исключения: приёмка Windows и macOS, доставка входного файла, изменения `compare`.
- Предусловия сверх плана 3 ([preflight-отчёт](../../testing/loginom-ai-agent/reports/2026-10-19-browser-recovery-preflight.md), пункты 4–6): профили двух моделей (с изображениями и текстовой) и судьи, ID кейсов естественных отказов от 18.10, вход в GitHub для candidate.

## Review Focus

1. Попытка со `start`, но без PASS — не `recovered_via_browser` (Task 1).
2. `browser_find` находит «Отмена» вне мастера узла или больше одного раза — сценарий FAIL без угадывания (Task 2).
3. Флаговый CLI с `LOGINOM_AI_AGENT_CLI_BUNDLE` → `session.json` `browserRecovery: false` (Task 3).
4. `release.yml` меняется только после гейта (Task 4).

---

### Task 1: Evals считают `recovered_via_browser`

**Files:**
- Modify: `evals/src/cli.ts:26-84` (`parseEvents`)
- Modify: `evals/src/report.ts:34-70,77-113,184-212`
- Modify: `evals/src/run.ts` (`runAttempt`, 239–345: перенести поле в результат)
- Modify: `docs/superpowers/specs/2026-09-18-evals-design.md` (раздел «Статусы, оценка и метрики», новый подраздел)
- Test: `evals/test/cli.test.ts`, `evals/test/report.test.ts`, `evals/test/run.test.ts`
- Fixture при необходимости: один CLI event-файл в существующем `evals/fixtures/fake/`; никаких новых настроек или test harness.

**Interfaces:**
- Produces:
  - `parseEvents(text).browserRecoveryStarted: boolean` — есть завершённая часть `loginom_dock_browser_recovery` с `input.action === "start"`.
  - Новые попытки всегда записывают `AttemptResult.browser_recovery: boolean`, включая `false` в empty result. При чтении исторического summary поле может отсутствовать: это не свидетельство recovery, count не увеличивается и миграция не нужна; тип допускает историческое отсутствие. Отсутствующий старый счётчик при render не выводится как `undefined`.
  - `aggregate()`: `recovered_via_browser_count` — попытки с `browser_recovery === true` и `pass === true`; при `skipJudge` — со `status === "completed"`.
  - `renderReport` выводит строку рядом с `pass_rate`.
  - Признак переносится в существующий измеренный `base` после `runAgent`, чтобы последующая ошибка артефакта/учёта не стирала наблюдённый факт. `aggregate` использует текущий набор `counted` и строгое `browser_recovery === true`: считает попытку один раз, не количество start. `aggregateTask`, знаменатели и `compare` не меняются.

- [ ] **Step 1: Write one failing behavior test**

Последовательные вертикальные циклы: один падающий тест → минимальная реализация → GREEN → коммит, затем следующее поведение. Примеры ниже описывают контракт, а не пакет тестов перед реализацией. Проверить completed start без finish, finish без start, running/error start, несколько start как один признак; judge count требует pass=true, skipJudge — completed; историческое отсутствие поля не увеличивает count, старые rates сохраняются.

Отдельный цикл через существующий public `runAttempt` или `main` и fake/dir механизм проверяет events → сохранённый `browser_recovery` → count и строку отчёта. Проверка существующего measured base также сохраняет признак при последующей ошибке bookkeeping. Нового harness, runtime hook или настройки не добавлять.

```ts
test("parseEvents notices a browser recovery start", () => {
  expect(parseEvents(lines([recovery("start"), recovery("finish", { result: "completed" })])).browserRecoveryStarted).toBe(true)
  expect(parseEvents(lines([])).browserRecoveryStarted).toBe(false)
})
test("aggregate keeps recovered_via_browser apart from clean passes", () => {
  const metrics = aggregate([attempt({ pass: true, browser_recovery: false }), attempt({ pass: true, browser_recovery: true }),
    attempt({ status: "failed", pass: false, browser_recovery: true }),
    attempt({ status: "completed", pass: null, browser_recovery: true })], false)
  expect(metrics.pass_rate).toBe(0.667)
  expect(metrics.recovered_via_browser_count).toBe(1)
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd evals && bun test test/cli.test.ts test/report.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement minimally for that behavior**; повторить Steps 1–3 последовательно для оставшихся поведений, коммитить GREEN циклы. Правка соответствующего контракта в спеке evals предшествует реализации и идёт тем же коммитом (`evals/AGENTS.md`: при расхождении правится спека).

- [ ] **Step 4: Run tests to verify they pass** (команда Step 2, `bun test` и `bun typecheck` в `evals`; Expected: PASS)

- [ ] **Step 5: Commit**

```bash
git add evals docs/superpowers/specs/2026-09-18-evals-design.md
git commit -m "feat(evals): count recovered_via_browser apart from clean passes"
```

### Task 2: Остальные сценарии на реальном Loginom

**Files:**
- Modify: `packages/desktop/test/loginom/browser-recovery-acceptance.ts` (план 3, Task 5)
- Modify: `docs/testing/loginom-ai-agent/browser-recovery.md`
- Create: `docs/testing/loginom-ai-agent/reports/<YYYY-MM-DD>-browser-recovery-source/report.md`

**Interfaces:**
- Consumes: планы 1–4.
- Оператор скриптован, как в плане 3, Task 5. Текущий статус: BR-S1 BLOCKED, BR-S3 NOT_RUN; проба сохранённого Import → Group дала NOT_APPLIED без эффекта из-за неактивного output0, собственная cleanup подтверждена. Task 2 отложена до валидированного активного входа и первого успешного native main path BR-S1/BR-S3; до этого не расширять harness или hardening заблокированного пути. Приёмочные критерии сохраняются. BR-S7 — принятый host-тест плана 4, Task 1.

| ID | `acceptanceFault` | Триггер | Действия оператора | Требуемый результат |
| --- | --- | --- | --- | --- |
| BR-S2 | `exports.text`, `overwrite: "replace"`: `phase_stop configure` (`times: 1`) | T2: у `exports.text` нет драйвера освобождения | «Отмена» мастера | `continuable`; в `output` ответа исходной операции `released_by: "browser_recovery"` и `recovery_receipt_id`; Dock продолжает тот же узел без пересоздания; файл проверен по байтам |
| BR-S4 | `transform.calculator`: `phase_stop execute` (`times: 1`) | T4 `execution` после освобождения Dock | `finish` без вызовов браузера | строго `completed`: узел действительно выполнился; `dock_node_read` по квитанции |
| BR-S5 | `exports.text`, `overwrite: "replace"`: `phase_stop execute` (`times: 1`) | T2, цель — файл | `finish` без вызовов браузера | строго `completed`: файл проверен по байтам и SHA-256; `next_step` — продолжение сценария без `dock_node_read` |
| BR-S6 | как BR-S2 | T2 | вызов Dock в `browser`; `browser_evaluate`; `browser_snapshot {filename}`; `browser_navigate`; 31 вызов `browser_snapshot {depth: 1}` | соответствующие отказы не расходуют бюджет; проба подтверждает документ; 31-й вызов — `BROWSER_RECOVERY_BUDGET_EXHAUSTED` и `stopped` с `budget_exhausted`; ложного успеха нет |

Сценарии BR-S2, BR-S4 и BR-S5 заканчиваются `package.save_checkpoint` через Dock и состоянием пакета `modified: false`.

- [ ] **Step 1: Extend the script and runbook**

- [ ] **Step 2: Run the scenarios**

Run: `cd packages/desktop && LOGINOM_AI_AGENT_TEST_CONFIG=<private config> LOGINOM_AI_AGENT_TEST_RESOURCES=<staged resources> bun test/loginom/browser-recovery-acceptance.ts BR-S2` (затем BR-S4, BR-S5, BR-S6)
Expected: все четыре выполняют требуемый результат; в журналах BR-S2, BR-S4 и BR-S5 есть `acceptance_fault_injected`, `browser_recovery_handoff`, `browser_recovery_verified`, `browser_recovery_dock_resumed`.

- [ ] **Step 3: Write the report**

SHA исходников, SHA-256 ресурсов, по сценарию — PASS/FAIL, ключевые квитанции (выдержки), ограничения: оператор скриптован, это не качество модели.

- [ ] **Step 4: Commit**

```bash
git add packages/desktop/test/loginom/browser-recovery-acceptance.ts docs/testing/loginom-ai-agent
git commit -m "test(desktop): accept browser recovery on Loginom with induced faults"
```

### Task 3: Упакованные CLI и Desktop: доступность и естественные отказы

**Files:**
- Create: `docs/testing/loginom-ai-agent/reports/<YYYY-MM-DD>-browser-recovery-packaged/report.md`
- Modify: `docs/testing/loginom-ai-agent/browser-recovery.md` (раздел упакованной приёмки)

**Interfaces:**
- Consumes: `session.json` попытки runtime (`browserRecovery`), `cli-manifest.json`, Desktop `release-manifest.json`, счётчик evals из Task 1.

- [ ] **Step 1: Build artifacts**

Приёмочные артефакты с флагом: `LOGINOM_AI_AGENT_BROWSER_RECOVERY=1 LOGINOM_AI_AGENT_CHANNEL=prod bun packages/loginom-host/script/build-cli.ts <new dir>` и Desktop DEB по `docs/testing/loginom-ai-agent/linux.md` с тем же окружением. Контрольные — без флага. Каждый артефакт — в новом каталоге; манифесты фиксируют фактический SHA.

- [ ] **Step 2: Availability matrix**

| Запуск | Ожидаемое `browserRecovery` в `session.json` |
| --- | --- |
| установленный CLI с флагом | `true` |
| установленный Desktop DEB с флагом | `true` |
| CLI из исходников и Desktop не в packaged-режиме | `false` |
| установленный CLI без флага с `LOGINOM_AI_AGENT_BROWSER_RECOVERY=1` и `LOGINOM_AI_AGENT_CHANNEL=prod` | `false` |
| CLI с флагом и `LOGINOM_AI_AGENT_CLI_BUNDLE` | `false` |

Манифесты: `metadata.browserRecovery` в `cli-manifest.json` и `browserRecovery` в `release-manifest.json` совпадают с входом сборки.

- [ ] **Step 3: Natural-failure runs**

До первого прогона записать в отчёт набор кейсов, где 18.10 наблюдались остаточные классы (не наблюдён DOM-owner, `UI_SCAN_LIMIT`, `WIZARD_OPEN_NOT_CONFIRMED`, ожидание готовности, подтверждение журнала JS, скачивание на медленном хосте). Без этих ID строки естественных отказов получают `BLOCKED` с причиной. Прогнать набор на установленном CLI с флагом с моделью с изображениями и с текстовой моделью; затем одна сессия Desktop с реальной моделью на кейсе, где в CLI наблюдался переход. Записать `recovered_via_browser_count`, наличие `loginom_browser_take_screenshot` в каталоге каждой модели и итог задачи.

- [ ] **Step 4: Write the report**

Матрица по строкам таблицы раздела 11 дизайна: PASS, FAIL или `BLOCKED` (нет естественного отказа) с ID прогонов. Отдельно: Windows и macOS не проверялись, флаг для них включается решением владельца.

- [ ] **Step 5: Commit**

```bash
git add docs/testing/loginom-ai-agent
git commit -m "docs(testing): record packaged browser recovery acceptance"
```

### Task 4: Включение флага в release

**Гейт до Step 1:** BR-S1–BR-S6 — PASS (план 3, Task 5; Task 2); host-тест BR-S7 зелёный (план 4, Task 1); матрица доступности — PASS (Task 3); строки естественных отказов — PASS или `BLOCKED` с ID прогонов (Task 3). Иначе остановиться.

**Files:**
- Modify: `.github/workflows/release.yml:198,282,355` (окружение задач Linux, Windows и macOS)
- Modify: `docs/testing/loginom-ai-agent/ci-release.md`
- Modify: `AGENTS.md` (карта модулей: ссылка на runbook browser recovery)

**Interfaces:**
- Produces: `LOGINOM_AI_AGENT_BROWSER_RECOVERY: ${{ needs.verify.outputs.channel == 'prod' && '1' || '0' }}` рядом с `LOGINOM_AI_AGENT_CHANNEL` во всех трёх задачах.

- [ ] **Step 1: Edit the workflow and docs**

- [ ] **Step 2: Verify with a prod candidate build**

Run: `gh workflow run release.yml --ref recovery-acceptance -f mode=candidate -f channel=prod`
Expected: в артефактах Linux, Windows и macOS `metadata.browserRecovery` и `browserRecovery` равны `true`. Кандидат не-prod канала не запускается: `linux-matrix` для него падает (`release.yml:165`). Значение `0` для не-prod задаёт само выражение, а артефакт без флага проверен в Task 3.

- [ ] **Step 3: Commit and checkpoint**

```bash
git add .github/workflows/release.yml docs/testing/loginom-ai-agent/ci-release.md AGENTS.md
git commit -m "chore(release): enable browser recovery in prod builds"
```

Checkpoint до 20 строк. PR в `demo-022`; слияние и выпуск — отдельная команда владельца.
