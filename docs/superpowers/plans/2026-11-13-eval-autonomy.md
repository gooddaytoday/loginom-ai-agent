# Автономная eval-кампания из карточки

## Принятое решение

Владелец назначает одну карточку EvalOps на подключённом runner. EvalOps
подготавливает поставку и слоты, создаёт два scoped wakeup, резервирует стенд,
запускает единственный controller, ремонтирует технические отказы и передаёт
проверенный итог через EvalBaseline. EvalRunner независимо рецензирует новый
ремонт. Обычные batches ведёт существующая systemd-служба.

Сохранить CLI и корпус LAB-901; harness закрепить отдельным проверенным SHA.
Старые кампании сохраняют pins, сроки, результаты и правила. Новая политика
судьи разрешает один третий вызов только после доказанного transport/no-verdict
при подтверждённой очистке. Исчерпанная оценка сохраняется без повторной
генерации, остальные ключи выполняются, финал partial.

## Задачи и проверки

- [x] Восстановить daemon → Multica и проверить свежий heartbeat, реальную
  native задачу EvalOps и полномочия управления собственным экземпляром.
- [x] TDD для возобновляемого launch: одна issue, manifest, исходный clock,
  два wakeup, reserve, prepare/verify, enable/start. Потерянный ответ не создаёт
  дубликат. Ошибка до controller публикуется в той же карточке.
- [x] TDD для isolated browser/Dock readiness, bytes/inodes и точного claim
  native upload LGP. Чужой или недоказанный файл сохраняется.
- [x] TDD для резервного судейства, crash recovery, terminal unscored,
  продолжения остальных ключей и partial. Исторический предел равен двум.
- [x] Независимое ревью изменений. Полные `bun test` и `bun typecheck` из evals.
- [x] Поставка отдельного pilot instance, проверка SHA/CLI/corpus и обновление
  трёх инструкций Multica и briefing с read-back.
- [x] Одна живая карточка: calc-data-double, filter-active-rows, local-lgp-edit,
  round 1, N2, batchSize2, maxStartedAttempts4. Один безопасный отказ до
  admissions. После назначения внешний контроллер только наблюдает.

Приёмка требует самостоятельного запуска, blocked → repair → resume, одного
controller, сохранения результатов, cleanup, хеша архива, адресного ответа
EvalBaseline, in_review и двух выключенных wakeup. Quality FAIL допустим.
Ручное вмешательство фиксируется и требует новой карточки после исправления.

## Checkpoint

- Base 5245ebc3dc, ветка autonomy-pilot; live harness ab66bfd0cf, код 49e55045d1.
- Launcher, browser/Dock readiness, LGP cleanup, transport reserve и terminal
  unscored реализованы по TDD, независимо приняты и поставлены на runner.
- Runtime восстановлен через v2rayN; инструкции трёх агентов и squad обновлены.
- Native OAuth и OAuth судьи обновлены отдельными входами по выбору владельца;
  LAB-1563 реально подтвердил native READY; модели и CLI сохранены.
- Полный suite: 1459 PASS, 89 SKIP, 3 FAIL; typecheck PASS.
- Все три отказавших теста отдельно PASS с прежними лимитами. Для PPID
  наблюдением подтверждена гонка тестового условия с zombie/thread reparent.
- LAB-1529 завершён partial/in_review: три unscored после 401 судьи;
  архив/cleanup/ответ EvalBaseline проверены, оба правила off, owner освобождён.
- LAB-1562 отменён: AUTH_REVOKED самого EvalOps до первого действия.
- LAB-1564 назначен один раз; внешних изменений после назначения ноль.
- EvalOps сам создал request/manifest/два wakeup, подготовил стенд и прошёл
  контролируемый отказ до admissions → event wakeup → repair/resume.
- Три попытки из четырёх: ordinary 100/PASS дважды; local-lgp-edit — ошибка
  CLI LOGINOM_HOST_CLEANUP_FAILED/no_artifact, без вызова судьи.
- Очистка трёх попыток и финальная verify подтверждены, архив прочитан.
- LAB-1564 сдан в in_review: EvalBaseline ответил в нужную ветку, оба правила
  выключены, owner освобождён; исходный LGP upload и удаление подтверждены.
