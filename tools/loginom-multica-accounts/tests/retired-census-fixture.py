"""Real dual-OFD/control census and immutable archive transaction, own namespace.

No historical real marker is read or changed. Fixture visibility is not mas
privileged visibility or server absence.
"""
import copy
import fcntl
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
from unittest.mock import patch
from uuid import uuid4
SCRIPTS=Path(__file__).resolve().parents[1]/'scripts'
sys.path.insert(0,str(SCRIPTS))
from common import write_private, read_private, process_identity
spec=importlib.util.spec_from_file_location('retired_namespace',SCRIPTS/'owner-retired-worker.py')
retired=importlib.util.module_from_spec(spec);spec.loader.exec_module(retired)
owner=retired.owner

def run():
    if os.getpid()!=1: raise RuntimeError('OWN_PID_NAMESPACE_REQUIRED')
    with tempfile.TemporaryDirectory() as directory:
        root=Path(directory); guards=[]
        marker=root/'worker.active.json';write_private(marker,{'status':'retired_cleanup_confirmed','old_start_ticks':None})
        old=owner.binding(marker)
        for role in ['worker','reviewer']:
            p=root/(role+'.lock');p.touch(mode=0o600);fd=os.open(p,os.O_RDWR);fcntl.flock(fd,fcntl.LOCK_EX)
            guards.append({**owner.binding(p),'role':role,'fd':fd})
        try:
            request={'operation_id':str(uuid4()),'nonce':'a'*64,'guardian':process_identity(os.getpid()),
                'guard':guards[0],'role_guards':guards,'targets':[{k:g[k] for k in ['path','device','inode','sha256']} for g in guards]+[old],
                'census_namespace':{'pid_namespace':os.readlink('/proc/self/ns/pid'),'user_namespace':os.readlink('/proc/self/ns/user')}}
            path=root/'fd-request.json';write_private(path,request)
            def census():
                result=subprocess.run([sys.executable,SCRIPTS/'retired-fd-inventory.py',path],capture_output=True,timeout=10)
                if result.returncode: raise RuntimeError('FIXTURE_COLLECTOR_FAILED:'+result.stderr.decode())
                return json.loads(result.stdout)
            proof=census();retired.validate_pair_fd(request,proof)
            retired.verify_held(guards)
            negatives=[]
            for case in ['denial','race','error','holder','missing-control','missing-reviewer','inventory','nonce','privilege','namespace']:
                broken=copy.deepcopy(proof)
                if case in ['denial','race','error']: broken['after']['errors'].append({'error':case,'pid':1})
                elif case=='holder': broken['after']['holders'].append({'pid':999,'fd':42,'device':old['device'],'inode':old['inode']})
                elif case=='missing-control': broken['after']['control_observed']=False
                elif case=='missing-reviewer': broken['before']['holders'].remove({'pid':1,**{k:guards[1][k] for k in ['fd','device','inode']}})
                elif case=='inventory': broken['after']['visible_pids'].append(3)
                elif case=='nonce': broken['nonce']='0'*64
                elif case=='privilege': broken['privileged_census']['euid']=1000
                else: broken['privileged_census']['pid_namespace']='pid:[unbound]'
                try: retired.validate_pair_fd(request,broken)
                except RuntimeError as error: negatives.append({'case':case,'code':str(error)})
                else: raise RuntimeError('NEGATIVE_ADMITTED:'+case)
            extra=os.open(marker,os.O_RDONLY)
            try:
                try: retired.validate_pair_fd(request,census())
                except RuntimeError as error:
                    if str(error)!='RETIRED_FD_HOLDER_PRESENT': raise
                else: raise RuntimeError('REAL_EXTRA_HOLDER_ADMITTED')
            finally: os.close(extra)
            receipt=root/'receipt.json'
            # A durable receipt failure after canonical removal must restore
            # the same original inode/status/unknown ticks under both guards.
            with patch.object(owner,'write_private',side_effect=OSError('fixture receipt fault')):
                try: owner.archive_legacy([old],root/'failed-history',receipt,{'ready':False})
                except OSError: pass
                else: raise RuntimeError('FAULT_NOT_REJECTED')
            if owner.binding(marker)!=old or receipt.exists(): raise RuntimeError('EXACT_ROLLBACK_FAILED')
            owner.archive_legacy([old],root/'success-history',receipt,{'ready':False,'history_state':'UNKNOWN_PRESERVED'})
            archived=read_private(receipt)['markers'][0]
            if marker.exists() or Path(archived['file']).stat().st_ino!=old['inode'] or archived['sha256']!=old['sha256']:
                raise RuntimeError('IMMUTABLE_ARCHIVE_FAILED')
            for g in guards:
                if os.fstat(g['fd']).st_ino!=g['inode']: raise RuntimeError('GUARD_CHANGED')
            return {'scope':'isolated-user-pid-mount-namespace','strict_validation':'PASS','proof':proof,
                'negative_cases':negatives,'real_extra_holder':'REJECTED','rollback':'EXACT_BYTES_AND_INODE',
                'archive':'ORIGINAL_BYTES_INODE_STATUS_PRESERVED','server_absence':'NOT_PROVED','host_absence':'NOT_PROVED'}
        finally:
            for g in guards: os.close(g['fd'])
if __name__=='__main__': print(json.dumps(run()))
