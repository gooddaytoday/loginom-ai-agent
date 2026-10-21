# bug-report

Skill `bug-report` и инструмент `bug_report_run` собирают описание проблемы, экспорт текущего чата и недавние логи в zip. Ветка `bug-report-skill` от `loginom` `38ee045e79`. Отдельного Host-профиля и генерируемого исполнителя нет.

## Checkpoint

- SHA базы: `38ee045e79`. Изменения на `bug-report-skill`, без отдельного коммита в этом шаге.
- Результат: `collect` пишет черновик, индекс «где смотреть», экспорт чата и хвосты логов; `pack` после заполненного `report.md` кладёт zip в каталог сессии.
- Проверено из исходников: тесты инструмента, каталога skills, реестра и окружения sidecar. Установленные Desktop и CLI не запускались.
- Ограничения: маскирование по шаблонам, перед `pack` нужно подтверждение пользователя. `.netlog`, `.dmp` и `.heapsnapshot` только перечисляются. Инструмент виден в `default` и `loginom-automation`.
- Следующий шаг: владелец смотрит diff и решает, нужна ли приёмка на установленном Desktop Windows и standalone CLI.

## Приёмка на установленном приложении

Эти шаги не заменяют исходные тесты и пока не выполнены.

1. Desktop на Windows: описать сбой в чате, вызвать `/bug-report`, подтвердить состав и получить `loginom-bug-report-*.zip` в каталоге сессии. В архиве есть `report.md`, файл чата `<id сессии>.json`, `index.json` и `logs/desktop/`.
2. Standalone CLI: то же из сессии `loginom-ai-agent-cli`. В архиве есть `logs/profile/`.
3. Сбой соединения Loginom: в `index.json` есть код вроде `LOGINOM_CONNECTION_NOT_READY` и ссылка на сообщение чата.
4. Секреты: в распакованном архиве нет значения пароля и ключа. Тело `data:`-вложения целиком отсутствует; у текстового вложения есть только начало, и секреты в нём замаскированы. Число `redactions` больше нуля.

## Как удалить

Скилл не имеет своего Host-профиля и исполнителя. Каталог `packages/product/skills/bug-report/`, инструмент `packages/agent/src/tool/bug-report.ts`, тест `packages/agent/test/tool/bug-report.test.ts` и этот журнал удаляются целиком. В основной программе остаются три правки:

1. В `packages/agent/src/tool/registry.ts` убрать import `BugReportTool`, `yield* BugReportTool`, `Tool.init` и строку `tool.bugreport` в списке встроенных инструментов.
2. В `packages/product/src/skills.ts` убрать `"bug-report"` из `reservedSkillNames`.
3. В `packages/desktop/src/main/sidecar.ts` убрать `LOGINOM_AI_AGENT_DESKTOP_LOG_ROOT` и import `join`, он нужен только для этой строки.

Замена `Bun.hash` на `createHash` в `packages/core/src/skill/discovery.ts` к скиллу не относится и при удалении остаётся.
