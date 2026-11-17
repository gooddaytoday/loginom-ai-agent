# Прототип нового Loginom AI Agent

Кликабельный макет нового интерфейса: статический HTML/CSS/JS без сборки и без бэкенда, все данные — учебные.
Это витрина решений для владельца, а не спецификация. Решения и сценарии описаны в
[`docs/product/loginom-agent/`](../../docs/product/loginom-agent/).

## Локальный просмотр

```sh
python3 -m http.server -d apps/loginom-agent-prototype/site 8080
```

Затем откройте `http://127.0.0.1:8080/`.

Опубликованная версия работает под строгим CSP: только собственные скрипты и стили, без inline-кода и без сетевых
запросов (`connect-src 'none'`). Новые возможности прототипа должны укладываться в эти ограничения.

## Публикация

Публикуется только закоммиченный `site/`. Скрипт собирает неизменяемый релиз
`releases/<sha256 от SHA256SUMS>/{site,SHA256SUMS}`, проверяет его на сервере, атомарно переключает `current`
и сверяет каждый опубликованный файл по публичному адресу.

```sh
bun apps/loginom-agent-prototype/deploy.ts --dry-run        # что будет сделано
bun apps/loginom-agent-prototype/deploy.ts                  # публикация
bun apps/loginom-agent-prototype/deploy.ts --list           # релизы и текущий
bun apps/loginom-agent-prototype/deploy.ts --rollback <hash>
```

Адрес сервера и каталоги в репозиторий не входят. Задайте их переменными окружения или в
`apps/loginom-agent-prototype/deploy.local.json` (файл игнорируется Git):

```json
{
  "PROTOTYPE_SSH_HOST": "<ssh-алиас сервера>",
  "PROTOTYPE_DIR": "<каталог с releases/ и current>",
  "PROTOTYPE_URL": "https://<домен прототипа>"
}
```

Хранятся последние 10 релизов; текущий не удаляется.
