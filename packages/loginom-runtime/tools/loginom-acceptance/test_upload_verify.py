import copy
import unittest
import test_upload_probe as probe_test
import upload_verify
from audit import PREFIX,MUTATIONS,file_storage_inspect

class UploadVerifyTest(unittest.TestCase):
    def refused_ui_fixture(self):
        data,request=self.fixture()
        for record in data['calls']+data['tools']:
            if record['row']>=11:record['row']+=2
        source=next(t['result'] for t in data['tools'] if t.get('tool_call_id')=='upload')
        original=next(e for e in data['events'] if e.get('operation_id')=='up' and e.get('phase')=='completed')
        original.update(session_id='native-session',recorded_at='2026-09-06T10:00:00Z')
        args={'operation_id':'blocked-scroll','observation_id':'file-obs','action':{'verb':'scroll','ref':'owner','delta_y':1000}}
        call={'row':10,'session_id':'s','tool_call_id':'blocked','tool':PREFIX+'dock_ui_action','arguments':args}
        result={'status':'FAILED','action_key':'request.validate','action_revision':'1','operation_id':None,
            'phase':'request_rejected','effect_possible':False,'cleanup_complete':True,'request_rejected':True,'trace':[],
            'error':{'code':'REQUEST_REJECTED','message':'Upload is pending'},
            'output':{'request_refusal':{'operation_id':'blocked-scroll','pending_operation_id':'up',
                'reason':'upload_pending','browser_invoked':False},'operation':{'operation_id':'up','state':'pending',
                'cleanup_confirmed':True,'effect_state':'partial_or_unverified','outcome':copy.deepcopy(source)}}}
        data['calls'].append(call);data['tools'].append({**call,'row':11,'result':result})
        data['events'].append({'session_id':'native-session','recorded_at':'2026-09-06T10:00:01Z',
            'operation_id':'blocked-scroll','phase':'ui_request_rejected','action_key':'request.validate',
            'pending_operation_id':'up','parameters':{'action':copy.deepcopy(args['action']),
                'observation_id':'file-obs','recovery_operation_id':None},'outcome':copy.deepcopy(result)})
        data['events'].append({'session_id':'native-session','recorded_at':'2026-09-06T10:00:02Z',
            'operation_id':'verify','phase':'download_prepared'})
        return data,request

    def test_only_persisted_pending_upload_guard_refusal_is_not_a_mutation(self):
        data,request=self.refused_ui_fixture()
        report=upload_verify.audit(data,[],request,PREFIX,MUTATIONS,file_storage_inspect)
        self.assertTrue(report['all_assertions_passed'],report)

    def test_guard_refusal_requires_unique_pair_event_and_upload_context(self):
        for mode in ('old_ambiguous','unsigned','duplicate_reply','duplicate_event','replay','parameters','pending_id',
                     'native_session','caller_session','time','late_time','overlap','source','invoked','effect','preupload'):
            with self.subTest(mode=mode):
                data,request=self.refused_ui_fixture()
                call=next(c for c in data['calls'] if c['tool_call_id']=='blocked')
                reply=next(t for t in data['tools'] if t['tool_call_id']=='blocked')
                event=next(e for e in data['events'] if e.get('phase')=='ui_request_rejected')
                if mode=='old_ambiguous':
                    for r in (reply['result'],event['outcome']):r.update(status='AMBIGUOUS',effect_possible=True,operation_id='up',action_key='artifact.upload')
                if mode=='unsigned':data['events'].remove(event)
                if mode=='duplicate_reply':data['tools'].append(copy.deepcopy(reply))
                if mode=='duplicate_event':data['events'].append(copy.deepcopy(event))
                if mode=='replay':data['calls'].append({**copy.deepcopy(call),'tool_call_id':'replay','row':12})
                if mode=='parameters':event['parameters']['action']['delta_y']=999
                if mode=='pending_id':event['pending_operation_id']='foreign'
                if mode=='native_session':event['session_id']='foreign'
                if mode=='caller_session':call['session_id']=reply['session_id']='foreign'
                if mode=='time':event['recorded_at']='2026-09-06T09:59:59Z'
                if mode=='late_time':event['recorded_at']='2026-09-06T10:00:03Z'
                if mode=='overlap':data['calls'].append({'row':10,'session_id':'s','tool_call_id':'other','tool':PREFIX+'dock_ui_action','arguments':{}})
                if mode=='preupload':call['row']=4;reply['row']=5
                for r in (reply['result'],event['outcome']):
                    if mode=='source':r['output']['operation']['outcome']['output']['destination']='/foreign'
                    if mode=='invoked':r['output']['request_refusal']['browser_invoked']=True
                    if mode=='effect':r['effect_possible']=True
                self.assertFalse(upload_verify.pending_upload_ui_refusal(call,data,PREFIX))
                self.assertFalse(upload_verify.audit(data,[],request,PREFIX,MUTATIONS,file_storage_inspect)['all_assertions_passed'])

    def revealed_fixture(self):
        data,request=self.fixture()
        read=next(t['result'] for t in data['tools'] if t.get('tool_call_id')=='file-read')
        state=read['output'];file=state['ui']['elements'][0]
        state.update(origin='https://loginom.invalid',loginom_build='7.5',active_tab_ref='tab',package_identity={'name':'p'},
                     dom_epoch={'document':'doc','revision':1},file_storage={'directory':'/test'})
        file.update(interaction={'state':'outside_viewport'},scroll={'ref':'owner','top':0,'max_top':50})
        raw=copy.deepcopy(read);raw['output'].pop('operation')
        next(e for e in data['events'] if e.get('operation_id')=='file-read')['outcome']=raw
        trace=[{'event':'download_file_revealed','applied':True,'file_ref':'ui-file','owner_ref':'owner',
                'from':0,'to':50,'max_top':50,'delta':50,'document':'doc'},
               {'event':'download_reveal_confirmed','file_ref':'ui-file','owner_ref':'owner','document':'doc',
                'interaction':'point_observed','file_tid':file['tid'],
                **{k:state[k] for k in ('origin','loginom_build','workflow_ref','active_tab_ref','package_identity')},'directory':'/test'},
               {'event':'download_gesture_result','status':'SUCCEEDED','effect_possible':True,'cleanup_complete':True,'error_code':None}]
        for e in data['events']:
            if e.get('operation_id')=='verify':e['outcome']['trace']=copy.deepcopy(trace)
        next(t for t in data['tools'] if t.get('tool_call_id')=='verify')['result']['trace']=copy.deepcopy(trace)
        return data,request

    def test_single_native_reveal_bound_to_original_file_and_byte_receipts(self):
        data,request=self.revealed_fixture()
        report=upload_verify.audit(data,[],request,PREFIX,MUTATIONS,file_storage_inspect)
        self.assertTrue(report['all_assertions_passed'],report)

    def test_only_declared_reveal_origin_allows_redaction_trailing_slash(self):
        data,request=self.revealed_fixture()
        for event in data['events']:
            if event.get('operation_id')=='verify':event['outcome']['trace'][1]['origin']+='/'
        self.assertTrue(upload_verify.audit(data,[],request,PREFIX,MUTATIONS,file_storage_inspect)['all_assertions_passed'])
        for value in ('https://foreign.invalid/','https://loginom.invalid/path','https://loginom.invalid/?q=1'):
            bad=copy.deepcopy(data)
            next(e for e in bad['events'] if e.get('phase')=='download_completed')['outcome']['trace'][1]['origin']=value
            self.assertFalse(upload_verify.audit(bad,[],request,PREFIX,MUTATIONS,file_storage_inspect)['all_assertions_passed'])
        for location in ('output','other_event'):
            a={'output':{'origin':'https://loginom.invalid'},'trace':[{'event':'other','origin':'https://loginom.invalid'}]}
            b=copy.deepcopy(a)
            (b['output'] if location=='output' else b['trace'][0])['origin']+='/'
            self.assertFalse(upload_verify.reveal_receipt_equal(a,b),location)

    def test_reveal_rejects_tampered_bounds_context_effect_order_and_missing_trace(self):
        for mode in ('missing','duplicate','owner','file','document','tab','directory','delta','to','effect','order','gesture','extra','nan'):
            with self.subTest(mode=mode):
                data,request=self.revealed_fixture()
                outcomes=[e['outcome'] for e in data['events'] if e.get('operation_id')=='verify']
                outcomes.append(next(t for t in data['tools'] if t.get('tool_call_id')=='verify')['result'])
                for outcome in outcomes:
                    trace=outcome['trace']
                    if mode=='missing':trace.clear();continue
                    if mode=='duplicate':trace.insert(0,copy.deepcopy(trace[0]));continue
                    if mode=='owner':trace[0]['owner_ref']='other'
                    if mode=='file':trace[0]['file_ref']='other'
                    if mode=='document':trace[1]['document']='other'
                    if mode=='tab':trace[1]['active_tab_ref']='other'
                    if mode=='directory':trace[1]['directory']='/other'
                    if mode=='delta':trace[0]['delta']=1001
                    if mode=='to':trace[0]['to']=49
                    if mode=='effect':trace[0]['applied']=False
                    if mode=='order':trace.reverse()
                    if mode=='gesture':trace[-1]['effect_possible']=False
                    if mode=='extra':trace[0]['unknown']=True
                    if mode=='nan':trace[0]['from']=float('nan')
                report=upload_verify.audit(data,[],request,PREFIX,MUTATIONS,file_storage_inspect)
                self.assertFalse(next(c['passed'] for c in report['assertions'] if c['name']=='download_reveal_bound_to_issued_file'))

    def fixture(self):
        data,request=probe_test.UploadProbeTest().fixture()
        artifact=data['tools'][0]['result']['input_artifacts'][0]
        inspection=data['tools'][-1]['result']['output']
        inspection.update(cleanup_confirmed=True,effect_state='partial_or_unverified',next_steps=[])
        context={k:inspection[k] for k in ('operation_id','state','cleanup_confirmed','effect_state','recovery_options','next_steps')}
        original=inspection['outcome'];original.update(action_key='artifact.upload')
        # Keep fixture upload receipt and original inspection identical.
        data['tools'][-2]['result']['action_key']='artifact.upload';data['events'][-1]['outcome']['action_key']='artifact.upload'
        context['outcome_summary']={'status':'AMBIGUOUS','action_key':'artifact.upload','operation_id':'up','detail_tool':'dock_operation_inspect'}
        file={'ref':'ui-file','label':artifact['name'],'tid':'MF;TF-2;FileStorageForm;colName_'+artifact['name'],'allowed_actions':['double_click']}
        read={'status':'SUCCEEDED','operation_id':'file-read','output':{'observation_id':'file-obs','workflow_ref':{'prefix':'MF;TF-2'},'ui':{'elements':[file]},'operation':context}}
        raw=copy.deepcopy(read);raw['output'].pop('operation')
        data['tools'].append({'session_id':'s','tool_call_id':'file-read','tool':PREFIX+'dock_workspace_observe','row':11,'result':read})
        data['events'].append({'phase':'observation_completed','operation_id':'file-read','outcome':raw})
        args={'operation_id':'up','verification_id':'verify','observation_id':'file-obs','file_ref':'ui-file'}
        call={'session_id':'s','tool_call_id':'verify','tool':PREFIX+'dock_artifact_verify','row':12,'arguments':args}
        data['calls'].append(call)
        output={'artifact_id':'a','upload_grant_id':'g','upload_operation_id':'up','destination':artifact['upload']['destination'],
                'suggested_name':artifact['name'],'download_completed':True,'bytes_verification_required':True,'file_ref':'ui-file','observation_id':'file-obs'}
        native={'status':'SUCCEEDED','action_key':'artifact.download','action_revision':'1','operation_id':'verify',
                'phase':'downloaded','cleanup_complete':True,'effect_possible':True,'error':None,'output':output}
        result={**copy.deepcopy(native),'action_key':'artifact.verify','phase':'verified',
                'output':{**output,'bytes_verification_required':False,'bytes_verified':True,'bytes':230,'sha256':artifact['sha256'],'upload_completion_verified':True}}
        data['tools'].append({**call,'row':13,'result':result})
        data['events'].extend([{'phase':'download_completed','operation_id':'verify','outcome':native},
                              {'phase':'download_verified','operation_id':'verify','outcome':{**copy.deepcopy(result),'output':{**result['output'],'upload_completion_verified':False}},
                               'parameters':{'upload_operation_id':'up','observation_id':'file-obs','file_ref':'ui-file'},'checkpoint':{'artifact':artifact}}])
        after=copy.deepcopy(inspection)
        after['outcome']['output']['server_copy_verification']={'verification_id':'verify','status':'SUCCEEDED','bytes_verified':True,
            'upload_completion_verified':True,'destination':artifact['upload']['destination'],'bytes':230,'sha256':artifact['sha256']}
        after['state']='resolved'
        after['outcome'].update(status='SUCCEEDED',error=None,cleanup_complete=True)
        after['outcome']['output'].update(verification_required=False,transfer_postcondition='destination_bytes_digest_and_size')
        data['events'].extend([{'phase':'transfer_completed','operation_id':'up','outcome':copy.deepcopy(after['outcome'])},
                               {'phase':'verification_completed','operation_id':'verify','outcome':copy.deepcopy(result)}])
        data['tools'].append({'session_id':'s','tool_call_id':'after','tool':PREFIX+'dock_operation_inspect','row':15,'result':{'output':after}})
        return data,request

    def test_same_session_bound_byte_proof(self):
        data,request=self.fixture()
        report=upload_verify.audit(data,[],request,PREFIX,MUTATIONS,file_storage_inspect)
        self.assertTrue(report['all_assertions_passed'],report)

    def test_rejects_wrong_bytes_file_receipt_context_or_completion_claim(self):
        for change in [lambda d:d['tools'][-2]['result']['output'].update(sha256='0'*64),
                       lambda d:d['tools'][-3]['result']['output']['ui']['elements'][0].update(label='other.csv'),
                       lambda d:next(e for e in d['events'] if e['phase']=='download_completed')['outcome']['output'].update(destination='/other'),
                       lambda d:next(e for e in d['events'] if e['phase']=='download_verified')['checkpoint'].update(artifact={}),
                       lambda d:d['tools'][-3]['result']['output']['operation'].update(state='resolved'),
                       lambda d:d['tools'][-1]['result']['output'].update(state='pending'),
                       lambda d:d['calls'].append({**d['calls'][-1],'row':20,'tool_call_id':'repeat'})]:
            data,request=self.fixture();change(data)
            self.assertFalse(upload_verify.audit(data,[],request,PREFIX,MUTATIONS,file_storage_inspect)['all_assertions_passed'])

    def test_verification_binds_target_page_among_other_pages_of_same_observation(self):
        data,request=self.fixture()
        read=next(t for t in data['tools'] if t.get('tool_call_id')=='file-read')
        other=copy.deepcopy(read);other['tool_call_id']='earlier-page';other['row']=10
        other['result']['operation_id']='earlier-page';other['result']['output']['ui']['elements']=[]
        data['tools'].insert(data['tools'].index(read),other)
        self.assertTrue(upload_verify.audit(data,[],request,PREFIX,MUTATIONS,file_storage_inspect)['all_assertions_passed'])
        for change in ('duplicate','other_session','tamper'):
            altered=copy.deepcopy(data)
            selected=next(t for t in altered['tools'] if t.get('tool_call_id')=='file-read')
            if change=='duplicate':altered['tools'].append(copy.deepcopy(selected))
            if change=='other_session':selected['session_id']='other'
            if change=='tamper':selected['result']['output']['ui']['elements'][0]['label']='other.csv'
            self.assertFalse(upload_verify.audit(altered,[],request,PREFIX,MUTATIONS,file_storage_inspect)['all_assertions_passed'],change)
