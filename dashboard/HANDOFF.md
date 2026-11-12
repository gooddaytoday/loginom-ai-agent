# Продолжение dashboard + Desktop на другом компьютере

Текущее состояние M1 на 12 ноября 2026: [checkpoint для продолжения](../docs/testing/loginom-ai-agent/dashboard-m1-handoff.md).

Рабочая ветка M1 — `dashboard-m1`. Она содержит стенд, исходники брендированного
Desktop и передачу выбранного узла в одну просьбу чата. Отдельная ветка Desktop
для продолжения не нужна. Начинайте с этого документа; прежние отчёты описывают
проверки на исходном компьютере, а их абсолютные пути не являются входами сборки.

История этой ветки очищена от унаследованных ключей доступа. Другие ветки
репозитория не переписывались. Используйте новый clone: обычный merge веток
со старой историей вернёт их прежние секреты в предков ветки. Будущие изменения
переносите отдельными проверенными коммитами и повторяйте аудит перед отправкой.

## Что готово и что осталось

- Кнопки «Создать dashboard» / «Изменить в чате» передают неизменяемый ID снимка
  в Desktop. Агент читает этот ID, создаёт или правит исходники и публикует dashboard.
- Dashboard открывается поверх сценария, читает живые данные и пересчитывает узел
  при изменении параметра. Esc из шапки или iframe закрывает dashboard; Esc при
  фокусе снаружи оставляет его открытым. Исправлено открытие с `user@` в URL.
- Ранее отдельно проверены создание, правка, привязка A/B, 500 кампаний и Esc.
  **Новый полный прогон «создание → правка → обновление → Esc» не выполнен:**
  в последней сессии было недоступно управление нативным окном Desktop.
  Следующая задача — пройти весь цикл ниже на новой машине с доступным GUI.

В Git сохранены исходники двух примеров в `dashboard/apps`: маркетинговый ROI
и созданная Desktop «Сводка по каналам». Зависимости второго примера фиксирует
общий `packages/dashboard/template/package-lock.json`; его одинаковая локальная копия
не нужна для публикации. `node_modules`, `dist`, снимки и серверные сессии
не переносятся. Для каждого нового открытия получают новый снимок.

## 1. Получить исходники и инструменты

```sh
git clone --branch dashboard-m1 --single-branch git@github.com:gooddaytoday/loginom-ai-agent.git
cd loginom-ai-agent
bun install --frozen-lockfile
```

Используйте Bun из поля `packageManager` корневого `package.json`, Docker,
Node/npm и Linux x86_64 с рабочим графическим сеансом. Версии runtime берутся
из `packages/product/loginom-release.json`, не из старых отчётов.

Точный CI-рецепт загрузки Node/Chromium:
[setup-loginom-inputs](../.github/actions/setup-loginom-inputs/action.yml).
Ниже — его команды для Linux. Выполнять из корня checkout в Bash.

```sh
transfer_cache="${XDG_CACHE_HOME:-$HOME/.cache}/dashboard-transfer"
mkdir -p "$transfer_cache"
node_version=$(bun -p 'require("./packages/product/loginom-release.json").nodeVersion')
distribution="node-v${node_version}-linux-x64"
curl -fsSLo "$transfer_cache/$distribution.tar.xz" "https://nodejs.org/dist/v${node_version}/$distribution.tar.xz"
curl -fsSLo "$transfer_cache/SHASUMS256.txt" "https://nodejs.org/dist/v${node_version}/SHASUMS256.txt"
awk -v file="$distribution.tar.xz" '$2 == file' "$transfer_cache/SHASUMS256.txt" > "$transfer_cache/node.sha256"
(cd "$transfer_cache" && sha256sum -c node.sha256)
tar -xJf "$transfer_cache/$distribution.tar.xz" -C "$transfer_cache"
export LOGINOM_AI_AGENT_NODE_SOURCE="$transfer_cache/$distribution/bin/node"
export LOGINOM_AI_AGENT_TEST_NODE="$LOGINOM_AI_AGENT_NODE_SOURCE"
export PATH="$(dirname "$LOGINOM_AI_AGENT_NODE_SOURCE"):$PATH"
export PLAYWRIGHT_BROWSERS_PATH="$transfer_cache/browsers"
export LOGINOM_AI_AGENT_BROWSER_SOURCE="$PLAYWRIGHT_BROWSERS_PATH"
(
  cd packages/loginom-runtime/client
  "$LOGINOM_AI_AGENT_NODE_SOURCE" "$transfer_cache/$distribution/lib/node_modules/npm/bin/npm-cli.js" ci --ignore-scripts --omit=dev --no-audit --fund=false --workspaces=false
  "$LOGINOM_AI_AGENT_NODE_SOURCE" node_modules/playwright/cli.js install chromium
)
```

## 2. Восстановить Loginom

Следуйте [рецепту стенда](stand/README.md). Нужен разрешённый дистрибутив Loginom
master с сервером, обоими клиентами, библиотеками и тестовой конфигурацией.
Он лицензированный и в Git не включён. Порт клиента должен быть
`127.0.0.1:32768`: этот адрес используют Desktop, публикация и привязки dashboard.

Из корня checkout после создания контейнеров:

