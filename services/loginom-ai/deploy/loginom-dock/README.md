# Сервер Dock и источники

[Действующая установка, доступ, пути и порядок развёртывания](../../docs/loginom-dock/operations.md).
Ниже описаны скрипты; их наличие в checkout не означает, что серверная копия
в `/opt/loginom-dock/tools` уже обновлена.

- `install-docker.sh` — bootstrap для чистого Ubuntu; требует разрешения на
  установку системных пакетов от root. [Порядок сборки](../../docs/loginom-dock/development.md).
- `compose.server.yaml` и `Caddyfile.server` — серверный конфиг, Ollama и публичный HTTPS.
- `Dockerfile.landing` — серверная сборка отдельного русскоязычного лендинга в
  закреплённый образ Caddy. Сайт работает на `loginom-dock.duckdns.org`, API/MCP
  остаются на `loginom.duckdns.org`. [Исходники и порядок обновления](../../landing/README.md).
- `bootstrap-account.py` — общий аккаунт и обычный клиентский ключ; существующие
  ключи не меняет. У технического администратора отключено извлечение памяти.
- `verify-server.py` — живая проверка HTTPS, readiness, прав клиента и каталога MCP.
- `backup-server.sh` — согласованная полная копия данных, конфигов, моделей Ollama,
  Caddy/TLS, исходников, эксплуатационных инструментов и закреплённых Docker images
  с краткой остановкой сервисов. Файлы содержат credentials и доступны только root.
- `catalog.yaml` — канонические GitLab locator, ветки и фиксированные URI ресурсов.
- `sources.yaml` — выбор всех трёх источников через штатный OpenViking Assets.
- `build-action-catalog.mjs` — детерминированная сборка action/selector catalog,
  проверка dependency graph и формирование replay-кандидата по умолчанию;
  при изменении E2E evidence затронутые действия получают статус `stale`.
- `publish-action-catalog.py` — fail-closed размещение immutable candidate через
  `--stage` без изменения `current.json` либо публикация production через
  `--activate --attestation <файл>` с проверкой отчёта точного manifest/runtime/UI
  build, readback неизменяемых файлов и отдельным переключением указателя.

Канонический catalog фиксирует существующие HTTP-адреса GitLab. Он не является
готовым сетевым маршрутом с VPS. До первого импорта:

1. Подготовить закрытый reverse SSH-маршрут и HTTPS-вход для PAT; проверить его
   из контейнера, включая LFS batch/object endpoints и настоящий файл вместо pointer.
2. Скопировать оба YAML в Dock-owned каталог состояния, добавить проверенный HTTPS
   locator и `auth_ref` в рабочий catalog. Поля `to` оставить неизменными. Секреты
   хранить в отдельном файле с правами 0600, не в manifest и не в URL.
3. Настроить точный разрешённый Git-хост штатным `code` config; глобальное
   разрешение приватных сетей не требуется. Не отправлять PAT к HTTP locator.
4. Явно задать Dock CLI config и `OPENVIKING_ASSETS_CREDENTIALS_FILE` в этом же
   namespace. Не полагаться на fallback в личный `~/.openviking`.
5. Выполнить штатный `ov add-resource --manifest sources.yaml --args dry_run:true`.
   Это проверит resolver, credentials и `git ls-remote`, но не выполнит импорт.
6. Применить manifest, проверить исходные ревизии, контрольные файлы, LFS и
   пропуски parser, затем чтение и поиск при отключённом GitLab.

Штатный resolver текущего checkout поддерживает поле `to` на уровне catalog asset.
Повторное применение синхронизирует тот же URI. При смене locator проверяйте Assets
State и прежние Watches перед запуском обновлений; State не коммитится в Git.

Автоматический refresh выключен. Каталоги источников и `.state.json` не следует
применять одновременно из нескольких процессов.

## Резервирование и восстановление

`loginom-dock-monitor.timer` запускает `monitor-server.py` каждые пять минут.
В `monitoring/health.json` сохраняются только состояния компонентов, задержка API,
свободное место и возраст копии; тексты provider errors и credentials не пишутся.
Клиентская задержка отправки проверяется через `dock_diagnostics` на машине агента.

После первой успешной полной проверки `loginom-dock-backup.timer` можно включить
для ежедневной копии в 05:00 Europe/Moscow. Скрипт сериализует копирование и импорт,
сохраняет исходное состояние в отдельную папку, проверяет суммы и возобновляет сервисы
при ошибке. Удаление старых копий не выполняется автоматически.

Для переноса на другой хост нужны каталог временной отметки из `latest-backup` и
все архивы, перечисленные в его `image-checksums`, в соседнем каталоге `images`.
Храните эту структуру в закрытом каталоге 0700: конфигурация содержит действующие
ключи. Проверка выполняется через `sha256sum -c SHA256SUMS` и `image-checksums`.

`restore-server.py --backup /path/to/backups/TIMESTAMP --name dock-restore-CHECK
--root /opt/loginom-dock/restore/CHECK` восстанавливает отдельные сети, пять томов
и пять сервисов из сохранённых образов. HTTP 19433 и HTTPS 19443 привязаны только
к loopback. Действующий стек не изменяется. После проверки остановите контейнеры
из `restore-state.json`; исходные данные для разбора остаются доступными.
Переключение публичных портов и DNS на восстановленный стек выполняет оператор
после приёмки, а не сам скрипт репетиции.

Для извлечения опыта скопируйте `memory-templates/events.yaml` в собственный
`/opt/loginom-dock/assets/memory-templates` и задайте в `ov.conf`
`memory.custom_templates_dir` равным `/opt/loginom-dock/assets/memory-templates`.
Этот каталог уже входит в mount assets и полную резервную копию. После изменения
пересоздайте только контейнер приложения и проверьте readiness/API. Шаблон
сохраняет native events schema, различает требования и наблюдаемые результаты,
добавляет исходные message IDs. Другие серверы OpenViking не затрагиваются.
