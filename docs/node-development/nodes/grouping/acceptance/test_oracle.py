import hashlib
import json
import math
import os
import subprocess
import unittest
from pathlib import Path
from oracle import ROOT, generate, compare_output
from copy import deepcopy

class OracleTests(unittest.TestCase):
    def compare(self, expected, observed, **changes):
        evidence = dict(expected_execution_id="verified-execution", observed_execution_id="verified-execution",
                        read_complete=True, read_fresh=True)
        evidence.update(changes)
        return compare_output(expected, observed, **evidence)

    def test_javascript_json_transport_preserves_exact_numeric_values(self):
        expected = generate()["fixtures/matrix.json"]["five-aggregates.csv"]["expected"]
        transport = subprocess.run([os.environ.get("NODE_BINARY", "node"), "-e",
            "let s='';process.stdin.on('data',x=>s+=x);process.stdin.on('end',()=>process.stdout.write(JSON.stringify(JSON.parse(s))));"],
            input=json.dumps(expected), text=True, capture_output=True, check=True)
        actual = json.loads(transport.stdout)
        self.assertIs(type(actual["rows"][0]["Amount_sum"]), int)
        self.assertTrue(self.compare(expected, actual))

    def test_numeric_values_and_scalar_types_are_exact(self):
        def single(value):
            return dict(columns=[dict(name="Value", label="Value", type="real")], rows=[dict(Value=value)])
        self.assertTrue(self.compare(single(30.0), single(30)))
        self.assertTrue(self.compare(single(1), single(1.0)))
        for left, right in [(30.0, math.nextafter(30.0, math.inf)), (30, 31),
                            (2**53+1, float(2**53+1)), (1, True), (0, False),
                            (30, "30"), (None, ""), (None, 0), ("", False)]:
            with self.subTest(left=left, right=right):
                with self.assertRaisesRegex(ValueError, "multiset"):
                    self.compare(single(left), single(right))
        for invalid in [math.nan, math.inf, -math.inf, [], {}]:
            with self.assertRaisesRegex(ValueError, "scalar_type"):
                self.compare(single(0), single(invalid))

    def test_complete_schema_and_composite_group_multiset(self):
        expected = generate()["fixtures/matrix.json"]["multiple-keys.csv"]["expected"]
        actual = deepcopy(expected)
        actual["rows"].reverse()
        self.assertTrue(self.compare(expected, actual))
        for change in [lambda x: x["columns"].reverse(),
                       lambda x: x["columns"][0].update(type="real"),
                       lambda x: x["columns"][0].update(label="Other"),
                       lambda x: x["rows"].pop(),
                       lambda x: x["rows"].append(deepcopy(x["rows"][0]))]:
            actual = deepcopy(expected)
            change(actual)
            with self.assertRaises(ValueError): self.compare(expected, actual)
        # Hidden Segment still creates two distinct A groups in the final task.
        projected = generate()["expected.json"]["outputs"][0]
        actual = deepcopy(projected)
        actual["rows"] = list({r["Group"]: r for r in actual["rows"]}.values())
        with self.assertRaisesRegex(ValueError, "multiset"): self.compare(projected, actual)

    def test_freshness_is_required_even_when_all_values_match(self):
        expected = generate()["expected.json"]["outputs"][0]
        for evidence in [dict(read_complete=False), dict(read_fresh=False),
                         dict(observed_execution_id="old"), dict(expected_execution_id=None)]:
            with self.assertRaisesRegex(ValueError, "fresh_complete"):
                self.compare(expected, expected, **evidence)

    def test_count_rows_null_empty_and_header_only_remain_distinct(self):
        matrix = generate()["fixtures/matrix.json"]
        output = matrix["null-empty.csv"]["expected"]
        self.assertTrue(self.compare(output, output))
        self.assertEqual(output["rows"][0]["Text_count"], 2)
        wrong = deepcopy(output)
        wrong["rows"][0]["Text_count"] = 1  # SQL-style present-value count.
        with self.assertRaisesRegex(ValueError, "multiset"): self.compare(output, wrong)
        empty = matrix["header-only.csv"]["expected"]
        self.assertTrue(self.compare(empty, empty))
        wrong = deepcopy(empty)
        wrong["columns"] = []
        with self.assertRaisesRegex(ValueError, "schema"): self.compare(empty, wrong)
        self.assertEqual(matrix["null-empty.csv"]["status"], "not_checked")
    def test_legacy_input_is_exact(self):
        repo = ROOT.parents[4]
        self.assertEqual((ROOT / "data/grouping.csv").read_bytes(),
            (repo / "packages/loginom-runtime/tools/loginom-acceptance/fixtures/grouping/grouping.csv").read_bytes())

    def test_groups_and_null_are_not_collapsed(self):
        output = generate()["expected.json"]["outputs"][0]
        self.assertEqual([c["name"] for c in output["columns"]], ["Group", "OtherTotal", "MeanAmount", "TextRows"])
        self.assertEqual(output["rows"], [
            dict(Group="A", OtherTotal=30.0, MeanAmount=1.25, TextRows=2),
            dict(Group="A", OtherTotal=-1.0, MeanAmount=-2.5, TextRows=2),
            dict(Group="B", OtherTotal=3.0, MeanAmount=0.0617283945061725, TextRows=2),
            dict(Group="C", OtherTotal=7.0, MeanAmount=None, TextRows=2)])
        initial = generate()["initial.json"]["outputs"][0]
        self.assertEqual(initial["rows"][-1], dict(Group="C", Total=None, Rows=2, Average=None, Minimum=None, Maximum=None, TextRows=2))

    def test_matrix_covers_empty_and_five_aggregates(self):
        matrix = generate()["fixtures/matrix.json"]
        self.assertEqual(matrix["header-only.csv"]["expected"]["rows"], [])
        self.assertEqual(matrix["five-aggregates.csv"]["expected"]["rows"][0],
            dict(Region="A", Amount_sum=30.0, Amount_count=3, Amount_avg=15.0, Amount_min=10.0, Amount_max=20.0))
        self.assertEqual(matrix["null-empty.csv"]["expected"]["rows"][0]["Text_count"], 2)

    def test_manifest_and_versioned_expectations(self):
        result = generate()
        for name, value in result.items():
            self.assertEqual(json.loads((ROOT/name).read_text()), value)
        for item in result["fixtures/manifest.json"]:
            data = (ROOT/item["path"]).read_bytes()
            self.assertEqual(len(data), item["bytes"])
            self.assertEqual(hashlib.sha256(data).hexdigest(), item["sha256"])

if __name__ == "__main__":
    unittest.main()
