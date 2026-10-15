# Prospective reuse шести baseline references

Статус: контракт для review до первого model dispatch серии `20261014T185528Z-ad0f2b`. Реализация и admission ещё не выполнены. Критерии `node-selection-policy-v2` остаются прежними; этот контракт меняет только источник шести baseline-наблюдений и учёт запусков.

## Зафиксированная граница

Новая матрица содержит **31 позицию: 6 исторических baseline references + 25 новых candidate attempts**. Все шесть baseline из `20261014T112452Z-5e223f` включаются вместе, включая две технические неудачи. Старые 17 candidate attempts с отвергнутым skill не входят в новую матрицу и не получают повторной зачётной роли. Нельзя заменять старую неудачу повтором или повышать её outcome после manual release.

Baseline описательный: policy 3 passed / 2 violated / 1 insufficient; analytics 4 correct / 2 not obtained; runtime 4 normal / 2 technical failures with approved strict release. Это не шесть policy PASS, не новый baseline-прогон и не оценка повторяемости. Условия v2 не возвращают требование math100%.

Порядок новой серии: candidate first9 → потребление шести baseline references → candidate remaining16. Обязательные exception/failure/anomaly reviews, strict own release и остановка при подтверждённом нарушении candidate JS-policy сохраняются. First9 должны быть завершены, рассмотрены и освобождены по действующему v2; reference-ветка не обходит этот барьер перед повторными candidate attempts.

## Явный opt-in в новом lock

Без `baselineReferences` действуют прежний controller и 31 новых model slots. Новый lock с reuse фиксирует `plannedComparisonSlots: 31`, `plannedModelSlots: 25`, `referencedBaselineSlots: 6`, `plannedBaselineSlots: 6`, `plannedCandidateSlots: 25` и объект `baselineReferences` версии 1. Неполное или неоднозначное сочетание этих полей запрещено.

`baselineReferences` содержит:

- `originRunID`, абсолютный `originResultsRoot`, refs `{path, sha256}` на исходный protocol, baseline pins, runtime pins и baseline v2 summary; исходные skill digest и runtime revision;
- ровно шесть уникальных slots `{phase: "baseline", task, attempt: 1, sessionID, evidence}` для sales-by-category, abc-pareto-groups, monthly-demand, risky-approved-claims, campaign-roi-by-channel, first-last-touch;
- для каждой строки — refs с SHA на исходные dispatch, returned, attempt, сохранённую history/runtime evidence и v2 sidecar; для normal completion — closure и её copied/protected evidence; для technical failure — descriptor, независимый release review, связанное recovery evidence и ранее сохранённый actual gate;
- frozen comparison evidence, связывающее общие параметры старого baseline с новым candidate, и хеши всех используемых reference-файлов.

Все refs — обычные неизменяемые файлы с абсолютными проверенными путями, без symlink. Historical evidence ограничено origin root; новые comparison evidence — новым resultsRoot. Данные самого профиля не копируются в новую серию: exact-own guard archive/Host paths остаются в исходном release descriptor и проверяются существующим release validator. Нет произвольного выбора другого origin или candidate evidence вместо baseline.

Исходный baseline-pins используется **без изменения байтов, runID, resultsRoot, manifest и package/result names**. Новые matrix-строки baseline содержат его фактическую проекцию `selectionAttempt` и original three-argument `buildAgentPrompt`; candidate-строки содержат новую проекцию. Старые matrix, lock, ledger, attempts, audits, reviews и архивы guard не переписываются и не переносятся под новые identities.

## Сопоставимость до admission

Новый lock должен доказать, а не предположить совпадение:

- runtime revision и полного runtime manifest; CLI executable, dependencies и browser closure по frozen упаковочному evidence; различия skill/служебных manifest metadata явно отделены от общего исполняемого кода;
- model `openai/gpt-6-sol-fast`, API model `gpt-6-sol`, variant `medium`, frozen-models bytes, requested tier `priority`, deadline 1800 / grace 90; фактический service tier остаётся unknown;
- container identity, endpoint/account/storage и того же последовательного профиля;
- шести standard task definitions, raw prompt hashes, input hashes, oracle hashes, auditor version и используемых graph/oracle contracts. Различающиеся attempts `[1]` и `[1,2,3]`, runID и имена целевых файлов не подменяются утверждением полного равенства итоговых prompts;
- baseline skill остаётся исходным `74cc…`; candidate получает новый отдельно проверенный digest, отличный от отвергнутого `ff18…`.

Новый evaluator/source seal относится к текущему controller. Исторический source/archive/protocol baseline остаётся отдельным provenance; нельзя запускать старую всю серию или применять её source seal к текущему коду. При любом неподтверждённом сравнительном поле admission останавливается; нового baseline fallback нет.

## Минимальная реализация controller

Изменения ограничены `evals/script/run-node-selection-series.ts` и `evals/test/node-selection-series.test.ts`. Single-attempt runner, continuation validators, Product и runtime не меняются.

