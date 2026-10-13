# Дополнительные Кросс-таблица eval (LAB-26)

Исходный узел `transform.cross_table`, план `docs/node-development/nodes/transform-crosstable/plan.md`, принятые этапы 1–3. Base `cd592244485cb892a0c1f13fd7b60dcbbf7f32ca`, доставка в `evals`. Исходный архив prompt/CSV имеет SHA256 `2c3b17f1de317edf4cd9ce51d4b0b49488a650402966a8535062e0b34cbd11f1`; все 8 entries его manifest проверены. Старые кейсы и LAB-16 live не запускаются.

| Кейс | Проверяемое поведение |
| --- | --- |
| `crosstable-multi-row-keys` | Два дискретных строковых ключа Region, Month в этом порядке; Category; real Amount/sum; fixed категории. |
| `crosstable-min-max` | Только min/max, native mask 12; собственные source record IDs и output mapping A_min/A_max/B_min/B_max; fixed категории. |
| `crosstable-sliding-source-refresh` | Initial A/B полностью прочитан; затем updated B/C применяется к тому же импорту; та же sliding CrossTable перечитывается с первоначальным source_operation_id без повторного apply. |

Каждый новый запуск сам создаёт import и CrossTable. Агент получает только исходный prompt и CSV. `oracle.py` использует CSV/Decimal независимо от Loginom и сохранён до builders; `oracle-provenance.json` фиксирует исходные hashes. Числовой допуск 0, строки в точном порядке, колонки сопоставляются по именам. `reference-provenance.json` содержит реальные builder/model/code-check/cold данные. Сохранённый sliding reference читает updated CSV: cold проверяет конечный граф, а историю смены источника подтверждают полные events.

Validator проверяет native роли/типы/порядок, реальный граф, exact input hashes и delivery/import receipts, complete output schema/category_fields, execution/owner/port identity, свежий export и финальное сохранение. Первое полное чтение новых кейсов требует native exact frames. У `dock_node_read` нет параметра `read.coverage=full`: для второго sliding read требуется достаточная полная выборка (`sample_complete=true`, `sample_rows=row_count`), verified numbers, новый completed execution, прежний port_guid и возврат workflow. Partial sample не принимается; отсутствие exact_table второго read не выдаётся за native full coverage. Native min/max mask берётся из реальных `node_observation_completed` в собственном подтверждённом profile-history; он не вычисляется из названий функций.

Негативы покрывают перестановку/потерю ключа, тип Amount, неверный агрегат/режим, mask 4/8/13, перепутанный XML mapping source, altered updated CSV, partial initial read, раннюю смену источника, stale execution/category_fields, заменённый import и source_operation_id, повторный CrossTable apply, неверный CSV/граф, пропущенное создание и отсутствующий артефакт. Неизвестные case/checklist IDs и инфраструктурные ошибки дают ERROR/2; неверное поведение/артефакт — FAIL/1.

Штатные команды из `evals/`, под собственным lease после native preflight по `docs/evaler/operations.md`:

```sh
R=/home/user/.local/share/loginom-evals-runtime
CFG="$R/operations/node-eval-ops.json"
LEASE="$R/roles/rich/reference-work/lab26-stand-lease-v2.json"
IDS=crosstable-multi-row-keys,crosstable-min-max,crosstable-sliding-source-refresh
"$R/bin/with-env" "$R/runtime.env" "$R/bin/bun" script/node-eval-ops.ts unit --config "$CFG" --lease "$LEASE"
"$R/bin/with-env" "$R/runtime.env" "$R/bin/with-env" "$R/roles/rich/eval.env" \
  "$R/bin/bun" script/run-node-evals.ts --tasks ./tasks/node-evals --only "$IDS" --label crosstable-additional
# Offline read-only перепроверка уже завершённого run, без новой модели:
"$R/bin/bun" script/check-node-run.ts <runDir> "$IDS"
```

Runner принудительно задаёт skip-judge/repeat=1; единственный штатный infra retry сохраняет исходную попытку. Builder использует `openai/gpt-6.1-sol/xhigh` и override `ATTEMPT_TIMEOUT_S=1800` после загрузки reference.env. Продукт — `openai/gpt-6-sol/default`; actual models подтверждаются по собственным архивным message records без публикации БД/профиля. Авторский расход builder — 2/1/1; первая отменённая multi-row попытка и прежние BLOCKED сохранены.

Ben принимает exact pushed frozen SHA независимо, сначала фиксируя собственный расчёт по prompt/CSV до чтения авторских ответов. Product FAIL при подтверждённой очистке совместим с READY_FOR_BEN. Итоговые evidence, manifest и SHA256 доставляются вложением issue; runtime-local paths не являются доставкой. Lease освобождается штатным helper только после завершения всего авторского этапа.
