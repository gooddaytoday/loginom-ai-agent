# Состояние блокеров parallel evals

[План](docs/superpowers/plans/2026-10-16-evals-parallel.md) утверждён владельцем
с поправками. Повторное согласование не требуется. Нормативные правила —
[контракт](evals/docs/parallel-users-contract.md), особенно п.20/24/26.
Прежняя диагностика — в [едином архиве](docs/archive/2026-10-16-evals-parallel-history.md),
[удержанные ресурсы](docs/testing/loginom-ai-agent/2026-10-16-evals-parallel-retained.md)
не трогать до успешного N=2 и решения владельца одним списком.

Harness автоматически очищает своё и доказанно свои остатки на новом стенде
после обязательных проверок. Ограничение временными файлами текущего хода
относится к работе исполнителя; оно не запрещает штатную очистку harness.
Разрешены сохранение одного private diff/откат двух незакоммиченных archive-правок
Снята ровно judge reservation585940be-5c1b-4bff-a7c6-00459a4f7fa3; A00yuH
не удалён. Проверка входа через исправленную repo-обёртку успешна (0 model calls),
status lease освобождён. Проверка не заменяет реальный N=1/N=2.

Известное ограничение: после аварии новый admin может получить SESSION_NOT_IDLE;
такой слот остаётся в карантине до решения владельца. Для первого нового стенда
старые incidents не используются. Нет действительного входа в прежнем judge home
через исправленный VPN launcher — остановка с просьбой владельцу выполнить вход.
Недостаточно MemAvailable для бюджета N=1 — остановка и сообщение владельцу.
Иной блокер сквозного пути или изменение требования — вопрос и ожидание ответа,
без обхода через запись в blockers и переход к другой задаче.

CLI retry output исправлен по разрешению владельца2026-10-19; установленный
candidatec8a85da728 сохраняет прежнюю OAuth-базу eb85403ce4. Process suite19 PASS,
typecheck PASS; HTTP429→200:2 запроса, busy/retry/idle, exit0/cleanup confirmed;
shared status qualified, refreshRequired=false. Evidence:
`/home/kiselev/.local/state/loginom-evals/acceptance-20261016/evidence/cli-retry-20261019/`.
Наблюдения подключены; четыре native A/B прошли. Первый admission-отказ (без модели)
разобран startup, бронь освобождена.

Текущий блокер N=1: команда `c21be2f8-1488-453a-a78b-a4aa5ac97ca3` удерживает
server/profile A после ошибочного preflight вызова VPN wrapper обычным supervisor.
Потерянный флаг systemd исправлен в cd59ec8717 (RED→GREEN25/51, typecheck PASS).
Version-only unit `run-u17489.service` найден по точному home/команде в systemd
journal и подтверждён завершённым; собственная judge reservation уже освобождена
через прежний CAS с сохранённым доказательством. Admin `admin-5w8Hht` имеет native
dispose/transportDisconnect confirmed, но process cleanup failed из-за чужого
setuid PID2257892, не входившего в его13 owned процессов. Исходный receipt сохранён.
Повторная прямая проверка:13 процессов отсутствуют по PID+starttime (две пробы),
сессий A нет, профиль idle, root пуст, FD/maps закрыты, SessionBackup пуст,
identity/Pool подтверждены; новый read-only admin завершён штатно. Ничего не удалено,
server/profile брони не сняты. Evidence:
`/home/kiselev/.local/state/loginom-evals/acceptance-20261016/evidence/n1-quarantine-diagnostics.json`.
Независимое ревью подтвердило отсутствие штатного settlement для такого failed proof.
По контракту п.23/24/33 требуется разовое решение владельца: освободить только
точные server/profile holds этой команды существующим CAS, сохранив исходные
failed records и отдельное подтверждение прямых проверок. До ответа N=1 не продолжать.
Задачи ещё не dispatch-ились; реальных model calls и ресурсного замера N=1 нет.
