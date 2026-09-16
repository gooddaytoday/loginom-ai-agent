import copy
import unittest
from prepare_binding import successful_prepare, _ALREADY_PREPARED
import test_upload_verify
import test_upload_probe
from audit import PREFIX, MUTATIONS, file_storage_inspect
import upload_probe
import upload_verify


def repeated(data):
    for item in data['calls']+data['tools']:item['row']*=4
    call={'session_id':'s','tool_call_id':'repeat-prepare','tool':PREFIX+'dock_prepare','row':1,'arguments':{}}
    reply={**call,'row':2,'result':{'isError':True,'error':_ALREADY_PREPARED}}
    data['calls'].append(call);data['tools'].append(reply)
    return call,reply


class PrepareBindingTest(unittest.TestCase):
    def test_both_transfer_auditors_accept_only_explicit_already_prepared_refusal(self):
        for fixture,auditor in [(test_upload_probe.UploadProbeTest().fixture,upload_probe),(test_upload_verify.UploadVerifyTest().fixture,upload_verify)]:
            data,request=fixture();repeated(data)
            report=auditor.audit(data,[],request,PREFIX,MUTATIONS,file_storage_inspect)
            self.assertTrue(report['all_assertions_passed'],report)

    def test_two_success_unknown_changed_foreign_or_ambiguous_prepare_fail_closed(self):
        for mode in ['two_success','unknown','changed','extra_payload','foreign_call','foreign_reply','duplicate_call','duplicate_reply','duplicate_event','foreign_event','changed_state','missing_event','before_success','args']:
            with self.subTest(mode=mode):
                data,request=test_upload_verify.UploadVerifyTest().fixture();call,reply=repeated(data)
                event=next(e for e in data['events']if e.get('event')=='workspace_prepared')
                if mode=='two_success':reply['result']=copy.deepcopy(data['tools'][0]['result'])
                if mode=='unknown':reply['result']={'isError':True,'error':'Unknown transport failure'}
                if mode=='changed':reply['result']['error']+=' changed'
                if mode=='extra_payload':reply['result']['workspace']={'created_draft':True}
                if mode=='foreign_call':call['session_id']='foreign'
                if mode=='foreign_reply':reply['session_id']='foreign'
                if mode=='duplicate_call':data['calls'].append(copy.deepcopy(call))
                if mode=='duplicate_reply':data['tools'].append(copy.deepcopy(reply))
                if mode=='duplicate_event':data['events'].append(copy.deepcopy(event))
                if mode=='foreign_event':event['session_id']='foreign'
                if mode=='changed_state':event['state']['created_draft']=False
                if mode=='missing_event':data['events'].remove(event)
                if mode=='before_success':call['row']=-3;reply['row']=-2
                if mode=='args':call['arguments']={'reset':True}
                self.assertIsNone(successful_prepare(data,PREFIX,'s',1000))
                self.assertFalse(upload_verify.audit(data,[],request,PREFIX,MUTATIONS,file_storage_inspect)['all_assertions_passed'])

    def test_unique_success_still_requires_paired_call_reply_and_precedes_upload(self):
        data,_=test_upload_probe.UploadProbeTest().fixture();self.assertIsNotNone(successful_prepare(data,PREFIX,'s',6))
        self.assertIsNone(successful_prepare(data,PREFIX,'s',0))
        data['calls']=[c for c in data['calls']if c['tool']!=PREFIX+'dock_prepare']
        self.assertIsNone(successful_prepare(data,PREFIX,'s',6))

if __name__=='__main__':unittest.main()

class PreparationV1Test(unittest.TestCase):
    def fixture(self):
        state={'status':'READY','reason':None,'authenticated':True,'created_draft':True,
               'ownership_verified':True,'target_verified':True,'session_id':'dock','operation_id':'prepare','document_id':'doc',
               'workflow_ref':{'tab_tid':'tab','prefix':'prefix','navigation_path':[{'tid':'path','label':'Workflow'}]},
               'package_ref':{'path':None,'persisted':False},'preserved_workflows':[{'tab_tid':'old','graph_unchanged':True}]}
        result={'prepared':True,'sessionId':'dock','workspace':state}
        common={'tool':PREFIX+'dock_prepare','session_id':'agent','tool_call_id':'one'}
        return {'calls':[{**common,'arguments':{},'row':1}],'tools':[{**common,'result':result,'row':2}],
                'events':[{'event':'workspace_prepared','session_id':'dock','state':copy.deepcopy(state)}]}

    def test_same_operation_repeat_is_verified_and_foreign_or_changed_state_is_rejected(self):
        data=self.fixture();self.assertIsNotNone(successful_prepare(data,PREFIX,'agent',10))
        call=copy.deepcopy(data['calls'][0]);call.update(tool_call_id='two',row=3)
        reply=copy.deepcopy(data['tools'][0]);reply.update(tool_call_id='two',row=4);reply['result']['workspace']['replayed']=True
        event=copy.deepcopy(data['events'][0]);event['state']['replayed']=True
        data['calls'].append(call);data['tools'].append(reply);data['events'].append(event)
        self.assertIsNotNone(successful_prepare(data,PREFIX,'agent',10))
        for key,value in [('document_id','different'),('ownership_verified',False),('created_draft',False)]:
            changed=copy.deepcopy(data);changed['tools'][-1]['result']['workspace'][key]=value
            changed['events'][-1]['state'][key]=value
            self.assertIsNone(successful_prepare(changed,PREFIX,'agent',10))
        data['events'][-1]['state']['preserved_workflows'][0]['graph_unchanged']=False
        self.assertIsNone(successful_prepare(data,PREFIX,'agent',10))
