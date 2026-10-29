# Перенос исправлений baseline-luna

**Цель:** перенести согласованные общие исправления LAB-334 в autonomus-eval
cherry-pick без изменения живых кампаний и без повторения уже перенесённых fixes.

**Решение:** сохранить существующую архитектуру. Перенести 8685deb150
(ограничение requestPreflight 180 секундами, безопасные признаки окружения,
тесты и runbook) и test-only часть ed129d1947 (полный node attempt/result.json).
Журнал конкретной Luna-кампании в docs/plans/2026-10-27-luna-baseline.md
не переносить; документ source-политики preflight сохранить вместе с её fix.
Systemd fixtures из a6b3 уже покрыты e6f9ddbab2, его не повторять.

**Границы:** measurement/judge timeout, cleanup, модели, corpus, pins,
окружение runner и живые инструкции/назначения Multica не менять.
Временные данные — только /home/kiselev/storage/tmp.

## Шаги

- [x] Сравнить свежие refs; проверить применимость и независимый review 8685.
- [x] Независимо проверить этот план и разрешение документационного конфликта.
- [x] Cherry-pick -x ed129d1947; при modify/delete сохранить отсутствие
  исторического Luna-журнала, оставив единственное исправление node fixture.
- [x] Cherry-pick -x 8685deb150 без изменения его runtime/test кода.
- [x] Проверить совпадение перенесённых файлов с source patches, git diff --check,
  адресные preflight/CLI/campaign/native-evidence tests и bun typecheck из evals.
  Для тестов процессов использовать отдельное PID-пространство; gated live,
  Docker и native checks не считать выполненными без соответствующего запуска.
- [x] Независимое финальное review diff и результатов. Сохранить checkpoint.
- [ ] Push autonomus-eval и проверить новый CI PR #466; результаты последнего
  SHA записать в описание PR, не создавать новый docs-only commit ради CI.

## Уже полученные свидетельства

На временной копии e6f9ddbab2 обе evals-правки применились без конфликтов;
bun typecheck прошёл. Source-план 8685 фиксирует исходный RED → GREEN.
Начатый адресный CLI-набор на общем host не дал итогового результата;
его не считать PASS. Повторять живой baseline ради переноса не требуется.

Переносы: f66b086e02 из ed129d1947, c2c117a2fd из 8685deb150;
provenance сохранён через -x. Совпадение семи evals-файлов с временной
проверенной интеграцией подтверждено. На рабочей ветке typecheck и 51
адресный preflight/campaign/native-evidence test прошли (132 assertions).
Пауза существующего CLI-теста объяснена его штатным 90-секундным SIGINT
grace; результат повтора в PID namespace приведён ниже.

Адресная проверка переноса завершена: CLI-файл на совпадающей временной
копии — 42 PASS / 2 штатных process-denial SKIP. Остальные три файла на
рабочей ветке — 51 PASS. Raw PID-namespace запуск временного git archive:
92 PASS / 2 SKIP / 1 FAIL; единственная ошибка — отсутствующий .git в архиве
в тесте чтения git SHA. Этот же dry-run тест успешно прошёл в составе 51
теста настоящего checkout. Исходный raw запуск полным PASS не объявляется.
Typecheck на рабочей ветке прошёл. Новых живых измерений не запускалось.

## Дополнение: замечание PR #466

Пользователь поручил исправить найденные ошибки до push. Единственное
содержательное замечание: discussion_r4389042483, P1. campaignTick
проверяет noProgressMs до чтения сохранённых результатов активного batch,
поэтому может ошибочно завершить его partial и потерять измерения в отчёте.

- [x] Независимый review этого минимального решения до правки runtime.
- [x] RED: тест campaignTick с активным batch, устаревшим journal.lastProgressAt
  и свежим завершённым result/native admission: action=wait, результат учтён,
  clock восстановлен; batch не accounted, глобальный cleanup не подтверждён.
- [x] GREEN: переиспользовать существующую сверку завершённых попыток до
  проверки deadline, сохранив terminal-only bookkeeping и запрет dispatch
  при active unit. Не считать незавершённый native admission прогрессом.
- [x] Проверить идемпотентность повторного tick и истечение действительно
  устаревшего прогресса с сохранением уже имеющихся результатов в partial.
- [x] Campaign regression tests, typecheck, независимое final review.
  Далее единый push и актуальный CI существующего PR.

Review уточнил две границы: ещё не опубликованные config/receipt активного
batch откладываются до следующего tick без долговечного blocker;
mtime/исторический cli_admitted fallback применяются только после выхода
writer. Активный прогресс требует подтверждённого native completedAt.

Три последовательных RED → GREEN подтверждены; regression suite кампании:
58 PASS / 347 assertions / 4 files, 28.79 с. Независимое review обнаружило
новый concurrent-reader риск активной сверки: node assessor и завершающий
batch регенерируют native-crosstable/native-import JSON через Bun.write.

- [x] RED → GREEN: сохранить целый JSON snapshot для уже начатого читателя
  при обновлении native evidence; использовать существующие collector fixtures.
- [x] Заменить только две записи native JSON существующим атомарным
  writeLeaseReceipt. Формат JSON остаётся совместимым; источник — уже
  подтверждённый immutable attempt archive. Новый flag/lock/protocol не нужен.
- [x] Node/native/import и campaign regression, typecheck, final review.

Это минимальное решение конкурентной записи независимо одобрено до
реализации; предложение отдельного read-only флага отклонено как неполное.

## Итог локальной проверки

Оба snapshot-сценария сначала упали на разорванном JSON, затем прошли после
двух замен записи. Итоговый набор из 15 campaign/node/import файлов:
149 PASS / 42 ожидаемых SKIP / 0 FAIL, 983 assertions, 134.48 с.
SKIP: 39 campaign-control и 3 finalization, для них не включались
EVAL_SYSTEMD_TESTS/EVAL_PAIR_INTEGRATION. Typecheck и git diff --check — PASS.
Фактический итоговый diff независимо одобрен, блокирующих замечаний нет.

Изменения ограничены eval harness, его тестами и документацией. Живая
поставка LAB-334, её модельные измерения и настройки не менялись.
Следующий checkpoint — проверки нового SHA в PR #466 после push.
