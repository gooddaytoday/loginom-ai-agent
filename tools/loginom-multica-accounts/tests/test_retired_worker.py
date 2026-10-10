"""Targeted retired Worker45 source checks, isolated files and exact own PIDs."""
import fcntl
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from uuid import uuid4
SCRIPTS=Path(__file__).resolve().parents[1]/'scripts';sys.path.insert(0,str(SCRIPTS))
from common import read_private,write_private,process_identity
spec=importlib.util.spec_from_file_location('retired_source_tests',SCRIPTS/'owner-retired-worker.py')
retired=importlib.util.module_from_spec(spec);spec.loader.exec_module(retired)

class RetiredWorker(unittest.TestCase):
    def test_originals_supply_exact_records_without_filling_missing_ticks_or_old_pass(self):
        marker={'issue_id':retired.PAIR_ISSUE,'attempt_id':retired.ATTEMPT,'status':'retired_cleanup_confirmed',
            'pid':176775,'lock_inode':2396009,'cleanup_sha256':retired.CLEANUP_SHA}
        stock={'issue_id':retired.PAIR_ISSUE,'immutable_attempt':{'uuid':retired.ATTEMPT},
            'account_locks':[{'role':'worker','inode':2396009}],
            'historical_ambiguous_preserved':True,'historical_ambiguous_resolved':False,
            'own_pid_tree_recorded':[{'pid':123,'start_ticks':'42'},{'pid':456,'start_ticks':None}]}
        cleanup={'browser_processes':[{'pid':789,'start_ticks':'84'}],'own_process_absence':False}
        exact,partial=retired.origin_records(marker,cleanup,stock)
        self.assertEqual(exact,[{'pid':123,'start_ticks':'42'},{'pid':789,'start_ticks':'84'}])
        self.assertEqual(partial,[456,176775]);self.assertNotIn('start_ticks',marker)
        for key,value in [('attempt_id',str(uuid4())),('cleanup_sha256','0'*64),('status','ready'),('start_ticks','999')]:
            with self.subTest(key=key),self.assertRaisesRegex(RuntimeError,'ORIGIN_UNKNOWN'):
                retired.origin_records({**marker,key:value},cleanup,stock)

    def test_live_exact_and_reused_unbound_pid_each_block_without_signals(self):
        with self.assertRaisesRegex(RuntimeError,'WRITER_PRESENT'): retired.current_process_absence([process_identity(os.getpid())],[])
        child=subprocess.run([sys.executable,'-c',"import os,json;f=open('/proc/self/stat').read().rsplit(')',1)[1].split();print(json.dumps({'pid':os.getpid(),'start_ticks':f[19]}))"],capture_output=True,check=True)
        record=json.loads(child.stdout)
        retired.current_process_absence([record],[record['pid']])
        with self.assertRaisesRegex(RuntimeError,'PARTIAL_PID_PRESENT_OR_REUSED'): retired.current_process_absence([record],[os.getpid()])
        if os.environ.get('LAB53_PROCESS_RECEIPT_DIR'): write_private(Path(os.environ['LAB53_PROCESS_RECEIPT_DIR'])/'retired-known-child.json',{'processes':[record]})

    def test_nonprivileged_census_does_not_claim_complete_absence(self):
        if os.getuid()==0: self.skipTest('negative nonprivileged probe requires normal owner UID')
        with tempfile.TemporaryDirectory() as directory:
            request=Path(directory)/'request.json';write_private(request,{})
            result=subprocess.run([sys.executable,SCRIPTS/'retired-fd-inventory.py',request],capture_output=True)
        self.assertNotEqual(result.returncode,0);self.assertIn(b'PRIVILEGED_CENSUS_REQUIRED',result.stderr)

    def test_wrong_source_or_authorization_refuses_before_lock_or_marker_changes(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory); grant=root/'authorization.json';write_private(grant,{'schema':'wrong','source':{}})
            sha=subprocess.check_output(['git','-C',SCRIPTS,'rev-parse','HEAD'],text=True).strip()
            result=subprocess.run([sys.executable,SCRIPTS/'owner-retired-worker.py','--authorization',grant,
                '--evidence-dir',root/'unused','--source-sha',sha],capture_output=True,timeout=5)
            self.assertNotEqual(result.returncode,0);self.assertIn(b'OWNER_BINDING_REQUIRED',result.stderr)
            self.assertFalse((root/'unused').exists());self.assertEqual(list(root.iterdir()),[grant])

    def test_executable_dual_flock_complete_census_negative_and_rollback(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);lock=root/'outer.lock';lock.touch(mode=0o600);fd=os.open(lock,os.O_RDWR)
            try:
                fcntl.flock(fd,fcntl.LOCK_EX)
                command=['unshare','--user','--map-root-user','--pid','--mount','--fork','--mount-proc',
                    sys.executable,SCRIPTS.parent/'tests/retired-census-fixture.py']
                evidence=root/'foreground'
                self.assertEqual(retired.provision.run_foreground(command,[{**retired.owner.binding(lock),'fd':fd}],evidence,timeout=15,stop_timeout=1),0,
                    (evidence/'stderr.log').read_text())
                proof=json.loads((evidence/'stdout.log').read_text())
                self.assertEqual(proof['strict_validation'],'PASS');self.assertEqual(len(proof['negative_cases']),10)
                self.assertEqual(proof['scope'],'isolated-user-pid-mount-namespace')
                self.assertEqual(proof['proof']['before']['errors'],[]);self.assertEqual(proof['proof']['after']['errors'],[])
                self.assertEqual(proof['rollback'],'EXACT_BYTES_AND_INODE')
                records=read_private(evidence/'supervisor-result.json')['processes']
                for record in records:
                    current=process_identity(record['pid'])
                    self.assertTrue(current is None or current['start_ticks']!=record['start_ticks'] or current['state'] in {'Z','X'})
                if os.environ.get('LAB53_PROCESS_RECEIPT_DIR'):
                    target=Path(os.environ['LAB53_PROCESS_RECEIPT_DIR'])
                    write_private(target/'retired-namespace-host-processes.json',{'processes':records})
                    write_private(target/'retired-namespace-census.json',proof)
            finally: os.close(fd)
if __name__=='__main__':unittest.main()
