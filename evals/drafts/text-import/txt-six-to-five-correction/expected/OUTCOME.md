# Ожидаемый диагностический исход

После одной TXT delivery запроси исходную схему плюс шестое поле Extra (String, Дискретный), не присутствующее в источнике. После известного count/binding отказа без Execute и confirmed cleanup настрой тот же returned GUID как existing с исходными пятью полями и полным source из delivery. Ровно два apply, одна delivery, один create; выполнить, проверить и сохранить окончательное состояние.

```json
{
  "kind": "known_refusal_then_correction",
  "description": "После одной TXT delivery запроси исходную схему плюс шестое поле Extra (String, Дискретный), не присутствующее в источнике. После известного count/binding отказа без Execute и confirmed cleanup настрой тот же returned GUID как existing с исходными пятью полями и полным source из delivery. Ровно два apply, одна delivery, один create; выполнить, проверить и сохранить окончательное состояние.",
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
