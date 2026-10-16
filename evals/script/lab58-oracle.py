import csv
import datetime
import hashlib
import io
import json
import pathlib
import re
import sys
import zipfile
from decimal import Decimal


def sha(data):
    return hashlib.sha256(data).hexdigest()


archive, output = map(pathlib.Path, sys.argv[1:])
output.mkdir(mode=0o700)
proof = {"archive_sha256": sha(archive.read_bytes()), "calculator_sha256": sha(pathlib.Path(__file__).read_bytes()), "cases": []}
assert proof["archive_sha256"] == "3cab0866997e36677b816050eab1b709c56c663fb9db945811fd93fbaffe6a63"
with zipfile.ZipFile(archive) as source:
    manifest = json.loads(source.read("manifest.json"))
    for item in manifest["files"]:
        data = source.read(item["path"])
        assert len(data) == item["bytes"] and sha(data) == item["sha256"]
    for case in manifest["ids"]:
        prompt = source.read(case + "/TASK.md")
        settings, fields = map(json.loads, re.findall(r"```json\n(.*?)\n```", prompt.decode(), re.S))
        filenames = [n for n in source.namelist() if n.startswith(case + "/data/")]
        assert len(filenames) == 1
        data = source.read(filenames[0])
        encoding = {"1200": "utf-16", "1201": "utf-16", "65001": "utf-8-sig", "1252": "cp1252", "1251": "cp1251"}[settings["source"]["encoding"]]
        text = data.decode(encoding)
        rows = list(csv.reader(io.StringIO(text, newline=""), delimiter=settings["format"]["delimiter"], quotechar=settings["format"]["text_qualifier"], strict=True))
        rows = rows[settings["source"]["rows_to_skip"]:]
        headers = rows.pop(0) if settings["source"]["first_line_as_title"] else None
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
                    value = datetime.date.fromisoformat(value).isoformat() + "T00:00:00.000"
                else:
                    assert field["type"] == "string"
                values.append({"type": field["type"], "value": value})
            typed.append(values)
        table = {"schema": [{k: field[k] for k in ["name", "label", "type", "data_kind"]} for field in fields if field["used"]], "row_count": len(typed), "comparison": "ordered", "rows": typed}
        target = output / (case + ".json")
        target.write_text(json.dumps(table, ensure_ascii=False, indent=2) + "\n")
        proof["cases"].append({"id": case, "task_sha256": sha(prompt), "input": filenames[0], "input_sha256": sha(data), "encoding": encoding, "settings": settings, "source_headers": headers, "oracle_sha256": sha(target.read_bytes()), "row_count": len(typed)})
(output / "manifest.json").write_text(json.dumps(proof, ensure_ascii=False, indent=2) + "\n")
print(json.dumps({"cases": len(proof["cases"]), "rows": [c["row_count"] for c in proof["cases"]], "manifest_sha256": sha((output / "manifest.json").read_bytes())}))
