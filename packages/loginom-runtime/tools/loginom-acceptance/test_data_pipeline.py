import copy
import unittest
from pathlib import Path
import data_pipeline
import hashlib
import json
import test_import_roundtrip_evidence as import_roundtrip_tests
import test_import_settings_evidence as import_settings_tests
from test_upload_verify import UploadVerifyTest
from audit import PREFIX, MUTATIONS, file_storage_inspect, rejected_before_browser


class DataPipelineTest(unittest.TestCase):
    def wizard_fixture(self):
        evidence,request=UploadVerifyTest().fixture()
        expected_path=Path(data_pipeline.__file__).with_name('fixtures')/'data-pipeline'/'expected.json'
        request['harness_inputs']['fixtures/data-pipeline/expected.json']=hashlib.sha256(expected_path.read_bytes()).hexdigest()
        imported=import_roundtrip_tests.fixture()
        settings=import_settings_tests.ImportSettingsEvidenceTests()
        for index in (1,7):
            for out in (imported['tools'][index]['result'],imported['events'][index]['outcome']):
                out['output']['wizard']['import_columns']=copy.deepcopy(settings.configured_snapshot()['wizard']['import_columns'])
        for index in (2,8):
            for out in (imported['tools'][index]['result'],imported['events'][index]['outcome']):
                out['output']['wizard']['output_columns']=copy.deepcopy(settings.configured_mapping_snapshot()['wizard']['output_columns'])
        destination=data_pipeline.declared_source_path(request)
        for out in [t['result'] for t in imported['tools']]+[e['outcome'] for e in imported['events']]:
            field=out['output'].get('wizard',{}).get('import_source',{}).get('fields',{}).get('source_path')
            if field:field.update(value=destination,value_length_utf16=len(destination))
        context=imported['tools'][0]['result']['output']
        for out in (next(t for t in evidence['tools'] if t['tool_call_id']=='file-read')['result'],
                    next(e for e in evidence['events'] if e['operation_id']=='file-read')['outcome']):
            for key in ('origin','loginom_build','dom_epoch','authenticated'):out['output'][key]=copy.deepcopy(context[key])
        next(t for t in evidence['tools'] if t['tool_call_id']=='after')['result'].update(status='SUCCEEDED',action_key='operation.inspect')
        evidence['calls'].extend([
            {'session_id':'s','tool_call_id':'file-read','tool':PREFIX+'dock_workspace_observe','row':10,'arguments':{}},
            {'session_id':'s','tool_call_id':'after','tool':PREFIX+'dock_operation_inspect','row':14,'arguments':{'operation_id':'up'}}])
        for record in imported['calls']+imported['tools']:
            record['row']+=20;record['tool']=PREFIX+record['tool'];record['tool_call_id']='import-'+record['tool_call_id']
        for key in ('calls','tools','events'):evidence[key].extend(imported[key])
        return evidence,request

    def test_bound_fixture_import_readback_passes_only_its_gate(self):
        evidence,request=self.wizard_fixture()
        report=data_pipeline.audit(evidence,[],request,PREFIX,MUTATIONS,file_storage_inspect,rejected_before_browser)
        self.assertTrue(report['transfer_verified'],report)
        proof=report['wizard_settings_readback_diagnostics']
        self.assertTrue(proof['wizard_settings_readback'],proof)
        self.assertFalse(proof['source_identity_verified']);self.assertFalse(proof['package_persistence_verified'])
        self.assertEqual(report['missing_domain_verifiers'],list(data_pipeline.DOMAIN_GATES[2:]))
        self.assertFalse(report['all_assertions_passed'])

    def test_wizard_gate_rejects_unbound_or_incomplete_roundtrip(self):
        modes=('foreign_session','foreign_document','foreign_origin','foreign_build','before_verify','before_inspect',
               'duplicate_inspect','duplicate_verify','duplicate_upload','duplicate_source','wrong_destination','wrong_sha',
               'expected_hash','csv_hash','partial_schema','partial_mapping','auto_sync','other_owner','missing_file_call',
               'failed_inspect','wrong_inspect_action','unauthenticated_file')
        for mode in modes:
            with self.subTest(mode=mode):
                evidence,request=self.wizard_fixture()
                call=lambda name:next(c for c in evidence['calls'] if c['tool_call_id']==name)
                tool=lambda name:next(t for t in evidence['tools'] if t['tool_call_id']==name)
                def both(index,fn):
                    result=tool('import-'+str(index))['result'];fn(result['output'])
                    next(e for e in evidence['events'] if e['operation_id']==result['operation_id'])['outcome']=copy.deepcopy(result)
                if mode=='foreign_session':
                    for r in evidence['calls']+evidence['tools']:
                        if r['tool_call_id'].startswith('import-'):r['session_id']='foreign'
                if mode in ('foreign_document','foreign_origin','foreign_build'):
                    for index in range(9):
                        if mode=='foreign_document':both(index,lambda s:s['dom_epoch'].update(document='foreign'))
                        else:both(index,lambda s:s.update({('origin' if mode=='foreign_origin' else 'loginom_build'):'foreign'}))
                if mode=='before_verify':call('import-0')['row']=12
                if mode=='before_inspect':call('import-0')['row']=15
                if mode.startswith('duplicate_'):
                    name={'duplicate_inspect':'after','duplicate_verify':'verify','duplicate_upload':'upload','duplicate_source':'import-0'}[mode]
                    evidence['tools'].append(copy.deepcopy(tool(name)))
                if mode=='wrong_destination':tool('verify')['result']['output']['destination']='/other/'+request['input_artifact']['name']
                if mode=='wrong_sha':tool('verify')['result']['output']['sha256']='0'*64
                if mode=='expected_hash':request['harness_inputs']['fixtures/data-pipeline/expected.json']='0'*64
                if mode=='csv_hash':request['harness_inputs'][data_pipeline.upload_probe.FIXTURE]='0'*64
                if mode=='partial_schema':both(7,lambda s:s['wizard']['import_columns']['definition_coverage'].update(status='partial'))
                if mode=='partial_mapping':both(8,lambda s:s['wizard']['output_columns']['definition_coverage'].update(status='partial'))
                if mode=='auto_sync':both(8,lambda s:s['wizard']['output_columns']['auto_sync'].update(value=True))
                if mode=='other_owner':both(8,lambda s:s['wizard']['owner_context']['node'].update(label='Other'))
                if mode=='missing_file_call':evidence['calls'].remove(call('file-read'))
                if mode=='failed_inspect':tool('after')['result']['status']='FAILED'
                if mode=='wrong_inspect_action':tool('after')['result']['action_key']='other'
                if mode=='unauthenticated_file':
                    tool('file-read')['result']['output']['authenticated']=False
                    next(e for e in evidence['events'] if e['operation_id']=='file-read')['outcome']['output']['authenticated']=False
                report=data_pipeline.audit(evidence,[],request,PREFIX,MUTATIONS,file_storage_inspect,rejected_before_browser)
                self.assertFalse(report['wizard_settings_readback_diagnostics']['wizard_settings_readback'],report)

    def test_fixture_requires_declared_header_order(self):
        _,request=self.wizard_fixture()
        expected=json.loads((Path(data_pipeline.__file__).with_name('fixtures')/'data-pipeline'/'expected.json').read_text())
        self.assertTrue(data_pipeline.fixture_schema(request,expected))
        expected['schema'][0],expected['schema'][1]=expected['schema'][1],expected['schema'][0]
        self.assertFalse(data_pipeline.fixture_schema(request,expected))

    def same_id_refusal_fixture(self):
        evidence,request=UploadVerifyTest().fixture()
        for record in evidence['calls']+evidence['tools']:record['row']+=10
        upload=next(c for c in evidence['calls'] if c['tool']==PREFIX+'dock_artifact_upload')
        operation_id=upload['arguments']['operation_id']
        idle={'state':'idle','operation_id':None,'cleanup_confirmed':True,'effect_state':'none'}
        rejected={'session_id':'s','tool_call_id':'refused','tool':upload['tool'],'row':1,
                  'arguments':{'operation_id':operation_id}}
        rejection={'status':'FAILED','phase':'request_rejected','action_key':'request.validate',
                   'operation_id':None,'request_rejected':True,'effect_possible':False,'trace':[],
                   'error':{'code':'REQUEST_REJECTED'},'output':{'operation':idle}}
        evidence['calls'].append(rejected);evidence['tools'].append({**rejected,'row':2,'result':rejection})
        observe={'session_id':'s','tool_call_id':'boundary','tool':PREFIX+'dock_workspace_observe','row':3,'arguments':{}}
        raw={'status':'SUCCEEDED','operation_id':'boundary-read','output':{'observation_id':'boundary-obs'}}
        evidence['calls'].append(observe)
        delivered=copy.deepcopy(raw);delivered['output']['operation']=copy.deepcopy(idle)
        evidence['tools'].append({**observe,'row':4,'result':delivered})
        for event in evidence['events']:
            if event.get('operation_id')==operation_id:
                event.update(session_id='journal-session',recorded_at='2026-09-06T09:00:02Z')
        evidence['events'].append({'phase':'observation_completed','operation_id':'boundary-read',
                                   'session_id':'journal-session','recorded_at':'2026-09-06T09:00:01Z','outcome':raw})
        return evidence,request,rejected

    def test_rejected_id_can_be_used_by_one_later_bound_upload(self):
        evidence,request,call=self.same_id_refusal_fixture()
        self.assertTrue(rejected_before_browser(call,evidence))
        report=data_pipeline.audit(evidence,[],request,PREFIX,MUTATIONS,file_storage_inspect,rejected_before_browser)
        self.assertEqual(report['pre_action_rejections'],1)
        self.assertTrue(next(c['passed'] for c in report['assertions'] if c['name']=='pipeline_exactly_one_upload_and_verify'))
        self.assertFalse(report['all_assertions_passed'])

    def multiple_refusals_fixture(self, count=2):
        evidence,request,first=self.same_id_refusal_fixture()
        reply=copy.deepcopy(next(t for t in evidence['tools'] if t['tool_call_id']==first['tool_call_id']))
        for record in evidence['calls']+evidence['tools']:
            if record['row']>=3:record['row']+=2*(count-1)
        refusals=[first]
        for i in range(1,count):
            call={**copy.deepcopy(first),'row':1+2*i,'tool_call_id':'refused-'+str(i)}
            evidence['calls'].append(call);refusals.append(call)
            evidence['tools'].append({**copy.deepcopy(reply),'tool_call_id':call['tool_call_id'],'row':call['row']+1})
        return evidence,request,refusals

    def test_multiple_proven_refusals_before_one_upload(self):
        for count in (2,4):
            evidence,request,calls=self.multiple_refusals_fixture(count)
            self.assertTrue(all(rejected_before_browser(call,evidence) for call in calls))
            report=data_pipeline.audit(evidence,[],request,PREFIX,MUTATIONS,file_storage_inspect,rejected_before_browser)
            self.assertEqual(report['pre_action_rejections'],count)
            self.assertTrue(next(c['passed'] for c in report['assertions'] if c['name']=='pipeline_exactly_one_upload_and_verify'))
            self.assertFalse(report['all_assertions_passed'])

    def test_multiple_refusals_do_not_hide_second_effect_or_uncertain_attempt(self):
        for mode in ('second_actual','pending','possible_effect','duplicate_call','duplicate_reply','foreign',
                     'overlap','boundary_before_last_refusal','wrong_tool','unknown_error'):
            with self.subTest(mode=mode):
                evidence,_,calls=self.multiple_refusals_fixture()
                middle=next(t for t in evidence['tools'] if t['tool_call_id']==calls[1]['tool_call_id'])
                if mode=='second_actual':middle['result']=copy.deepcopy(next(t['result'] for t in evidence['tools'] if t['tool']==PREFIX+'dock_artifact_upload' and t['row']>10))
                if mode=='pending':middle['result']['output']['operation']['state']='pending'
                if mode=='possible_effect':middle['result']['effect_possible']=True
                if mode=='duplicate_call':evidence['calls'].append(copy.deepcopy(calls[1]))
                if mode=='duplicate_reply':evidence['tools'].append(copy.deepcopy(middle))
                if mode=='foreign':calls[1]['session_id']='foreign';middle['session_id']='foreign'
                if mode=='overlap':calls[1]['row']=2
                if mode=='boundary_before_last_refusal':
                    next(c for c in evidence['calls'] if c['tool_call_id']=='boundary')['row']=2
                    next(t for t in evidence['tools'] if t['tool_call_id']=='boundary')['row']=3
                if mode=='wrong_tool':middle['tool']=PREFIX+'dock_ui_action'
                if mode=='unknown_error':middle['result']['error']=None
                self.assertFalse(rejected_before_browser(calls[0],evidence))

    def test_same_id_exception_requires_new_idle_boundary_and_unique_effect(self):
        for mode in ('prior_event','missing_timestamp','foreign_journal','missing_boundary','pending_boundary',
                     'duplicate_reply','duplicate_effect','changed_journal','overlap','foreign_retry','possible_effect'):
            with self.subTest(mode=mode):
                evidence,_,call=self.same_id_refusal_fixture()
                event=next(e for e in evidence['events'] if e.get('operation_id')=='up')
                upload=next(c for c in evidence['calls'] if c['tool']==PREFIX+'dock_artifact_upload' and c['row']>2)
                if mode=='prior_event':event['recorded_at']='2026-09-06T09:00:00Z'
                if mode=='missing_timestamp':event.pop('recorded_at')
                if mode=='foreign_journal':event['session_id']='foreign'
                if mode=='missing_boundary':evidence['events']=[e for e in evidence['events'] if e.get('operation_id')!='boundary-read']
                if mode=='pending_boundary':next(t for t in evidence['tools'] if t['tool_call_id']=='boundary')['result']['output']['operation']['state']='pending'
                if mode=='duplicate_reply':evidence['tools'].append(copy.deepcopy(next(t for t in evidence['tools'] if t['tool_call_id']==upload['tool_call_id'])))
                if mode=='duplicate_effect':evidence['calls'].append({**copy.deepcopy(upload),'row':100,'tool_call_id':'another'})
                if mode=='changed_journal':next(e for e in evidence['events'] if e.get('operation_id')=='up' and e.get('phase')=='completed')['outcome']['status']='FAILED'
                if mode=='overlap':upload['row']=4
                if mode=='foreign_retry':upload['session_id']='foreign'
                if mode=='possible_effect':next(t for t in evidence['tools'] if t['tool_call_id']=='refused')['result']['effect_possible']=True
                self.assertFalse(rejected_before_browser(call,evidence))

    def test_transfer_prefix_survives_later_pipeline_mutations_but_never_admits_domain(self):
        evidence,request=UploadVerifyTest().fixture()
        evidence['calls'].append({'session_id':'s','tool_call_id':'later','tool':PREFIX+'dock_ui_action','row':20,'arguments':{}})
        report=data_pipeline.audit(evidence,[],request,PREFIX,MUTATIONS,file_storage_inspect,rejected_before_browser)
        self.assertTrue(report['transfer_verified'],report)
        self.assertFalse(report['all_assertions_passed'])
        self.assertEqual(report['missing_domain_verifiers'],list(data_pipeline.DOMAIN_GATES[2:]))

    def test_mutation_before_resolved_inspection_does_not_prove_transfer(self):
        evidence,request=UploadVerifyTest().fixture()
        evidence['calls'].append({'session_id':'s','tool_call_id':'early','tool':PREFIX+'dock_ui_action','row':14,'arguments':{}})
        report=data_pipeline.audit(evidence,[],request,PREFIX,MUTATIONS,file_storage_inspect,rejected_before_browser)
        self.assertFalse(report['transfer_verified'])
        self.assertFalse(report['all_assertions_passed'])

    def test_repeated_upload_or_forged_domain_summary_never_passes(self):
        evidence,request=UploadVerifyTest().fixture()
        call=next(c for c in evidence['calls'] if c['tool']==PREFIX+'dock_artifact_upload')
        evidence['calls'].append({**copy.deepcopy(call),'row':20})
        evidence['domain_proof']={gate:True for gate in data_pipeline.DOMAIN_GATES}
        report=data_pipeline.audit(evidence,[],request,PREFIX,MUTATIONS,file_storage_inspect,rejected_before_browser)
        self.assertFalse(report['transfer_verified']);self.assertFalse(report['all_assertions_passed'])

    def test_prompt_embeds_full_pinned_task_and_explicit_destination(self):
        template=Path(data_pipeline.__file__).with_name('goals').joinpath('data-pipeline.txt').read_text()
        prompt=data_pipeline.prompt(template,'/analyst/packages/new.lgp','/analyst','20260905-120000-1234abcd')
        self.assertNotIn('__',prompt)
        for text in ('Quantity','UnitPrice','RowCount','null','повторно','/analyst/packages/new.lgp','Dock-upload-20260905-120000-1234abcd.csv'):
            self.assertIn(text,prompt)


    def test_proven_grant_refusal_allows_a_corrected_request_only_without_effects(self):
        for effect in (False,True):
            evidence,request=UploadVerifyTest().fixture()
            call={'session_id':'s','tool_call_id':'typo','tool':PREFIX+'dock_artifact_upload','row':1,
                  'arguments':{'operation_id':'rejected-upload'}}
            result={'status':'FAILED','action_key':'request.validate','phase':'request_rejected','operation_id':None,
                    'request_rejected':True,'effect_possible':effect,'trace':[],'error':{'code':'REQUEST_REJECTED'},
                    'output':{'operation':{'state':'idle','cleanup_confirmed':True,'effect_state':'none'}}}
            evidence['calls'].append(call);evidence['tools'].append({**call,'row':2,'result':result})
            report=data_pipeline.audit(evidence,[],request,PREFIX,MUTATIONS,file_storage_inspect,rejected_before_browser)
            self.assertEqual(report['pre_action_rejections'],0 if effect else 1)
            self.assertEqual(report['transfer_verified'],not effect)
            self.assertFalse(report['all_assertions_passed'])

    def test_source_path_comes_only_from_pinned_request(self):
        _, request = UploadVerifyTest().fixture()
        path = data_pipeline.declared_source_path(request)
        self.assertEqual(path, request['storage_directory']+'/'+request['input_artifact']['name'])
        for mutate in (
            lambda r: r['input_artifact'].update(name='other.csv'),
            lambda r: r['harness_inputs'].update({data_pipeline.upload_probe.FIXTURE:'forged'}),
            lambda r: r.update(storage_directory='/../test'),
            lambda r: r.update(run_id='foreign'),
        ):
            changed=copy.deepcopy(request);mutate(changed)
            self.assertIsNone(data_pipeline.declared_source_path(changed))
        self.assertIsNone(data_pipeline.declared_source_path({}))

    def test_partial_goals_pin_upload_and_never_claim_full_p3(self):
        for goal in ('import-roundtrip','calculator-roundtrip'):
            template=Path(data_pipeline.__file__).with_name('goals').joinpath(goal+'.txt').read_text()
            prompt=data_pipeline.upload_probe.prompt(template,'/analyst/packages/a.lgp','/analyst','20260905-120000-1234abcd')
            self.assertNotIn('__',prompt)
            self.assertIn('/analyst/Dock-upload-20260905-120000-1234abcd.csv',prompt)
            evidence,request=UploadVerifyTest().fixture();request['goal_id']=goal
            report=data_pipeline.audit(evidence,[],request,PREFIX,MUTATIONS,file_storage_inspect,rejected_before_browser)
            self.assertEqual(report['goal'],goal)
            self.assertFalse(report['all_assertions_passed'])
            self.assertEqual(report['missing_domain_verifiers'],list(data_pipeline.DOMAIN_GATES[2:]))
