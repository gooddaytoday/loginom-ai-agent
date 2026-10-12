# Cold headless compatibility repair Implementation Plan

> Исполнитель — Rich по существующему назначению Evaler; выполнять по /tdd.
> Отдельные workers и новые live бюджеты этим планом не назначаются.

**Goal:** допустить независимый cold reader на runtime без оконного сервера.
**Architecture:** единственный headless:true в существующем loginBrowser вызове,
с прежним exact pinned runtime и всеми cold/native/cleanup gates.
**Tech Stack:** Node ESM, Bun tests, exact bundled Playwright/Chromium.
**Spec:** ../specs/2026-10-12-text-import-cold-headless-design.md.

**Files:** `evals/script/text-import-cold/reader.mjs` — browser mode;
`evals/script/text-import-cold/provenance.json` — adaptation и текущий SHA256;
`evals/test/text-import-cold-reader.test.ts` — прежний public pin rejection,
дополнить только воспроизводимым поведенческим тестом на реальных resources.

**Constraints:** source pin `5cd74d8ee5d6125692d953eb327b4d4f833c27a1` неизменен;
bundled Node realpath из manifest обязателен; все native/cold gates прежние.
Partial исходник `8e2bc4fc480d9037ab1a9b4f5fe269daa716e97b`;
repeat ledger 2/10, cold calls 2, completed cold 0 до нового evidence.

- [x] Проверить исходный cold archive/manifest/305 файлов и reader headless:false.
- [x] Spec review: включить provenance adaptation/current hash, сохранить original/source pin.
- [ ] Передача выбранного исправления Evaler без повторного запроса владельцу.
- [ ] Rich: RED public reader на реальных pinned resources без DISPLAY; сохранить предыдущий отказ.
- [ ] Минимальное изменение только browser mode; GREEN по реальному поведению, без mocks/source-string tests.
- [ ] В provenance добавить adaptation `headless:true`, sha256 reader пересчитать; original_sha256/source_sha неизменны.
- [ ] Pin rejection, cold/cleanup regressions, bun typecheck из evals/; commit/publish clean partial.
- [ ] Fresh lease/штатный preflight; один исправленный cold saved reference №1 со всеми проверками.
- [ ] Независимый Evaler verdict; полный пилот/frozen SHA/Ben только по прежнему контракту.

Мониторинг не запускал live/browser/model checks: реализация и реальные GREEN/cold
проверки принадлежат назначенному Rich. Не изменять общий CLI, runtime, credentials,
модели, oracle, критерии или попыточные budgets; historical failures и ledger сохраняются.

Минимальная реализация в существующем `loginBrowser` вызове reader:

```diff
-  headless:false,keepOpen:true
+  headless:true,keepOpen:true
```

Поведенческий RED/GREEN выполняется прежней сохранённой командой reader из
проверенного cold archive, с теми же config/saved/expected/events, корректным
bundled Node и новым отдельным output/browser profile. RED — сохранённый refusal
на headed launch; GREEN должен создать настоящий native cold result, который
проверяется неизменённым `script/check-text-import-cold.py`. Повтор headed refusal
ради RED, новый builder/model run и probe не требуются. Если headless launch тоже
откажет, сохранить private redacted lower trace и остановиться для диагностики;
не объявлять причину новой или холодную проверку успешной автоматически.

Из `evals/` проверить:

```bash
bun test test/text-import-cold-reader.test.ts
bun test
bun typecheck
git diff --check
```

Проверить SHA256 всех provenance files по реальным bytes; source и original SHA
сравнить с исходным provenance. Сохранить release/cleanup proofs независимо от
verdict. Публикация clean partial не означает frozen SHA или READY_FOR_BEN;
Evaler сначала проверяет все cold gates и только затем оставшийся пилот.
