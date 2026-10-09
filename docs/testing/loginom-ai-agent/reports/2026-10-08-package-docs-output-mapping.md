# Output mapping: разбор трёх отказов baseline

В сохранённых попытках ABC, cohort и low-liquidity подтверждён общий отказ
geometry proof `right_containment`. Единственная первопричина неполноты страницы
не доказана; изменения продукта, допуска, viewport и retries не выполнялись.
Каждый native-кейс наблюдался один раз: stable/flaky **UNKNOWN**.

| Попытка | Наблюдение | Отрицательных samples |
| --- | --- | --- |
| abc-pareto-groups#1 | addressed output definition page at0 | 46 |
| cohort-spend-activity#1 | complete output definition page at0 | 46 |
| low-liquidity-companies#1 | complete output definition page at0 | 43 |

Во всех samples: правая граница1158.03125, ожидаемая1158, допуск0.015625 CSS px,
DPR1, viewport1280×800. Predicate `child.right <= parent.right + tolerance`
возвращает false. Полная definition page/rendered window не подтверждается;
observer возвращает `unverified_definition_page`, пустые fields и отсутствие
scroll ref. Bounded readiness истекает без нового жеста; outer phase сохраняет
`AMBIGUOUS/output_mapping/NODE_APPLY_STOPPED`, effect_possible=true и
cleanup_complete=false. Подтверждённый harness cleanup не отменяет native отказ.

Журнал хранит только первый failed geometry predicate. DOM owner этого ref,
прочие отрицательные complete/window proofs и clipping/rounding неизвестны.
Поэтому устранение одной проверки ещё не обещает native PASS. Более поздний
широкий workspace observation low-liquidity отказал по page budget отдельно.

Cohort остановился до создания output checkpoint и исходного Output Done.
Прежний успешный Done относится к мастеру калькулятора. Последующий
`Original output Done reference unavailable` соответствует recovery guard;
дефект этого guard не показан, обходить его нельзя.

Baseline `fc3d97dbf` и candidate `49b1584f2`:11 выбранных definition/mapping
modules плюс node-procedure совпали по байтам и manifest hashes. Эти данные
не доказывают регрессию candidate и не меняют измеренные результаты baseline.
Pinned Node24.19 source/VM проверки из `packages/loginom-runtime/client`:

- `test/import-definition-pages.test.mjs` и `test/node-output-mapping-recovery.test.mjs`:
  три повтора, каждый20 PASS/0 FAIL/exit0.
- `test/workspace-ui.test.mjs`, pattern `fractional geometry|addressed output definitions|output page refuses|buffered output page`:
  три повтора, каждый20 PASS/0 FAIL/exit0.

Все команды использовали `--test --test-isolation=none`; stderr пустой,
девять source/test hashes до/после совпали. Это исходные проверки,
**не native воспроизведение**. Live/model/judge/Help/browser/Docker calls0.

Полный private evidence сохранён в acceptance-каталоге
`output-mapping-readonly-signal-20261008`:39 entries в архиве прошли полную
распаковку с проверкой хэшей, bytes, modes и точного набора;28 верхних файлов
дополнительно скопированы с проверкой exact bytes. `report.md` SHA256
`631a610dcc462a4cd16ea4bb3de8b96e8e0142626a21ffcfb4ce0e026a89fad5`,
preservation SHA256 `34a677aa5d8bbcddb7ec56b69fc8f4a1e0999c25947ba60b12df77ecc70c120b`.
Исходные formal diagnostics archives и result/events/cleanup hashes перепроверены;
новых запусков и правок immutable A/B нет.

Следующий диагностический шаг: fixture точных измеренных границ и отдельные
bounded proofs failed-ref owner, complete/window и required fields, с negative
control настоящего overflow. Решение об изменении допуска требует этих данных;
активный A/B не прерывать и его условия не менять.
