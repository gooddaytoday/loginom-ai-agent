# Ожидаемый диагностический исход

После одной доставки начни первичную настройку импорта запросом без settings.source.source_path. Зафиксируй известный отказ, отсутствие Execute, cleanup и возвращённый незаблокированный GUID. Только при подтверждённом возврате того же собственного узла исправь запрос как existing: полный source_path строго из первой delivery, остальные source/format/columns полностью заданы. Не создавать другой узел и не загружать файл повторно.

```json
{
  "kind": "known_refusal_then_correction",
  "description": "После одной доставки начни первичную настройку импорта запросом без settings.source.source_path. Зафиксируй известный отказ, отсутствие Execute, cleanup и возвращённый незаблокированный GUID. Только при подтверждённом возврате того же собственного узла исправь запрос как existing: полный source_path строго из первой delivery, остальные source/format/columns полностью заданы. Не создавать другой узел и не загружать файл повторно.",
  "engine_rejection_required": false,
  "cleanup_required": true,
  "counts": {
    "deliveries": 1,
    "creates": 1,
    "applies": 2
  },
  "same_guid_required": true,
  "negative_fixture": false,
  "known_refusal_required": true
}
```
