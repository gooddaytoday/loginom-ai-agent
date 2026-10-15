"""Readonly regression from an actual failed CLI trial; never promotes that trial.

LOGINOM_JAVASCRIPT_CLI_REGRESSION_ROOT points to its private run directory.
No browser, model, supplied JavaScript or persisted package is executed here.
"""
import copy
import hashlib
import json
import os
from pathlib import Path
import unittest
from javascript_cli_evidence import read_cli_session
from javascript_cli_nodes import cli_public_calls
from javascript_cli_persistence import rendered_label
from javascript_configuration_evidence import verify_javascript_configuration
from javascript_node_acceptance import verify_cli_prompt_snapshot,successful_applies,bound_native_intervals
from artifact_delivery_evidence import verify_delivered_import_output,verify_delivered_import_source_execution
from import_execution_evidence import verify_text_import_execution


class PromptAndLabelTests(unittest.TestCase):
    def test_exact_single_cli_argument_snapshot(self):
        for prompt,delivered in [('one','one'),('текст "да"','"текст \\"да\\""'),('a\nb','a\nb')]:
            projection=dict(models=[dict(role='user',message_id='user')],user_prompts=[dict(
                part_id='text',message_id='user',bytes=len(delivered.encode()),sha256=hashlib.sha256(delivered.encode()).hexdigest())])
            verify_cli_prompt_snapshot(projection,prompt)
            for fault in ('missing','duplicate','hash','bytes','owner'):
                changed=copy.deepcopy(projection)
                if fault=='missing':changed['user_prompts']=[]
                if fault=='duplicate':changed['user_prompts']*=2
                if fault=='hash':changed['user_prompts'][0]['sha256']='0'*64
                if fault=='bytes':changed['user_prompts'][0]['bytes']+=1
                if fault=='owner':changed['user_prompts'][0]['message_id']='other'
                with self.subTest(prompt=prompt,fault=fault):
                    with self.assertRaisesRegex(ValueError,'prompt_snapshot'):verify_cli_prompt_snapshot(changed,prompt)

    def test_ecmascript_rendered_label_keeps_non_js_whitespace(self):
        self.assertEqual(rendered_label('Расчёт продаж,\tитог\ufeff'), 'Расчёт_продаж_итог_')
        self.assertEqual(rendered_label('a\u0085b\u001cc'), 'a\u0085b\u001cc')
        for label in (None,''):
            with self.assertRaises(ValueError):rendered_label(label)


