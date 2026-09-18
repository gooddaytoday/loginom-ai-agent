# Destination folder: подтверждённый stale precondition

Source fix после [отказа общей сборки](../2026-09-17-unified-cli-build/report.md).
Причина: folder ui.act с UI_EPOCH_CHANGED/NOT_APPLIED до эффекта завершал весь
delivery как требующий inspection. Исходная recovery-запись не изменена.

## Изменение

В `client/lib/artifact-delivery.mjs` ограниченное продолжение разрешено только для
выбора папки, когда receipt относится к текущему action ID и одновременно имеет:
NOT_APPLIED, phase=preconditions, effect_possible=false, cleanup_complete=true,
error.code=UI_EPOCH_CHANGED. После него выполняется новый поиск той же папки,
с проверкой document/workflow/tab/parent directory, типа folder и допустимого
double_click. Используются новые observation/ref/action ID. Лимит — три попытки;
abort/deadline останавливают продолжение.

Не менялись запреты на повтор uncertain navigation, upload, verification или
старого settled delivery. Runtime action validation не ослаблялась. Отсутствие
эффекта без подтверждённого cleanup не разрешает продолжение.

## Проверено

- До изменения regression positive/bounded cases падали. После: delivery suite
  46 tests PASS, включая свежие refs/IDs, предел попыток, отмену и отказы при
  ambiguity, возможном/неизвестном эффекте, чужом ID, другой phase/code, потере
  ответа, смене document/tab/directory и типа выбранного объекта.
- Ещё 44 upload/verification/storage/bridge tests PASS, pinned Node 24.19.0.
- Отдельный bundle `/tmp/loginom-epoch-runtime-20260917`, 4365 staged files.
  Resource manifest SHA256:
  `ac1aebeb0346d0040042bd473f01e5f9e04a01a259ccdd0b122276c84d4ca36b`.
  Изменённый модуль в source и bundle имеет одинаковый SHA256:
  `35aff53d345de3b29eb7f8212f66342a129afdae63dfcb4c24fdcb3f594e7c80`.
- Живой direct-runtime oracle `/tmp/loginom-linux-oracle-Wd5srE/summary.json`:
  canonical A/B input hashes совпали, 32 receipts, source paths различаются,
  independent cold readback 55/101, settingsReapplied=false, process exit=0.
  Использованы новые profiles/packages; прежняя операция не повторялась.
- Recovery ID `fe3d315e-3d86-4f0a-bc9a-fa643d5c4c4b` прежнего run B сохранён.

Логи: `/tmp/loginom-folder-epoch-tests.log`,
`/tmp/loginom-folder-epoch-regressions.log`, `/tmp/loginom-epoch-runtime-oracle.log`.

## Ограничения

Fault path детерминированно проверен локальными tests. Живой прогон подтверждает
обычный end-to-end runtime flow; он не является намеренно вызванным browser
stale-folder fault. Native candidates 0.1.4-cli.202609171930 не содержат fix.
Их historical run B остаётся FAIL; нужна новая общая сборка и native acceptance.
Ни один полный IND gate этим source-only отчётом не повышается. Installed
Desktop, пользовательские profiles и старый recovery не изменялись.
