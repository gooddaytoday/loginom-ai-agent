import hashlib
import json
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch
import text_export_reevaluation_v2 as v2


class ReEvaluationProvenanceTests(unittest.TestCase):
    def fixture(self, root):
        work=root/'work';run=root/'run';work.mkdir();run.mkdir()
        code=("def audit_directory(directory, external_dir=None):\n"
              "    if False:\n        for r in []:\n            again=None"+v2.OLD+"\n"
              "    return {'passed':False,'checks':{'external':{'passed':False}}}\n")
        files={'text_export_acceptance.py':code.encode(), 'text_export_readiness.py':b'def require_reject_baseline_reader(): return True\n',
               'text_export_import_contract.py':b'contract-version', 'text_export_reevaluation_v2.py':b'reevaluation-version'}
        for name,data in files.items():(work/name).write_bytes(data)
        names=list(files)[:2]
        request={'runtime_source_pin':{'client_revision':'original'}, 'harness_inputs':{name:v2.digest(files[name]) for name in names}}
        for name,data in {'request.json':json.dumps(request),'evidence.json':'{}','scenario.txt':'original goal','full-audit.json':'{"passed":false}'}.items():(run/name).write_text(data)
        batch=b''.join(b'abc blob '+str(len(files[n])).encode()+b'\n'+files[n]+b'\n' for n in names)
        return work,run,batch,request

    def call(self, work, run, batch):
        with patch.object(v2,'WORK',work),patch.object(v2,'ROOT',work),patch.object(v2.subprocess,'check_output',return_value='original-sha\n'),patch.object(v2.subprocess,'run',return_value=SimpleNamespace(stdout=batch)):
            return v2.reevaluate(run,'revision')

    def test_records_original_fail_and_keeps_external_gate(self):
        with tempfile.TemporaryDirectory() as d:
            work,run,batch,_=self.fixture(Path(d));original={p.name:p.read_bytes() for p in run.iterdir()}
            result=self.call(work,run,batch)
            self.assertFalse(result['passed']);self.assertFalse(result['audit']['checks']['external']['passed'])
            self.assertEqual(result['provenance']['original_harness_verified_files'],2)
            self.assertEqual(result['provenance']['original_files_sha256'],{k:hashlib.sha256(v).hexdigest() for k,v in original.items()})
            self.assertEqual(original,{p.name:p.read_bytes() for p in run.iterdir()})

    def test_rejects_blob_not_matching_original_request(self):
        with tempfile.TemporaryDirectory() as d:
            work,run,batch,request=self.fixture(Path(d));request['harness_inputs']['text_export_acceptance.py']='0'*64;(run/'request.json').write_text(json.dumps(request))
            with self.assertRaisesRegex(AssertionError,'original_harness_hash'):self.call(work,run,batch)

    def test_rejects_unapproved_changed_dependency(self):
        with tempfile.TemporaryDirectory() as d:
            work,run,batch,_=self.fixture(Path(d));(work/'text_export_readiness.py').write_text('tampered')
            with self.assertRaisesRegex(AssertionError,'changed_audit_dependency'):self.call(work,run,batch)


if __name__=='__main__':unittest.main()
