"""Emit the pre-effect refusal contract for an unsupported variable input."""
import json


expected = dict(nodes=[], outputs=[], refusal=dict(text="переменн"))
print(json.dumps(expected, ensure_ascii=False, indent=2))
