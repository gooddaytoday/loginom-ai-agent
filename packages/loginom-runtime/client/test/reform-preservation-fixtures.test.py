"""Independent fixture integrity/value-contract checks, not native execution."""
import csv
import hashlib
import io
import json
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[4] / "docs/node-development/nodes/field-parameters/acceptance/fixtures/preservation"

def verify(name, *, data=None, contract=None):
    c = contract or json.loads((ROOT / (name + ".json")).read_text())
    raw = data if data is not None else (ROOT / (name + ".csv")).read_bytes()
    pin, = [f for f in json.loads((ROOT / "manifest.json").read_text())["files"] if f["path"] == name + ".csv"]
    assert len(raw) == pin["bytes"] and hashlib.sha256(raw).hexdigest() == pin["sha256"]
    assert c["format"] == dict(encoding="UTF-8", delimiter=";", decimal_separator=".", null_marker="NULL", text_qualifier='"')
    parsed = list(csv.reader(io.StringIO(raw.decode("utf-8"), newline=""), delimiter=";", strict=True))
    assert parsed[0] == [f["name"] for f in c["input_columns"]]
    def typed(value, kind):
        if value == "NULL":
            return None
        if kind == "integer":
            return int(value)
        if kind == "real":
            return float(value)
        if kind == "boolean":
            assert value in ["true", "false"]
            return value == "true"
        return value
    assert all(len(r) == len(c["input_columns"]) for r in parsed[1:])
    rows = [[typed(v, f["type"]) for v, f in zip(r, c["input_columns"])] for r in parsed[1:]]
    assert rows == c["input_rows"]
    assert c["expected"]["cardinality"] == len(rows) == len(c["expected"]["rows"])
    assert c["expected"]["columns"] == [{k: f[k] for k in ["name", "label", "type"]} for f in c["expected_configuration"] if not f["excluded"]]
    assert len(c["value_sources"]) == len(c["expected"]["columns"])
    indices = [parsed[0].index(n) for n in c["value_sources"]]
    # Explicit retained-value identities; no conversion or production oracle.
    assert [[r[i] for i in indices] for r in rows] == c["expected"]["rows"]
    return c

class Fixtures(unittest.TestCase):
    def test_preservation(self):
        c = verify("rowid-ab-c")
        self.assertEqual(c["value_sources"], ["RowID", "A", "B", "Extra"])
        self.assertEqual(c["expected"]["rows"], [[101, "alpha", 17, "keep"], [102, "", 0, ""], [103, None, None, None], [104, "semi;colon", -7, "Кириллица"], [105, 'say "yes"', 2147483647, "NULL-ish"]])
        self.assertEqual([f["label"] for f in c["input_columns"]][1:3], ["Same", "Same"])
    def test_wide(self):
        c = verify("wide-130")
        self.assertEqual(len(c["input_columns"]), 130)
        self.assertEqual(len(c["expected"]["columns"]), 130)
        self.assertEqual(c["value_sources"][0], "W000")
        self.assertEqual(c["value_sources"][-1], "W129")
        self.assertIsNone(c["expected"]["rows"][0][5])
        self.assertEqual(c["expected"]["rows"][1][5], 0)
        self.assertEqual([r[-1] for r in c["expected"]["rows"]], [129, -129])
    def test_empty(self):
        c = verify("empty-typed")
        self.assertEqual(c["input_rows"], [])
        self.assertEqual(c["expected"]["rows"], [])
        self.assertEqual([f["type"] for f in c["expected"]["columns"]], ["integer", "string", "real", "boolean", "datetime"])
    def test_changed_bytes_refuse(self):
        for n in ["rowid-ab-c", "wide-130", "empty-typed"]:
            with self.assertRaises(AssertionError):
                verify(n, data=(ROOT / (n + ".csv")).read_bytes() + b"\n")
    def test_value_null_empty_zero_and_row_order_drift_refuse(self):
        for row, col, value in [(0, 0, 999), (1, 1, None), (1, 2, None), (2, 1, ""), (3, 3, "lost")]:
            c = json.loads((ROOT / "rowid-ab-c.json").read_text())
            c["expected"]["rows"][row][col] = value
            with self.assertRaises(AssertionError):
                verify("rowid-ab-c", contract=c)
        c = json.loads((ROOT / "rowid-ab-c.json").read_text())
        c["expected"]["rows"].reverse()
        with self.assertRaises(AssertionError):
            verify("rowid-ab-c", contract=c)
    def test_schema_type_order_cardinality_and_format_drift_refuse(self):
        for mutation in ["type", "order", "cardinality", "format", "width"]:
            c = json.loads((ROOT / "wide-130.json").read_text())
            if mutation == "type": c["expected"]["columns"][0]["type"] = "string"
            if mutation == "order": c["expected"]["columns"].reverse()
            if mutation == "cardinality": c["expected"]["cardinality"] = 0
            if mutation == "format": c["format"]["delimiter"] = ","
            if mutation == "width": c["expected"]["rows"][0].pop()
            with self.assertRaises(AssertionError):
                verify("wide-130", contract=c)

if __name__ == "__main__":
    unittest.main()
