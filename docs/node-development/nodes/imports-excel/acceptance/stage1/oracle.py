"""Independent expected output from XLSX XML; never supplied to the model."""
from pathlib import Path
from zipfile import ZipFile
from xml.etree import ElementTree as ET
import json
root = Path(__file__).parent
ns = {"s": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
with ZipFile(root / "data/sales.xlsx") as z:
    strings = ["".join(n.itertext()) for n in ET.fromstring(z.read("xl/sharedStrings.xml"))]
    records = []
    for row in ET.fromstring(z.read("xl/worksheets/sheet1.xml")).findall("s:sheetData/s:row", ns):
        records.append([strings[int(c.find("s:v", ns).text)] if c.get("t") == "s" else float(c.find("s:v", ns).text) for c in row])
headers, *rows = records
assert headers == ["Id", "Region", "Amount"]
expected = {"package_path": "{{PACKAGE_PATH}}", "nodes": [{"type": "imports.excel"}, {"type": "exports.text"}], "outputs": [{"output_node_type": "imports.excel", "output_port": 0, "columns": [{"name": n, "label": n, "type": t} for n, t in zip(headers, ["integer", "string", "real"])], "rows": [dict(zip(headers, [int(r[0]), r[1], r[2]])) for r in rows]}]}
(root / "expected.json").write_text(json.dumps(expected, ensure_ascii=False, indent=2) + "\n")
