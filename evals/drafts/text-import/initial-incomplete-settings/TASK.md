# Неполная первичная настройка нового импорта

Доставь оригинальный вход один раз, проверь серверные bytes и создай собственный черновик imports.text. Передай следующие source/format, намеренно не передавая columns. source_path возьми из подтверждённой доставки. Не применяй частичную настройку, не выполняй импорт и не продолжай исправлением. Зафиксируй известный отказ и закрытие своего черновика.

```json
{
  "source": {
    "encoding": "65001",
    "rows_to_skip": 0,
    "first_line_as_title": true
  },
  "format": {
    "delimiter": ",",
    "text_qualifier": "\"",
    "decimal_separator": ".",
    "null_marker": "?",
    "multiple_delimiters": false,
    "date_format": "yyyy/mm/dd",
    "date_separator": "-"
  }
}
```
