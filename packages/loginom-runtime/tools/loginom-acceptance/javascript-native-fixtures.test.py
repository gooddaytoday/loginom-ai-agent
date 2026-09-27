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
import re


ROOT = Path(__file__).resolve().parents[4]
HERE = Path(__file__).resolve().parent
CATALOG = json.loads((HERE / "javascript-native-fixtures.mjs").read_text().split("const fixtures=", 1)[1].split(";", 1)[0].replace("  ...javascriptCoercionCases,\n", ""))
CASES = json.loads((ROOT / "docs/node-development/nodes/programming-javascript/fixtures/operator-only/typed-cases.json").read_text())["cases"]


COERCIONS = json.loads((HERE / "javascript-native-coercion-cases.mjs").read_text().split("const cases=", 1)[1].split("\n};", 1)[0] + "\n}")
# Independent reviewed input/source pins, copied from the canonical design.
# No output scalar expectations are inferred from the implementation.
COERCION_SPEC = [{'id': 'integer-coercion-fraction-positive',
  'input_type': 'real',
  'input_native_type': 3,
  'input_native_tag': 5,
  'input_native_bytes': '000000000000fc3f',
  'csv_utf8': 'Value\n1.75\n',
  'csv_bytes': 11,
  'csv_sha256': '8bef552b1ef66cdeaf5e382ffc56658cb6c6117ff9e8ffd7bb2bf1a2f3bee765',
  'TYPE': '"number"',
  'INPUT': '1.75',
  'EXPR': 'input',
  'CHECK': 'typeof candidate === "number" && candidate === 1.75',
  'source_bytes': 587,
  'source_sha256': '6392d7bd6ecfb37351160aef70a94fa52f4786124daf2d14d789120292173e4e'},
 {'id': 'integer-coercion-fraction-negative',
  'input_type': 'real',
  'input_native_type': 3,
  'input_native_tag': 5,
  'input_native_bytes': '000000000000fcbf',
  'csv_utf8': 'Value\n-1.75\n',
  'csv_bytes': 12,
  'csv_sha256': '903706717263f47c0a16baf6780062e1334cd12b76e59c9a7b9ad8147ec4f66b',
  'TYPE': '"number"',
  'INPUT': '-1.75',
  'EXPR': 'input',
  'CHECK': 'typeof candidate === "number" && candidate === -1.75',
  'source_bytes': 589,
  'source_sha256': 'c6cc020cb53965aec934f072c82ecc0ea5fcaebe0385b650adfa889e478a15fa'},
 {'id': 'integer-coercion-string-numeric',
  'input_type': 'string',
  'input_native_type': 5,
  'input_native_tag': 8,
  'input_native_bytes': '3432',
  'csv_utf8': 'Value\n"42"\n',
  'csv_bytes': 11,
  'csv_sha256': '97a11b225d4b86224e07f533e327c4e1d8d9da458818a2dca5b76d170504ca19',
  'TYPE': '"string"',
  'INPUT': '"42"',
  'EXPR': 'input',
  'CHECK': 'typeof candidate === "string" && candidate === "42"',
  'source_bytes': 587,
  'source_sha256': '263d9de6fa75ce6c1ac9379eabeca1114407998ec00c5ff6fcaffe4a001306c6'},
 {'id': 'integer-coercion-string-invalid',
  'input_type': 'string',
  'input_native_type': 5,
  'input_native_tag': 8,
  'input_native_bytes': '6e6f742d616e2d696e7465676572',
  'csv_utf8': 'Value\n"not-an-integer"\n',
  'csv_bytes': 23,
  'csv_sha256': '0b95bd2da8b44656df1d42d2734d0c7aa462a2802293e18b732e8db4515dfe89',
  'TYPE': '"string"',
  'INPUT': '"not-an-integer"',
  'EXPR': 'input',
  'CHECK': 'typeof candidate === "string" && candidate === "not-an-integer"',
  'source_bytes': 611,
  'source_sha256': 'cc7cbdfd0262956f66896395b8ad85e48879e8b5fac70a70be7bf21712b68fd2'},
 {'id': 'integer-coercion-nan',
  'input_type': 'real',
  'input_native_type': 3,
  'input_native_tag': 5,
  'input_native_bytes': '0000000000000000',
  'csv_utf8': 'Value\n0\n',
  'csv_bytes': 8,
  'csv_sha256': 'cbae8bbee4380c47abea5ce84baeaf1391c345a8950e731fc77935afe4e4bad6',
  'TYPE': '"number"',
  'INPUT': '0',
  'EXPR': 'input / input',
  'CHECK': 'typeof candidate === "number" && candidate !== candidate',
  'source_bytes': 597,
  'source_sha256': 'e145174ca2472dab41c0d1433fd27c87aca7a2391459f04a0e579930ac7085ff'},
 {'id': 'integer-coercion-positive-infinity',
  'input_type': 'real',
  'input_native_type': 3,
  'input_native_tag': 5,
  'input_native_bytes': '000000000000f03f',
  'csv_utf8': 'Value\n1\n',
  'csv_bytes': 8,
  'csv_sha256': 'c4b301392924e65794be7ce5ade35a17462cefb36ea095c95b91a36d03c1bcf6',
  'TYPE': '"number"',
  'INPUT': '1',
  'EXPR': 'input / 0',
  'CHECK': 'typeof candidate === "number" && candidate === 1 / 0',
  'source_bytes': 589,
  'source_sha256': '7cae6b72caeadcc28d7c6a87e4cf7b9eb2c94daf5901369d2f099a239e3cdf16'},
 {'id': 'integer-coercion-negative-infinity',
  'input_type': 'real',
  'input_native_type': 3,
  'input_native_tag': 5,
  'input_native_bytes': '000000000000f0bf',
  'csv_utf8': 'Value\n-1\n',
  'csv_bytes': 9,
  'csv_sha256': 'ca5f305ca67f9fc14d2b368007174be77607635eb3c5e5f6cbb9fcd779352a2c',
  'TYPE': '"number"',
  'INPUT': '-1',
  'EXPR': 'input / 0',
  'CHECK': 'typeof candidate === "number" && candidate === -1 / 0',
  'source_bytes': 591,
  'source_sha256': 'd75c797c0915f0796b267e9b9a46c99db29b192db3aa2e3ef7a4cc0efb04e2d1'}]
