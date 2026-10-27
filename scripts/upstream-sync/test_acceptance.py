#!/usr/bin/env python3
"""Runs every cell of the acceptance contract (acceptance_cells.py) as a real Git merge against the tools in this directory.

A cell is red when the tool's verdict differs from the contract's. Run: python3 -I scripts/upstream-sync/test_acceptance.py
"""
import importlib.util
import os
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
_spec = importlib.util.spec_from_file_location("acceptance_cells", os.path.join(HERE, "acceptance_cells.py"))
cells = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(cells)


class VerifyAcceptedCells(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.results, _ = cells.evaluate_verify(HERE)

    def test_every_cell_gets_the_contract_verdict(self):
        for r in self.results:
            with self.subTest(cell=r["id"], upstream=r["scenario"].op, file=r["scenario"].shape, fork=r["scenario"].fork,
                              result=r["kind"], expected=r["verdict"].code()):
                self.assertEqual(r["problems"], [])

    def test_the_findings_of_lab_300_are_cells(self):
        ids = {r["id"]: r for r in self.results}
        rename_edit = [r for r in self.results if r["scenario"].op == "R" and r["scenario"].fork == "edit" and r["kind"] == "up"]
        self.assertTrue(rename_edit and all(r["verdict"].cat == "took-theirs" for r in rename_edit), "C1: rename/modify taken from upstream")
        dups = [r for r in self.results if r["kind"] == "dup-lost"]
        self.assertEqual(sorted((r["scenario"].op, r["verdict"].code()) for r in dups), [("A", "AT/e"), ("M", "ok*")], "C2: repeated lines")
        self.assertTrue(ids)


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