@unittest.skipUnless(os.environ.get('LOGINOM_JAVASCRIPT_CLI_REGRESSION_ROOT'),'private CLI regression capture not supplied')
class AutonomousNativeRegressionTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.root=Path(os.environ['LOGINOM_JAVASCRIPT_CLI_REGRESSION_ROOT'])
        cls.events=[json.loads(line) for line in (cls.root/'evidence/events.jsonl').read_text().splitlines()]
        paths=list(cls.root.glob('profile/loginom/runtime/generations/*/chats/*/attempts/*/saved-package-cleanup.json'))
        assert len(paths)==1
        cls.native=[json.loads(line) for line in paths[0].with_name('execution-events.jsonl').read_text().splitlines()]
        cls.request=next(r['request'] for r in successful_applies(cls.native)
            if r['request']['target'].get('type')=='programming.javascript' and r['request']['finish']=='execute')
        cls.imported=next(r['request'] for r in successful_applies(cls.native) if r['request']['target'].get('type')=='imports.text')
        cls.source=cls.request['parameters']['source_text'].encode()
        cls.data=(cls.root/'workspace/sales.csv').read_bytes()
        cls.inputs=[dict(name=n,type=t) for n,t in [('RowID','integer'),('Customer','string'),('Qty','integer'),('UnitPriceCents','integer'),('DiscountPct','integer')]]
        cls.outputs=[dict(name=n,type=t) for n,t in [('RowID','integer'),('CustomerKey','string'),('NetCents','integer'),('Status','string')]]
        cls.target=cls.native[0]['target']
        cls.runtime=cls.native[0]['runtime_revision']
        cls.upload=cls.imported['parameters']['source']['upload_operation_id']
        delivered=next(c['result'] for c in cli_public_calls(cls.events) if c['part']['tool'] in
            ('loginom_dock_artifact_deliver','loginom_dock_artifact_delivery_status') and c['result']
            and c['result'].get('state')=='settled' and c['result'].get('output',{}).get('upload_operation_id')==cls.upload)
        cls.delivery=dict(state=delivered['state'],phase='completed',error=delivered.get('error'),
            operation_id=delivered['operation_id'],upload_operation_id=cls.upload,outcome=delivered['output'])

    def configuration(self,native):
        return verify_javascript_configuration(native,self.request,self.source,self.inputs,self.outputs,
            expected_target=self.target,expected_origin='http://logi-test-plan.bg.local')

    def test_original_sqlite_prompt(self):
        session=next(c['part']['sessionID'] for c in cli_public_calls(self.events))
        projection=read_cli_session(self.root/'profile',session)
        prompt=json.loads((self.root/'assignment.json').read_text())['prompt']
        verify_cli_prompt_snapshot(projection,prompt)

    def test_new_admission_requires_exact_owner_transition(self):
        self.assertTrue(self.configuration(self.native)['passed'])
        for fault in ('guid','epoch','deadline','source','kind','missing','order','dispatch'):
            native=copy.deepcopy(self.native)
            configured=next(r for r in native if r.get('phase')=='javascript_source_configured' and r['receipt']['kind']=='new')
            admitted=next(r for r in native if r.get('phase')=='javascript_source_admitted' and r['receipt']['kind']=='new')
            if fault=='guid':configured['receipt']['owner']['node_id']='foreign'
            if fault=='epoch':configured['receipt']['owner']['ui_epoch']+=1
            if fault=='deadline':configured['deadline']+=1
            if fault=='source':configured['receipt']['effective_source']['source_sha256']='0'*64
            if fault=='kind':admitted['receipt']['kind']='existing'
            if fault=='missing':native.remove(configured)
            if fault=='order':native.remove(configured);native.insert(native.index(admitted),configured)
            if fault=='dispatch':next(r for r in native if r.get('phase')=='javascript_source_mutation_dispatch')['receipt']['intent']='preserve'
            with self.subTest(fault=fault):self.assertFalse(self.configuration(native)['passed'])

    def test_input_execution_does_not_certify_preview_numbers(self):
        proof=verify_delivered_import_source_execution(self.native,self.imported,self.data,self.__class__.delivery,self.runtime)
        self.assertTrue(proof['passed'],proof)
        self.assertIs(proof['output_data_verified'],False)
        strict=verify_delivered_import_output(self.native,self.imported,self.data,self.__class__.delivery,self.runtime)
        self.assertFalse(strict['passed'],strict)
        self.assertIn('one_format_and_filter_apply_required',strict['failures'])
        self.assertFalse(verify_text_import_execution(self.native,self.imported,self.data)['passed'])

    def test_input_bytes_process_and_discovery_faults_refuse(self):
        for fault in ('bytes','scrolls','move','runtime','execution','source_path'):
            native=copy.deepcopy(self.native);data=self.data
            trace=next(r['outcome']['trace'] for r in native if r.get('phase')=='download_completed')
            if fault=='bytes':data+=b'\n'
            if fault=='scrolls':next(r for r in trace if r.get('event')=='artifact_file_discovered')['scrolls']-=1
            if fault=='move':next(r for r in trace if r.get('event')=='artifact_discovery_scroll')['to']+=1
            if fault=='runtime':native[0]['runtime_revision']='foreign'
            if fault=='execution':next(r for r in native if r.get('phase')=='node_checkpoint' and r.get('operation_id')==self.imported['operation_id'])['result']['execution']['execution_id']='foreign'
            if fault=='source_path':next(r for r in native if r.get('phase')=='artifact_delivery_completed')['result']['destination']='/foreign/sales.csv'
            proof=verify_delivered_import_source_execution(native,self.imported,data,self.__class__.delivery,self.runtime)
            with self.subTest(fault=fault):self.assertFalse(proof['passed'],proof)

    def test_private_upload_time_binds_to_public_delivery(self):
        bound_native_intervals(self.events,self.native,[self.upload])
        native=copy.deepcopy(self.native)
        next(r for r in native if r.get('operation_id')==self.upload)['recorded_at']='1970-01-01T00:00:00.000Z'
        with self.assertRaisesRegex(ValueError,'work_outside_public_operation'):bound_native_intervals(self.events,native,[self.upload])
        for fault in ('missing','foreign','tool'):
            events=copy.deepcopy(self.events)
            for event in events:
                part=event.get('part',{})
                if part.get('tool') not in ('loginom_dock_artifact_deliver','loginom_dock_artifact_delivery_status'):continue
                if fault=='tool':part['tool']='loginom_unrelated'
                else:
                    result=json.loads(part['state']['output'])
                    if result.get('output',{}).get('upload_operation_id')!=self.upload:continue
                    if fault=='missing':result['output'].pop('upload_operation_id')
                    if fault=='foreign':result['output']['upload_operation_id']='foreign'
                    part['state']['output']=json.dumps(result)
            with self.subTest(fault=fault):
                with self.assertRaisesRegex(ValueError,'time_binding_missing'):bound_native_intervals(events,self.native,[self.upload])


if __name__=='__main__':unittest.main()
