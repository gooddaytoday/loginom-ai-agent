# Предложение приёмки двух входных таблиц

LAB-1013, этап 0. Это материалы для решения владельца, не зарегистрированные
сценарии `run-check` и не объявление нового поведения поддержанным.
Обоснование, живое исследование, ограничения остальных API и оценка —
[capabilities-discovery.md](../../capabilities-discovery.md).

Модель получает только [task-multi-input.md](../task-multi-input.md),
`fixtures/capabilities/orders.csv`, `bins.csv` и назначенный путь пакета.
Для продолжения — [task-multi-input-update.md](../task-multi-input-update.md)
и `bins-updated.csv`. Oracle, expected, карточка типа, план, журналы и готовый JS
модели не передаются. Здесь нет готового исходника решения задачи.

| Случай | Входы | Ожидание |
|---|---|---|
| M1, new/code | orders.csv + bins.csv | expected.json |
| M2, тот же JS без правки кода | orders.csv + bins-updated.csv | expected-updated.json |
| M3, пустая вторая таблица | orders.csv + bins-empty.csv | expected-empty-bins.json |
| M4, пустая первая таблица | orders-empty.csv + bins.csv | expected-empty-orders.json |
| M5, переставленные столбцы | orders-reordered.csv + bins.csv | expected.json |
| M6, declared | те же данные M1, четыре поля из задания объявлены до кода | expected.json |

Для M3–M5 задача сохраняет бизнес-правила M1; будущий runner доставляет выбранные
CSV под именами orders.csv и bins.csv, сохраняя их байты. Для M6 подготовлено
отдельное [задание](../task-multi-input-declared.md), оно заменяет задание M1.
Не выдавать M1 за проверку declared. Для M5 Import должен подтвердить исходные имена/типы и actual mapping,
а не сохранить индексную привязку прежнего файла.

Предлагаемые критерии:

- Два прямых подключения от двух Import к одному JS; никаких скрытых
  объединений, промежуточного JS или замены источников. Это явное требование
  данной задачи, не общее правило выбора JavaScript для обычного join.
- Полное совпадение всех четырёх полей, типов и каждой строки, включая NULL,
  порядок OrderID и отсутствие повторного расходования места.
- M2 сохраняет JS source, оба GUID входных портов, links, схему и настройки;
  меняется только источник контейнеров. Новый execution читает новые значения.
- Сохранение пакета; cold заново выполняет сохранённый сценарий без
  конфигурации, читает полный выход0 и сверяет скачанный CSV через штатный
  oracle. CSV с NULL требует явного бесконфликтного маркера (например `?`).
- Обязательны `package_closed=true`, `logged_out=true`, точный SHA,
  исполнитель ≥2 PASS из 3 и независимая проверка 2/3 своей парой.
- Отрицательные пробы до UI effects: input2, дублирование input1, отсутствующий
  запрошенный input1, несовместимые refs и новый узел с неподключённой таблицей.
  Новый третий порт/лишняя связь не должны появиться. Старые одновходовые
  `n18`, `throw1`, `js-declared-empty` сохраняют прежнюю приёмку.
- Context/source до изменения подтверждает оба входа отдельно, их technical
  names/types, mappings и output0; Done/Close не запускает код. Не доказывать
  это совпадением CSV или голым `InputTables.length`.

Новый matcher, файловый byte-reader или критерий сетевого ledger для этого
среза не нужен. Дополнительные связи проверяются штатным graph/context
readback. Если существующий cold не подтверждает оба подключения — остановка
до расширения общего verifier, а не PASS только по таблице.

Независимые числа: `python3 oracle.py --check`. Без `--check` Python stdlib
пересчитывает четыре JSON из CSV; он не импортирует handler, Loginom или JS.
Дополнительная фиксированная последовательность назначений внутри oracle
защищает от неверного выбора порядка контейнеров. Expected нельзя менять
по результату модели. После внедрения подключать материалы к существующему
`run-check`; самостоятельно запускать модель или писать новый runner нельзя.

`proposed-node-card.json` — полная предлагаемая карточка для оценки размера,
построенная из действующего `userActionInventory(runtime.describe(...))` на
базовом SHA с небольшими изменениями описания двух входов. Все hash-поля,
включая cache_key и вложенные pins, заменены 64 нулями. Это не действующий
cache key и не готовый runtime asset. Метки старых примеров относятся к их
собственному историческому scope, не к новым входам.

`proposed-routing.txt` заменяет только строку JavaScript в SKILL;
`proposed-reference.md` показывает весь файл узла после добавления инструкции.
Это предложения: установленные skill и runtime этим PR не меняются.

Размеры UTF-8: карточка считается как `JSON.stringify(card)` без форматирования;
строка маршрутизации — без завершающего LF. Замена одной строки даёт размер
предлагаемого SKILL без копии всех его 40 КБ. Для воспроизведения оценки:

```sh
node -e 'const fs=require("node:fs"); const p="docs/node-development/nodes/programming-javascript/acceptance/capabilities/"; const card=JSON.parse(fs.readFileSync(p+"proposed-node-card.json","utf8")); const skill=fs.readFileSync("packages/product/skills/loginom-automation/SKILL.md","utf8"); const old=skill.split("\n").find(x=>x.includes("| Явный JS/")); const route=fs.readFileSync(p+"proposed-routing.txt","utf8").trimEnd(); console.log({card:Buffer.byteLength(JSON.stringify(card)),routing:Buffer.byteLength(route),skill:Buffer.byteLength(skill.replace(old,route)),reference:fs.statSync(p+"proposed-reference.md").size})'
```
