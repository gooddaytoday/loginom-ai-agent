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
    assert len(manifest["cases"]) == 11
    for item in manifest["cases"]:
        case = item["id"]
        table = json.loads((output / (case + ".json")).read_text())
        assert table["row_count"] == 3
        assert [c["type"] for c in table["schema"]] == ["string", "string", "real", "datetime", "string"]
        assert [row[0]["value"] for row in table["rows"]] == ["0001", "0002", "0003"]
        assert [row[1]["value"] for row in table["rows"]] == ["Привет", "Мир", "Юникод"]
        assert [row[2]["value"] for row in table["rows"]] == ["12.25", "0", "-2.5"]
        assert [row[3]["value"] for row in table["rows"]] == ["2026-10-05T00:00:00.000", "2026-10-06T00:00:00.000", "2026-10-07T00:00:00.000"]
        note = "left;right 'quoted'" if case.endswith("single-quote") else "left|right `quoted`" if case.endswith("backtick-quote") else 'literal"quote' if case.endswith("no-quote") else 'first\nsecond, "quoted"' if case.endswith("multiline-lf") else 'first\r\nsecond| "quoted"' if case == "txt-pipe-multiline" else 'first\r\nsecond, "quoted"'
        assert [row[4]["value"] for row in table["rows"]] == ["", None, note]
print("PASS: all 11 tables, quote modes, CRLF/LF, NULL/empty, exact types and values")
