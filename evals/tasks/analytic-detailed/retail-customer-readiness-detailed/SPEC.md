# Готовность retail-строк к клиентской аналитике — фактический эталон P28

> Сведения о локальном окружении обезличены. Приватные подтверждения, упомянутые в документе, не включены в репозиторий.

## Источник, лицензия и изменения
Реальная часть — Online Retail, Chen, D. (2015), UCI Machine Learning Repository, DOI [10.24432/C5BW33](https://doi.org/10.24432/C5BW33).
[Страница источника](https://archive.ics.uci.edu/dataset/352/online%2Bretail), лицензия [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
Официальный архив получен 2026-11-01T03:23:54.863941Z; workbook Online Retail.xlsx/sheet Online Retail содержит 541909 товарных строк.
Отбор зафиксирован до gold: ВСЕ строки 2010-12-01 00:00:00 <= InvoiceDate < 2010-12-01 08:36:00, исходный порядок/все8колонок/без иных фильтров.
Это 26 строк worksheet2–27. Их исходные признаки/числа сохранены; целочисленные числовые ID сериализованы строкой целого, строки не trim.
None преобразован в пустую CSV-ячейку; naive datetime сохранён как YYYY-MM-DD HH:MM:SS без предположения/конвертации часового пояса.
Quantity/UnitPrice сериализованы без округления/изменения знака; GBP остаётся единицей выручки. Изменения — выделение среза и CSV-представление.
Шесть synthetic-boundary.csv строк и four-row categories.csv сконструированы отдельно и не являются наблюдениями UCI; Country=Synthetic отмечает границы.
UCI metadata заявляет отсутствие missing, фактический полный workbook содержит missing CustomerID/Description; фиксированный реальный срез их не содержит.
Пропуск CustomerID означает непригодность к клиентской аналитике, не доказанную ошибочность продажи. Источник/лицензия/выбор/изменения сохранены в provenance.

## Общий контракт
Входы uci-retail.csv/synthetic-boundary.csv имеют одинаковые8полей; зерно — товарная строка, InvoiceNo может повторяться.
Полный порядок классификации: missing CustomerID → missing Description → uppercase-C prefix InvoiceNo → sale.
Missing означает NULL или пустую строку без trim; ровно три пробела Description SYN04/SYN_D остаются непустыми.
CSYN01 относится только к missing_customer, CSYN02 к missing_description, CSYN03 к credit_note.
rows считает каждую строку категории; invoices — различные InvoiceNo внутри категории, не строки/StockCode/CustomerID.
Две строки SYN04 сохраняют оба произведения Quantity*UnitPrice, но дают один invoice; отрицательные Quantity сохраняют знак.
Полное основание результата — четыре categories.csv в sort_order1–4, с нулевыми показателями для отсутствующих фактов.
D/B имеют одинаковые raw/контракт/oracle/рубрику; подробный способ дан только D. Эквивалентная native-композиция допустима без node-name/count/layout gate.

## Фактическая композиция Unit_0/Unit.xml
A1 содержит 12 штатных узлов и 11 workflow links, без JS/статического gold/подмены raw.
1. Три TBGImportTextFile читают два retail CSV и отдельный categories.csv: UTF-8, заголовок, «;», точка, двойная кавычка.
InvoiceNo/StockCode/Description/InvoiceDate/CustomerID/Country — dtString, Quantity — dtInteger, UnitPrice — dtFloat; sort_order — dtInteger.
2. TBGUnionDataEngine append_all объединяет только два совместимых retail-набора по всем8полям:26+6=32, без дедупликации; категории не являются фактами.
3. TBGCalcData quality_bucket использует IF/NVL(CustomerID,"") прежде IF/NVL(Description,"") прежде Left(InvoiceNo,1)="C"; trim отсутствует.
line_revenue=Quantity*UnitPrice вычисляется по каждой строке до группировок, без abs/промежуточного округления.
4. TBGGroupDataEngine по quality_bucket/InvoiceNo даёт10 bucket/invoice групп; gdCount(nonempty StockCode)→line_count и gdSum(line_revenue)→invoice_revenue.
5. Второй group по quality_bucket: gdSum(line_count)→rows, gdCount(InvoiceNo)→invoices, gdSum(invoice_revenue)→signed_revenue.
6. TBGJoinDataEngine сохраняет полный categories слева; NVLF missing metrics→0, rows/invoices имеют целочисленные выходы.
Фиксированный fixture заполняет все4категории; дополнительных вариантов входа для пустой категории не запускали.
7. TBGSortingEngine sort_order ASC, LocaleAware=false; TBGReformColumnsEngine убирает служебный sort_order и оставляет ровно4поля.
8. TBGExportTextFile сохраняет один UTF-8 CSV: заголовок имён, «;», точка, двойная кавычка, LF, без BOM; фактический receipt/readback подтверждён.

## Полный ожидаемый CSV
Проверяются все16ячеек и порядок4строк; колонки сопоставляются по точным именам, их порядок не ограничен.
Все8 rows/invoices — неотрицательные целые тексты, пустых итоговых ячеек нет; числа±0.001, без промежуточного округления/minimum decimal padding.
```csv
quality_bucket;rows;invoices;signed_revenue
missing_customer;2;2;-4.50
missing_description;1;1;-6.00
credit_note;1;1;-5.00
sale;28;6;536.95
```
Независимый полный ручной ledger и Decimal oracle получены после raw freeze до native; gold не входит в agent prompt.
Консервация:32=2+1+1+28 строк; GBP521.45=-4.50-6.00-5.00+536.95. UCI527.95 плюс отдельно synthetic−6.50.

## Фактическое выполнение и ограничения
Reference — оригинальный подробный A1/package.lgp; B честно использует тот же пакет без отдельной B session/model/attempt.
CLI0; openai/gpt-6-sol/xhigh подтверждена собственной БД; requested STANDARD, response tier NOT_OBSERVED, speed NOT_MEASURED.
ToolErrors=1: group-invoice-1 REQUEST_REJECTED/NOT_APPLIED до эффекта — InvoiceNo одновременно key/count measure; effect_possible=false/cleanup_complete=true.
group-invoice-2 внутри того же A1 считал nonempty StockCode и успешно завершился; второй CLI attempt/hint/reset не использовался.
Повтор skill — metadata-enriched duplicate; summary сохраняет43toolCalls/1toolError/errors[]. Нулевой memory-writer counter не доказывает отсутствие автоматического контекста.
DB prompt отличается от actual argv/prompt на3байта внешних кавычек/одного escape; remainder совпадает, literal newlines сохранены; byte equality/valid JSON не заявляются.
Save save_completed/workflow_preserved=true, reopened/persisted_content_verified=false, arrangement=result_unconfirmed/warning=true; data/goal outcome не повышены до verified.
Native actual32APPROVE/rootcd0d44 CLOSED; ordinary own Close/logout и original Runtime+Knowledge ACK/actualexit0/noSignal подтверждены отдельно от CLI0.
Cold: один RunAll03:57:35.387Z,12native+1service grey→green/38ports; новый CSV133B/inode [private]/mtime03:57:36.189315115Z совпадает с native.
LGP и все3raw неизменны по SHA/size/inode/mtime/ctime. Все16значений/8integer/noempty сверены, padding −4.5/−6/−5 допустим.
Configure/Save не вызывались; actual NoSave prompt→home→logout signin подтверждены последующим DOM, own ownTab[private] закрыта/IAB[].
Первое Packages text click встретило hydration timeout; immediate AX опережал async UI, дальнейший DOM подтвердил состояния. Эти наблюдения не повторяли execution.
cold-left.png показывает первые7native+service, cold-export.png последние5native; intermediate cold-right.png поймал repaint и сохранён как ограниченный снимок, RunAll не повторялся.
Authoring idle подтверждён двумя полными scoped passes; metadata unrelated sd-pam/ssh-agent denied не выдаётся за просмотренное. Нового CLI probe не было.
Scenario URL выведен из actual endpoint/имени пакета/Unit_0/Info.xml Name=Unit1; отдельный deep-link visit не заявляется.
Четыре public near-miss используют actual XML и полные wrong CSV с рецептами на disposable oracle copies; native mutants не исполнялись.
Combined независимое cold+public review ожидается; calibration/sole D/B/pair acceptance NOTRUN/PENDING.
