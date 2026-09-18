# Desktop regression после выделения standalone CLI

Дата: 2026-09-17. Linux x64, X11. Проверены текущие исходники ветки
`loginom-cli`, base commit `c37913ab5ca8f421b76286bf25c282b83cc2de56`.
Рабочее дерево dirty; это development candidate, не опубликованный релиз.
Source tree SHA256 после сборки, до добавления этого отчёта:
`32f6cb7f85a17db7b220131191af74e1212a7a64d82871794801fc37deeeb961`
(алгоритм snapshot из `packages/loginom-host/script/build-cli.ts`).

## Проверено

- Desktop `bun typecheck`: PASS.
- Connection/credentials/recovery/host-port: 33 tests, 100 assertions PASS.
- Packaging/static artifact verifier/system proxy: 10 tests, 66 assertions PASS.
- Реальные HTTP, HTTPS CONNECT и Node HTTP через proxy, loopback bypass,
  отсутствие direct fallback: PASS (`test/loginom/system-proxy.ts`, Node 24.19.0).
- `bun run build` с prod channel и закреплёнными Node/browser resources: PASS.
  Bun 1.3.14; Vite build subprocess использовал системный Node 22.16.0.
  Комплектный runtime Node — 24.19.0.
- `electron-builder --dir --publish never`: PASS, Electron 42.3.3;
  упаковка запускалась с Node 24.19.0 и Bun 1.3.14 в PATH.
- Статический `verifyResourceTree` упакованного candidate: 4365 файлов PASS;
  проверены hashes, границы путей и Linux x64 ELF Node/Chromium.
- `gui-smoke.mjs` через development Electron и затем через packaged executable:
  PASS в двух разных временных профилях. В каждом проверены четыре поля первого
  входа, пустые secrets, отсутствие password placeholders, видимость submit,
  живое подключение к Loginom, сохранение connection с правами 0600, безопасный
  IPC readback без API key, branding и восстановление подключения после полного
  закрытия/повторного запуска без повторного мастера.

Private credentials читались тестом из локального файла; в аргументы процесса,
этот отчёт и git они не копировались. Установленный Desktop и пользовательский
профиль не изменялись. Предыдущие generated outputs сохранены в
`/tmp/loginom-desktop-before-cli-regression-20260917`.

## Артефакт и локальные evidence

- Candidate: `/tmp/loginom-desktop-cli-regression-20260917/linux-unpacked`.
- ASAR SHA256: `f91a86d1ba25d76f23036cda3277b192e912016e18bc55b20652d598c7cdce9d`.
- Resource manifest SHA256:
  `4d0780e520276c908a96fe4a0c5c8e4b327a172aeb23b17f2193e75dbfd7ff30`.
- Build/package logs: `/tmp/loginom-desktop-cli-regression-build.log`,
  `/tmp/loginom-desktop-cli-regression-package.log`.
- GUI logs: `/tmp/loginom-desktop-cli-regression-gui.log`,
  `/tmp/loginom-desktop-cli-regression-packaged-gui.log`.
- Последние GUI screenshots: `/tmp/loginom-gui-evidence` (packaged run).

## Ограничения

`linux-unpacked` не установлен через dpkg и не является проверкой DEB/AppImage
upgrade. Release manifest не создавался: для него требуется committed source.
GUI smoke проверяет подключение и restore, но не сценарий CSV через model tools,
активную отмену, owner crash или независимый cold readback. Не проводилась
инвентаризация всех дочерних PID после GUI shutdown. Предыдущие native CLI
candidates собраны из других snapshots: IND-02/03 и полный Desktop regression
gate этим отчётом не закрываются. Windows/macOS не проверены.
