# Проверки всех веток и запуск v0.1.6

Цель, согласованная пользователем 2026-09-21: тесты и typecheck запускаются
на всех ветках; новый тег запускает полную релизную сборку.

## Решение

`test.yml` и `typecheck.yml` используют push branches `["**"]`, включая
имена со слешами; PR не ограничены целевой веткой. Теги обслуживает существующий
`release.yml`, который повторно использует тесты и typecheck. Отдельный
`windows-native-check.yml` также принимает push всех веток, сохраняя paths.
Следующая свободная версия — 0.1.6: v0.1.5 уже существует и не перемещается.
Root/Desktop manifests и bun.lock обновляются через `script/set-version.ts`.
Существующий release workflow создаёт draft после всех платформенных gates;
публичная публикация и установка приложения не входят в эту задачу.

## Выполнение и проверка

- [x] Обновить три workflow и CI runbook.
- [x] Выполнить `bun script/set-version.ts --version 0.1.6` на Bun 1.3.14.
- [x] Проверить YAML, branch/tag filters, неизменность release gates и frozen install.
- [x] Создать коммит с Conventional Commit message; сохранить пользовательский cleanup.md.
- [x] Создать annotated v0.1.6 и атомарно отправить loginom с тегом; pre-push не отключать.
- [x] Проверить удалённые refs и запуск test/typecheck/release в GitHub Actions.

- [x] Довести полный release workflow до success под Linux x64, Windows x64 и macOS arm64, исправляя подтверждённые ошибки.
- [x] Сверить артефакты Desktop/CLI, обязательные gates и draft-only статус; сохранить итоговый отчёт.

Пользователь отдельно подтвердил сопровождение до успешной сборки всех платформ.
Локальные проверки конфигурации не объявляются успешной релизной сборкой.

Итог: [release run 35584356107](https://github.com/gooddaytoday/loginom-ai-agent/actions/runs/35584356107) — success.
[Отчёт и проверенные артефакты](../../testing/loginom-ai-agent/reports/2026-09-21-ci-release/report.md).
