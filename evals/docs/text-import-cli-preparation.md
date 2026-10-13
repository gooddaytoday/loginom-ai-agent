# Отдельный CLI pin для текстового импорта

Назначенный source: `5cd74d8ee5d6125692d953eb327b4d4f833c27a1` из
`gooddaytoday/loginom-ai-agent`. Это отдельная кодовая база CLI, не SHA harness.
Commit доступен локально; при передаче проверить доступность exact SHA в remote.
Новый CLI в текущем этапе не собирался, не устанавливался и не активировался.
Default CLI, профили и baseline LAB-55 сохранены. Live compatibility — NOT_RUN.

Для отдельно разрешённого исполнения карточки 0 создать собственный clean
detached checkout exact SHA вне harness/профилей. Прочитать его AGENTS.md,
`docs/testing/loginom-ai-agent/standalone-cli.md` и штатный
`packages/loginom-host/script/build-cli.ts`. Не переносить сборщик из другой ветки.
Его контракт: pinned Bun из `packages/loginom-host/licenses/bun/source.json`,
явные `LOGINOM_AI_AGENT_NODE_SOURCE` / `LOGINOM_AI_AGENT_BROWSER_SOURCE`, новый
абсолютный destination; команда из `packages/loginom-host`:

```sh
bun script/build-cli.ts "$NEW_PRIVATE_CLI_ARTIFACT"
```

Сборщик включает binary, ресурсы/host, notices/source snapshot, installer и
полный cli-manifest; отдельный agent/script/build.ts не заменяет эту поставку.
Перед ресурсозатратной сборкой подтвердить отсутствие конфликта с LAB-55.
Полученный artifact использовать по абсолютному собственному пути либо штатно
установить в отдельный подтверждённый prefix; не заменять default launcher.
Если имеющийся installer не поддерживает отдельный prefix, не запускать его
на общий home — назначить отдельный isolated home/executor по его контракту.

До первого model/reference/product/cold подтвердить manifest sourceCommit exact,
sourceDirty=false, полный resource manifest и SHA binary/resources/архива,
штатный немодельный допуск/sandbox, выделенный Loginom/lease/cleanup и доступность
Luna/high. Cold reader проверяет exact CLI manifest до открытия браузера.
Невозможность сборки/установки/допуска — BLOCKED; автоматической замены pin нет.
Активация действующих runtime и проверка живого продукта относятся к следующему этапу.
