#!/usr/bin/env python3
"""Runs every cell of the acceptance contract (acceptance_cells.py) as a real Git merge against the tools in this directory.

A cell is red when the gate's exit code, RESULT line or FAIL lines differ from the contract's, with every other cell recorded so
that the run belongs to that cell alone. The mutation tests copy the tools, break the gate in the two ways a careless edit would
(always exit 0, always ACCEPTED) and require the cells to turn red.
Run: python3 -I scripts/upstream-sync/test_acceptance.py
"""
import importlib.util
import os
import shutil
import sys
import tempfile
import unittest

sys.dont_write_bytecode = True

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))


def load(name, file):
    spec = importlib.util.spec_from_file_location(name, os.path.join(HERE, file))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


cells = load("acceptance_cells", "acceptance_cells.py")
merge_oracle = load("merge_oracle", "merge_oracle.py")
SAMPLE = lambda c: c["n"] % 8 == 0


class GateCells(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.results, _ = cells.evaluate_verify(HERE)

    def test_every_cell_gets_the_contract_verdict(self):
        for r in self.results:
            with self.subTest(cell=r["id"], upstream=r["scenario"].op, file=r["scenario"].shape, fork=r["scenario"].fork,
                              result=r["kind"], expected=r["verdict"].code()):
                self.assertEqual(r["problems"], [])

    def test_the_space_has_every_verdict(self):
        self.assertEqual({r["verdict"].code() for r in self.results}, {"ok", "C", "D"})

    def test_the_findings_of_lab_302_are_cells(self):
        rename_edit_old = [r for r in self.results if r["scenario"].op == "R" and r["scenario"].fork == "edit" and r["kind"] == "old-kept"]
        self.assertTrue(rename_edit_old and all(r["verdict"].code() != "ok" for r in rename_edit_old), "F3: old path kept next to a merged rename")
        elsewhere = [r for r in self.results if r["scenario"].op == "A" and r["kind"] == "elsewhere"]
        self.assertTrue(elsewhere and all(r["verdict"].code() != "ok" for r in elsewhere), "F2: an added file only under another path")


class CellsSeeTheGate(unittest.TestCase):
    """F4 of LAB-302: a gate that always exits 0, or always says ACCEPTED, must not leave the cells green."""

    def mutated(self, old, new):
        with tempfile.TemporaryDirectory(prefix="mutated-tools.") as tools:
            shutil.copytree(HERE, tools, dirs_exist_ok=True, ignore=shutil.ignore_patterns("__pycache__"))
            path = os.path.join(tools, "verify-accepted.py")
            with open(path, encoding="utf-8") as fh:
                text = fh.read()
            self.assertEqual(text.count(old), 1, f"the mutation point {old!r} is not in the gate")
            with open(path, "w", encoding="utf-8") as fh:
                fh.write(text.replace(old, new))
            return cells.evaluate_verify(tools, SAMPLE)[0]

    def test_the_sample_is_green_on_the_real_gate(self):
        results, _ = cells.evaluate_verify(HERE, SAMPLE)
        self.assertEqual([r["id"] for r in results if r["problems"]], [])

    def assert_every_failing_cell_is_red(self, results):
        needing = [r for r in results if r["verdict"].needs]
        self.assertTrue(len(needing) >= 20, "the sample must hold cells that need a record")
        self.assertEqual(sorted(r["id"] for r in results if r["problems"] and r["verdict"].needs), sorted(r["id"] for r in needing))

    def test_a_gate_that_always_exits_0_turns_the_cells_red(self):
        self.assert_every_failing_cell_is_red(self.mutated("sys.exit(0 if accepted else 1)", "sys.exit(0)"))

    def test_a_gate_that_always_says_accepted_turns_the_cells_red(self):
        self.assert_every_failing_cell_is_red(self.mutated('"ACCEPTED" if accepted else "REJECTED"', '"ACCEPTED"'))

    def test_a_gate_that_never_reports_a_deviation_turns_the_cells_red(self):
        results = self.mutated('need[path] = ("deviation", ', 'need[path + "\\0"] = ("deviation", ')
        self.assertTrue(any(r["problems"] for r in results if r["verdict"].code() == "D"))


class TwoRoutesOfGit(unittest.TestCase):
    """Acceptance 1: the oracle (merge-tree) and the index route of `prepare` (git merge --no-commit) give the same merge."""

    def test_same_conflicts_and_same_tree_outside_them_on_every_cell(self):
        with tempfile.TemporaryDirectory(prefix="acceptance-cells.") as repo:
            _, model = cells.judged_cells(repo)
            orc = merge_oracle.oracle(repo, model.fork, model.upstream)
        self.assertEqual(set(orc.conflicts), set(model.conflicts))
        outside = [p for p in set(orc.entries) | set(model.expected)
                   if p not in model.conflicts and p not in orc.parked and orc.entries.get(p) != model.expected.get(p)]
        self.assertEqual(outside, [])


class LookalikeOfAParkedName(unittest.TestCase):
    """R3 of LAB-312: `path~<40 hex>` is a parked name only when Git reports a file-types clash at `path`; a real file of that name
    is a conflict of its own, in the model of the index route as in the oracle."""

    def conflicting_cells(self):
        class Twin(cells.Scenario):
            @property
            def paths(self):
                return {k: v + "~" + "a" * 40 for k, v in super().paths.items()}

        sid = "900"
        args = (sid, "M", "text", "both edit one line", cells.body(sid), cells.body(sid, [(5, "fk")]), cells.body(sid, [(5, "up")]),
                cells.body(sid, [(5, "fk up")]))
        return [{"id": sid, "n": 0, "s": s, "kind": "merge", "res": cells.result_for(s, "merge")}
                for s in (cells.Scenario(*args), Twin(*args))]

    def test_the_model_counts_the_lookalike_as_a_second_conflict(self):
        with tempfile.TemporaryDirectory(prefix="acceptance-cells.") as repo:
            model = cells.build_repo(repo, self.conflicting_cells())
            orc = merge_oracle.oracle(repo, model.fork, model.upstream)
        self.assertEqual(len(orc.conflicts), 2)
        self.assertEqual(set(model.conflicts), set(orc.conflicts))


class CatalogCheckCells(unittest.TestCase):
    def test_every_cell_gets_the_contract_verdict(self):
        for r in cells.evaluate_catalog(HERE):
            with self.subTest(cell=r["id"]):
                self.assertEqual(r["problems"], [])

    def test_a_type_change_is_a_divergence_c3(self):
        kinds = {c["kind"] for c in cells.catalog_cells()}
        self.assertLessEqual({"file to symlink", "symlink to file"}, kinds)


class ContractDocument(unittest.TestCase):
    def test_the_document_embeds_the_generated_tables(self):
        doc = open(os.path.join(ROOT, "docs/upstream-sync/acceptance-contract.md"), encoding="utf-8").read()
        begin, end = "<!-- cells:begin -->\n", "<!-- cells:end -->"
        self.assertIn(begin, doc)
        embedded = doc.split(begin, 1)[1].split(end, 1)[0]
        self.assertEqual(embedded, cells.markdown(), "regenerate: scripts/upstream-sync/acceptance_cells.py --markdown")


if __name__ == "__main__":
    unittest.main()
