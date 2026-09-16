# Нехватка места на Mac — 13 сентября 2026

При активном Hermes узла14 и работе16/17 Data достиг100%:116MiB free,
ENOSPC при записи. Main .dock129GiB/worktrees45GiB сохранены; их содержимое
не считалось удаляемым только по размеру. Найден npm download cache7.5GiB,
активных npm install/ci/exec процессов не было. Координатор удалил только
/Users/kartamyshev/.npm/_cacache; installed dependencies/runtime/evidence не менялись.
После очистки df7.9GiB free, повторный df подтвердил. Local receipt:
.dock/disk-cache-cleanup-20260913.json.

До уведомления16 удалил126воспроизводимыхcache каталогов своих закрытых
Chromium-профилей (272401205bytes); по отчёту активный профиль и evidence
сохранены. Дополнительная очистка остановлена. Потоки14/16 уведомлены:
продолжать текущие назначения, проверить целостность записей послеENOSPC,
не переобозначать pending и не повторять неопределённые операции/модель.

17 завершил development source110da29a/reporta0912da9; после completed
назначено единственное same-task review Astra medium, ход
01a09aa3-f66d-7420-a27c-c83c98605df3 active. First official phase capture
проверяется отдельным read-only помощником, ручной capture не запускается.

## Проверка official capture узла17

Helper подтвердил cursor/server count799,4completed extraction commits,
last899c1e21-74fc-4975-a841-ec8375a41d8f completed11:58:36UTC; ENOSPC в результате
не найден. Routing canonicalPeer подтверждён receipt и извлечёнными ресурсами;
per-message Peer не проверен (read/messages endpoint405). Archive004 извлёк
исторические11–14 сведения, не финальный Text export lesson. Более ранний
node_16_export_investigation.md содержит export данные, но неправильно
атрибутирован Node16; не считать корректным итогом17. Память не редактировалась.
Следующий event-trigger — review17 completed/official extraction, exactread/find
нового урока. Разработчику передано уточнение node17/source/branch context.

## Повторный дефицит около12:50UTC

Узлы16 и14 сообщили около2GiB free. Координатор подтвердил1.9GiB,
отсутствие uv/pip установок и выполнил штатный uv cache clean только
`/Users/kartamyshev/.cache/uv`. Exit0,250013files/5.2GiB reported removed;
фактический df после очистки3.9GiB. Не путать размер кэша с приростом free.
Receipt `.dock/disk-uv-cleanup-20260913.json`. Evidence/DB/WAL/venv/runtime
и профили браузеров не удалялись. Другие крупные browser/runtime caches
не затрагивались. Оба разработчика уведомлены и продолжают ограниченную
подготовку. Предложенный node14 reserve12GiB не достигнут: Hermes остаётся
недопущенным; после готового плана подготовки координатор должен решить
вопрос хранения и свободного места до выделения слота. ENOSPC для нового
неопределённого uploadD узла16 пока не установлен.

Узел13 принял ресурсную остановку: при1.5GiB free текущий Done
продолжается в output_mapping, журнал движется, disk errors не наблюдались.
Сессия869MiB; следующий Execute автоматически не запускается. Новые сессии
и большие duplicate exports запрещены; ожидается terminal checkpoint Done
и решение координатора после подтверждённого освобождения места.
