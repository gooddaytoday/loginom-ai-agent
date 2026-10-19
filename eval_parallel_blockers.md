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

Блокер c21be2f8-1488-453a-a78b-a4aa5ac97ca3 снят по разовому разрешению владельца
2026-10-19: повторные прямые проверки подтвердили завершение13 процессов,
чистый профиль A, отсутствие его сессий/файлов/FD, пустой SessionBackup и identity/Pool.
Новый read-only admin завершён штатно. Существующий CAS освободил только
server/profile A; исходный failed admin receipt сохранён с проверкой SHA256.
Никакие данные не удалялись, старые стенды/инциденты не затрагивались. Evidence:
`/home/kiselev/.local/state/loginom-evals/acceptance-20261016/evidence/n1-quarantine-owner-release-20261019.json`.
Исходная диагностика `evidence/n1-quarantine-diagnostics.json` сохранена.
N=1 `20261019-063523-9d19375bf1-dirty-ZpDChg` остановлен на первом dispatch:
`ProviderModelNotFoundError: openai/gpt-6-luna`, до исполнения модели/судьи.
Встроенный каталог CLI устарел; актуальный публичный models.opencode.ai/api.json
содержит точную модель и reasoning high. CLI менять не требуется: следующий шаг —
штатный `models openai --refresh` под server/profile locks, затем закрепить каталог
для N=1/N=2. Короткий сбор ресурсов завершён с PASS, но не заменяет замер трёх задач.

Текущий карантин: server/profile A команды
`14c5b7c6-2437-496f-b4a1-f5b14be70bc0`. Cleanup слота и admin подтверждён,
архив истории сохранён, judge hold released. Повторные прямые проверки:
13 прежних процессов отсутствуют (две пробы PID+starttime), профиль чист/idle,
сессий A/файлов/FD нет, SessionBackup пуст, identity/Pool подтверждены.
Брони не сняты, данные не удалялись. Evidence:
`/home/kiselev/.local/state/loginom-evals/acceptance-20261016/evidence/n1-model-quarantine-diagnostics-20261019.json`.
Автоматический startup всё ещё проверяет исторический failed admin c21;
фильтр только по producer PID небезопасен для startup-admin нового процесса
(независимое ревью). Независимое ревью подтвердило простой путь без изменения кода: с явного разрешения
владельца переместить только уже урегулированный `controller/admin-5w8Hht` в
`evidence/settled-admin-c21be2f8-5w8Hht`, сохранив все байты/хеши и соответствие
путей в relocation note. Внешние ссылки только в двух прежних owner-release proofs;
admission проверяет сами proofs/хеши и не разыменовывает originalAdminReceipt.
Действующими admin-proof перемещённые записи больше не являются. A00yuH и другие
incidents не затрагиваются. Затем существующий startup штатно разбирает текущий14c5
с confirmed admin/slot cleanup; refresh каталога и повтор N=1. Это исключение из
запрета трогать старые incidents до N=2 требует решения владельца. Без разрешения
не перемещать/не снимать текущие брони и не продолжать работу.
