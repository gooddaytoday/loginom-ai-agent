"""Independent LAB-60 calculation from original TASK/input bytes; no SPEC or Loginom."""
import csv
import datetime
import hashlib
import io
import json
import pathlib
import re
import sys
from decimal import Decimal


def sha(data):
    return hashlib.sha256(data).hexdigest()


source, output = map(pathlib.Path, sys.argv[1:])
output.mkdir(mode=0o700)
proof = {"calculator_sha256": sha(pathlib.Path(__file__).read_bytes()), "source": "original TASK.md and input bytes only", "cases": []}
ids = [prefix + "-" + suffix for prefix in ["txt", "csv"] for suffix in ["single-quote", "backtick-quote", "no-quote", "multiline-crlf", "multiline-lf"]] + ["txt-pipe-multiline"]
for case in ids:
    prompt = (source / case / "TASK.md").read_bytes()
    settings, fields = map(json.loads, re.findall(r"```json\n(.*?)\n```", prompt.decode(), re.S))
    files = list((source / case / "data").iterdir())
    assert len(files) == 1
    data = files[0].read_bytes()
    assert settings["source"] == {"encoding": "65001", "rows_to_skip": 0, "first_line_as_title": True}
    assert settings["format"]["multiple_delimiters"] is False
    qualifier = settings["format"]["text_qualifier"]
    rows = list(csv.reader(io.StringIO(data.decode("utf-8-sig"), newline=""), delimiter=settings["format"]["delimiter"], quotechar=qualifier or None, quoting=csv.QUOTE_MINIMAL if qualifier else csv.QUOTE_NONE, strict=True))
    headers = rows.pop(0)
    typed = []
    for row in rows:
        assert len(row) == len(fields)
        values = []
        for value, field in zip(row, fields):
            if value == settings["format"]["null_marker"]:
                value = None
            elif field["type"] == "real":
                value = format(Decimal(value.replace(settings["format"]["decimal_separator"], ".")).normalize(), "f")
            elif field["type"] == "datetime":
                assert settings["format"]["date_format"] == "yyyy/mm/dd" and settings["format"]["date_separator"] == "-"
                value = datetime.date.fromisoformat(value).isoformat() + "T00:00:00.000"
            else:
                assert field["type"] == "string"
            values.append({"type": field["type"], "value": value})
        typed.append(values)
    table = {"schema": [{k: field[k] for k in ["name", "label", "type", "data_kind"]} for field in fields if field["used"]], "row_count": len(typed), "comparison": "ordered", "rows": typed}
    target = output / (case + ".json")
    target.write_text(json.dumps(table, ensure_ascii=False, indent=2) + "\n")
    proof["cases"].append({"id": case, "task_sha256": sha(prompt), "input": files[0].name, "input_sha256": sha(data), "settings": settings, "source_headers": headers, "oracle_sha256": sha(target.read_bytes()), "row_count": len(typed)})
(output / "manifest.json").write_text(json.dumps(proof, ensure_ascii=False, indent=2) + "\n")
print(json.dumps({"cases": len(proof["cases"]), "typed_cells": sum(c["row_count"] * 5 for c in proof["cases"]), "manifest_sha256": sha((output / "manifest.json").read_bytes())}))
