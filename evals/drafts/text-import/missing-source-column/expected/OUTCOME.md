# Ожидаемый диагностический исход

Known FAILED/node_incomplete: Requested source field is missing or ambiguous: OtherName; Execute не запрошен, owned cleanup подтверждён. Это historical missing-field доказательство, не duplicate source preflight.

```json
{
  "kind": "missing_column",
  "description": "Known FAILED/node_incomplete: Requested source field is missing or ambiguous: OtherName; Execute не запрошен, owned cleanup подтверждён. Это historical missing-field доказательство, не duplicate source preflight.",
  "engine_rejection_required": false,
  "cleanup_required": true,
  "missing_name": "OtherName",
  "negative_fixture": false,
  "known_refusal_required": true
}
```
