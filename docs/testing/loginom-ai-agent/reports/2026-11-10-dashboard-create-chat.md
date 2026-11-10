# Отдельный чат при создании dashboard

`action=create` теперь открывает новый черновик, даже если в Desktop уже идёт работа в другом чате. `action=edit` использует прежний чат. Выбор сервера, проверка локального подключения и явная отправка пользователем сохранены.

Изменение: `packages/app/src/pages/layout/dashboard-links.ts`, две отдельные проверки `current` и `existing`. Действующий дизайн обновлён. [План и результаты](../../../superpowers/plans/2026-11-10-dashboard-create-chat.md) независимо проверены до реализации; финальное ревью обязательных дефектов не выявило.

## Проверки

- RED на прежнем production renderer: новая метка оказалась в прежнем занятом чате, вкладок нового черновика0 вместо1.
- GREEN в отдельном Electron: новый черновик с правильным узлом; возврат в прежний чат сохраняет текст, метку и busy state. Затем повторное создание из черновика даёт ещё один отдельный чат; `edit` остаётся в выбранном чате; недоступный снимок сохраняет текст/метку и не создаёт пустую вкладку.
- Тест: `packages/desktop/test/loginom/dashboard-chat.ts`. Используются настоящие second-instance, preload, renderer, маршрутизация и черновики. HTTP-ответы, busy state, snapshot service и `loginom-read` заданы fixture; реальная модель и Loginom не запускаются.
- App:56/56 тестов; Desktop:4/4 теста; `bun typecheck` в обоих пакетах PASS. `node --check`, `git diff --check` PASS.
- Production benchmark существующего перехода в чат: до225,9мс /258мс, после222,7мс /243,5мс (первое наблюдение / стабильное состояние контента и вкладки). По одному измерению нельзя делать вывод об ускорении. Оба прогона завершены, одинаковый Chromium1246. Старый интерфейс выведен из эксплуатации14.09.2026; дата в GUI-тесте не подменялась. Холодная доставка покрыта существующим тестом main, холодный маршрут renderer не изменялся.

Raw evidence: `$HOME/storage/tmp/dashboard-create-chat-20261110/`.

## Локальная сборка

Подготовлен локальный кандидат0.3.9 на основе уже проверенного Desktop. Заменён только renderer;5976 остальных файлов ASAR побайтно совпали, настройки unpacked сохранены. Исходники App/Renderer/UI в прежней build-копии и рабочем дереве сравнены: единственное отличие App — исправленный `dashboard-links.ts`. Это локальное исправление интерфейса, не новый выпуск продукта; версия main/backend и их встроенная provenance остались прежними. Отдельный `dashboard-chat-fix.json` фиксирует состав и SHA-256 изменения.

- AppImage: `$HOME/storage/tmp/dashboard-create-chat-20261110/dist/loginom-ai-agent-linux-x86_64.AppImage`.
- AppImage SHA-256: `e5fc23792dac887ab8e012e6f817761276232222a7489bc3f188016d334b8d2d`.
- ASAR SHA-256: `47bfe0dc1e3ccedbd22aa6ce92ace09345f3827055fe0d29e98f00caf61cf40a`; извлечённый из AppImage ASAR совпал с проверенным кандидатом.
- Полная GUI-регрессия кандидата без подмены renderer: PASS, профиль `dashboard-chat-eZZkbo`.
- Та же полная регрессия готовой AppImage: PASS, профиль `dashboard-chat-19zdkA`.

Существующий `$HOME/storage/tmp/dashboard-acceptance-20261110/launch-desktop.sh` переключён на новую AppImage. Системный обработчик остаётся `com.loginom.aiagent.desktop`; пути профиля и остальные настройки launcher сохранены, синтаксис shell проверен. Резервная копия прежнего launcher: `$HOME/storage/tmp/dashboard-create-chat-20261110/launch-desktop-before.sh`. Пользовательский Desktop/backend не перезапускались, пользовательские черновики и профиль не редактировались. Уже работающий процесс получит исправление только после полного закрытия и ручного запуска обновлённой сборки.

Воспроизведение проверки (Node24.19.0, из `packages/desktop`):

```bash
TMPDIR=$HOME/storage/tmp/dashboard-create-chat-20261110 \
LOGINOM_AI_AGENT_TEST_EXECUTABLE=$HOME/storage/tmp/dashboard-create-chat-20261110/dist/loginom-ai-agent-linux-x86_64.AppImage \
$HOME/storage/tmp/dashboard-acceptance-20261110/runtime/node-v24.19.0-linux-x64/bin/node test/loginom/dashboard-chat.ts
```
