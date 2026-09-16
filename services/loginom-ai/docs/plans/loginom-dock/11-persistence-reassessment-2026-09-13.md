# Узел11: переоценка persistence — 13 сентября 2026

**PASS59/59 при отдельной переоценке замороженного run20260913-122247-a862a34d.**
Исходный результат FAIL57/59 сохранён неизменным. Нового выполнения Hermes,
браузера, изменения product runtime или goal не было.

## Исправление verifier

Коммит `9ddb33edf973264e90222f16f75fb832c7dcb2ff`, версия
`replacement-persistence-draft-overwrite-v2`.
Verifier SHA256 `5449a8f2cad5b53a0aa46cf5003182f3fdc747456581618e75854d88e9037f33`.
Изменён только диагностический `replacement_persistence_evidence.py`, добавлены
его focused tests и отдельный узкий `replacement_reassessment.py`.

Первый checkpoint теперь требует fail, пустой прежний путь и имя именно
подтверждённого собственного нового черновика. Проверяются единственный initial
prepare до узла, READY/created_draft/ownership, session/runtime/manifest/target,
document и workflow. Второй save требует replace и точный путь первого успешного
save. Пустой или чужой путь второй стадии не допускается. Сохранены совпадение
prepared/completed parameters/checkpoint, exact graph, порядок и уникальность
receipts, неизменность settings, свежесть выполнения и полные выходы.
Для overwrite обязательна последовательность conflict→overwrite_confirmed→
save_flow_completed→close→open с привязкой к пути.

Focused suite:17 тестов PASS, включая пустой/чужой путь второй стадии,
несовпадение prepared/completed, wrong policy каждой стадии, foreign graph,
удаление и перестановку каждого native trace события, подмену исходного draft,
owner/session/runtime/manifest/target, первого успешного пути, stale execution.
Компонентные fixtures синтетические: проверки выходов изолированы в focused
suite; фактические данные проверены полным отдельным аудитом реального run.
Все36 тестов семейства Replacement прошли.

## Происхождение переоценки

Отдельный entry point сверил252 execution harness inputs и253 полного inventory
с исходным Git tree `5891dfdc`; единственное различие областей — `empty.csv`.
Все исходные файлы harness вне inventory также сверены с этим Git tree;
допустимо изменение только named persistence verifier и добавление двух named
файлов tests/entry. Изменённые байты не выдаются за original harness.
Все392 source inventory files сверены с execution Git `49c8b68f` и текущими
байтами, runtime map полностью совпал. Исходный product commit `b0571534`,
runtime `8d6d4b3cd7f5d19a3ac1e9ac6537ff8219f97f9898326227df3f3ae55dcb1380`,
manifest `bb2fe2207e01d594108efb591d1c25036adc12f67168ef895dfde755d391ac2a`,
goal `d283e683fe61298a9273365ca485d63e16fb582d08b45d42dfefb70c65952a9c` сохранены.

Неизменённый верхнеуровневый evaluator выполнил все59 исходных проверок;
harness gate отдельно доказал frozen execution + allowlisted verifier delta.
Все общие model/goal/pins/public/session/geometry gates остались включены.
Обе persistence проверки прошли по исходным фактическим данным после настоящего
reopen, с исходными independent expected outputs. Итог59/59 PASS относится
к переоценке этого выполнения, не к новому прогону.

Все11 frozen артефактов прочитаны и сверены по SHA/размеру до и после переоценки.
Старый FAIL55/59 (8артефактов), A1–A3 (10) и v2 preflight (8) также неизменны.
[Машинный отчёт со всеми59 checks и SHA](../../loginom-dock/node11-persistence-reassessment-2026-09-13.json).

Команда выполненной переоценки:

```sh
python3 tools/loginom-acceptance/replacement_reassessment.py --run-dir .dock/replacement/acceptance-runs/20260913-122247-a862a34d --output .dock/replacement/autonomous-v2/persistence-reassessment-v2.json
```

Runtime/VPS/stage/current/main/push/plugin/routing не менялись. Candidate остаётся
staged, activated=false; review/merge и решение о принятии принадлежат координатору.
Следующий узел не запускался.
