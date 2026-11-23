import copy
import unittest
import oracle


class OracleTests(unittest.TestCase):
    def test_rejects_semantic_mutations(self):
        expected = oracle.expectations()[0]["cases"][0]
        base = {k:copy.deepcopy(expected[k]) for k in ["columns", "rows", "row_count", "output_port"]}
        base["complete"] = True
        oracle.compare(expected, base)
        changes = [lambda d:d.update(complete=False), lambda d:d.update(output_port=1),
                   lambda d:d["rows"].reverse(), lambda d:d["columns"].reverse(),
                   lambda d:d["columns"][0].update(label="Wrong"),
                   lambda d:d["columns"][0].update(data_kind="continuous"),
                   lambda d:d["columns"][0].update(type="real"),
                   lambda d:d["rows"][2].__setitem__(1,""),
                   lambda d:d["rows"][3].__setitem__(1,None),
                   lambda d:d["rows"][0].__setitem__(4,1),
                   lambda d:d["rows"][0].__setitem__(2,1234.5678),
                   lambda d:d["rows"][0].__setitem__(3,"2024-02-29T12:30:00.002")]
        for change in changes:
            altered = copy.deepcopy(base)
            change(altered)
            with self.assertRaises(AssertionError):
                oracle.compare(expected, altered)

    def test_fixtures(self):
        oracle.fixtures()


if __name__ == "__main__":
    unittest.main()
