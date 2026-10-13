# Спецификация: CSV: неверный разделитель → единственное исправление

ID: `csv-delimiter-correction`. Новое eval: **NOT_RUN**. Готовность проверяется только offline; runner: **NOT_IMPLEMENTED**.

Сохранить |, CRLF и удвоенные кавычки внутри одной строки Note; считать логические записи.

## Вход и контракт

```json
{
  "inputs": [
    {
      "path": "data/pipe_multiline.csv",
      "bytes": 204,
      "sha256": "586ac210d58bc0025c019b0e3669fc03807b13202320eef0de0aba2713f7b927",
      "encoding": "utf-8",
      "bom": false
    }
  ],
  "settings": {
    "source": {
      "encoding": "65001",
      "rows_to_skip": 0,
      "first_line_as_title": true
    },
    "format": {
      "delimiter": "|",
      "text_qualifier": "\"",
      "decimal_separator": ".",
      "null_marker": "?",
      "multiple_delimiters": false,
      "date_format": "yyyy/mm/dd",
      "date_separator": "-"
    }
  },
  "columns": [
    {
      "name": "Id",
      "label": "Идентификатор",
      "type": "string",
      "data_kind": "Дискретный",
      "used": true
    },
    {
      "name": "Name",
      "label": "Название",
      "type": "string",
      "data_kind": "Дискретный",
      "used": true
    },
    {
      "name": "Amount",
      "label": "Сумма",
      "type": "real",
      "data_kind": "Непрерывный",
      "used": true
    },
    {
      "name": "Date",
      "label": "Дата",
      "type": "datetime",
      "data_kind": "Дискретный",
      "used": true
    },
    {
      "name": "Note",
      "label": "Текст",
      "type": "string",
      "data_kind": "Дискретный",
      "used": true
    }
  ]
}
```

## Этапы

```json
[
  {
    "stage": 1,
    "request": "comma requested vs native pipe; five requested vs one observed",
    "expected": "settled known refusal; Execute not requested; owned cleanup; same unlocked target returned"
  },
  {
    "stage": 2,
    "request": "existing target; full correct source/format/columns; source_path from original delivery",
    "expected": "fresh full final table, persistence and cleanup"
  }
]
```

## Ожидаемые результаты

- [expected/final.json](expected/final.json)
- [expected/outcome.json](expected/outcome.json)
- [expected/OUTCOME.md](expected/OUTCOME.md)

## Обязательные доказательства будущего прогона

1. Зафиксировать product SHA, установленный CLI/артефакт, Loginom version/platform и модель. Каждый запуск получает отдельный профиль, контекст и выделенный аккаунт.
2. Admission/provider → одна verified delivery каждого файла: оригинальное расширение, bytes/SHA, artifact identity и подтверждённый server source_path.
3. Graph: один настоящий импорт; штатные «Переменные сценария» не считаются аналитическим узлом. Дополнительный связанный export допустим только для полного чтения. Использовать GUID и актуальное имя из живого графа: импорт может автоматически переименоваться по файлу. Не путать master узла с master выходного порта.

   Readback настроек: code page, skip/header, delimiter/qualifier, multiple_delimiters, NULL/decimal/date formats; явный полный source в первичной настройке ненастроенного узла.
4. Схема позиционно по name/label/type/data_kind/used. Служебный DOM header_tid не сравнивается с пользовательской схемой. Значения и типы сравниваются строго; NULL ≠ пустая строка ≠ 0. «0001» не равно «1». CRLF/LF и Unicode сохраняются.
5. Terminal native execution и свежий полный результат: все строки/поля, sample_complete и cardinality подтверждены. Exit=0, скриншот или первые строки сами по себе недостаточны.
6. Save после успеха; independent cold open/re-execute без перенастройки. Тот же сохранённый graph/source/settings, новое execution identity и полный результат. Для отрицательного кейса — его явно заданный диагностический исход, без ошибочного Execute.
7. Подтверждённые package_closed и logged_out; неизвестный эффект/незавершённая операция/cleanup=false исключают успешный вердикт. Старый FAIL не переписывается поздним cleanup.

## Изоляция ответа и область оценки

Агент получает только TASK.md и перечисленные data-файлы. SPEC.md, SPEC.json, expected/, PROVENANCE.md, корневые документы и tools/ ему не передаются. Не монтировать весь корпус в workspace модели.
Offline oracle сравнивает только данные: DATA_MATCH не доказывает runtime execution, source bytes, сохранение или cleanup. Техническая и аналитическая оценки отдельны. Desktop, merge и выпуск этим корпусом не принимаются.

## Семантика отрицательного кейса

Приложенный pipe_multiline.csv: первый apply намеренно использует запятую и запрашивает пять полей. Зафиксируй известный отказ requested 5 / observed 1, no Execute и cleanup. Второй и единственный existing apply использует |, полный settings.source.source_path из подтверждённой первой delivery и остальные исходные настройки. Ровно два apply, один create/upload, тот же GUID; никаких третьих попыток.

```json
{
  "kind": "known_refusal_then_correction",
  "description": "Приложенный pipe_multiline.csv: первый apply намеренно использует запятую и запрашивает пять полей. Зафиксируй известный отказ requested 5 / observed 1, no Execute и cleanup. Второй и единственный existing apply использует |, полный settings.source.source_path из подтверждённой первой delivery и остальные исходные настройки. Ровно два apply, один create/upload, тот же GUID; никаких третьих попыток.",
  "engine_rejection_required": false,
  "known_refusal_required": true,
  "cleanup_required": true,
  "counts": {
    "deliveries": 1,
    "creates": 1,
    "applies": 2
  },
  "same_guid_required": true,
  "negative_fixture": false
}
```
