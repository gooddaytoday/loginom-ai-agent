# CSV: Повторная ссылка на исходное Name

Проверь проблемный вход `ambiguous_headers.csv`. Используй строго заданные настройки; не исправляй файл, кодировку, разделитель или кавычки ради успешного результата.

```json
{
  "source": {
    "encoding": "65001",
    "rows_to_skip": 0,
    "first_line_as_title": true
  },
  "format": {
    "delimiter": ",",
    "decimal_separator": ".",
    "null_marker": "?",
    "text_qualifier": "\"",
    "multiple_delimiters": false
  }
}
```

Запрошенные поля:
```json
[
  {
    "source_name": "Name",
    "name": "FirstName",
    "label": "FirstName",
    "type": "string",
    "data_kind": "Дискретный",
    "used": true
  },
  {
    "source_name": "Name",
    "name": "SecondName",
    "label": "SecondName",
    "type": "string",
    "data_kind": "Дискретный",
    "used": true
  }
]
```

Не выбирай повторяющиеся source names по позиции. Наблюдай точный отказ или всю фактически прочитанную таблицу; сообщи повреждение/неполноту, если они возникли. Не выдумывай native warning. После известного исхода с подтверждённым cleanup допускается сохранить собственный диагностический пакет; неизвестный эффект сохраняется как остановка, а не успех.

Доставь оригинальный вход ровно один раз с проверкой bytes/SHA. Передай запрос на новый imports.text с заданными полями. Повторный source_name должен дать REQUEST_REJECTED на request.validate до создания импорта; не создавай узел отдельно, не выполняй импорт и не исправляй запрос.
