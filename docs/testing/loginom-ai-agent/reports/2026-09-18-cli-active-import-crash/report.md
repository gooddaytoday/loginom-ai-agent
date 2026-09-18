# SIGKILL при активном импорте — Linux native CLI

Artifact 0.1.4-cli.202609180038 из /tmp/loginom-cli-cleanup-202609180038;
archive/source identity зафиксированы в соседнем cli-cleanup-build report.
Driver: packages/loginom-host/script/cli-owner-crash.ts, новый режим active-import.
Evidence `/tmp/loginom-cli-owner-crash-kr8ClY`, приватный log
`/tmp/loginom-cli-active-import-202609180038.log`.

Реальный CLI run с приложенным fixture A/sales.csv прошёл Loginom setup,
dock_prepare(new_draft), upload и dock_node_apply(imports.text). Существующие
пакеты не открывались для изменения; package.save/save_as не отправлялись.
Импорт работал в отдельном несохранённом draft.

Перед SIGKILL получен receipt operation_id=crash-import, state=running;
проверено наличие durable recovery JSON. После SIGKILL:
exit137, trackedProcesses24, alive=[], guarded=true, retry status exit3
PROFILE_BUSY. Driver проверил отсутствие API key в outputs.

Отдельное чтение recovery после завершения подтвердило одну запись generation1,
ID `9664a27e-5dd6-4b97-bf69-38dd0a3d7135`, mode0600. Guard и запись сохранены;
recovery acknowledgement или ручного снятия guard не выполнялось.

PASS для потери CLI owner после active-operation receipt и сохранения
неопределённости без автоматического повторного запуска. Receipt и сигнал
не являются атомарным наблюдением: точная фаза серверной операции в момент
сигнала не доказана. Business outcome после crash не объявляется успешным или
отменённым. Независимый read-back persisted mutation, network failure и Windows/
macOS — отдельные gates. Browser/host реальные; provider scripted.


## SIGINT при active import

Driver теперь поддерживает также SIGINT в active-import режиме. При оставшейся
неопределённости ожидается exit4 LOGINOM_RECOVERY_REQUIRED вместо обычного
cancellation130. Проверяются recovery JSON после остановки и retry status
recoverable-error; production CLI для этого не менялся.

Первый прогон `/tmp/loginom-cli-owner-crash-uSqCGg` завершил CLI с code4,
alive=[], guard=false, status retry0 и одним recovery, но старое driver assertion
ожидало130 и завершило driver ошибкой. Это ошибка ожидания приёмки, не PASS.

Полный повтор `/tmp/loginom-cli-owner-crash-ytSmta` — PASS:
active-import running receipt, SIGINT, exit4, tracked24, alive=[], guarded=false,
retry0, state=recoverable-error. Recovery ID
bd83c278-57ca-4c7e-bf8b-3f45ef60a914 сохранён. Guard не снимался вручную;
acknowledgement и replay не выполнялись. Private log
`/tmp/loginom-cli-active-import-sigint-202609180038-retry.log`.

Это подтверждает освобождение локальных процессов и сохранение неопределённого
исхода. Серверная отмена или успешное завершение бизнес-операции не утверждаются.


## Новый run с pending recovery

На профиле `/tmp/loginom-cli-owner-crash-ytSmta/profile` выполнен новый native
`run --headless --format json --model test/test-model`. Exit4, единственное
событие error/LOGINOM_RECOVERY_REQUIRED, guard освобождён; SHA256 всех recovery
JSON совпали до/после. `blocked-run-summary.json` сохранён в evidence.

Для прямой проверки отсутствия model dispatch выполнен отдельный повтор:
baseURL test provider временно направлен на локальный HTTP counter. Получены
exit4 и **0 model HTTP requests**, recovery hashes сохранены, guard=false.
Конфигурация тестового provider восстановлена побайтово в finally и проверена.
Evidence `blocked-model-summary.json`. Подтверждение recovery и повтор mutation
не выполнялись; проверка не раскрывала credentials и не меняла пользовательские
профили за пределами этого acceptance fixture.
