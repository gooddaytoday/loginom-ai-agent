# Description + dataset: итоговый checkpoint

Обновлено 2026-09-22. **План выполнен: full final18 — 10/10 CREATED_EXECUTED_SAVED на одном установленном кандидате.** Все10 без бизнес-помощи (`assistance=none`), исходные description.md/dataset.csv неизменны; технических подсказок и ручной настройки зачётных графов не было. Все десять Desktop штатно закрыты, активных попыток нет.

## Проверенный кандидат

- Версия `0.1.7-local.20260922.6`, source `361b13682cf63c7280eef2027015a4d81e38029d`.
- ASAR `628613ce1c8fc9a600dbf78105d7ed65f253162b8210e1334fff80d2317263bf`.
- Установка `/Users/kartamyshev/Applications/Loginom Scenario Tests/0.1.7-local.20260922.6/Loginom AI Agent.app` из readonly DMG.
- Build directory `/Users/kartamyshev/.cache/loginom-macos-build/description-20260922-6`.
- Runtime2315 PASS/2 Windows-only SKIP/0 FAIL; macOS source8/8 PASS; source attribution5045 PASS.
- Общий clean build-macos PASS, включая CLI TAR.GZ, source snapshot, общий Desktop+CLI offline smoke. DMG/ZIP по4446 ресурсов, подпись deep/strict и совпадение установленного ASAR PASS.
- Пользовательская `/Applications/Loginom AI Agent.app` не заменялась; push/публикация не выполнялись. Новая Linux/Windows installed-приёмка не заявляется.

## Итоговая серия

Порядок старта D02,D47,D23,D45,D19,D36,D24,D48,D27,D65 сохранён, фактический максимум5 независимых Desktop. Свои профиль/backend/browser/чат/вложения/пакет у каждой попытки. Loginom7.4.2, macOS Desktop backendv1, openai/gpt-5.6-sol low. От отправки до завершения каждой модели6.19–18.67min, предел30min соблюдён. Полная серия от первого старта до последнего завершения36.23min; это не чистый эксперимент производительности относительно последовательного baseline.

Strict final18-audit.json: complete=true/completed10/expected10/max_observed5. Проверены исходные20файлов, prompt/model, provenance CSV, итоговые execution/output, save-after-graph, modified=false, cleanup, сроки и awaited Desktop close. Узлы: D02=10, D47=8, D23=5, D45=4, D19=9, D36=3, D24=6, D48=6, D27=8, D65=8. Не переносились старые PASS с других версий.

Подтверждены6 типов/режимов: imports.text:delimited, calculator:expression, filter_data:conditions, group_data:aggregate, join_data:inner, sorting:keys. Это не14/14. Признаков compaction в10историях нет, принудительного сжатия не было.111 завершённых ожиданий масок, max408ms, remaining0 во всех учтённых traces. Минутная задержка маски в final18 не повторилась; проверена регрессиями, не объявлять live minute-long PASS.

## Изменения и предшествующие серии

История дефектов/исправлений и точные таблицы — [результаты](description-dataset-debugging-results.md); [выполненный план](../../superpowers/plans/2026-09-21-loginom-description-dataset-debugging.md), [реестр допущений](description-dataset-business-assumptions.md), [исходные файлы](description-dataset-inputs.json).

Baseline7/10; final12=9/10; final13=7/10; final15=9/10; final16=4 PASS/4 BLOCKED/1 INTERRUPTED/1 FAILED(provider). Target17=3 PASS/1 BLOCKED, final17 не запускалась из-за D-F11. Target18 D65 PASS5узлов/9.88min, затем новая full final18=10/10.

Последние code commits: `3e19818b6` — host-owned reread600s; `617f37364` — bounded time-scan refresh и configure в общем600s; `361b13682` — same-editor refresh перед metadata fill, с прежними проверками owner/schema/value и отказом при неизвестном эффекте. Предыдущие исправления портов, областей preview, масок и сроков сохранены.

DEBUG_ONLY17b: D36/D24/D27/D65 PASS,8node.apply+4save, awaited shutdown; DEBUG_ONLY18: исходный D65-target17 import+save PASS, awaited shutdown. Они не заменяли installed-приёмку. Первая диагностика17 дала три CALL_UNCERTAIN и один WIZARD_CONTEXT_CHANGED; временные каталоги после перерыва отсутствовали, первопричина не установлена. Новые диагностики сохранялись в постоянные приватные каталоги, старые неизвестные операции не повторялись.

Общий build16/17 не завершился на CLI source-snapshot, Desktop тогда проверялся отдельно; эти исторические CLI результаты не превращать в PASS. В candidate18 полный build прошёл без изменения сборщика, причина прежнего ожидания не доказана. Keychain вручную подтверждал пользователь; запрет автоматизации SecurityAgent не обходился.

## Доказательства и ограничения

Evidence root `/Users/kartamyshev/Library/Logs/loginom-description-debugging/20260921-163359`: final18-manifest.json, final18-audit.json, final18-audit-console.json, final18-mask-audit.json, candidate18-install.json, target18-audit.json, debug17b-audit.json, debug18-audit.json, source-checks-18.json, runtime-tests-18.log. Чаты, receipts, финальные screenshots и профили — в отдельных Dxx-final18-a01 каталогах; credentials/headers/env/сырые журналы в Git не помещать.

Аналитическая правильность и полнота description — not_checked. Общие аварийные recovery F03/F07 и compaction не провоцировались. Старые неопределённые операции не объявляются восстановленными; их журналы сохранены. Один успешный прогон не доказывает отсутствие редких сбоев и не измеряет вероятность успеха.

REPL все slots18/targets18/targets17 закрыты; launchNext18 больше не вызывать. Продолжать старые pending операции или удалять их журналы не требуется. Дальнейшая установка в рабочий профиль, публикация и расширение приёмки — отдельные задачи.
