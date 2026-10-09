# Сокращённая приёмка package-docs — 2026-10-09

Текущая граница — решение пользователя и план `94627858a`: десять независимых
CLI-задач по одному запуску, минимум8 PASS с судьёй/структурой/CSV; три заранее
выбранных cold replay; S1–S8; установленный CLI/Desktop и штатное завершение.
Новая baseline/A/B90, статистический compare, полная TUI/recovery матрица и
этап9 отложены. Серверный skill сохраняется. Историческая v9 остаётся INCOMPLETE.

## Финальные сборки и offline-проверки

Оба продукта: чистый source `9695e61e358ac5e6043c08eb56d183faa03d7a28`, версия0.1.17.
Полный CLI TAR.GZ, Desktop DEB/AppImage и source archive сохранены в новых
каталогах вне checkout; manifests/resources проверены. CLI inventory5651,
Desktop static verification4654 ресурсов для каждого артефакта.

| Материал | SHA256 |
| --- | --- |
| CLI TAR.GZ | `822ba2c58dd5ba09bbaa33369400e248f81e710368c4842e6fb093d2bec02acb` |
| CLI manifest | `3d1c461c6760bf768deee50ebf2c9edb0d5faca9f114a5aca80bf428fe4b598d` |
| Desktop release manifest | `48d0e10a5ebd1abaa1860a7b0f133e6601da33ba2a5f38ee2827abf5efe05e66` |
| Desktop AppImage | `d7ca713b2db3124018753e1ba562bd64ac23b15b93cd89ec0ba218f7ad0f6095` |
| Read-back offline-матриц,47 файлов | `dc84c279e601b88f548c70c8f6a9f89d11191cf365c55c2568eca12d1cdb9af9` |

Уже начатые до сокращения плана серии закончены: Ubuntu22/24/26, Debian12/13,
**CLI5/5 PASS, Desktop5/5 PASS**, non-root/network:none. Проверены собственная
установка/запуск, bundled Node/resources и Chromium sandbox; CLI uninstall
сохранил профиль. Все10 контейнеров удалены. Это offline/synthetic проверки,
модель/судья/Loginom в них не вызываются.

На текущем Linux CLI установлен штатным `install.sh` в отдельный HOME;
launcher status — unconfigured, все5651 inventory entries совпали,
chrome-sandbox root:root4755. Пользовательский launcher не заменён.
Первоначальный диагностический checker ошибочно использовал `stat` для symlink;
после перехода к `lstat`, как в штатном manifest verifier, проверка прошла
без изменения установленного payload. Desktop AppImage доставлен в отдельный
каталог; native проверки этой установки ещё открыты. Выпуск не опубликован.

## Условия новой десятки

Принятый frozen harness `d08be6baf8f5aea53f83c228cd0984c9d2bf0494` неизменен,
проверены658 tracked files, lockfile, judge и verifier/adapter pins.
Перед новым freeze актуальный evals ref был
`7318ec61fef3e026216e62e287ef1328d4f8e912`; judge prompt/schema/code,
near-miss calibration и tasks не отличаются от выбранного frozen SHA.
Новая калибровка и повтор полного неизменённого harness suite не выполнялись;
его сохранённые486 PASS/2 SKIP/0 FAIL и typecheck относятся к этому exact SHA.

Задачи фиксированы в порядке: sales-by-category, abc-pareto-groups,
articles-by-author, campaign-roi-by-channel, customer-activity-segments,
monthly-demand, ab-revenue-per-converter, risky-approved-claims,
slow-supplier-deliveries, trial-dosage-outcomes. Cold фиксирован для sales,
ABC и campaign ROI. Исходный task snapshot/рубрики/oracle сохранены без правок.
У trial прежний первый повтор PASS, второй FAIL/no_artifact; это не скрывается.

Основная модель `openai/gpt-6.1-sol medium`, судья `gpt-6-astra high`, threshold70
и обязательный checklist; исходные effective timeout1800000ms сохранены.
Каждый task запускается отдельным процессом `--only ID --repeat 1`, со своими
results/profile/workspace/artifacts. Следующий admission требует terminal
result и подтверждённый cleanup предыдущего. Ручных повторов нет.

Private evidence root: `/home/kiselev/.local/share/loginom-ai-agent-acceptance/package-docs-20261006`.
Условия: `ab-short-conditions-9695e61e3-20261009/common.json`, SHA256
`570d1578f57d64a249611a4bb3efc324d6d9a757e9c28273c5c14dc7cfb5e0e9`;
dispatch manifest SHA256
`86979bc4d0d150404547c72123ed1a1ae17f4e589a6b564757c5f37deeed7a55`.

Новый собственный локальный стенд использует endpoint `http://127.0.0.1:32769/app/`,
network `loginom-skills-short-20261009`, server ID
`8ef472eed7fd6d6a5cf49ce8dcae115429b20f4cfad6fbb71c33af7f138b8185`.
Нет host mounts; isolated storage marker, Python-disabled config, native proxy
и admission проверены штатным harness. Старый v9 стенд/материалы сохранены,
исходные server/client ID/StartedAt не изменены. Между пользовательскими ходами
server reset не используется.

## Открытые проверки

Первой запущена sales-by-category, один формальный запуск. Итог десятки,
judge/structure/CSV, cold3 и S1–S8 ещё не приняты. Нужны native Desktop,
небольшое изменение/execute/save после writable reopen установленного CLI,
одна штатная отмена с процессным наблюдением и итоговая очистка.
Предыдущий scripted normal shutdown/writable reopen нового CLI прошёл;
он подтверждает native lifecycle, но не выбор skill реальной моделью.

Отбор по прошлым успехам ограничивает охват: нет statistical non-inferiority,
полных35 задач, соединений и построения подмоделей. Причина старого long-run
harness hang остаётся UNKNOWN; его результаты не считаются новой приёмкой.
