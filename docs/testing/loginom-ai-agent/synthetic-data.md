# Синтетические данные

Скил `synthetic-data` выпускает детерминированный набор таблиц в каталог сессии.
Исполнитель — `scripts/synthetic-data.mjs`, его собирает staging вместе с
`package-docs`. Инструмент сессии — `synthetic_data_run` (`validate`,
`generate`, `inspect`). В профиле `package-docs` его нет.

Файлы генератора не являются вложениями пользователя. Host по-прежнему
принимает в Loginom только исходные вложения, поэтому скил просит приложить
файлы следующим сообщением или через `--file`. `manifest.json` и `defects.csv`
лежат рядом и не входят в импорт, если сверка дефектов не нужна.

## Проверки исходников

Из каталогов пакетов, не из корня репозитория:

```text
packages/loginom-host: bun test test/synthetic-data.test.ts && bun typecheck
packages/product: bun test && bun typecheck
packages/agent: bun test test/skill/bundled-skills.test.ts test/session/profile-tools.test.ts test/tool/synthetic-data.test.ts && bun typecheck
```

Инструмент агента запускает поставляемый Node. Для `test/tool/synthetic-data.test.ts`
нужен `LOGINOM_AI_AGENT_TEST_NODE`. Полный staging с манифестом ресурсов
по-прежнему требует `LOGINOM_AI_AGENT_TEST_NODE` и `LOGINOM_AI_AGENT_TEST_BROWSERS`.

Эти команды проверяют генератор, каталог скила и регистрацию инструмента.
Они не заменяют установленный Desktop или CLI.

Локальный прогон Windows подтвердил перечисленные команды `product`,
`loginom-host` (`test/synthetic-data.test.ts`, `test/stage-resources.test.ts`)
и `agent` (каталог, профили, `test/tool/synthetic-data.test.ts`). Инструмент
принимает в манифесте `bin/node` и `bin/node.exe`: на Windows тест указывает
`bin/node.exe`, потому что так лежит поставляемый Node и так его запускает
CreateProcess. Полный `bun test` в `loginom-host` на этой машине дополнительно
падает на создании symlink без привилегии и на сравнении короткого и длинного
пути `TEMP`; к генератору это не относится.
