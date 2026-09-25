# Browser scale: исходные проверки и открытая приёмка

2026-09-24. База: `7cf322f72696506282a823c7124b79145a98c664`, изменения в рабочем
дереве. [Согласованный план](../../superpowers/plans/2026-09-24-browser-scale.md).
Это отчёт об исходниках и Linux Chromium, не сертификация установленных Desktop/CLI.

## Реализовано

Единая политика headed DPR=1 для обоих владельцев браузера, viewport null;
headless 1280×800. Допуск 1/64 CSS px для DOM-геометрии и 1e-7 для единичных
SVG коэффициентов. Точные семантические проверки и целочисленные scroll guards
сохранены. Исключение пустого gutter отделяет округлённую ширину от доказанной
видимости содержимого. Диагностика включает фактическую геометрию и первый
геометрический отказ; compact pager сохраняет её, timeout использует последнее
успешное наблюдение без дополнительного браузерного чтения.

## Среда и проверенные результаты

- Linux x64, X11/Xvfb, Node 24.19.0, Bun 1.3.14.
- Playwright 1.63.0-alpha-2026-08-31, MCP 0.0.80, Chromium revision 1243.
- Chromium SHA256: `8c599d43aec53f2460a31ae2f4af6bd863f8258b34ff519564bc5d4726bfaa1e`.
- Node SHA256: `bc17c508ffeed0ec622934f9b7fa72f8e78da65350e63c3eceb56fa688aa5e12`.
- Runtime tests: 28/28 PASS. Независимый Python journal verifier: 14/14 PASS
  (`python3 -B -m unittest test_rename_effect` из `tools/loginom-acceptance`).
- Реальный Chromium headless: 7/7 PASS — managed/MCP downloads и uploads,
  плюс естественный layout при DPR 1/1.25/1.5/1.75/2. Независимые измерения
  строк при 1.25/1.75 содержат ненулевой float-шум; полные определения принимаются,
  clipping 0.5 CSS px отклоняется. Тест использует production serialized capability.
- Реальный headed Chromium в Xvfb с `GDK_SCALE=2`: managed/MCP 2/2 PASS,
  фактический DPR=1, null viewport, downloads/uploads работают. До подключения
  общей политики каждый путь воспроизводил RED: фактический DPR=2 вместо 1.
- Геометрические регрессии: output families, native cache, Calculator, Reform,
  import, input SVG; границы допуска и отрицательные случаи. Размещение с дробными
  origin/scroll проверено при 50/100/150/200%; прежние проверки bounds сохранены.
- Полный client suite: **2339 PASS, 0 FAIL, 9 SKIP**, всего 2348 тестов, 201.9 s.

Команды из `packages/loginom-runtime/client` (Node — закреплённый бинарник):

```sh
node --test --test-concurrency=2 test/*.test.mjs
LOGINOM_DOCK_TEST_BROWSER=/path/to/pinned/chrome node --test test/browser-downloads.integration.test.mjs test/browser-geometry.integration.test.mjs
GDK_SCALE=2 LOGINOM_DOCK_TEST_HEADED=1 LOGINOM_DOCK_TEST_BROWSER=/path/to/pinned/chrome xvfb-run -a -s '-screen 0 1600x1000x24' node --test test/browser-downloads.integration.test.mjs
```

Runtime suite запускается из `packages/loginom-runtime`: `node --test test/*.test.mjs`.
Интеграционные тесты пропускаются без `LOGINOM_DOCK_TEST_BROWSER`; поэтому они
дополнительно выполнены явно. TS продукта не менялся, typecheck для mjs не заявляется.

## Диагноз единственного отказа первого полного прогона

Первый прогон: 2337 PASS, 1 FAIL, 9 SKIP. Тест `native Table coverage survives
actual pager and independent journal comparison` воспроизводился 3/3. Новая
`geometry` терялась в whitelist компактной выдачи и отклонялась Python verifier.
Добавленная проверка равенства доставленной геометрии дала RED; оба списка
метаданных расширены, получен GREEN. Полное сравнение значений сохранено,
подмена количества строк по-прежнему отклоняется. Это интеграционная регрессия
нового диагностического поля, не флак и не основание ослаблять проверку журнала.