```sh
(cd packages/dashboard && bun run build)
bash -n packages/dashboard/deploy/dev-master.sh
shellcheck packages/dashboard/deploy/dev-master.sh
./packages/dashboard/deploy/dev-master.sh install
```

Не запускайте общий installer другого стенда. `packages/dashboard/deploy/dev-master.sh` обслуживает
только контейнеры с именами из рецепта. После перезапуска server-контейнера
повторите эту команду: служба снимков запускается отдельно. Старые ID при этом
исчезают. Для проверки обоих клиентов запустите [check](stand/README.md#проверка-и-удаление). После замены оболочки обновите страницу через Ctrl+Shift+R.

## 3. Собрать и подключить Desktop

Введите действующий ключ Knowledge вручную: `read -s` скрывает ввод и не записывает
его в историю команд. Ключ получите через свой обычный защищённый канал доступа;
прежний ключ из чата не включён в ветку. Для модели нужен отдельный обычный вход
в Desktop. Старые auth-файлы и пользовательский профиль не копируйте в Git.

```sh
read -r -s -p 'Knowledge key: ' LOGINOM_MCP_API_KEY
printf '\n'
export LOGINOM_MCP_API_KEY
export LOGINOM_AI_AGENT_CHANNEL=prod
(
  cd packages/desktop
  bun run build
  bun run package:linux --x64 --publish never
  bun typecheck
)
unset LOGINOM_MCP_API_KEY
```

Пакеты создаются в `packages/desktop/dist`. Сборка со встроенным ключом приватная:
не добавляйте её, ресурсы `knowledge-key` или release-архив в Git/публичный релиз.
На исходной машине сборка и статический verifier уже проходили; новая чистая
сборка по этому объединённому checkout и установка на другую ОС ещё не проверены.
Требования к системным библиотекам и verifier — в
[Linux runbook](../docs/testing/loginom-ai-agent/linux.md).

Полностью закройте прежний экземпляр Desktop, затем настройте обработчик
на новую AppImage. Команды выполняются из корня checkout; абсолютный путь
создаётся для текущей машины.

```sh
desktop_app="$PWD/packages/desktop/dist/loginom-ai-agent-linux-x86_64.AppImage"
chmod +x "$desktop_app"
mkdir -p "$HOME/.local/share/applications"
cat > "$HOME/.local/share/applications/com.loginom.aiagent.desktop" <<EOF
[Desktop Entry]
Type=Application
Name=Loginom AI Agent
Exec="$desktop_app" %U
Terminal=false
MimeType=x-scheme-handler/loginom-ai-agent;
Categories=Office;
StartupWMClass=com.loginom.aiagent
EOF
xdg-mime default com.loginom.aiagent.desktop x-scheme-handler/loginom-ai-agent
"$desktop_app"
```

В обычных настройках Desktop войдите в модель и подключите тестовую учётную
запись к `http://127.0.0.1:32768/app/`. Используйте backend V1 по умолчанию;
экспериментальный `LOGINOM_AI_AGENT_SIDECAR_V2=1` для этого прогона не задавайте.

## 4. Полный цикл, который нужно завершить

1. В отдельную новую папку `UserStorage/user` скопируйте оба файла
   `dashboard/fixture/{campaign.lgp,dataset.csv}`. Другой путь пакета создаёт
   новую привязку даже при одинаковых GUID. Откройте его в обычном браузере
   на `/app/?testable=true#packages/user/<новая-папка>/campaign.lgp/Unit1/workflow`.
2. Выберите «По убыванию ROI» и нажмите «Создать dashboard». Системная ссылка
   должна открыть новую сборку Desktop с меткой создания и именем узла.
   Отправьте: «Создай сводку бюджета, выручки и числа кампаний по каналам».
   Дождитесь завершения агента и публикации. Сохраните ID и снимок экрана.
3. Закройте слой и откройте Dashboard снова. Проверьте таблицу пяти каналов
   и итог 500 кампаний при исходном `MinBudget=0`.
4. Нажмите «Изменить в чате», проверьте метку того же узла, отправьте:
   «Измени заголовок dashboard на “Проверка переноса”». После публикации заново
   откройте dashboard и убедитесь, что виден именно новый заголовок.
5. Поставьте фокус в поле dashboard, нажмите Esc: должен вернуться сценарий.
   Повторное открытие должно сохранить данные. Дополнительно проверьте Esc
   на кнопке шапки и при фокусе на внешней панели Loginom.
6. Сохраните безопасные скриншоты/результат вне Git. Закройте свои пакеты и
   выполните штатный «Выход» из Loginom **до закрытия тестовой вкладки**:
   иначе серверная сессия может оставить пакет заблокированным на 30 минут.

Исходные два примера можно восстановить отдельно: скопировать fixture в
`/user/dashboard-roi/` или `/user/dashboard-desktop-20261110-d/`, открыть узел
и выполнить `commands.publish` из нового снимка. При том же origin и пути пакета
сервер выберет сохранённый каталог исходников. Для нового пути используйте
`commands.init` и затем создавайте новый dashboard через Desktop.

Проверки из каталогов пакетов: `bun run test` и `bun run test:browser` из `packages/dashboard`;
`bun typecheck` из `packages/app` и `packages/desktop`. Полный прогон и его
непройденные пункты фиксируйте в [плане](../docs/superpowers/plans/2026-11-10-dashboard-full-cycle.md).
