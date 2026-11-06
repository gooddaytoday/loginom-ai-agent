# Сохранить причину отказа profile admission

Результат: следующий исходный `verifyProfile` отказ оставляет безопасное различение exit/reply/state/failure/recoveries/key/identity в существующем stderr контроллера. Сами критерии, `PROFILE_NOT_PREPARED`/exit 2, cleanup, настройки и pins не меняются.

Основание: P44B/P46B/P22B трижды дали generic отказ до dispatch; исторические status replies не сохранены. Одобренная единственная P22B status-проба дала admissible starting/exit 0/confirmed cleanup и завершена без check/warmup. Она не доказала историческую причину. Отдельный прогрев поэтому не является исправлением.

Область: только `evals/src/profile.ts`, его existing fake-CLI тесты и эта документация. Оба файла сейчас равны в campaign W и принятом private harness H; переносится только собственная проверенная дельта. Runtime CLI, private judge patches, модельные pins, бюджеты и готовые evals не затрагиваются.

1. Независимо проверить этот план. Обязательные замечания закрыть до реализации.
2. TDD: один subprocess-тест публичного `verifyProfile` с existing fake CLI воспроизводит exit 0/recoverable-error, требует диагностическую строку stderr, прежний отказ и отсутствие raw URL/username/failure/extra secret. Получить RED до изменения реализации.
3. Непосредственно в существующей rejected ветви вывести один JSON с фиксированным event, numeric exit и boolean результатами guard. Никаких raw state/failure/output, новых helpers/loggers/config/files/retries. Сохранить исходный throw и guard. Получить GREEN; отдельным focused случаем проверить valid ready/nonzero exit, используя тот же существующий путь.
4. Выполнить focused profile suite и `bun typecheck` из `evals/` закреплённым Bun. Независимое spec/quality review проверяет неизменность admission, redaction и отсутствие новой обвязки; затем точно эту дельту зеркалировать в H с сохранением иных изменений. Использовать существующее освобождение own stale reservations, не удалять guards вручную.
5. После подтверждённого cleanup единственной status-пробы и review допустить исходную ещё не начатую P22B форму обычной main-командой без предварительного check/warmup. При отказе читать именно исходную новую диагностику, не повторять admission автоматически. При dispatch сохранить единственное измерение независимо от балла и следовать остальному плану.

Первый проверяемый результат — RED→GREEN на реальном fake CLI subprocess; end-to-end — сохранённый predicate исходного admission либо допущенная sole P22B. Неповторение интермиттирующего сбоя не объявляется его исправлением.

Ожидаемый размер: два исходных файла до 65 добавленных строк, этот план до 25 строк, краткий checkpoint; около 100 строк в W плюс идентичная собственная дельта двух файлов H. Новый механизм ограничен одной строкой существующего stderr только при отказе: без неё четвёртый generic отказ снова потеряет причину; простая повторная проба её не восстановит.

Исключены raw diagnostics/auth/URL/usernames, новые зависимости и wrapper, ослабление guards, повтор setup/OAuth, новые критерии eval, повтор измерения и commit/push/merge/release. Риск — утечка произвольного status текста; payload допускает только фиксированную строку, booleans и exit number, а тест подставляет секреты.

Статус: plan/SPEC/QUALITY review APPROVE (SDD/p22b-admission-diagnostic-*-review.md). RED→GREEN, W profile82PASS/2SKIP/typecheck; own guarded mirror двух файлов W→H подтверждён, H verifyProfile5PASS/typecheck. Все проверки pinned Bun1.3.14; protected logs G/p22b-diagnostic-checks. Original P22B admission79435 допущена без preliminary check/warmup и soleB завершена:100/oracletrue/resourceFAILonlyRAM; cleanup/archive/release/fullmemory/independentactualreview APPROVE. Диагностическая задача выполнена; historical cause UNKNOWN, его исправление не заявляется.

Текущее решение: собственная 8bool console diagnostic и её implementation-specific test заменены existing management capture по [плану](2026-10-30-management-output-capture.md), SPEC/QUALITY APPROVE, own2 Hmirror/focused checks/typecheck PASS. Исходные guards и ready/nonzero regression сохранены; исторические snapshots/выводы не переписаны. Capture не устанавливает утраченные причины прошлых отказов.
