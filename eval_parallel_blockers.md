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

Блокеры c21/14c5 закрыты по разрешениям владельца: settled admin перенесён
с неизменным содержимым, штатный startup подтвердил cleanup/release. Оба профиля
после штатного refresh квалифицировали gpt-6-luna/high, одинаковый cache SHA256
59bcb39e…; model calls0. Подробности и private evidence — в
[едином архиве](docs/archive/2026-10-16-evals-parallel-history.md).
Schema-only drift исправлен в5c93dafea9 (18/65 PASS/TC/Review), потерянный
proxy route восстановлен вf88ce89f9c (CLI8/28+sandbox1/2 PASS/TC/Review).
Штатный startup852/071 подтвердил cleanup/release. Модельный N=1/N=2 не завершён.

Текущий блокер: command `4fb6d039-4d27-412a-82c3-4fc091eb4739`, run
`20261019-070313-f88ce89f9c-dirty-Dt4nwP` до dispatch получил ENOENT ancestry
`/proc/2446906/stat` при providers status. PID не входит в два own management
processes; original failed proof: capture=true/unknown[]/два final owned_remaining0.
Admin dispose/process cleanup confirmed. Failed receipt не переписывался.
Прямые проверки под прежними locks:2 management+13 admin PID/starttime отсутствуют
в двух пробах, профиль idle, сессий A/серверных файлов/FD нет, SessionBackup пуст,
identity/Pool подтверждены. Собственные `data/log`, `data/loginom-ai-agent.db`
сохранены в профиле и ожидают переноса в закрытый history; ничего не удалено,
server/profile holds не сняты. Новое read-only admin соединение закрыто штатно.
Evidence:
`/home/kiselev/.local/state/loginom-evals/acceptance-20261016/evidence/n1-proc-race-quarantine-diagnostics-20261019.json`.
Review Approved для минимального исправления: при ENOENT/ESRCH отдельно подтвердить,
что исходный PID уже отсутствует, тогда false без ownership/signals. Живой исходный
PID при исчезнувшем ancestor и EACCES/EPERM по-прежнему дают отказ. Новых inventories/
протоколов нет. Сам фикс пока не реализован: по правилу остановки на блокере
запрошено разовое разрешение сохранить собственные log/DB в archive и снять только
точные server/profile holds4fb существующим CAS; после ответа TDD fix и повтор N=1.
Старые стенды/инциденты не трогать; до ответа работу не продолжать.
