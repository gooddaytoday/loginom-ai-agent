import copy
import unittest
from pathlib import Path
from sales_sorting_acceptance import audit, report, model_completed, WORK
from sales_upload_probe import FIXTURE, prompt

class SalesAcceptanceGateTests(unittest.TestCase):
    def test_absent_evidence_is_never_a_pass(self):
        self.assertFalse(audit({}, {}, '', (WORK/FIXTURE).read_bytes())['passed'])
        self.assertFalse(report({})['passed'])
        self.assertFalse(report({'part':{'passed':True},'missing':{'passed':False}})['passed'])

    def test_model_prose_or_process_exit_cannot_satisfy_acceptance(self):
        request={'run_id':'20260910-120000-aabbccdd','storage_directory':'/user/dock-p3',
                 'goal_id':'sales-sorting-complete','package_path':'/user/dock-p3/packages/Dock-acceptance-20260910-120000-aabbccdd.lgp','schema_version':2}
        evidence={'run_id':request['run_id'],'process':{'returncode':0,'final':'All six nodes and totals are correct.'}}
        rendered=prompt((WORK/'goals/sales-sorting-complete.txt').read_text(),request['package_path'],request['storage_directory'],request['run_id'])
        result=audit(request,evidence,rendered,(WORK/FIXTURE).read_bytes())
        self.assertFalse(result['passed']);self.assertFalse(result['subplan_complete'])
        self.assertFalse(model_completed(request,evidence))

if __name__=='__main__':unittest.main()
