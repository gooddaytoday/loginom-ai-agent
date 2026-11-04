# Структура источников снабжения SKU — фактический эталон P15

> Сведения о локальном окружении обезличены. Приватные подтверждения, упомянутые в документе, не включены в репозиторий.

## Контракт и источник
Полностью synthetic products.csv содержит шесть товаров, supplier_quotes.csv — семь предложений.
PK каталога — sku, PK предложений — quote_id; quotes.sku ссылается на products.sku.
Все значения непустые, ключи/category/supplier_id ASCII/case-sensitive, active — целое 0 или 1.
Источник товара — distinct supplier_id отдельно каждого SKU только по active=1; предложение не равно поставщику.
Основание результата — полный products, включая only-inactive и товары совсем без quotes.
Каждый SKU относится ровно к одному классу по числу активных источников: 0, 1, ≥2.
По category считаются products и три класса; single_source_share=one_supplier/все products категории.
Три класса суммируются в products; нулевые классы/доля и вся CAT_C сохраняются, пустых итогов нет.
Это структура источников, не оценка надёжности или взаимозаменяемости. Денежных и временных полей нет.
D/B имеют одинаковые raw/oracle/контракт/рубрику; подробный метод раскрывается только в D prompt.
Эквивалентная нативная композиция допустима без требований к именам, GUID, количеству узлов и расположению.

## Фактическая композиция Unit_0/Unit.xml
Принятый A1 содержит 12 штатных узлов и 11 workflow links; JavaScript и готовый gold в расчёте отсутствуют.
1. Два TBGImportTextFile читают products.csv и supplier_quotes.csv: UTF-8, «;», заголовки, точка, двойная кавычка.
2. TBGFilterDataEngine оставляет active=1 (frtEqual/CompareValue vrtInt64=1); неактивные Q05/Q07 исключены.
3. Первая TBGGroupDataEngine группирует по sku/supplier_id; quote_count=gdCount(quote_id) — вспомогательное поле.
Её четыре строки представляют уникальные пары; Q01/Q02 образуют одну A01/S01 строку с quote_count=2.
4. Вторая группировка по sku считает supplier_id (gdCount → supplier_count), а не суммирует quote_count.
A01 получает один источник, A02 — два, B01 — один; счётчик относится отдельно каждому SKU.
5. TBGJoinDataEngine имеет полный products на главном левом входе и supplier_count справа, ключ sku, case-sensitive.
Фактический default LEFT сохраняет все шесть товаров: A03/B02 only-inactive и C01 без quotes получают NULL справа.
6. Калькулятор: n_sources=NVLF(supplier_count,0); no_supplier=IFF(n_sources=0,1,0), one_supplier=IFF(n_sources=1,1,0), multiple_suppliers=IFF(n_sources>=2,1,0).
7. Группировка по category: gdCount(sku)→products и gdSum каждого из трёх флагов.
8. TBGReformColumnsEngine переводит три агрегированные суммы классов в dtInteger; products уже целочисленный.
9. Калькулятор single_source_share=one_supplier/products, без промежуточного округления и без нового минимума точности доли.
10. TBGSortingEngine сортирует category ASC, LocaleAware=false; экспорт передаёт шесть заданных колонок.
11. TBGExportTextFile сохраняет UTF-8 CSV с «;», заголовком имён, точкой, двойной кавычкой, LF, без BOM.

## Полный ожидаемый CSV
Имена и состав колонок точные, порядок колонок при сверке не ограничивается; строки CAT_A/CAT_B/CAT_C идут ASCII ASC.
Все 18 ячеек сравниваются по именам колонок: текст точно, числа с абсолютным допуском ±0.001.
Все 12 counter texts целые неотрицательные без дробной части/тысяч; пустых значений нет, минимум знаков доли не вводится.
```csv
category;products;no_supplier;one_supplier;multiple_suppliers;single_source_share
CAT_A;3;1;1;1;0.3333333333333333333333333333
CAT_B;2;1;1;0;0.5
CAT_C;1;1;0;0;0
```
Отдельная ручная классификация всех шести SKU и stdlib sets/Decimal oracle получены после raw freeze, до нативной попытки; gold вне agent prompt.

## Фактическая проверка и происхождение
Reference — оригинальный A1 detailed package.lgp. B использует тот же проверенный reference с явным source_task, без отдельной B-сессии.
A1 CLI0/651s, модель openai/gpt-6-sol/xhigh подтверждена собственной БД; requested STANDARD, response tier NOT_OBSERVED, speed NOT_MEASURED.
Summary содержит toolErrors=1 при errors=[]: export-result-1 вернул NOT_APPLIED из-за недостижимой запрошенной drop surface, effect_possible=false/cleanup_complete=true.
export-result-2 убрал только target.position (помимо нового operation_id), успешно создал экспорт в той же A1; это не новая авторская попытка.
Повтор skill имеет тот же ID/input/output/time с metadata.activation enrichment; memory writing0 не означает отсутствия readonly Help/skill reads.
Save: SUCCEEDED/save_completed/workflow_preserved; reopened=false, persisted_content_verified=false, arrangement=result_unconfirmed/warning=true.
XML и полный CSV проверены независимо; исходные флаги Save остаются честными. Native actual32/rootcd3887 CLOSED.
Обычные Close/logout и оригинальные Runtime/Knowledge ACK+actualexit0/noSignal подтверждены сохранёнными receipts и idle root9adddb.
Cold root866002: один RunAll, все 12 узлов grey→green, 36 активных портов; новый CSV149B/inode [private] вместо прежнего файла, mtime после выполнения.
LGP и оба raw сохранены по SHA/inode/size/mtime/ctime; full18/12integer/partition/share/noempty подтверждены с сопоставлением колонок по именам.
Cold завершён NoSave/logout/закрытием ownTab[private]/IAB[]; новых CLI/model попыток нет.
Первый cold-right.png частично отрисован; cold-export.png — полный свежий вид без повторного исполнения. Первый checker пропустил case argument и упал до записи; исправлен только checker.
Scenario URL выведен из actual endpoint/имени пакета/Unit_0/Info.xml Name=Unit1, отдельного перехода по deep link не было.
Public корпус использует четыре смысловые XML-мутации и полные независимо выведенные wrong CSV; native mutants не исполнялись.
Combined независимая cold+public SPEC+QUALITY/root review ожидается; calibration/sole D/B/pair acceptance pending.
