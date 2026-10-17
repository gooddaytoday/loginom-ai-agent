# Ожидаемый диагностический исход

Известный отказ либо обнаруженная утрата исходного Unicode. Исходные CP1251 bytes при настройке UTF-8 нельзя объявлять правильно прочитанными. Native warning не обязателен.

```json
{
  "kind": "wrong_encoding",
  "description": "Известный отказ либо обнаруженная утрата исходного Unicode. Исходные CP1251 bytes при настройке UTF-8 нельзя объявлять правильно прочитанными. Native warning не обязателен.",
  "must_not_certify_correct_table": true,
  "native_warning_required": false,
  "engine_rejection_required": false,
  "unknown_effect_is_success": false,
  "cleanup_required": true,
  "negative_fixture": true
}
```
