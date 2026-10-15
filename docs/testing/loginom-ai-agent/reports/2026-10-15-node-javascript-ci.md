# JavaScript: PR и CI, 2026-10-15

[PR68](https://github.com/gooddaytoday/loginom-ai-agent/pull/68): `node-javascript → loginom`.
Исходный published SHA: `cbc0ee47e6bc2c5efe47819bccf3b45cab9bc5f7`.
Обычный push, без force; исходный worktree4118 с незакоммиченным планом сохранён.

## Диагноз и исправления

- `237fb7e4cf` обновил Chromium1243→1246, но Linux installer продолжал искать старый sandbox. Путь теперь следует product pin, native installer acceptance читает путь браузера из artifact resource manifest. Регрессионный тест подтверждает отказ для mode0755 текущего sandbox; до исправления он ошибочно устанавливался.
- `1e481585dd` добавил shutdown fixture без существующего root и native Keychain helper. На macOS десять тестов падали до проверки shutdown с `LOGINOM_CREDENTIAL_PROTECTION_UNAVAILABLE`; исходный Linux scope прошёл3/3, по17 тестов. Оба fixture paths теперь создают root0700 и на darwin собирают штатный helper, как существующий node-host fixture. Production credential protection не меняется.
- Тот же commit прекращал обычный cleanup до MCP/browser close при отсутствии Save, native refusal или evidence failure. Теперь обычный bridge закрывает транспорт и сохраняет BLOCKED receipt. Managed layer после закрытия outer browser handles отклоняет ACK и сохраняет профиль при blocked last-confirmed-own-save cleanup. Strict acceptance early refusal сохранён. Четыре адресных RED cases воспроизведены до fix; runtime guards, save ownership и native discard policy не ослаблялись.

## Локальная проверка исправлений

Bun1.3.14, Node24.19.0; запуск из package directories, TMPDIR в storage/tmp.

- Host installer + saved-package-shutdown:19 PASS,159 assertions; Host `bun typecheck` PASS.
- Runtime bridge lifecycle, package cleanup, managed resource/entry close:88 PASS.
- Отдельная bridge wrapper:PASS, внутри51 cases; исходный30s timeout не менялся.
- `git diff --check` PASS; transformed bridge SHA обновлён в source-transforms.
- Нативный macOS helper здесь не исполнялся: подтверждение требует macOS CI.
- Локальная реальная установка CLI, GUI/live Loginom и публикация релиза не выполнялись в рамках этой задачи.

## Checkpoint

- Source before fixes:cbc0ee47e6; рабочая ветка исправлений:javascript-ci.
- PR68 открыт в loginom, конфликтов и force-push нет.
- Исправлены installer pin, macOS fixture и ordinary blocked cleanup resource release.
- Локальные проверки:Host19/runtime88/bridge51 и Host typecheck PASS.
- Исходный candidate38703471881:macOS fixture FAIL; остальные jobs продолжаются.
- Следующий шаг:push fixes, закрыть review threads, запустить candidate на новом SHA и дождаться всех CI gates.
