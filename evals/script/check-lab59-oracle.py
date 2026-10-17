import json
import pathlib
import subprocess
import sys
import tempfile


calculator, inputs = map(pathlib.Path, sys.argv[1:])
with tempfile.TemporaryDirectory() as work:
    output = pathlib.Path(work) / "oracle"
    subprocess.run(["python3", str(calculator), str(inputs), str(output)], check=True)
    manifest = json.loads((output / "manifest.json").read_text())
    assert len(manifest["cases"]) == 12
    for item in manifest["cases"]:
        case = item["id"]
        table = json.loads((output / (case + ".json")).read_text())
        assert table["row_count"] == 3
        assert [c["type"] for c in table["schema"]] == ["string", "string", "real", "datetime", "string"]
        assert [row[0]["value"] for row in table["rows"]] == ["0001", "0002", "0003"]
        assert [row[2]["value"] for row in table["rows"]] == ["12.25", "0", "-2.5"]
        assert [row[3]["value"] for row in table["rows"]] == ["2026-10-05T00:00:00.000", "2026-10-06T00:00:00.000", "2026-10-07T00:00:00.000"]
        assert [row[1]["value"] for row in table["rows"]] == ["" if case.endswith("merge-off") else "Привет", "Мир", "Юникод"]
        delimiter = ";;" if case.endswith("merge-on") else "," if case.endswith("skip-header") else "|" if case.endswith("no-header-skip") else " " if case.endswith("space") else ";"
        assert [row[4]["value"] for row in table["rows"]] == ["first" if case.endswith("merge-on") else "", None, f'left{delimiter}right "quoted"']
print("PASS: all 12 tables, leading zeros, NULL/empty, exact decimals/dates, quoted delimiters")
