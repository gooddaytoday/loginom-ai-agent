"""Composer boundaries and actual module/native fixtures, never whole CLI PASS.

Native regression is opt-in and uses the existing private observations. Tests do
not run a model, a browser, supplied JS, or a frozen compiled candidate.
"""
import copy
import hashlib
import json
import os
from pathlib import Path
import tempfile
import unittest
from javascript_node_acceptance import JavascriptCliAcceptance,authored_source,bound_native_intervals,captured_events,native_writer_baseline,private_bytes,successful_applies,verified_source_review,verify_javascript_cli_pair,writer_business_output
from javascript_output_evidence import verify_javascript_executions
import test_javascript_cli_nodes
import test_javascript_evidence


class JavascriptAcceptanceBoundaryTests(unittest.TestCase):
    def test_serialized_success_receipts_cannot_be_original_launch_objects(self):
        receipt=dict(passed=True,cli_acceptance_verified=True)
        trial=JavascriptCliAcceptance(receipt,receipt,reader=receipt,expected=dict(schema_mode='code'),
            prompt='task',data_filename='sales.csv',input_columns=[],output_columns=[],expected_rows=[])
        result=trial.audit_writer()
        self.assertFalse(result['passed'],result)
        self.assertIs(result['cli_acceptance_verified'],False)
        result=trial.finish(receipt,receipt)
        self.assertFalse(result['passed'],result)
        self.assertIs(result['cli_acceptance_verified'],False)
        self.assertIs(result['cold_persistence_verified'],False)
        self.assertFalse(verify_javascript_cli_pair([receipt,receipt])['passed'])
        with self.assertRaisesRegex(ValueError,'original_closed_collection'):captured_events(receipt,receipt,receipt)

    def test_terminal_like_objects_without_observation_cannot_be_pair(self):
        trials=[JavascriptCliAcceptance(None,None,reader={},expected=dict(schema_mode=mode),prompt='task',
            data_filename='sales.csv',input_columns=[],output_columns=[],expected_rows=[]) for mode in ('code','declared')]
        for trial in trials:trial.result=dict(passed=True);trial.terminal_sha256='f'*64
        proof=verify_javascript_cli_pair(trials)
        self.assertFalse(proof['passed'],proof)
        self.assertIn('javascript_acceptance_terminal_result_changed',proof['failures'])

    def test_private_physical_file_identity_and_alias_are_observed(self):
        with tempfile.TemporaryDirectory(prefix='loginom-composer-') as directory:
            root=Path(directory);path=root/'report.json';path.write_bytes(b'{"status":"OBSERVED"}\n');path.chmod(0o600)
            content,pin=private_bytes(path)
            self.assertEqual(pin['sha256'],hashlib.sha256(content).hexdigest())
            self.assertEqual((pin['device'],pin['inode']),(path.stat().st_dev,path.stat().st_ino))
            alias=root/'alias';alias.symlink_to(path)
            with self.assertRaisesRegex(ValueError,'private_file'):private_bytes(alias)
            path.chmod(0o644)
            with self.assertRaisesRegex(ValueError,'private_file'):private_bytes(path)

    def test_full_source_review_requires_exact_task_input_candidate_and_anchored_reasoning(self):
        source=b'// inert source-review fixture\n// no program execution\n'
        assignment=dict(owner_task_id='fixture-task',cli_session_id='fixture-cli',candidate_manifest_sha256='a'*64,
            schema_mode='code',prompt_sha256='b'*64,input=dict(filename='sales.csv',bytes=5,sha256='c'*64))
        review=dict(assignment,format='javascript-cli-source-review-v1',decision='VERIFIED',reviewed_at='1970-01-01T00:30:00.001Z',
            source_sha256=hashlib.sha256(source).hexdigest(),source_utf8_bytes=len(source),checks=[dict(kind=kind,
                reason='Fixture reasoning binds the whole inert source; it makes no actual business or CLI claim.',
                source_lines=[1,3],source_excerpt_sha256=hashlib.sha256(source).hexdigest())
                for kind in ('input_rows','row_values','net_cents','status','no_injected_answers')])
        with tempfile.TemporaryDirectory(prefix='loginom-source-review-') as directory:
            path=Path(directory)/'review.json'
            path.write_text(json.dumps(review));path.chmod(0o600)
            pin=dict(path=str(path),sha256=hashlib.sha256(path.read_bytes()).hexdigest())
            proof=verified_source_review(pin,source,assignment)
            self.assertTrue(proof['passed'],proof);self.assertIs(proof['program_equivalence_proved'],False)
            for mutation in ('code','input','decision','span','reason','missing'):
                current=copy.deepcopy(review);actual=source
                if mutation=='code':actual+=b'// changed'
                if mutation=='input':current['input']['sha256']='d'*64
                if mutation=='decision':current['decision']='PENDING'
                if mutation=='span':current['checks'][-1]['source_lines']=[1,2]
                if mutation=='reason':current['checks'][0]['reason']=' '
                if mutation=='missing':current['checks'].pop()
                path.write_text(json.dumps(current));pin['sha256']=hashlib.sha256(path.read_bytes()).hexdigest()
                with self.subTest(mutation=mutation):
                    with self.assertRaisesRegex(ValueError,'source_review'):
                        verified_source_review(pin,actual,assignment)