SOURCE_TEMPLATE = 'import {InputTable,OutputTable,DataType} from "builtIn/Data";\nif (InputTable.RowCount !== 1 || InputTable.ColumnCount !== 1 || InputTable.IsNull(0,"Value")) throw Error("JS_INT_COERCION_INPUT_SHAPE");\nconst input=InputTable.Get(0,"Value");\nif (typeof input !== @@TYPE@@ || input !== @@INPUT@@) throw Error("JS_INT_COERCION_INPUT_VALUE");\nconst candidate=@@EXPR@@;\nif (!(@@CHECK@@)) throw Error("JS_INT_COERCION_CANDIDATE");\nOutputTable.AssignColumns([{Name:"Value",DataType:DataType.Integer}]);\nOutputTable.Append();\nOutputTable.Set("Value",candidate);\n'
OPERATOR_FIXTURES = ROOT / "docs/node-development/nodes/programming-javascript/fixtures/operator-only"


def verify_coercion(case, data):
    fixture = COERCIONS[case["id"]]
    assert data == case["csv_utf8"].encode("utf-8")
    assert len(data) == fixture["bytes"] == case["csv_bytes"]
    assert hashlib.sha256(data).hexdigest() == fixture["sha256"] == case["csv_sha256"]
    assert fixture["type"] == case["input_type"] and fixture["native_type"] == case["input_native_type"]
    assert fixture["rows"] == fixture["columns"] == 1
    rows = list(csv.reader(io.StringIO(data.decode("utf-8")), delimiter=";", quotechar='"'))
    assert rows[0] == ["Value"] and len(rows) == 2 and len(rows[1]) == 1
    value = float(rows[1][0]) if fixture["type"] == "real" else rows[1][0]
    encoded = struct.pack("<d", value).hex() if fixture["type"] == "real" else value.encode("utf-8").hex()
    assert [value] == fixture["values"] and [encoded] == fixture["expected_bytes"]
    assert encoded == case["input_native_bytes"]
    source = SOURCE_TEMPLATE
    for key in ["TYPE", "INPUT", "EXPR", "CHECK"]:
        source = source.replace("@@" + key + "@@", case[key])
    assert source == fixture["source"] and len(source.encode()) == case["source_bytes"]
    assert hashlib.sha256(source.encode()).hexdigest() == fixture["source_sha256"] == case["source_sha256"]
    assert source.splitlines()[8] == 'OutputTable.Set("Value",candidate);'
    assert "output_values" not in fixture


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

    def test_coercion_enum_and_pins(self):
        self.assertEqual(len(COERCIONS), 7)
        self.assertEqual(list(COERCIONS), [case["id"] for case in COERCION_SPEC])
        for case in COERCION_SPEC:
            with self.subTest(case=case["id"]):
                verify_coercion(case, (OPERATOR_FIXTURES / COERCIONS[case["id"]]["file"]).read_bytes())

    def test_coercion_mutations_refused(self):
        for case in COERCION_SPEC:
            data = (OPERATOR_FIXTURES / COERCIONS[case["id"]]["file"]).read_bytes()
            for changed in [data + b" ", b"\xef\xbb\xbf" + data, data.replace(b"\n", b"\r\n"), data.replace(b"Value", b"value")]:
                with self.subTest(case=case["id"]), self.assertRaises(AssertionError):
                    verify_coercion(case, changed)

    def test_changed_inputs_refused(self):
        for kind in CATALOG:
            data = (HERE / "fixtures" / CATALOG[kind]["file"]).read_bytes()
            for changed in [data + b" ", data.replace(b"Value\n", b"Value\n__JS_NULL__\n", 1), data.replace(b"Value", b"value")]:
                with self.subTest(kind=kind, changed=changed), self.assertRaises(AssertionError):
                    verify(kind, changed)


if __name__ == "__main__":
    unittest.main()