1. Проверить opt-in и все шесть refs до первого candidate dispatch; включить sealed reference inputs в существующую interslot-проверку. Common candidate/source/model/runtime seals сохраняются.
2. Для baseline использовать исходный plan и вызвать существующий `runSeriesSlot` в явном `existingOnly` режиме. Этот режим проверяет существующий dispatch **до создания каталогов/dispatch**; отсутствие или повреждение evidence означает halt. Переход к `runSelectionAttempt`, reserve, model, новой recovery или fallback исключён.
3. Normal references проходят существующий collected gate; обе неудачи — существующий `assessTechnicalContinuation` с v2 context и исходными pins. Exact-own release/guard/account/Session/process checks не ослабляются. Decision `advance` технической неудачи означает только учёт и release, не PASS.
4. Писать только новый ledger: `reference: true`, `originRunID`, исходные Session/evidence hashes и неизменный outcome. Reference не увеличивает fresh-dispatch counter и не расходует `limit`. Resume повторно проверяет reference evidence, но не создаёт старый dispatch и не дописывает старый ledger.
5. Candidate-ветка, first9/manual barriers, no-replacement и immediate digest stop остаются прежними. Финальный отчёт различает 25 новых запусков и 6 references; историческое сравнение не выдаётся за одновременный эксперимент.

## Обязательный TDD перед реализацией

Через публичные `runSelectionSeries` / `runSeriesSlot`, из `evals/`, без global mocks и реальных моделей:

- RED: новый origin/runID не принимается прежним controller; GREEN: ровно шесть явных baseline references читаются без dispatch, четыре normal и две released technical сохраняют исходные статусы/байты.
- `existingOnly`: отсутствующий dispatch/closure/release, чужие Session/identity, duplicate/missing slot, candidate вместо baseline, symlink или изменённый hash → halt без создания попытки и model fallback.
- Изменённый общий runtime/model/task/input/oracle/baseline digest либо interslot evidence/source drift → отказ до следующего dispatch.
- Resume/limit считают только fresh candidate; first9 barrier сохранён, legacy opt-out неизменен. Старые files/ledger/audits и failed outcomes byte-equal.

Не вводить generic reference framework и не повторять oracle/семантические ревью уже закрытых baseline. Реализация, focused tests, typecheck, независимый review, frozen lock и Root admission предшествуют новым моделям.

## Проверенные исходные refs

Все относительные пути ниже отсчитываются от `evals/results/node-selection-local/20261014T112452Z-5e223f/`:

| Evidence | SHA-256 |
|---|---|
| `acceptance-lock.json` | `834620b93866078023dd988c283fcf9ddbc1651158503cbcf8c072458d79b3c0` |
| `baseline-pins.json` | `4a81f2cedce807c4764a06efcf10c3968fb94420619be4b69338fba2e108772c` |
| `runtime-source-pins.json` | `44289a5b0bad1c83c5c5f49fe5df7bab0abdf840ab004c96e13f03dc1a704478` |
| `matrix-interface-check.json` | `45263aadb403ccb6bb900d1046c6459dee8d109fa5b1c322c35e58770987b721` |
| `frozen-models.json` | `6c4aa6f49ec7f38379b0ac5823e1ef9d8b47a1a34dfe566ae05fb50e80544a01` |
| `policy-v2/baseline/summary-six-closed.json` | `ce274beff561f14a8e2da321343b26005d164a8b1cea3f944da1b74c243b9d26` |
| `series/baseline-risky-approved-claims-1/technical-continuation-review.json` | `f154e353c278d525a9415c149fa4bea73251da5f163f94ba32d660f4a395dd7c` |
| `series/baseline-risky-approved-claims-1/independent-gate-compatibility-r2.json` | `85b4b1314580119cad2fbc31e8bc3d9918b7deb97db3547df7b727b4f54dee24` |
| `series/baseline-first-last-touch-1/technical-continuation-review.json` | `6cfb41dd18e4afc2ad6bd34b785045073bcc82a952e866736ea93a81c69c66bc` |
| `series/baseline-first-last-touch-1/independent-gate-compatibility.json` | `afc211b37fa9d6bf23b0fcecb2e98b3726e5f20252bb71ee520ba182e88d544a` |

Criteria SHA: `5b5053d14aecf7462e317b75fa3a14fa3bff6717080128edf0da582171a015fa`.
Runtime revision: `659588afcc23fded2a44915d062afaf58646239d0a8c01b3222fa272bbb717dc`, 288 manifest entries.
Baseline skill: `74cc9ac0b5a22724909bd1ba3123e8f6e3abedbe85a3b87dee6596119bbfb340`.
Отвергнутый candidate skill: `ff18dc5f2b4da3d7b6c66d0419d48aae7590b2a07e0d2e50f7a01cd9f3f34261`.
