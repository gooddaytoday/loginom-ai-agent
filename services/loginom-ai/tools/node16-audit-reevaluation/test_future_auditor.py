"""Focused future-harness regression checks using preserved original evidence."""
import copy,json,sys,unittest
from pathlib import Path
from types import SimpleNamespace
sys.path.insert(0,str(Path.cwd()/'tools/loginom-acceptance'))
import collapse_node_acceptance as current
import test_reevaluation as previous
import test_preview_negative_v2 as preview_tests

class CurrentProjectionAndRestart(previous.EvidenceCounterexamples):
    @classmethod
    def setUpClass(cls):
        cls.verifier=SimpleNamespace(**current.__dict__)
        cls.verifier.bind_restart=lambda e,ps:current.bind_restart(e,ps,previous.r.RUN_ID,SimpleNamespace(**current.__dict__))
        cls.original=json.loads((previous.RUN/'counterexample-input.json').read_text())

class CurrentPreview(preview_tests.PreviewNegativeCounterexamples):
    def check(self,events):
        return current.verify_preview_negative(SimpleNamespace(**current.__dict__),{'events':events},self.op)

if __name__=='__main__':unittest.main()
