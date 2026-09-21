# Локальное исправление восстановления macOS — 2026-09-21

Установлена `0.1.7-local.20260921.2` из commit
`be001116644aa8e0c1d8349f9ea1872cd46584b2` в `/Applications/Loginom AI Agent.app`.
Причина и исходные регрессии: [ошибка кнопки восстановления](../../recovery-button.md).
Это следующая локальная установка после [.1](report.md), без публикации и push.

## Проверено

- App: 14 browser tests, включая настоящий structuredClone; App/Desktop typecheck — PASS.
- Чистая сборка Bun 1.3.14 / Node 24.19.0, prod identity, macOS 27 arm64.
- DMG/ZIP static verification: 4446 ресурсов, подписи и хеши — PASS.
- Desktop/CLI offline smoke — PASS. CLI собран, не установлен.
- `recovery-ui.mjs` на итоговом bundle в отдельном профиле: реальная кнопка,
  preload/IPC и durable journal acknowledgement — PASS, штатный выход — PASS.
- Установлен readonly DMG; codesign deep/strict и равенство executable,
  Info.plist/app.asar собранному кандидату — PASS.
- В обычном профиле через UI повторено уже запрошенное пользователем
  подтверждение исхода старой операции. Recovery count 2 → 0;
  connection generation/revision 1 → 7, pending удалён штатным сервисом.
- UI после применения: предупреждения восстановления и общей ошибки нет.
  «Проверить подключение» показало: «Подключение проверено: AI-сервер доступен,
  вход в Loginom выполнен». Настройки закрыты штатной кнопкой.
- История до/после: 5 сессий, 86 сообщений, 378 частей — сохранена.

Прежний процесс штатно завершён через обработчик SIGTERM, отслеживаемые
дочерние процессы вышли. Bundle и все профили сохранены в приватном
`~/.cache/loginom-macos-build/local-20260921-2-backup/`.
До первого запуска после замены хеши JSON профиля полностью совпали.
Journal и pending вручную не удалялись; старые операции не повторялись.

Итоговые артефакты и build/static/offline reports:
`~/.cache/loginom-macos-build/local-20260921-2-retry/`.
GUI regression: соседний `local-20260921-2-retry-recovery-ui.log`.
Installed app.asar SHA256:
`2be74a91b5c8b3d2b2f39a7bee752e301940aa02c6e4ac5fa4acbb21ed630fc8`.

Первый pipeline остановлен на зависшем cli-source-snapshot; завершён только
его build-процесс. Повторный полный pipeline из того же чистого commit прошёл.
Первый GUI-прогон ожидал macOS Keychain при выходе, пользователь разрешил
доступ в системном окне. Повторный GUI-прогон и установленный запуск прошли.

## Границы

Ad-hoc подпись, без нотариализации. Новый полный ABC-сценарий моделью не
запускался; Windows/Linux и macOS14 в этой локальной установке не проверялись.
Предыдущая общая source-приёмка 142 PASS/9 SKIP относится к [.1](report.md);
для .2 выполнены указанные выше целевые проверки изменённого renderer.
