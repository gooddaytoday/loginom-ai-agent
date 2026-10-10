import hashlib
import json
import unittest
from pathlib import Path
from oracle import ROOT, generate

class OracleTests(unittest.TestCase):
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
