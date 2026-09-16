import copy
import unittest
from pathlib import Path
import upload_probe
from audit import PREFIX, MUTATIONS, file_storage_inspect
import test_file_storage_inspect as storage_test

class UploadProbeTest(unittest.TestCase):
    def fixture(self):
        data=storage_test.FileStorageInspectTest().fixture()
        request={'run_id':'20260905-230000-1234abcd','storage_directory':'/analyst/data',
                 'harness_inputs':{upload_probe.FIXTURE:upload_probe.FIXTURE_SHA}}
        expected=upload_probe.descriptor(request['run_id'],request['storage_directory'])
        request['input_artifact']=expected
        artifact={**copy.deepcopy(expected),'artifact_id':'a'}
        artifact['upload'].update(grant_id='g',destination='/analyst/data/'+expected['name'])
        data['tools'].insert(0,{'session_id':'s','tool_call_id':'prepare','tool':PREFIX+'dock_prepare','row':0,
                               'result':{'prepared':True,'sessionId':'native-session','workspace':{'created_draft':True},'input_artifacts':[artifact]}})
        data['calls'].insert(0,{'session_id':'s','tool_call_id':'prepare','tool':PREFIX+'dock_prepare','row':-1,'arguments':{}})
        data['events'].insert(0,{'event':'workspace_prepared','phase':None,'operation_id':None,'session_id':'native-session','state':{'created_draft':True}})
        data['tools'][-1]['result']['output']['observation_id']='dir-read'
        data['events'][-1]['outcome']['output']['observation_id']='dir-read'
        call={'session_id':'s','tool_call_id':'upload','tool':PREFIX+'dock_artifact_upload','row':6,
              'arguments':{'artifact_id':'a','upload_grant_id':'g','observation_id':'dir-read','operation_id':'up'}}
        result={'status':'AMBIGUOUS','phase':'submitted','operation_id':'up','effect_possible':True,'cleanup_complete':True,
                'error':{'code':'UPLOAD_SERVER_VERIFICATION_REQUIRED'},'output':{
                    'upload_submitted':True,'artifact_id':'a','upload_grant_id':'g','destination':artifact['upload']['destination'],
                    'bytes':expected['bytes'],'sha256':expected['sha256'],'verification_required':True},
                'trace':[{'event':'upload_preconditions_verified','destination':artifact['upload']['destination']},
                         {'event':'upload_input_submitted'}]}
        data['calls'].append(call)
        data['tools'].append({**call,'row':7,'result':result})
        data['events'].append({'phase':'completed','operation_id':'up','outcome':copy.deepcopy(result)})
        data['tools'].append({'session_id':'s','tool_call_id':'inspect','tool':PREFIX+'dock_operation_inspect','row':9,
                              'result':{'output':{'operation_id':'up','state':'pending','outcome':copy.deepcopy(result),'recovery_options':[]}}})
        return data,request

    def test_declared_submission_is_not_server_success(self):
        data,request=self.fixture()
        report=upload_probe.audit(data,[],request,PREFIX,MUTATIONS,file_storage_inspect)
        self.assertTrue(report['all_assertions_passed'],report)
        self.assertIn('unverified',report['limitations'][0])
        payload=Path(__file__).with_name('fixtures').joinpath('data-pipeline/sales.csv').read_bytes()
        import hashlib
        self.assertEqual(hashlib.sha256(payload).hexdigest(),upload_probe.FIXTURE_SHA)
        self.assertEqual(len(payload),230)

    def test_rejects_unbound_or_changed_transfers_and_later_mutations(self):
        for change in [lambda d,r:r['input_artifact']['upload'].update(directory='/other'),
                       lambda d,r:d['calls'][-1]['arguments'].update(upload_grant_id='other'),
                       lambda d,r:d['calls'][-1]['arguments'].update(destination='/other'),
                       lambda d,r:d['tools'][-2]['result'].update(status='SUCCEEDED'),
                       lambda d,r:d['events'][-1]['outcome']['output'].update(sha256='0'*64),
                       lambda d,r:d['tools'][-1]['result']['output'].update(state='resolved'),
                       lambda d,r:d['calls'].append({**d['calls'][-1],'row':10,'tool_call_id':'repeat'})]:
            data,request=self.fixture();change(data,request)
            self.assertFalse(upload_probe.audit(data,[],request,PREFIX,MUTATIONS,file_storage_inspect)['all_assertions_passed'])

    def test_probe_uses_explicit_account_directory_and_run_unique_name(self):
        value=upload_probe.descriptor('20260905-230000-1234abcd','/test')
        self.assertEqual(value['upload'],{'directory':'/test','overwrite':'replace'})
        self.assertEqual(value['name'],'Dock-upload-20260905-230000-1234abcd.csv')
        for run_id,directory in [('bad','/test'),('20260905-230000-1234abcd','/test/../user')]:
            with self.assertRaises(ValueError):upload_probe.descriptor(run_id,directory)

    def test_paged_directory_is_bound_to_each_native_receipt(self):
        import json, subprocess
        raw={'status':'SUCCEEDED','operation_id':'read','output':{'nodes':[],'links':[],
             'file_storage':{'status':'observed','directory':'/test'},
             'ui':{'elements':[{'ref':f'ui-{i}','label':str(i),'signature':{'tag':'td'}} for i in range(70)],
                   'dialogs':[],'masks':[],'messages':[],'table_cells':[],'truncated':{}}}}
        script="""import {createObservationPages} from './client/lib/observation-pages.mjs';
let text='';for await(const part of process.stdin)text+=part;
const raw=JSON.parse(text),pager=createObservationPages(),out=[];let p=pager.retain(structuredClone(raw));
while(true){out.push(p);if(!p.output.page.next_cursor)break;p=pager.next(p.output.page.next_cursor,structuredClone(raw));}
console.log(JSON.stringify(out));"""
        pages=json.loads(subprocess.run(['node','--input-type=module','-e',script],
            cwd=Path(__file__).resolve().parents[2],input=json.dumps(raw),text=True,capture_output=True,check=True).stdout)
        data={'calls':[],'tools':[],'events':[]}
        for i,page in enumerate(pages):
            page['operation_id']=f'read-{i}'
            call={'session_id':'s','tool_call_id':str(i),'tool':PREFIX+'dock_workspace_observe','row':i*2,
                  'arguments':{} if i==0 else {'cursor':pages[i-1]['output']['page']['next_cursor']}}
            data['calls'].append(call);data['tools'].append({**call,'row':i*2+1,'result':page})
            data['events'].append({'phase':'observation_completed','operation_id':page['operation_id'],
                                   'outcome':{**copy.deepcopy(raw),'operation_id':page['operation_id']}})
        self.assertTrue(upload_probe.delivered_directory(data['tools'],data,{'session_id':'s'},'/test'))
        for mutate in [lambda d:d['events'].pop(),lambda d:d['calls'][1]['arguments'].update(cursor='wrong'),
                       lambda d:d['tools'][1]['result']['output']['file_storage'].update(directory='/other'),
                       lambda d:d['tools'][1]['result']['output']['page'].update(offset=0),
                       lambda d:d['tools'][1].update(session_id='foreign')]:
            bad=copy.deepcopy(data);mutate(bad)
            self.assertFalse(upload_probe.delivered_directory(bad['tools'],bad,{'session_id':'s'},'/test'))
