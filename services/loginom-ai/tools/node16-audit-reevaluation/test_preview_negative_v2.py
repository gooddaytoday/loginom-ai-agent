import copy,hashlib,json,sys,unittest
from pathlib import Path
sys.path.insert(0,str(Path.cwd()/'tools/loginom-acceptance'))
import collapse_node_acceptance as v
from preview_negative_v2 import verify_preview_negative

class PreviewNegativeCounterexamples(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.original=json.loads(Path('.dock/node16/negative-missing-original-events.json').read_text())
        cls.op=cls.original[0]['operation_id']
    def check(self,events):return verify_preview_negative(v,{'events':events},self.op)
    def test_actual_three_steps(self):self.assertTrue(self.check(copy.deepcopy(self.original)))
    def test_semantic_counterexamples(self):
        for name in ['source','preview_port','close_control','gesture','graph','extra_step','unclosed','schema','effect','phase','signature','incomplete','order']:
            with self.subTest(name=name):
                es=copy.deepcopy(self.original)
                get=lambda phase,step=None:next(x for x in es if x['phase']==phase and (step is None or x.get('step')==step))
                before=get('node_observation_completed',1)['outcome']['output']
                preview=get('node_observation_completed',5)['outcome']['output']
                after=get('node_observation_completed',7)['outcome']['output']
                if name=='source':get('node_apply_prepared')['request']['inputs'][0]['source']['node_id']='foreign'
                elif name=='preview_port':preview['node_preview_schema']['port_guid']='foreign'
                elif name=='close_control':
                    close=get('node_step_prepared',6)['action']['ref']
                    next(x for x in preview['ui']['elements'] if x['ref']==close)['tid']='foreign;close'
                elif name=='gesture':get('node_step_prepared',4)['action']['key']='Delete'
                elif name=='graph':after['nodes'].append(copy.deepcopy(after['nodes'][0]))
                elif name=='extra_step':es.append(copy.deepcopy(get('node_step_prepared',2)))
                elif name=='unclosed':after['node_preview_schema']=copy.deepcopy(preview['node_preview_schema'])
                elif name=='schema':
                    preview['node_preview_schema']['fields'][0]['name']='__MissingField__'
                    proof=get('collapse_preflight_completed')['proof'];proof['preview']=copy.deepcopy(preview['node_preview_schema']);proof['schema']=copy.deepcopy(preview['node_preview_schema']['fields'])
                elif name=='effect':get('completed')['outcome']['effect_possible']=True
                elif name=='phase':get('node_phase_completed')['receipt']['effect_possible']=True
                elif name=='signature':get('node_step_prepared',2)['signature']='0'*64
                elif name=='incomplete':before['scan']['complete']=False
                elif name=='order':
                    obs=get('node_observation_completed',3);es.remove(obs);es.insert(es.index(get('node_step_completed',2)),obs)
                # Rebind altered snapshots so semantic tests cannot pass merely
                # because the snapshot hash detects the injected change first.
                if name!='signature':
                    digest=lambda x:hashlib.sha256(json.dumps(x,ensure_ascii=False,separators=(',',':')).encode()).hexdigest()
                    for step in (2,4,6):
                        action=get('node_step_prepared',step);out=get('node_observation_completed',step-1)['outcome']['output']
                        action['observation_sha256']=digest(out);action['signature']=digest([action['internal_operation_id'],action['action'],out])
                with self.assertRaises((ValueError,KeyError,TypeError)):self.check(es)

if __name__=='__main__':unittest.main()
