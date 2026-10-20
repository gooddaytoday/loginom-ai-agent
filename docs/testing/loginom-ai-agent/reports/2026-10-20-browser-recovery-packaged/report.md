# Packaged browser recovery: первый installed CLI

Проверка 2026-10-20 остановлена после первой флаговой Linux CLI строки.
Capability и Save подтверждены; обычная очистка пакета отказала.
Полная Task 1 и acceptance gate остаются открытыми.

## Проверенная поставка

- CLI 0.2.1, prod, Linux x64; исходники `2e625530354afad01a8f6d99fc3269317015b6ea`, `sourceDirty:false`.
- Manifest: `browserRecovery:true`; source tree digest `10c6141a1d382ea1ba92441e5dd8309255dace875bd54189842d654fa8699039`.
- Полная сборка с pinned Bun1.3.14/Node24.19.0/Chromium1246, archive roundtrip и проверка установленного manifest прошли.
- Установка штатным installer в отдельный HOME; launcher указывает на собственный payload. Собственный sandbox root:root/4755, запуск non-root без обхода sandbox.
- Отдельные profile/workspace, `PURE=1`, без `CLI_BUNDLE`; public headless setup завершился кодом0.

## Результат одного public run

| Проверка | Наблюдение |
|---|---|
| Public путь | `skill loginom-automation` → `dock_prepare new_draft` → describe SaveAs → SaveAs собственного UUID-пакета → finish |
| Текущая task capability | Верхнеуровневый `session.json.browserRecovery:true`; session связана с текущим CLI run через SHA256 session ID и совпадающий prepare receipt |
| Prepare | `prepared:true`, `READY`, собственный пустой черновик; без узлов/CSV |
| Save | `availability-save`, `SUCCEEDED`, `reopened:true`; точный путь и пустой граф после reopen проверены |
| Native state после Save | `modified:false`; checkpoint не выполнялся; проверка вычислений не заявляется |
| Native cleanup | `BLOCKED / TAB_IDENTITY_CHANGED`, stage `close_request`; `package_closed:false`, `logged_out:false`, `unsaved_changes_discarded:false` |
| Task runtime transport | `LOGINOM_RUNTIME_CLEANUP_FAILED`, `closed_ack:false`, exit1/no signal |
| CLI/profile | `LOGINOM_HOST_CLEANUP_FAILED`, exit1/no signal; `.writer` сохранён |
| Ресурсы/OS | Browser resource close fulfilled; итоговый cleanup rejected. Собственных оставшихся процессов нет; все ранее наблюдавшиеся собственные PID отсутствуют |

Save receipt также содержит arrangement warning `result_unconfirmed`: успешная
расстановка не заявляется. Успех Save и отсутствие процессов не заменяют
подтверждённое закрытие пакета и logout. Management validation ACK/exit0 не
используется как доказательство task cleanup.

## Граница установленного отказа

Сохранённый prepare/checkpoint содержит исходные tab identity и workspace prefix
`MF;TF-1`; Save trace после reopen показывает prefix `MF;TF-3`, проверенные путь
и граф. Полный новый tab identity в receipts отсутствует. Shutdown берёт tab из
`workspacePreparation`, а native guard требует совпадения browser preparation
receipt с текущими package object и tab. Поддержанная данными гипотеза: reopen
SaveAs меняет привязку, которую cleanup продолжает брать из prepare. Какая именно
часть проверки identity отказала, текущие receipts не различают. Полный публичный
SaveAs reply не содержит `next_step` на prepare/refresh; advice фиксирует только
`modified:false`. Пропущенного предписанного refresh-шага в этом ответе нет.

После отказа не было нового запуска, повторного SaveAs, Discard, удаления guard,
диагностики браузера или изменений production. Одноразовый private driver удалён;
собственная установка, profile и raw evidence сохранены. Следующий шаг требует
отдельного reviewed repair plan. Отрицательные CLI строки, Desktop, модельные
кейсы и качество recovery этим прогоном не проверены.
