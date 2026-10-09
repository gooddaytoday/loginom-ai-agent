"""Pinned-source admission, own migration rollback and completed file handoff."""
import hashlib,importlib.util,json,os,subprocess,sys,tempfile,time,unittest,signal,fcntl
from contextlib import ExitStack
from pathlib import Path
from unittest.mock import patch
from uuid import uuid4
SCRIPTS=Path(__file__).resolve().parents[1]/'scripts';sys.path.insert(0,str(SCRIPTS))
from common import write_private,read_private,private_snapshot,account_guard,process_identity,begin_account_effect
def load(name,file):
    spec=importlib.util.spec_from_file_location(name,SCRIPTS/file);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m
card=load('admin_card_tests','card-admin-common.py');migration=load('admin_migration_tests','migrate-operator.py');publisher=load('admin_publisher_tests','publish-handoff.py')
provision=card.load('admin_foreground_tests','provision-accounts.py')

def fixture(root):
    dependencies=read_private(Path.home()/'.config/loginom-multica/operator.json')
    global_path=root/'global.json';global_operator={**{k:dependencies[k] for k in ['node','browser','playwright_module']},
        'url':'about:blank','admin_user':'admin','admin_password':'SYNTHETIC','workspace_id':'fixture','agents':{'worker':'w','reviewer':'r'},'api_key':'SYNTHETIC'}
    write_private(global_path,global_operator);cards=[]
    for issue in card.CARDS:
        original=read_private(Path.home()/'.config/loginom-multica/cards'/issue/'operator.json')
        path=root/issue/'operator.json';write_private(path,{**global_operator,'admin_user':original['admin_user'],'admin_password':'SYNTHETIC','account_state':'planned'})
        cards.append({'issue_id':issue,'operator':card.binding(path)})
    return global_path,global_operator,cards

