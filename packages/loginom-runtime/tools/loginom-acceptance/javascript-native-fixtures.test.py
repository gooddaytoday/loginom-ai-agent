"""Independent CSV/bytes audit; run separately from Node's sandboxed runner.

This checks immutable fixture inputs, never fabricates native/live evidence.
"""
import csv
import hashlib
import io
import json
from pathlib import Path
import struct
import unittest


ROOT = Path(__file__).resolve().parents[4]
HERE = Path(__file__).resolve().parent
CATALOG = json.loads((HERE / "javascript-native-fixtures.mjs").read_text().split("const fixtures=", 1)[1].split(";", 1)[0])
CASES = json.loads((ROOT / "docs/node-development/nodes/programming-javascript/fixtures/operator-only/typed-cases.json").read_text())["cases"]


def verify(kind, data):
    fixture = CATALOG[kind]
    assert len(data) == fixture["bytes"]
    assert hashlib.sha256(data).hexdigest() == fixture["sha256"]
    rows = list(csv.reader(io.StringIO(data.decode("utf-8"), newline=""), delimiter=";", quotechar='"'))
    assert rows[0] == ["Value"] and all(len(row) == 1 for row in rows)
    values = [None if row[0] == "__JS_NULL__" else {"true": True, "false": False}[row[0]] if kind == "boolean" else float(row[0]) if kind == "real" else row[0] for row in rows[1:]]
    if kind.startswith("cardinality-"):
        case = next(case for case in CASES if case["id"] == "cardinality")
        assert values == [str(v) for v in case["input_rows"]] == fixture["values"]
        index = {"cardinality-keep2": 0, "cardinality-odd": 1, "cardinality-duplicate": 2, "cardinality-empty": 3}[kind]
        expected = [str(v) for v in case["cases"][index]["expected_ids"]]
        assert fixture["output_values"] == expected and fixture["output_rows"] == len(expected)
        assert [values[i] for i in fixture["output_input_rows"]] == expected
        assert fixture["expected_bytes"] == [int(v).to_bytes(8, "little", signed=True).hex() for v in values]
        return
    if kind == "civil-datetime":
        import re
        converted = []
        for value in values:
            if value is None:
                converted.append(None)
                continue
            match = re.fullmatch(r"(\d{2})\.(\d{2})\.(\d{4}) (\d{2}:\d{2}:\d{2}\.\d{3})", value)
            assert match
            day, month, year, time = match.groups()
            converted.append(f"{year}-{month}-{day}T{time}")
        case = next(case for case in CASES if case["id"] == kind)
        assert converted == case["local_values"] == fixture["values"]
        assert len(converted) == fixture["rows"] and fixture["expected_bytes"] is None
        return
    case_id = {"real": "null-number", "boolean": "null-bool", "string": "null-text"}.get(kind, kind)
    case = next(case for case in CASES if case["id"] == case_id)
    expected = ([None] if kind == "integer-safe" else []) + case["decimal_strings"] if fixture["type"] == "integer" else case["values"]
    assert values == expected == fixture["values"] and len(values) == fixture["rows"]
    encoded = [None if value is None else struct.pack("<d", value).hex() if kind == "real" else bytes([int(value)]).hex() if kind == "boolean" else int(value).to_bytes(8, "little", signed=True).hex() if fixture["type"] == "integer" else value.encode("utf-8").hex() for value in values]
    assert encoded == fixture["expected_bytes"]
    if kind == "string":
        assert data.startswith(b'Value\n__JS_NULL__\n""\n')
        assert values[1] == "" and encoded[1] == "" and values[0] is None


class FixtureAudit(unittest.TestCase):
    def test_real(self):
        verify("real", (HERE / "fixtures" / CATALOG["real"]["file"]).read_bytes())

    def test_boolean(self):
        verify("boolean", (HERE / "fixtures" / CATALOG["boolean"]["file"]).read_bytes())

    def test_string(self):
        verify("string", (HERE / "fixtures" / CATALOG["string"]["file"]).read_bytes())

    def test_integer_safe(self):
        verify("integer-safe", (HERE / "fixtures" / CATALOG["integer-safe"]["file"]).read_bytes())

    def test_integer_outside_safe(self):
        verify("integer-outside-safe", (HERE / "fixtures" / CATALOG["integer-outside-safe"]["file"]).read_bytes())

    def test_civil_datetime(self):
        verify("civil-datetime", (HERE / "fixtures" / CATALOG["civil-datetime"]["file"]).read_bytes())

    def test_cardinality_keep2(self):
        verify("cardinality-keep2", (HERE / "fixtures" / CATALOG["cardinality-keep2"]["file"]).read_bytes())

    def test_cardinality_odd(self):
        verify("cardinality-odd", (HERE / "fixtures" / CATALOG["cardinality-odd"]["file"]).read_bytes())

    def test_cardinality_duplicate(self):
        verify("cardinality-duplicate", (HERE / "fixtures" / CATALOG["cardinality-duplicate"]["file"]).read_bytes())

    def test_declared_empty_shared_input(self):
        verify("cardinality-empty", (HERE / "fixtures" / CATALOG["cardinality-empty"]["file"]).read_bytes())

    def test_changed_inputs_refused(self):
        for kind in CATALOG:
            data = (HERE / "fixtures" / CATALOG[kind]["file"]).read_bytes()
            for changed in [data + b" ", data.replace(b"Value\n", b"Value\n__JS_NULL__\n", 1), data.replace(b"Value", b"value")]:
                with self.subTest(kind=kind, changed=changed), self.assertRaises(AssertionError):
                    verify(kind, changed)


if __name__ == "__main__":
    unittest.main()
