import copy
import hashlib
import tempfile
import unittest
from pathlib import Path

from audit_exported_csv import audit_exported_csv


class ExportAudit(unittest.TestCase):
    def test_exact_download_content_and_binding_are_both_required(self):
        with tempfile.TemporaryDirectory() as directory:
            run = Path(directory)
            sid, aid = '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222'
            dest = '/mimo/MiMo-test/result.csv'
            path = run/'private/dock-state/sessions'/sid/'artifacts/input'/('output-'+aid)/'result.csv'
            path.parent.mkdir(parents=True); path.write_text('category,total\nA,12.5\nB,4\n')
            plan = dict(expected_graph=dict(nodes=[dict(id='export',type='exports.text')],
                        links=[dict(source='group',output=0,target='export',input=0)]),
                        outputs=[dict(node_id='group',port=0,name='group-table')],
                        model_operations_for_review=[dict(node_id='export',operation_id='export-op',parameters=dict(destination=dest))])
            expected = dict(tables={'group-table':dict(fields=dict(category='string',total='real'),keys=['category'],
                            rows=[dict(category='A',total='12.5'),dict(category='B',total='4')],sorting=[dict(name='total',direction='DESC')])})
            artifact = dict(artifact_id=aid,destination=dest,execution_id='execution',verification_id='download',
                            bytes=path.stat().st_size,sha256=hashlib.sha256(path.read_bytes()).hexdigest())
            evidence = dict(tools=[dict(result=dict(operation_id='export-op',status='SUCCEEDED',node=dict(node_id='export'),
                            execution=dict(execution_id='execution'),output=dict(file_artifacts=[artifact])))],
                            events=[dict(phase='export_file_download_completed',operation_id='export-op',id='download',session_id=sid,
                            outcome=dict(status='SUCCEEDED',cleanup_complete=True,output=dict(download_completed=True,artifact_id=aid,
                            output_binding=dict(node_id='export',destination=dest,execution_id='execution'))))])
            self.assertEqual(audit_exported_csv(run,plan,expected,evidence)['files']['export-op']['rows_checked'],2)
            bad = copy.deepcopy(evidence); bad['events'][0]['outcome']['output']['output_binding']['node_id'] = 'other'
            with self.assertRaisesRegex(ValueError,'binding differs'): audit_exported_csv(run,plan,expected,bad)
            path.write_text('category,total\nA,12.5\n')
            with self.assertRaisesRegex(ValueError,'bytes/hash'): audit_exported_csv(run,plan,expected,evidence)
            artifact.update(bytes=path.stat().st_size,sha256=hashlib.sha256(path.read_bytes()).hexdigest())
            with self.assertRaisesRegex(ValueError,'row count'): audit_exported_csv(run,plan,expected,evidence)
            path.write_text('category,total\nB,4\nA,12.5\n')
            artifact.update(bytes=path.stat().st_size,sha256=hashlib.sha256(path.read_bytes()).hexdigest())
            with self.assertRaisesRegex(ValueError,'ranking'): audit_exported_csv(run,plan,expected,evidence)


if __name__ == '__main__':
    unittest.main()
