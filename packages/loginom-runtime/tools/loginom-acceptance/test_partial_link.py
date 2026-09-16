"""Synthetic fault proof; real UI acceptance remains a separate run."""
import copy
import unittest
import audit


def fixture():
    request={'run_id':'fixture','runtime_source_pin':{'inputs':{'client/lib/executor.mjs':'a'*64}}}
    before={'event':'operator_fault_before','nodes':['s','t'],'ports':['p1','p2'],'links':['link'],
            'baseline':{'ports':['p1'],'links':[]}}
    after={'event':'operator_fault_injected','nodes':['s','t'],'ports':['p1','p2'],'links':[],
           'retained_added_port_tid':'p2','removed_link_tid':'link','delta':{'added_ports':['p2'],'added_links':[]}}
    actual={'status':'AMBIGUOUS','cleanup_complete':True,'operation_id':'op','action_key':'link.create','trace':[before,after]}
    fault={'variant':'partial_link','fault':'remove_only_new_link_keep_added_port','run_id':'fixture',
           'injection_reached':True,'receipt_fabricated':False,'operation_id':'op','actual_browser_reply':actual,
           'executor_source_sha256':'a'*64,'source_code_sha256':'b'*64,'injected_code_sha256':'c'*64}
    result={'status':'SUCCEEDED','cleanup_complete':True,'operation_id':'op','recovery_operation_id':'repair',
            'trace':[{'event':'partial_link_recovery','target_port_tid':'p2','creates_port':False}],
            'output':{'link_ref':{'tid':'link'}}}
    calls=[{'session_id':'s','tool_call_id':'a','tool':audit.PREFIX+'dock_action_run',
            'arguments':{'action_key':'link.create','parameters':{'target_port':{'kind':'add'}}}},
           {'session_id':'s','tool_call_id':'r','tool':audit.PREFIX+'dock_operation_recover',
            'arguments':{'operation_id':'op','recovery_operation_id':'repair','strategy':'complete_link'}}]
    data={'operator_fault_receipt':fault,'calls':calls,
          'tools':[{**calls[0],'result':actual},{**calls[1],'result':result}],
          'events':[{'phase':'completed','operation_id':'op','outcome':actual},
                    {'phase':'recovery_completed','operation_id':'repair','outcome':{k:v for k,v in result.items() if k!='recovery_operation_id'}}]}
    return request,data


def verify(request,data):
    checks=[]
    audit.partial_link_proof(request,data,{(c['session_id'],c['tool_call_id']):c for c in data['calls']},
                            lambda name,ok:checks.append((name,bool(ok))))
    return all(ok for _,ok in checks)


class PartialLinkTest(unittest.TestCase):
    def test_existing_port_recovery(self):self.assertTrue(verify(*fixture()))
    def test_forged_or_duplicate_port_proof_fails(self):
        for mutate in [lambda d:d['operator_fault_receipt'].update(receipt_fabricated=True),
                       lambda d:d['tools'][1]['result']['trace'][0].update(creates_port=True),
                       lambda d:d['events'].pop(),
                       lambda d:d['calls'].append(copy.deepcopy(d['calls'][0])),
                       lambda d:d['operator_fault_receipt']['actual_browser_reply']['trace'][1]['ports'].append('extra')]:
            request,data=fixture();mutate(data);self.assertFalse(verify(request,data))

if __name__=='__main__':unittest.main()
