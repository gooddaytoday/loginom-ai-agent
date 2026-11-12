# Проверка девяти замечаний cloud auth

База `7ae5bbb3f7`, ветка `dock-cloud-auth`. Контракт задаёт
`docs/superpowers/specs/2026-11-05-dock-cloud-auth-design.md`.
Поручение владельца охватывает повторную проверку, исправления и тесты.

- [x] Независимое ревью плана — Approved. Проверки подтвердят read-back,
  bounded cleanup и сохранение ошибок отмены/закрытия.
- [x] F1, F5, F6 — `cloud-auth.ts`, `test/cloud-auth.test.ts`. Последовательно
  RED → GREEN проверить сохранение последней подтверждённой записи при ошибке
  read-back, повтор token polling при сетевом обрыве тела, отмену после обмена
  с DELETE 204 и ожидаемым revoke-session 401. Сохранить протокольные ошибки,
  ограничения времени, первичную причину сбоя и предупреждения реальной очистки.
- [x] F2, F3, F4 — connection-service, settings-loginom-state, host-port и их
  поведенческие тесты. Последовательно RED → GREEN проверить результат save
  после ошибки старого Help, обновление чистой формы при отложенной активации
  connection-required и локальные tools после 401 Dock и сбоя site refresh.
  Сохранить dirty drafts, rev-conflicts, cleanup/cancellation и исходный budget.
- [x] F7, F8, F9 — Desktop/CLI acceptance drivers и settings-ux. Проверить их
  реальные входные форматы, передать explicit custom mode/endpoint/ключ через
  существующие приватные каналы. Проверить автоматическое и ручное открытие
  ссылки отдельно. Использовать существующие fake executables и контроллер
  формы для регрессий. Native проверки отмечать только по реальному запуску.
- [x] Выполнить затронутые package-local тесты и `bun typecheck`, проверить diff
  независимо, записать решение по каждому замечанию и результаты в
  `docs/testing/loginom-ai-agent/cloud-auth.md`.

Работать в существующем worktree, сохранить чужой prompt. Временные данные
только в `$HOME/storage/tmp/`, тесты с изолированными профилями и локальными
сервисами. Сетевые тесты Bun запускать с очищенными ambient proxy variables,
дочерним процессам передавать pinned Node. Изменения ограничены подтверждёнными
замечаниями, без новых зависимостей и изменений публичного Protocol/HttpApi.

Результат — F1–F9 подтверждены и исправлены, 368 PASS, 2 SKIP.
Четыре package-local typecheck и независимое ревью исправлений — PASS.
Полный GUI-прогон не дошёл до проверок из-за Electron launch timeout,
native Windows/macOS и production не проверены. Подробности и первый
неуспешный Desktop-прогон с timeout5с сохранены в canonical cloud-auth.md.