class OperatorMigration(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.root=Path(self.temp.name);self.paths=[]
        for role in ['worker','reviewer']:
            p=self.root/(role+'.json');p.write_bytes((' { "credential" : "SYNTHETIC", "nested": {"operator_file":"untouched"},\n "operator_file" : "/old.json", "account_state" : "ready", "role":"'+role+'" }\n').encode());p.chmod(0o600);self.paths.append(p)
        self.bindings=[card.binding(p) for p in self.paths]
    def tearDown(self):self.temp.cleanup()
    def test_only_operator_string_span_changes_and_original_bytes_inodes_survive(self):
        before=[p.read_bytes() for p in self.paths]
        after=migration.migration_transaction(self.bindings,'/old.json','/new card.json',self.root/'history',self.root/'receipt.json',{'source':'fixture'})
        for p,raw,b in zip(self.paths,before,self.bindings):
            self.assertEqual(p.read_bytes(),raw.replace(b'"/old.json"',b'"/new card.json"'))
            retained=self.root/'history'/p.name;self.assertEqual(retained.read_bytes(),raw);self.assertEqual(retained.stat().st_ino,b['inode'])
            self.assertEqual(read_private(p)['account_state'],'ready')
        self.assertEqual(read_private(self.root/'receipt.json')['changed_keys'],['operator_file']);self.assertFalse(read_private(self.root/'receipt.json')['old_grants_ready_receipts_valid'])
    def test_second_replace_failure_restores_original_exact_inodes_and_bytes(self):
        original=migration.replace_bytes;count=0
        def fault(path,raw):
            nonlocal count;count+=1
            if count==2:raise OSError('second migration fault')
            return original(path,raw)
        with patch.object(migration,'replace_bytes',fault),self.assertRaisesRegex(OSError,'second migration fault'):
            migration.migration_transaction(self.bindings,'/old.json','/new.json',self.root/'history',self.root/'receipt.json',{})
        self.assertEqual([card.binding(p) for p in self.paths],self.bindings);self.assertFalse((self.root/'receipt.json').exists())
    def test_receipt_failure_restores_originals_and_preserves_history(self):
        with patch.object(migration,'write_private',side_effect=OSError('receipt fault')),self.assertRaisesRegex(OSError,'receipt fault'):
            migration.migration_transaction(self.bindings,'/old.json','/new.json',self.root/'history',self.root/'receipt.json',{})
        self.assertEqual([card.binding(p) for p in self.paths],self.bindings);self.assertEqual(len(list((self.root/'history').iterdir())),2)
    def test_duplicate_key_or_wrong_before_operator_is_rejected(self):
        for raw in [b'{"operator_file":"/old.json","operator_file":"/old.json"}',b'{"operator_file":"/foreign.json"}']:
            with self.assertRaises(RuntimeError):migration.rewrite_operator_only(raw,'/old.json','/new.json')

class CompletedHandoff(unittest.TestCase):
    def test_documented_direct_redirect_exposes_empty_json_but_staging_does_not(self):
        with tempfile.TemporaryDirectory() as d:
            root=Path(d);early=root/'early.json';complete=root/'complete.pending.json';final=root/'complete.json'
            with early.open('wb') as out:
                process=subprocess.Popen([sys.executable,'-c','import sys;sys.stdin.read();print("{}")'],stdin=subprocess.PIPE,stdout=out)
                record=process_identity(process.pid)
                try:
                    self.assertTrue(early.exists())
                    with self.assertRaises(json.JSONDecodeError):json.loads(early.read_bytes())
                finally:process.communicate(timeout=3)
            write_private(complete,{'schema':'fixture','complete':True});raw=complete.read_bytes();self.assertFalse(final.exists())
            publisher.publish(complete,final,len(raw),hashlib.sha256(raw).hexdigest());self.assertEqual(final.read_bytes(),raw)
            with self.assertRaises(FileExistsError):publisher.publish(complete,final,len(raw),hashlib.sha256(raw).hexdigest())
            if os.environ.get('LAB53_PROCESS_RECEIPT_DIR'):write_private(Path(os.environ['LAB53_PROCESS_RECEIPT_DIR'])/'handoff-producer.json',{'processes':[record]})
    def test_partial_changed_bytes_and_live_control_fail_without_final_publication(self):
        with tempfile.TemporaryDirectory() as d:
            root=Path(d);stage=root/'pending.json';final=root/'response.json';stage.write_bytes(b'{');stage.chmod(0o600)
            with self.assertRaises(json.JSONDecodeError):publisher.publish(stage,final,1,hashlib.sha256(b'{').hexdigest())
            self.assertFalse(final.exists())
            record=process_identity(os.getpid());write_private(stage,{'schema':'lab53-held-fd-inventory-v1','before':{'control':record},'after':{'control':record}})
            raw=stage.read_bytes()
            with self.assertRaisesRegex(RuntimeError,'CONTROL_STILL_LIVE'):publisher.publish(stage,final,len(raw),hashlib.sha256(raw).hexdigest())
            with self.assertRaisesRegex(RuntimeError,'BYTES_CHANGED'):publisher.publish(stage,final,len(raw),'0'*64)
            self.assertFalse(final.exists())

class PinnedAdministrators(unittest.TestCase):
    def test_eight_pin_and_no_recreate_for_original_unknown_or_probe_only(self):
        with tempfile.TemporaryDirectory() as d:
            root=Path(d);global_path,global_operator,cards=fixture(root);operators=card.validate_cards(cards,global_operator)
            self.assertEqual(len(operators),8)
            with self.assertRaisesRegex(RuntimeError,'EIGHT_PIN'):card.validate_cards(cards[:7],global_operator)
            issue=next(iter(card.PROBE_ONLY));binding=next(x['operator'] for x in cards if x['issue_id']==issue)
            proof=root/'original.json';write_private(proof,{'fixture_original_history':True})
            intent={'schema':'lab53-card-admin-intent-v1','issue_id':issue,'card_operator':binding,'full_name':'fixture-owned-admin',
                'action':'probe-existing','history':{'provenance':'owner-audited-original-task-chain','state':'RECONCILIATION_REQUIRED','files':[card.binding(proof)]}}
            card.validate_intent(intent,binding,operators[issue])
            with self.assertRaisesRegex(RuntimeError,'RECREATE_FORBIDDEN'):card.validate_intent({**intent,'action':'create-unstarted'},binding,operators[issue])
            changed=read_private(binding['path']);changed['admin_user']='foreign-admin';write_private(binding['path'],changed)
            altered=[{**x,'operator':card.binding(binding['path'])} if x['issue_id']==issue else x for x in cards]
            with self.assertRaisesRegex(RuntimeError,'PIN_OR_DEPENDENCY'):card.validate_cards(altered,global_operator)
    def test_eight_pair_preparation_guards_overlap_after_operator_only_migration(self):
        # Actual held flocks; each pair uses its existing distinct admin, never
        # the common global admin. This is fixture overlap, not daemon load12.
        from contextlib import ExitStack
        with tempfile.TemporaryDirectory() as d:
            root=Path(d);global_path,global_operator,cards=fixture(root);directories=root/'pairs';locks=root/'locks'
            with ExitStack() as stack:
                for selected in cards:
                    issue=selected['issue_id'];configs=provision.allocate(issue,global_path,directories)
                    before=[card.binding(p) for p in configs];card_operator=selected['operator']['path']
                    migration.migration_transaction(before,str(global_path),card_operator,root/('history-'+issue),root/('receipt-'+issue+'.json'),{})
                    operator=read_private(card_operator);roles=list(map(read_private,configs));previous={name:[] for name in [operator['admin_user'],*[r['loginom']['username'] for r in roles]]}
                    context=stack.enter_context(provision.preparation_guard(issue,Path(card_operator),directories,previous,root/('attempt-'+issue),locks))
                    self.assertNotIn('admin',context['guards']);self.assertEqual(len(context['guards']),3)
                self.assertEqual(len(list(locks.glob('*.lock'))),24)

class BoundedBootstrap(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.root=Path(self.temp.name)
        self.global_path,self.global_operator,self.cards=fixture(self.root)
        self.selected=self.cards[0];self.issue=self.selected['issue_id'];self.card=read_private(self.selected['operator']['path'])
        self.origin=self.root/'original-history.json';write_private(self.origin,{'fixture_original_chain':'no real account history'})
        self.intent=self.root/'intent.json';write_private(self.intent,{
            'schema':'lab53-card-admin-intent-v1','issue_id':self.issue,'card_operator':self.selected['operator'],
            'full_name':'fixture-card-admin','action':'probe-existing','history':{'provenance':'owner-audited-original-task-chain',
                'state':'EXISTING_VERIFIED','files':[card.binding(self.origin)],'prior_attempts':[]}})
        sha=subprocess.check_output(['git','-C',SCRIPTS,'rev-parse','HEAD'],text=True).strip()
        self.source=provision.clean_candidate(sha);self.op=str(uuid4())
        self.observer={'user_hash':card.digest(b'admin'),'guid_hash':card.digest(b'fixture-owner'),
            'session_id':90,'create_time':'2026-10-09T00:00:00.000Z','stand':'about:blank','tab_binding_sha256':card.digest(b'fixture-tab')}
        self.configs=list(map(card.binding,[self.global_path,Path(self.selected['operator']['path']),self.intent]))
        self.grant=self.root/'authorization.json';self.authorization={'schema':'lab53-admin-bootstrap-owner-binding-v1',
            'lab53_issue_id':'01a11e17-b869-7550-8450-35e5e17119d4','issue_id':self.issue,'card_issue_id':self.issue,
            'operation_id':self.op,'source':self.source,'configs':self.configs,'cards':self.cards,
            'intent_file':str(self.intent),'expected_observer':self.observer}
        write_private(self.grant,self.authorization)
        self.previous=self.root/'previous.json';write_private(self.previous,{self.global_operator['admin_user']:[],self.card['admin_user']:[]})
        self.home=self.root/'isolated-home';self.home.mkdir(mode=0o700)
        self.evidence=self.root/'production';self.command=[sys.executable,SCRIPTS/'admin-bootstrap.py',
            '--authorization',self.grant,'--evidence-dir',self.evidence,'--source-sha',sha,'--previous-processes',self.previous]
    def tearDown(self):self.temp.cleanup()
    def absent(self,records):
        for r in records:
            current=process_identity(r['pid']);self.assertTrue(current is None or current['start_ticks']!=r['start_ticks'] or current['state'] in {'Z','X'})
    def test_fixed_production_bootstrap_reaches_prelogin_request_and_cancel_releases_three_fds(self):
        p=subprocess.Popen(self.command,env={**os.environ,'HOME':str(self.home)},stdout=subprocess.PIPE,stderr=subprocess.PIPE)
        leader=process_identity(p.pid);request=None
        try:
            deadline=time.monotonic()+12
            while p.poll() is None and time.monotonic()<deadline:
                request=next(self.evidence.rglob('capture-1-before-operation-request.json'),None)
                if request:break
                time.sleep(.02)
            self.assertIsNotNone(request,'fixed bootstrap did not reach before-request: '+(p.stderr.read().decode() if p.poll() is not None else 'deadline'))
            value=read_private(request);self.assertEqual(value['operation_id'],self.op);self.assertEqual(value['expected_observer'],self.observer)
            self.assertEqual(value['capture_binding']['role'],'admin')
            barrier=read_private(next(self.evidence.rglob('flock-barrier.json')));self.assertEqual(len(barrier['guards']),3)
            self.assertEqual(barrier['command'][1],str(SCRIPTS/'qualify-preparation.mjs'));self.assertEqual(barrier['flock_policy'],'deny-all-EPERM')
            self.assertFalse(list(self.evidence.rglob('ui-completion.json')))
        finally:
            if p.poll() is None:
                daemon=json.loads(subprocess.check_output(['multica','daemon','status','--output','json']))
                self.assertNotEqual(p.pid,daemon['pid']);self.assertEqual(process_identity(p.pid)['start_ticks'],leader['start_ticks']);p.send_signal(signal.SIGTERM)
            _,stderr=p.communicate(timeout=12);records=[leader]
            for file in self.evidence.rglob('supervisor-result.json'):records.extend(read_private(file)['processes'])
            self.absent(records)
            if os.environ.get('LAB53_PROCESS_RECEIPT_DIR'):write_private(Path(os.environ['LAB53_PROCESS_RECEIPT_DIR'])/'admin-production-cancel.json',{'processes':records,'stderr_sha256':card.digest(stderr)})
        self.assertNotEqual(p.returncode,0);self.assertEqual(len(list(self.home.rglob('*.active.json'))),2)
        for path in [Path(self.selected['operator']['path']).parent/'.accounts.lock',*self.home.rglob('*.lock')]:
            fd=os.open(path,os.O_RDWR)
            try:fcntl.flock(fd,fcntl.LOCK_EX|fcntl.LOCK_NB)
            finally:os.close(fd)
        card.require_bindings([*self.configs,*[x['operator'] for x in self.cards]])
    def test_wrong_source_grant_or_target_pin_refuses_before_markers_and_login(self):
        for field,value in [('source',{}),('schema','foreign'),('configs',[])]:
            write_private(self.grant,{**self.authorization,field:value})
            result=subprocess.run(self.command,env={**os.environ,'HOME':str(self.home)},capture_output=True,timeout=5)
            self.assertNotEqual(result.returncode,0);self.assertFalse(self.evidence.exists());self.assertFalse(list(self.home.rglob('*.active.json')))
    def linked(self,mode='normal',create=False):
        if create:
            intent=read_private(self.intent);intent.update(action='create-unstarted');intent['history']['state']='NEVER_STARTED';write_private(self.intent,intent)
            self.configs=list(map(card.binding,[self.global_path,Path(self.selected['operator']['path']),self.intent]))
        directory=self.root/'linked';directory.mkdir(mode=0o700);operation_file=directory/'operation.json'
        operation={'schema':'lab53-admin-bootstrap-operation-v1','issue_id':self.issue,'operation_id':self.op,'source':self.source,
            'stand':'about:blank','expected_observer':self.observer,'configs':self.configs}
        write_private(operation_file,operation);snapshots=list(map(private_snapshot,[x['path'] for x in self.configs]))
        responder=subprocess.Popen([sys.executable,SCRIPTS.parent/'tests/parent-fixture.py',directory,mode]);record=process_identity(responder.pid)
        prior=os.environ.get('LAB53_FIXTURE_DEPENDENCIES');os.environ['LAB53_FIXTURE_DEPENDENCIES']=str(Path.home()/'.config/loginom-multica/operator.json')
        all_records=[record]
        try:
            with ExitStack() as stack:
                pair=stack.enter_context(provision.pair_guard(Path(self.selected['operator']['path']).parent))
                guards=[stack.enter_context(account_guard(name,snapshots,lock_directory=self.root/'locks')) for name in [self.global_operator['admin_user'],self.card['admin_user']]]
                for guard in guards:begin_account_effect(guard,self.issue,'admin',self.op,self.source['sha'])
                markers={str(Path(g['path']).with_suffix('.active.json')):Path(g['path']).with_suffix('.active.json').read_bytes() for g in guards}
                child=directory/'child';audit={'schema':'parent-held-audited-harness-v1','source_sha':self.source['sha'],
                    'manifest_sha256':self.source['manifest_sha256'],'entrypoint':'qualify-preparation.mjs','parent':process_identity(os.getpid())}
                result=provision.run_foreground([self.global_operator['node'],SCRIPTS.parent/'tests/admin-harness.mjs',operation_file,child,mode],
                    [pair,*guards],child,timeout=25,guard_barrier=True,harness_audit=audit,
                    operation_binding={'issue_id':self.issue,'operation_id':self.op,'source_sha':self.source['sha']})
                cleanup=next(read_private(p) for p in child.glob('event-*.json') if read_private(p).get('phase')=='process-cleanup')
                browser=read_private(child/'fixture-browser.json');all_records.extend(cleanup['processes']+browser['observed_processes'])
                self.absent(all_records[1:]);self.assertTrue(browser['sandbox']);self.assertEqual(browser['network_requests'],0)
                self.assertEqual(result,0 if mode in ['normal','readback'] else 1,(child/'stderr.log').read_text()[-3000:])
                if result==0:
                    completion=read_private(child/'ui-completion.json');self.assertEqual([x['actor'] for x in completion['receipts']],['bootstrap-admin','card-admin'])
                    self.assertTrue(all(x['effective_admin'] and x['logout']['ui_logout_invoked'] and x['logout']['transport_disconnected'] for x in completion['receipts']))
                    self.assertEqual(len(list(child.glob('capture-*-request.json'))),4)
                    cleanup_file=directory/'cleanup.json';write_private(cleanup_file,cleanup)
                    final=directory/'final';final.mkdir(mode=0o700);input_file=final/'input.json'
                    inputs={'directory':str(final),'operation':operation,'completionFile':str(child/'ui-completion.json'),'cleanupFile':str(cleanup_file)}
                    write_private(input_file,inputs);collector=[self.global_operator['node'],SCRIPTS/'bootstrap-readback.mjs']
                    self.assertEqual(provision.run_foreground([*collector,'request',input_file],[],final/'request',timeout=5),0,(final/'request/stderr.log').read_text())
                    response=final/'parent-response.json';card.wait_file(response,3);inputs.update(requestFile=str(final/'parent-request.json'),responseFile=str(response));write_private(input_file,inputs)
                    self.assertEqual(provision.run_foreground([*collector,'verify',input_file],[],final/'verify',timeout=5),1 if mode=='readback' else 0,(final/'verify/stderr.log').read_text())
                    self.assertEqual(len(list(final.glob('bootstrap-consumed-*.json'))),0 if mode=='readback' else 1)
                    if mode!='readback':self.assertNotEqual(provision.run_foreground([*collector,'verify',input_file],[],final/'replay',timeout=5),0)
                for p,raw in markers.items():self.assertEqual(Path(p).read_bytes(),raw)
                card.check_held([pair,*guards])
        finally:
            (directory/'fixture-stop').touch();responder.wait(timeout=3);self.absent(all_records)
            if prior is None:os.environ.pop('LAB53_FIXTURE_DEPENDENCIES',None)
            else:os.environ['LAB53_FIXTURE_DEPENDENCIES']=prior
            if os.environ.get('LAB53_PROCESS_RECEIPT_DIR'):write_private(Path(os.environ['LAB53_PROCESS_RECEIPT_DIR'])/('admin-linked-'+mode+('-create' if create else '')+'.json'),{'processes':all_records})
    def test_existing_admin_readonly_probe_all_effects_logout_and_new_final_once(self):self.linked()
    def test_never_started_admin_single_create_all_effects_logout_and_new_final_once(self):self.linked(create=True)
    def test_incomplete_identity_blocks(self):self.linked('identity')
    def test_incomplete_effective_admin_blocks(self):self.linked('rights')
    def test_incomplete_logout_blocks(self):self.linked('logout')
    def test_incomplete_final_readback_blocks(self):self.linked('readback')

class MultipleHeldCensus(unittest.TestCase):
    def test_executable_privileged_wrapper_strict_multi_guard_positive_and_real_extra_holder(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);lock=root/'outer.lock';lock.touch(mode=0o600);fd=os.open(lock,os.O_RDWR);fcntl.flock(fd,fcntl.LOCK_EX)
            try:
                guard={**card.binding(lock),'fd':fd};evidence=root/'census'
                command=['unshare','--user','--map-root-user','--pid','--mount','--fork','--mount-proc',sys.executable,SCRIPTS.parent/'tests/card-census-fixture.py']
                result=provision.run_foreground(command,[guard],evidence,timeout=20)
                self.assertEqual(result,0,(evidence/'stderr.log').read_text());receipt=json.loads((evidence/'stdout.log').read_text())
                self.assertEqual(receipt['strict_validation'],'PASS');self.assertEqual(len(receipt['cases']),3)
                self.assertTrue(all(c['guard_count'] in [1,3,5] and c['real_extra_holder']=='REJECTED' and c['negatives']==10 for c in receipt['cases']))
                if os.environ.get('LAB53_PROCESS_RECEIPT_DIR'):
                    write_private(Path(os.environ['LAB53_PROCESS_RECEIPT_DIR'])/'card-census-host-processes.json',{'processes':read_private(evidence/'supervisor-result.json')['processes']})
                    write_private(Path(os.environ['LAB53_PROCESS_RECEIPT_DIR'])/'card-census-namespace.json',receipt)
            finally:os.close(fd)

class ExactCard47Origin(unittest.TestCase):
    def test_retained_original_collector_bindings_and_hash_algorithm_preserve_gaps(self):
        route=load('exact_card47_test','owner-card-observer.py')
        base=Path('/home/user/multica_workspaces/lab-6462f220cf3b/lab-47-fac8fe178ede/workdir/evidence-private/card-observer-504fb604-40c6-4ccf-9f64-c784cb1bb136')
        marker=read_private(base/'observer-marker-final-checkpoint.private.json');original=json.dumps(marker)
        origins=[*[card.binding(base/name) for name in route.ORIGINS],*[card.binding(route.ROOT_ORIGIN_DIR/name) for name in route.ROOT_ORIGINS]]
        exact,partial=route.origin_records(marker,origins);self.assertGreaterEqual(len(exact),23);self.assertEqual(len(partial),2)
        self.assertEqual(json.dumps(marker),original)
        self.assertEqual(len(route.root_origin_records()),11)
        for field,value in [('attempt_uuid',str(uuid4())),('original_card_config_hash','0'*64)]:
            with self.assertRaisesRegex(RuntimeError,'ORIGIN_UNKNOWN'):route.origin_records({**marker,field:value},origins)
        with self.assertRaisesRegex(RuntimeError,'ORIGINAL_BYTES_REQUIRED'):route.origin_records(marker,origins[:-1])
    def test_partial_numeric_pid_is_never_signalled_or_filled_and_live_record_blocks(self):
        route=load('exact_card47_absence_test','owner-card-observer.py')
        with self.assertRaisesRegex(RuntimeError,'PARTIAL_PID_PRESENT_OR_REUSED'):route.absence([{'pid':999999999,'start_ticks':'1'}],[os.getpid()])
        with self.assertRaisesRegex(RuntimeError,'WRITER_PRESENT'):route.absence([process_identity(os.getpid())],[])

if __name__=='__main__':unittest.main()
