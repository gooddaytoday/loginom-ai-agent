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
По решению владельца2026-10-19 технические блокеры решать самостоятельно;
вопрос только при действительной необходимости по контракту п.33.

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

Карантин4fb завершён по разрешению владельца: собственные log/DB/точный marker
сохранены в закрытом history; original failed receipt неизменен, CAS holds released,
данные не удалялись. Ancestry gone-PID fix прошёл9/48 targeted PASS/TC/Review.
Evidence: `evidence/n1-proc-race-owner-release-20261019.json` в acceptance state,
подробности — в едином архиве. Технические блокеры решать самостоятельно;
утверждение бюджета N=2 сохраняется.

N1 iLakZJ дошёл до завершённой задачи:21 tools/0 errors/0 retry. Судья получил64
из-за добавленной глобальной desktop-настройки; private config синхронизирован
под judge lease, вход подтверждён без модели. Cleanup сохранил root из-за
хешированного имени своего input. Проверка существующей delivery-квитанции
(точное имя/размер/hash) подключена в normal cleanup и startup:12/72 unit PASS,
typecheck/sh-n/diff PASS, Review Approved. Native judge100 и startup cleanup
подтверждены; исходные результаты не менялись.
Исходные результаты и карантин сохранены, подробности — в едином архиве.

Текущий блокер — внешние inspector/CDP установленного Desktop из другого чата.
В s9821T первая задача завершилась с judge100/cleanup confirmed; вторая не запущена
из-за guard `assertNoDebuggers`. Новый процесс не создавался;71 прежний process
из6 подтверждённых receipts завершены. Fresh admin/Pool/backup/sessions/root/FD/
profile checks подтвердили чистое состояние; только a20 server/profile holds сняты
существующим CAS, без удаления и без создания отсутствующего cleanup.json.
Evidence: `evidence/n1-debugger-settlement-20261019.json`. Нужен период без внешних
inspector/CDP для полного N1/N2; чужой Desktop не трогать, guard не отключать.
Вопрос владельцу отправлен только о согласовании окна с чатом «Выпустить версию 0.2.2».
