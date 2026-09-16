# Checkpoint реализации Linux

2026-09-16. Цель остаётся полной реализацией Linux по согласованному плану.
Это промежуточный checkpoint; desktop-дистрибутив пока не готов.

## Выполнено

- F1/F2: read-only snapshot, защищённый source archive, реальное восстановление
  четырёх worktrees и истории; [evidence](source-restore-proof.json).
- F3: 4951 файлов импортированы из frozen `wow-landing`; source map проверен
  по SHA256 и файловым типам. Commit импорта: `26ff8fa76`.
- Добавлены workspace packages product/runtime/site; сохраняются оригинальные
  client npm lock и server uv/Cargo locks, внешние host plugins не регистрируются.
- F4: immutable Product, отдельные channel identities, отсутствие update feed;
  desktop checks отключены, CLI не выполняет upstream upgrades. Исходный publishing
  workflow перенесён в `.github/archived/publish-upstream.yml` вне активных workflows.

## Проверено

- Migration: 6 tests PASS; архив restored PASS; 4951 source hashes PASS.
- Product: 2 tests и `bun typecheck` PASS.
- Desktop: 14 targeted updater/packaging tests и `bun typecheck` PASS.
- Backend: 20 installation tests и `bun typecheck` PASS.
- Workspace install: Bun 1.3.14, Node 24.19.0, 4721 packages; штатные postinstall
  и prepare выполнены. Runtime client: npm ci из собственного lock, 97 packages,
  browser download на install отключён. Сам runtime пока не тестировался в новом layout.

Toolchain находится в `/home/kiselev/.cache/loginom-ai-agent/toolchain/`.
Node archive проверен по официальному SHASUMS256:
`14b342e71204f811bde6153be8e04b62aef63c236fef92b55f9c83154b409647`.
Не менялись пользовательские глобальные версии Node/Bun. Для команд использовать
`bun-v1.3.14/bun-linux-x64` и `node-v24.19.0-linux-x64/bin` в локальном PATH.

## Не завершено

F5/F6, D1–D7, R1–R7 Linux: переименование/собственные пути, managed runtime/host,
generation barrier, credentials/UI, bundle Chromium, DEB/AppImage, Docker и реальные
Loginom workflow/recovery проверки. UI пока остаётся прежним OpenCode.
Серверное production переключение/публикация/удаление старого репозитория не выполнялись.
Native Windows/macOS остаются отдельной работой по подготовленным инструкциям.

Архив не включает активные `.dock` diagnostics; originals сохраняются и требуют
отдельного checkpoint перед retirement. Изменения после source snapshot тоже
потребуют нового архива. Следующее действие: F5, затем встроенный Linux исполнитель.
