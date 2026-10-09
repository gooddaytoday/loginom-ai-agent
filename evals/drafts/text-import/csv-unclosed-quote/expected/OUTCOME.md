# Ожидаемый диагностический исход

Известный отказ либо явно обнаруженная неполнота/повреждение. Не объявлять корректный импорт. В историческом прогоне движок принял неполные данные; native warning не наблюдался. Новый движок может отказать, это допустимо.

```json
{
  "kind": "unclosed_quote",
  "description": "Известный отказ либо явно обнаруженная неполнота/повреждение. Не объявлять корректный импорт. В историческом прогоне движок принял неполные данные; native warning не наблюдался. Новый движок может отказать, это допустимо.",
  "must_not_certify_correct_table": true,
  "native_warning_required": false,
  "engine_rejection_required": false,
  "unknown_effect_is_success": false,
  "cleanup_required": true,
  "negative_fixture": true
}
```