## Изолированный ресурсный каталог и live oracle

Для диагностики скопированы установленные Linux зависимости, поверх наложены
текущие `runtime/src` и `runtime/client/lib`, заново вычислен файловый manifest.
Проверка `verifyResources` прошла; 213 исполняемых модулей `src`/`client/lib`
побайтово совпадают с текущим рабочим деревом. Каталог временный, установленное приложение
не изменено; это не официальный release staging и не новая установленная сборка.

- resource-manifest SHA256: `a98e35b6fd41ae108373f8de89257154226ef407b86249f5f7cafe0ed36f9506`.
- source pin только `client/lib` (`fixedPaths=[]`): `54aa8519ac0c064d789be5ff0d105893fd3e50216b7fd8564bc576b7483cc86a`.
- Новый `browser-launch.mjs` включён рекурсивным source pin; SHA256:
  `e9691df3785442f9bc6de992c08ffebc5e8791f1cce5ad6376830fb5152ada32`.

Первый `runtime-acceptance.ts` остановился до создания узла: устаревший oracle
передавал `budgets`, запрещённый текущим `user-v1`. Для диагностического запуска
использована временная копия без этой строки; контракт продукта не менялся.
В Xvfb без WM импорт настроен и выполнен, затем чтение остановлено:
`Table filter setting ready`, `NODE_APPLY_STOPPED`, `AMBIGUOUS`. Фактический
viewport 1050×893 при screen 1600×1000, DPR 1; диалог Filter x=49, width=1230
действительно обрезан. Проверки геометрии корректно не приняли его. Старый oracle
затем трижды отклонил resume с `unknown field contract_revision`; повторного
браузерного эффекта эти отказы не допускали. Cleanup остался неподтверждённым.
Полный runtime revision этой попытки:
`1d82bf603ca6c278574fdaa84b7a60bd738b1770da2d9a1672fe1600d03a1b02`.
Для отдельного нового сценария выбран нативный X11 с GNOME WM; временная копия
oracle останавливается при AMBIGUOUS без автоматического resume.

Нативный X11/GNOME WM: **PASS**, exit 0. Фактический DPR=1,
viewport 1920×966, screen 1920×1080, visualViewport scale=1. Оба набора
`sales.csv` импортированы в независимых чатах:
A — Alpha 35/Beta 20, total 55; B — Alpha 100/Beta 1, total 101. Оба уникальных
пакета сохранены, закрыты с `SUCCEEDED`, независимо холодно открыты и прочитаны;
`settingsReapplied:false`. Финальный `summary.json` — PASS. Полный runtime revision
совпадает с указанным выше; source/staged модули не менялись между прогонами.

Приватное доказательство: `/tmp/loginom-linux-oracle-n8lqoz/summary.json`,
журнал запуска `/tmp/loginom-scale-oracle-native.log`. Эти временные файлы
не входят в git и могут быть очищены ОС. Временный файл с учётными данными удалён.
Предыдущая Xvfb-попытка остаётся отдельно обозначенной AMBIGUOUS; её исход не
переименован в успех последующего независимого сценария. Секреты и сырые журналы в git не включены.

## Открытые gates

Нужны сборка и установка исправленных Desktop и CLI, проверка их полного source
pin/resource-manifest, CSV 55/101 с сохранением и холодным открытием на каждой
платформе. Windows: OS scale 100/125/150/175/200%, page zoom 80/125/150% при OS 125%.
Linux: нативный X11/Wayland с дробным масштабом. macOS Retina: page zoom 100/125%,
оценка читаемости. На всех — смена монитора с другим DPI и свежая геометрия
следующих действий. ABC LLM остаётся дополнительной продуктовой проверкой.
Эти gates не считаются пройденными по результатам Linux fixture-тестов.
