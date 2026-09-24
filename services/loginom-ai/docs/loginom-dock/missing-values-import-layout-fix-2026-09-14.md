> Исторический документ, адаптированный для навигации в Loginom AI Agent. Даты, версии, SHA и результаты относятся к прежним проверкам. Пути к коду указаны относительно нового репозитория; это не доказательство проверки текущих файлов. Исходник `source-bfb263327982` и изменения: [происхождение](../../../../docs/node-development/provenance.json). `unavailable:artifact-*` означает [неперенесённый материал](../../../../docs/node-development/history/unavailable.md). Актуальная работа: [регламент](../../../../docs/node-development/README.md).

# Missing Values: исправлен блокирующий импорт120

**Готово к следующему выделенному Hermes-слоту.** Source commit
`408738126465c9ba143452be7d7ad4b1b62aa127` исправляет распознавание полной
таблицы полей при вертикальной полосе прокрутки. Run7 сохранён как FAIL;
новая модель после него не запускалась. Полная приёмка Missing Values ещё
не завершена.

## Воспроизведение и причина

В отдельной source-сессии Loginom7.4.2/test-4 импорт one-in-120.csv на старом
runtime повторил `Import field has no observed horizontal scroller`.
Скриншот и read-only DOM-измерения подтверждают пять полностью видимых полей.
В заголовке native grdSettings зарезервирована вертикальная полоса:
box/scrollWidth719, clientWidth704, overflowY=scroll, scrollLeft0.
У body и preview scrollWidth=clientWidth704. Горизонтальной прокрутки нет.

Строгое прежнее noOverflow(header) ошибочно объявляло definition_coverage
partial из-за15пикселей пустой полосы. Полная definition page5/5 сама по себе
не разрешала редактирование без поиска horizontal scroller, и настройка
останавливалась. Старое AMBIGUOUS не переоценивалось и не повторялось.

В workspace-ui разрешён только наблюдённый случай полосы: overflowY=scroll,
нулевой scrollLeft, scrollWidth=offsetWidth, измеренные unavailable:artifact-212c261c149e0a24 размеры,
нулевой clientLeft, одинаковая клиентская ширина header/body. Все native
заголовки и каждую ячейку дополнительно проверяем внутри клиентской ширины,
включая правый край редактора. Прежние проверки уникальности, ownership,
последовательности, видимости, полного покрытия и отсутствия overflow body/grid
сохранены. Настоящая горизонтальная обрезка остаётся partial. API, команды
прокрутки, обработчик импорта, критерии результата и аудитор не менялись.

E2E columnDefsTuning.ts/sColumnDefsTuning.ts и Help import/txt/README.md
сверены для семантики редактирования полей и native selectors. Геометрическая
причина установлена по живому Loginom, не выведена из документации.

## Проверки и границы результата

- 344 проверки workspace observer/импорта: PASS, в том числе новый случай
  вертикальной полосы и7отрицательных вариантов с обрезкой заголовка/ячейки,
  настоящим overflow, иной overflowY, прокруткой, несовпадением ширин и
  отсутствием измерений. Проверены общий и scoped observers.
- 72 проверки Missing Values/runtime,18Python и2startup: PASS.
- На свежем исправленном source runtime импорт120 — SUCCEEDED; получены
  complete_configured_columns без horizontal action. Далее два полных
  Missing Values с порогами0/100 — SUCCEEDED. 11/11 адресных проверок:
  настройки,120строк и первые10строк каждого выхода по прежнему Decimal oracle.
  Прочитаны все1997строк журнала. Полное чтение120строк и persistence этой
  адресной проверкой не заявляются: это остаётся задачей полного аудитора.
- Обе сессии развёрнуты с viewport=null; исправленная2044×1035,
  outer2044×1122 при available2048×1122. Оба launcher exit0, собственные
  процессы/браузеры отсутствуют по проверке09:07:40UTC.
- Старые38квитанций run7 и36квитанций предыдущей готовности повторно сверены.
  Исходные FAIL, DB/WAL и журналы сохранены. Пользовательские файлы не включены.

## Комплект полного прогона8

`unavailable:artifact-c8525a798dd68a1e`.
Скопированы и сверены412файлов (156runtime +256harness). Штатный preflight
прошёл без модели. В harness изменены только две literal runtime-привязки;
весь goal, fixtures, oracle и аудиторы совпадают с предыдущим комплектом.

| Pin | SHA256 |
|---|---|
| Runtime | `e909a974f924fe2be856eb9508cd85c42ac18245ea16df01c6bb75d8b4e874fc` |
| Harness | `e0b1c6135b3eecfa51c91307eb0b17b4e3280aa9482c3a3061428e89cd1fe454` |
| Goal | `35a23e9aeb6a37c408e249aec54e12ca1f230cbc219392e5cabe9b6d4675a836` |
| Kit manifest | `bb1eb18a6094cfff68f51080df1a77bee48e7b22ba31892fdcc40318195f7fa2` |
| Launch plan | `f8c7b61b45c8e796cd54e8eeeb28421731be5934a52187c6a1c8aefca3d32df2` |

Команда — точный массив args в launch-plan.json: прежний test4.2/cadd80df…,
test-4, новый root node14-autonomous-acceptance-8/runs, полный
missing-values-complete, existing openai-codex/gpt-5.6-sol/low,3600s/200turns.
Перед запуском обновить preflight и получить новое назначение единственного
слота. Обязательны27успешных операций/9импортов/12результатов/nativeSave/
independentReopen/fullAudit. Повторное full review и новая Goal не требуются.

Слот7 локально освобождён после подтверждённого выхода. Прямая пересылка
внутренних данных координатору ранее отклонена auto-review; повторных попыток,
обхода и записи в coordinator registry не было. Готовность доступна в этой
задаче и документации для независимого чтения координатором.
Main/merge/push/deploy/общий плагин не изменялись.

[Pins и43квитанции](missing-values-import-layout-fix-pins-2026-09-14.json).
