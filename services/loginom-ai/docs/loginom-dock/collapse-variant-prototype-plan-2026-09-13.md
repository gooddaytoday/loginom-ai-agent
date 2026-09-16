# Ограниченный прототип чтения variant — план для решения

Исторический план до решения пользователя.13сентября пользователь разрешил
ровно этот ограниченный эксперимент; прежний запрет запуска заменён разрешением.
[Результат прототипа и ограничения](collapse-variant-prototype-result-2026-09-13.md).
Loginom7.4.2, node16; точные SHA256 трёх frontend-файлов и строки приведены в
[исходном исследовании](collapse-variant-blocker-2026-09-13.md).

## Два возможных пути

| Кандидат | Доказано статически | Ещё нужно доказать до включения |
| --- | --- | --- |
| Отдельное read-only чтение IBGDataSource.AsVariant(Row,Col), method321/interface116 | Proxy получает binary response, ReadVariant читает Int16 tag и возвращает primitive; response затем освобождается | Реальный owner datasource, соответствие tag исходному subtype, freshness, диапазоны и права read-only |
| Пассивное чтение обычного UI-ответа до decoder | В ReadVariant есть точка, где tag ещё доступен | Какой UI caller вызывает этот decoder, как конкретный response связан с node/port/execution/row/column; наличие всех требуемых bytes |

Прямой вызов существующего AsVariant proxy не решает задачу: subtype уже потерян.
Для первого кандидата raw tagged payload — бинарное тело ответа DispatchMessageAsync
на фиксированный method321/interface116 **до** ReadVariant/Release. Это статически
видимый источник-кандидат, а не уже полученный или проверенный live payload.
Для второго кандидата конкретный caller-chain/owner binding пока не установлен;
его нельзя считать готовым или автоматически более безопасным решением.

## Предлагаемые границы отдельно разрешённого прототипа

- Только собственная test-1 сессия, отдельный процесс/профиль/пакет, точные
  Loginom build и SHA frontend; ни hooks, ни общий plugin, ни общий транспорт.
- Одна явно выбранная output table: document/workflow/node GUID, native port
  GUID **вместе с владельцем** (port GUID повторяется между узлами), output index,
  datasource identity, schema fingerprint. Проверять владельца до/после чтения.
- Только завершённое собственное выполнение с execution receipt; одних timestamp
  или видимого preview недостаточно. Смена execution/schema/owner останавливает
  весь результат. Не вызывать чтение во время настройки/выполнения.
- Начальный лимит:50 строк ×8 столбцов, offset>=0, каждый Row/Col в подтверждённых
  пределах полного row count/schema. Один фиксированный метод, без произвольных
  interfaces/method IDs, вызовов записей, извлечения credentials и fallback.
- Whitelist фиксируется по pinned decoder:3/20 integer,4/5 real,7 datetime;
  1 Null,8 string (ReadString после восьмибайтного слота),11 boolean
  также подтверждены статически в ReadVariant.0 undefined,13 unknown и
  дополнительные integer tags пока отклонять; widths/bounds сверить отдельно. Unknown/interface/array tags отклонять.
  Наличие tag не доказывает его семантическое соответствие типу исходной ячейки.
- Integer: signed decimal из исходных bytes/BigInt, без промежуточного Number;
  real: ширина32/64, исходные IEEE bytes и round-trip representation; не сводить
  real1.0 к integer1. NaN/Infinity — явный отказ до отдельного контракта.
- Datetime: исходный OADate payload плюс проверенные локальные компоненты/ms;
  не придумывать UTC/timezone. До подтверждения epoch/offset semantics точным
  datetime результатом не объявлять. Null — отдельный tag/state, не пустая строка.
- Пользовательский ответ сохраняет native subtype, lossless payload и evidence
  binding; DataTypes-off не меняется, Names и expected/source schema не служат
  доказательством subtype прочитанной variant-ячейки.

## Проверки и отказ

Независимый набор: integer1/real1.0/string"1", native integer границы, integer выше
2^53 если поддержан платформой, полный real, отрицательный zero, boolean/Null/"",
datetime с .123ms, переставленные поля и одинаковые labels, DataTypes excluded.
Отрицательные проверки: подмена owner/порта/индекса/execution/schema/row,
повторный stale response, обрезанный/лишний payload, неверная длина, неизвестный
или interface tag, numeric overflow и попытка fallback в display reader.
Каждая подмена должна дать отказ целиком, без частичного exact PASS.

Критерий остановки прототипа: невозможно доказать хотя бы один binding, tag
semantics или lossless conversion; требуется произвольный RPC или изменение
shared runtime; byte payload недоступен в выбранном разрешённом пути.
На этапе подготовки этого плана новый транспорт, RPC, interception и hooks
не запускались. Последующий разрешённый fixed321 эксперимент описан в отчёте.
Решение координатора/пользователя требуется только для конкретного следующего
эксперимента; текущий handler продолжает честно отказывать exact non-null variant.