class JavascriptAuthorshipCompositionTests(unittest.TestCase):
    def setUp(self):
        self.nodes=test_javascript_cli_nodes.JavascriptCliNodeTests(methodName='runTest')
        self.nodes.setUp();self.addCleanup(self.nodes.doCleanups)

    def test_same_execute_authorship_uses_actual_compact_module_and_public_bytes(self):
        selected=successful_applies(self.nodes.native)[0]
        source,operation=authored_source(self.nodes.fixture.events,self.nodes.native,selected,self.nodes.expected)
        self.assertEqual(operation,'js')
        self.assertEqual(source,self.nodes.args['parameters']['source_text'].encode('utf-8'))

    def test_done_then_preserve_execute_retains_bound_authorship(self):
        native=self.nodes.native
        selected=dict(position=4,end=6,request=dict(operation_id='preserve',target=dict(type='programming.javascript'),mode='script'),
            checkpoint=dict(node=self.nodes.checkpoint['node']))
        source,operation=authored_source(self.nodes.fixture.events,native,selected,self.nodes.expected)
        self.assertEqual(operation,'js');self.assertEqual(source,self.nodes.args['parameters']['source_text'].encode())

    def test_native_only_code_or_foreign_owner_cannot_prove_model_authorship(self):
        for change in ('source','node'):
            native=copy.deepcopy(self.nodes.native)
            if change=='source':native[1]['request']['parameters']['source_text']='unissued native code'
            if change=='node':native[2]['result']['node']['node_id']='foreign'
            selected=successful_applies(native)[0]
            with self.subTest(change=change):
                with self.assertRaisesRegex(ValueError,'authored_public_binding'):
                    authored_source(self.nodes.fixture.events,native,selected,self.nodes.expected)

    def test_native_clock_cannot_place_execution_after_public_terminal_or_before_submission(self):
        native=copy.deepcopy(self.nodes.native[1:])
        for row in native:row['recorded_at']='1970-01-01T00:00:01.250Z'
        bound_native_intervals(self.nodes.fixture.events,native,['js'])
        for stamp in ('1970-01-01T00:00:01.239Z','1970-01-01T00:00:01.281Z'):
            native[-1]['recorded_at']=stamp
            with self.subTest(stamp=stamp):
                with self.assertRaisesRegex(ValueError,'work_outside_public_operation'):
                    bound_native_intervals(self.nodes.fixture.events,native,['js'])


@unittest.skipUnless(os.environ.get('LOGINOM_JAVASCRIPT_AUDIT_EVIDENCE_ROOT'),'private native regression captures not supplied')
class JavascriptNativeCompositionTests(unittest.TestCase):
    def cases(self):return test_javascript_evidence.JavascriptNativeRegressionTests(methodName='runTest').cases()

    def test_native_writer_baseline_comes_from_bound_target_checkpoint_settings_and_mappings(self):
        for name,native,request,source,inputs,oracle in self.cases():
            proof=verify_javascript_executions(native,request)
            self.assertTrue(proof['passed'],proof)
            ids=[proof['materialization_execution_id'],proof['execution_id']]
            baseline=native_writer_baseline(native,request,source,ids,'/jsteach/fixture.lgp',1800000)
            with self.subTest(name=name):
                self.assertEqual(baseline['source'],source)
                self.assertEqual(baseline['node']['node_id'],next(n['ref']['node_id'] for n in baseline['graph']['nodes']
                    if n['ref']['node_id']==baseline['node']['node_id']))
                self.assertTrue(baseline['graph']['complete'])
                self.assertTrue(baseline['mappings']['input']['verified'])
                self.assertTrue(baseline['mappings']['output']['verified'])
                self.assertEqual(baseline['schema_mode'],request['parameters']['schema_mode'])
                self.assertEqual(baseline['finished_at'],'1970-01-01T00:30:00.000Z')
            missing=[r for r in native if r.get('phase')!='node_target_checkpoint']
            with self.assertRaisesRegex(ValueError,'native_guid_graph_missing'):
                native_writer_baseline(missing,request,source,ids,'/jsteach/fixture.lgp',1800000)

    def test_partial_apply_without_model_full_read_cannot_promote_existing_full_native_table(self):
        name,native,original,source,inputs,oracle=next(iter(self.cases()))
        request=copy.deepcopy(original);request['read']=dict(ports=[0],sample_rows=5,require_exact_numbers=False)
        changed=copy.deepcopy(native)
        for row in changed:
            if row.get('operation_id')==request['operation_id'] and row.get('phase')=='node_apply_prepared':row['request']=request
        expected=dict(target=next(row['target'] for row in changed if row.get('target')))
        with self.assertRaisesRegex(ValueError,'model_delivered_full_business_output'):
            writer_business_output([],changed,request,{},expected,oracle['schema'],oracle['ordered_rows'])


if __name__=='__main__':unittest.main()
