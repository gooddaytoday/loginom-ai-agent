"""Synthetic observer evidence only: never admits a native acceptance run."""
import copy,json,tempfile,unittest
from pathlib import Path
from text_export_observer_evidence import verify_observer,sha,REVISION

def encoded(value):return json.dumps(value,ensure_ascii=False,separators=(',',':')).encode()

class ObserverEvidenceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        import os,subprocess,shutil
        cls.template=tempfile.TemporaryDirectory(prefix='node17-cross-runtime-');cls.addClassCleanup(cls.template.cleanup)
        bundled=Path.home()/'.loginom-dock/current/runtime/node'
        node=os.environ.get('DOCK_TEST_NODE') or (str(bundled) if bundled.is_file() else shutil.which('node'))
        if not node:raise RuntimeError('Node is required; set DOCK_TEST_NODE to the pinned runtime')
        script=Path(__file__).with_name('text-export-observer-offline.mjs')
        subprocess.run([node,str(script),'--synthetic-fixture',cls.template.name],check=True,capture_output=True,text=True,timeout=10)

    def setUp(self):
        import shutil
        self.temp=tempfile.TemporaryDirectory(prefix='node17-proof-test-');self.addCleanup(self.temp.cleanup)
        self.run=Path(self.temp.name).resolve();shutil.copytree(self.template.name,self.run,dirs_exist_ok=True)
        self.root=self.run/'observer';fixture=json.loads((self.run/'synthetic-expected.json').read_text())
        self.run_request=fixture['run'];self.expected=fixture['expected'];self.request=fixture['request'];self.data=b'x\n'
        self.events=[json.loads(x) for x in (self.root/'observer.jsonl').read_text().splitlines()]
        self.read_id=self.events[0]['payload']['read_id'];self.identity=self.expected['identity']
        self.file=self.root/self.events[2]['payload']['native_file']

    def persist(self):
        previous='0'*64;lines=[]
        for i,e in enumerate(self.events):
            e.update(seq=i+1,previous=previous);line=encoded(e);previous=sha(line);lines.append(line)
        (self.root/'observer.jsonl').write_bytes(b'\n'.join(lines)+b'\n')
        if len(self.events)>2 and 'action_ledger' in self.events[2]['payload']:
            actions=[]
            for e in self.events[2]['payload']['action_ledger']:
                actions.extend([dict(phase='prepared',**{k:e[k] for k in ['seq','step','code_sha256','run_id','session_id','mono_start']}),dict(phase='completed',**e)])
            (self.root/'observer-actions.jsonl').write_text('\n'.join(json.dumps(x) for x in actions)+'\n')
        self.expected['actual_replace_dispatch']=dict(operation_id='replace',after_observer_chain_sha256=previous,mono_ms=self.events[-1]['mono_ms']+1,before_product_dispatch=True)

    def result(self):return verify_observer(self.root,self.expected,self.request)['passed']

    def test_synthetic_positive_does_not_claim_native_or_global_atomicity(self):
        r=verify_observer(self.root,self.expected,self.request)
        self.assertTrue(r['passed']);self.assertEqual(r['scope'],'unadmitted_observer_proof');self.assertFalse(r['global_atomicity_verified'])

    def test_semantic_negatives_with_valid_rebuilt_hash_chain(self):
        originals=copy.deepcopy(self.events)
        changes=[
            (0,['run_id'],'old-run'),(0,['session_id'],'old-session'),(0,['runtime'],'old-runtime'),
            (0,['baseline','original_event_index'],11),(0,['reject','cleanup_complete'],False),(0,['deadline_ms'],4),
            (2,['destination'],'/test-2/other.csv'),(2,['bytes'],3),(2,['sha256'],'0'*64),
            (2,['cleanup_complete'],False),(2,['workflow_returned'],False),(2,['download_count'],2),
            (2,['listener_before_gesture'],False),(2,['native_file'],'original/result.csv'),
            (2,['after','settings_verified'],True),(2,['after','workflow_ref','workflow_id'],'other'),
            (2,['after','graph','nodes'],[]),(2,['before','complete'],False),
            (2,['raw',1,'kind'],'download_gesture'),(2,['raw',3,'payload','suggested_name'],'old.csv'),
            (2,['raw',3,'session_id'],'old-session'),(2,['raw',4,'payload','node_id'],'other'),
            (3,['read_id'],'old-read'),(3,['request_sha256'],'0'*64),
        ]
        for index,path,value in changes:
            with self.subTest(path=path,value=value):
                self.events=copy.deepcopy(originals);target=self.events[index]['payload']
                for key in path[:-1]:target=target[key]
                target[path[-1]]=value;self.persist();self.assertFalse(self.result())

    def test_actual_dispatch_must_be_independently_bound(self):
        for key,value in [('operation_id','other'),('mono_ms',0),('before_product_dispatch',False),('after_observer_chain_sha256','0'*64)]:
            with self.subTest(key=key):
                self.persist();self.expected['actual_replace_dispatch'][key]=value;self.assertFalse(self.result())
        self.expected.pop('actual_replace_dispatch');self.assertFalse(self.result())

    def test_tamper_missing_events_and_actual_bytes(self):
        p=self.root/'observer.jsonl';original=p.read_bytes()
        for data in [b'',original.replace(b'"seq":1',b'"seq":9'),original.splitlines()[0]+b'\n']:
            p.write_bytes(data);self.assertFalse(self.result())
        p.write_bytes(original);self.file.write_bytes(b'y\n');self.assertFalse(self.result())
        self.file.unlink();self.assertFalse(self.result())

    def test_wrong_request_and_symlink_are_refused(self):
        self.request['params']['arguments']['parameters']['overwrite']='reject';self.assertFalse(self.result())
        self.request['params']['arguments']['parameters']['overwrite']='replace'
        other=self.root/'other.csv';other.write_bytes(self.data);self.file.unlink();self.file.symlink_to(other);self.assertFalse(self.result())

    def test_forbidden_observer_actions_and_raw_sidecar_binding(self):
        original=copy.deepcopy(self.events)
        for kind in ['Configure','Finish','Execute','save','upload','reload','press','scroll']:
            self.events=copy.deepcopy(original);self.events[2]['payload']['action_ledger'][3]['step']['kind']=kind
            self.persist();self.assertFalse(self.result())
        self.events=original;self.persist()
        (self.root/'observer-actions.jsonl').unlink();self.assertFalse(self.result())

    def test_outer_binds_to_actual_journal_and_dispatch_before_replace(self):
        from text_export_observer_run import verify_run_observer
        result=verify_run_observer(self.run,self.run_request,self.request['params']['arguments'])
        self.assertTrue(result['passed'],result)
        actual=self.root/'actual-dispatch.jsonl';e=json.loads(actual.read_text());e['journal_line_count']+=1
        actual.write_text(json.dumps(e)+'\n')
        self.assertFalse(verify_run_observer(self.run,self.run_request,self.request['params']['arguments'])['passed'])

    def test_return_refresh_proof_requires_exact_no_effect_and_bound_owner(self):
        from text_export_observer_evidence import verify_action_ledger
        proof=self.events[2]['payload'];original=proof['action_ledger']
        ret=next(i for i,e in enumerate(original) if e['step']['kind']=='return')
        def fixture(count):
            rows=copy.deepcopy(original);extra=[]
            for _ in range(count):
                refusal=copy.deepcopy(original[ret]);refusal['response']=dict(status='NOT_APPLIED',phase='preconditions',error=dict(code='UI_EPOCH_CHANGED'),effect_possible=False,cleanup_complete=True,trace=[])
                extra.extend([refusal,*copy.deepcopy(original[ret-2:ret])])
            rows[ret:ret]=extra
            for i,e in enumerate(rows):e.update(seq=i+1,mono_start=2*i,mono_end=2*i+1)
            return rows
        def verify(rows):return verify_action_ledger(rows,self.expected,proof['before'],proof['after'])
        for count in [1,2]:verify(fixture(count))
        with self.assertRaises(AssertionError):verify(fixture(3))
        for key,value in [('effect_possible',True),('cleanup_complete',False),('error',dict(code='UI_CONTEXT_CHANGED')),('trace',[dict(event='ui_gesture_applied')]),('trace',[dict(event='ui_preconditions_verified')])]:
            rows=fixture(1);rows[ret]['response'][key]=value
            with self.assertRaises(AssertionError):verify(rows)
        rows=fixture(1);rows[ret+3]['step']['snapshot']['package_identity']='foreign'
        with self.assertRaises(AssertionError):verify(rows)

    def test_explicit_file_reveal_requires_independent_native_proof(self):
        from text_export_observer_evidence import verify_download_reveal
        step=copy.deepcopy(next(e['step'] for e in self.events[2]['payload']['action_ledger'] if e['step']['kind']=='download'))
        s,e=step['snapshot'],step['element'];s['active_tab_ref']='ui-storage';s['package_identity']=None
        e['interaction']['state']='outside_viewport';e['scroll']=dict(ref='ui-scroll',top=0,max_top=2075)
        s['ui']['elements']=[copy.deepcopy(e)]
        step['reveal']={'file_ref':e['ref'],'owner_ref':'ui-scroll','from':0,'max_top':2075,'limit':1000}
        trace=[{'event':'download_file_revealed','applied':True,'file_ref':e['ref'],'owner_ref':'ui-scroll','from':0,'to':400,'max_top':2075,'delta':400,'document':s['dom_epoch']['document']},
            dict(event='download_reveal_confirmed',file_ref=e['ref'],owner_ref='ui-scroll',max_top_before=2075,max_top_after=2075,document=s['dom_epoch']['document'],interaction='point_observed',file_tid=e['tid'],origin=s['origin'],loginom_build=s['loginom_build'],workflow_ref=s['workflow_ref'],active_tab_ref=s['active_tab_ref'],package_identity=None,directory=s['file_storage']['directory']),
            dict(event='download_gesture_result',status='SUCCEEDED',effect_possible=True,cleanup_complete=True,error_code=None)]
        verify_download_reveal(step,dict(trace=trace))
        for index,key,value in [(0,'delta',1001),(0,'owner_ref','foreign'),(1,'document','foreign'),(1,'max_top_after',9999),(2,'cleanup_complete',False)]:
            changed=copy.deepcopy(trace);changed[index][key]=value
            with self.assertRaises(AssertionError):verify_download_reveal(step,dict(trace=changed))
        step.pop('reveal')
        with self.assertRaises(AssertionError):verify_download_reveal(step,dict(trace=trace))

    def test_nonmonotonic_and_nonfinite_times_are_refused(self):
        for time in [0,float('nan'),float('inf')]:
            self.events[2]['mono_ms']=time;self.persist();self.assertFalse(self.result())

if __name__=='__main__':unittest.main()
