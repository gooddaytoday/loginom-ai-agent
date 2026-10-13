# Спецификация: Отсутствующее поле OtherName

ID: `missing-source-column`. Новое eval: **NOT_RUN**. Готовность проверяется только offline; runner: **NOT_IMPLEMENTED**.

Запросить source_name=Name дважды для разных выходов; это отдельный preflight refusal.

## Вход и контракт

```json
{
  "inputs": [
    {
      "path": "data/ambiguous_headers.txt",
      "bytes": 23,
      "sha256": "c7519031b5932dc11febfd15807c8205d9892229ab7913321eea7d96eabd7bba"
    }
  ],
  "settings": {
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
  },
  "columns": [
    {
      "name": "Name",
      "label": "Name",
      "type": "string",
      "data_kind": "Дискретный",
      "used": true
    },
    {
      "name": "OtherName",
      "label": "OtherName",
      "type": "string",
      "data_kind": "Дискретный",
      "used": true
    }
  ]
}
```

## Ожидаемые результаты

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

Known FAILED/node_incomplete: Requested source field is missing or ambiguous: OtherName; Execute не запрошен, owned cleanup подтверждён. Это historical missing-field доказательство, не duplicate source preflight.

```json
{
  "kind": "missing_column",
  "description": "Known FAILED/node_incomplete: Requested source field is missing or ambiguous: OtherName; Execute не запрошен, owned cleanup подтверждён. Это historical missing-field доказательство, не duplicate source preflight.",
  "engine_rejection_required": false,
  "known_refusal_required": true,
  "cleanup_required": true,
  "missing_name": "OtherName",
  "negative_fixture": false
}
```
