# Назначение одного узла

- campaign_id: <...>; node_id: <component ID>; attempt_id: <...>.
- Режим: parallel | sequential | single; разрешённый scope: <...>.
- Подплан/карточка: <ссылка>; фаза: <...>.
- Задача разработчика: <task ID>; модель `gpt-6-astra`, effort `medium`.
- Repo/worktree: <абсолютные пути>; ветка: <не более трёх слов через дефис>.
- Принятая база `loginom`: <SHA>; зависимости/owner: <...>.
- Loginom version/URL/account/storage/package: <...>, secrets только в приватном конфиге.
- Собственные profile/browser/state/ports: <...>; занятые shared resources: <...>.
- Общая память: <проверенный actor route/receipt либо blocker подготовки>;
  механизм [CURRENT.md](../../../services/loginom-ai/tools/project-memory/CURRENT.md).
- Регистрация памяти: namespace `loginom-ai-agent`, generation <из deployment.json>,
  registration ID <...>, точные cwd/task ID <...>; чужую регистрацию не переиспользовать.
- Допуск памяти: project hooks <установлены/не проверены>, bootstrap/доверие hooks
  <приватные квитанции>, actor health/find/read <проверка либо blocker>.
- Полный цикл записи: <ожидает первого содержательного этапа/проверен>;
  capture/extraction, точное чтение и поиск из основного checkout <доказательства>.
- CLI candidate/runtime SHA: <...>; CLI session: <null до фактического запуска>.
- Общий журнал ресурсов хоста: <точный путь к host-resources.json>; владелец: <...>.
- Итоговый CLI slot: один на host; lease и acceptance.lock по регламенту оркестратора.
- Модель приёмки: `openai/gpt-6-sol`, `low`; timeout: 30 минут либо <из подплана>.

Прочитай [README](../README.md), [single-node](../workflow/single-node.md) и
[lifecycle](../workflow/lifecycle.md); реализуй только назначенный подплан.
Разработку начинать после допуска памяти. Подготовительный bootstrap — отдельный
ход без разработки и вызовов памяти; наличие этого шаблона не активирует маршрут.
До первого ревью создай Goal: завершить development и подготовить результат к первому ревью, без token_budget; типовые решения
принимай самостоятельно. Не останавливайся ради повторного разрешения согласованных
шагов. Сначала исследуй живой Loginom Dock-скриптами, сверяй Help/E2E и код.
В потоке сообщи completion и заверши этап; новую фазу назначает координатор.
В single последовательно выполни отдельные этапы сам в этой задаче.
Не запускай приёмку без свободного выделенного слота; не меняй общий клиент.
Не сливай, не публикуй и не бери следующий узел вне разрешённой очереди.
