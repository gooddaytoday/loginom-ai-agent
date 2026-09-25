# Устранение зависимости сценариев от масштаба экрана

Дата: 2026-09-24. Основание: утверждённый пользователем план, исходный код
`7cf322f72696506282a823c7124b79145a98c664`. Реализация — TDD, согласованная политика
headed DPR=1. Исторический TXT — свидетельство прошлого исследования, не инструкция.

## Решение

Общий `client/lib/browser-launch.mjs` используется managed Desktop/CLI и MCP:
headed получает ровно `--start-maximized`, `--force-device-scale-factor=1` и
`viewport:null`; headless сохраняет 1280×800. Политика одинакова для Linux,
Windows и macOS. Sandbox, Wayland, журналирование профиля, download initScript
и передача аутентифицированного контекста сохраняются. Второй браузер/CDP не нужен.
Playwright `deviceScaleFactor` при `viewport:null` не передаётся. Позиция и
физические размеры окна не фиксируются. DPR проверяется при page zoom 100%;
последующий page zoom автоматически не сбрасывается.

Одного флага недостаточно: page zoom влияет на DPR. Измеренные DOM/SVG координаты
остаются CSS px, не округляются и не умножаются на DPR.

## Геометрия

- Внутри сериализуемой `workspaceUiCapability` конечный допуск 1/64 CSS px
  используется для вложенных границ, начала контейнера, смежности и конца строк.
- Область: import, обычное/адресное output mapping, окна native cache, Calculator,
  Reform, input mapping. Проверки ID, индексов, владельцев, порядка и количества,
  полноты cache, фильтров, редакторов и масок остаются точными.
- SVG: a/d сравниваются с 1 с допуском 1e-7; b/c строго 0. Translation,
  экранные endpoints, ширина — 1/64 CSS px. Структура путей, уникальность
  endpoints и владелец остаются обязательными. Реальные scale/skew/rotation
  отклоняются. Проверка кандидата endpoint сама по себе не пишет отказ.
- Целочисленные client/scroll extents сохраняются. Для исключения пустой
  вертикальной полосы допускается abs(offsetWidth−DOMRect.width) ≤ 0.5+1/64.
  Без transform/zoom и левой рамки доказанная правая граница равна
  rect.x+clientWidth−0.5 с допуском только 1/64. Неизвестная видимость — partial.
- `browser_geometry` содержит DPR, screen и visualViewport (или null).
  Наблюдение содержит ограниченную `geometry.failure`: условие, actual/expected,
  delta, tolerance и ссылку при доступности. Это первый отказ геометрического
  предиката покрытия, не универсальный статус всего наблюдения.
- Compact pager и независимый journal verifier сохраняют и сравнивают geometry.
  NodeReadinessTimeout сохраняет последнюю успешную геометрию даже при финальном
  UI_SCAN_LIMIT. Дополнительного запроса после deadline нет; транспортная
  неопределённость остаётся отдельной ошибкой.

## TDD и проверки

Вертикальные циклы: реальный запуск MCP → запуск managed → диагностика наблюдения
→ сохранение последнего наблюдения в timeout → компактная доставка диагностики.
Каждый новый отказ сначала воспроизводится тестом, затем устраняется минимальным
изменением. Начальные тесты дробной геометрии были написаны группой до уточнения
пользователя о TDD; это не объявляется строгим вертикальным TDD задним числом.
Далее новые изменения выполняются RED→GREEN. Проверки уже реализованного
размещения не требуют искусственно ломать исправный код.

Матрица автоматических проверок:

- настоящая сериализованная capability; DPR 1/1.25/1.5/1.75/2;
- границы: 0, реальный float-шум, 1/128, 1/64, превышение, NaN/Infinity;
- отрицательные случаи: clipping 0.25/0.5/1 px, пропуски/дубликаты, чужие и
  recycled records, незавершённый cache, фильтры, редакторы, маски;
- дробные origins/scroll, масштаб схемы 50/100/150/200%, модельные границы 64..10000;
- реальный Chromium: оба владельца при внешнем масштабе 200% получают DPR=1;
  отдельно DPR 1–2 без нормализации, чтобы флаг не скрывал дефект;
- полный client suite и runtime tests закреплённым Node 24.19.0 из package dirs.
  При изменении TS — bun typecheck соответствующего пакета.

## Нативные release gates

- Windows Desktop и CLI: OS scale 100/125/150/175/200%; page zoom 80/125/150%
  при OS 125%.
- Linux: X11 и Wayland, включая дробное масштабирование.
- macOS Retina: page zoom 100/125%, оценка читаемости с принятой политикой DPR=1.
- Перенос между мониторами с разным DPI: последующие действия используют свежую
  проверенную геометрию.
- На установленных сборках детерминированные CSV 55/101, выполнение, сохранение
  уникального пакета, закрытие и независимое повторное открытие. ABC LLM —
  дополнительная проверка, не замена детерминированного oracle.
- Source pin и resource-manifest должны соответствовать реально проверенному
  payload. Старые installed-отчёты не переименовываются в приёмку этого изменения.

Расширение восстановления незавершённого output_mapping — отдельная задача;
неопределённые операции автоматически не повторяются. Все изменения исходников
не означают завершения релизной приёмки. Текущий результат и открытые gates:
[отчёт](../../testing/loginom-ai-agent/browser-scale.md).

## Первичные источники исследования

- [MDN devicePixelRatio](https://developer.mozilla.org/en-US/docs/Web/API/Window/devicePixelRatio)
- [MDN scrollHeight](https://developer.mozilla.org/en-US/docs/Web/API/Element/scrollHeight)
- [Playwright browserContext](https://github.com/microsoft/playwright/blob/main/packages/playwright-core/src/server/browserContext.ts)
- [Chromium display switches](https://github.com/chromium/chromium/blob/main/ui/display/display_switches.cc)
- [Chromium macOS screen](https://github.com/chromium/chromium/blob/main/ui/display/mac/screen_mac.mm)

## Состояние реализации

- [x] Общий запуск managed/MCP и сохранение download/auth invariants.
- [x] DOM/SVG допуски, консервативный gutter, диагностика и compact delivery.
- [x] RED→GREEN для новых изменений после уточнения TDD; полный suite и регрессии.
- [x] Реальный Chromium: forced DPR 1 и отдельные дробные DPR 1–2.
- [x] Текущий runtime на Linux X11: CSV 55/101, сохранение/закрытие/холодное чтение.
- [ ] Официальные исправленные установленные сборки Desktop/CLI и их release pins.
- [ ] Нативная матрица Windows/Linux Wayland/macOS Retina, page zoom и mixed DPI.
- [ ] Дополнительный LLM-прогон ABC.
