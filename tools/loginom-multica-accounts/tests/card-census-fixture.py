"""Actual complete collector/validator under 3/5 own OFDs, own namespace only."""
import copy,fcntl,importlib.util,json,os,subprocess,sys,tempfile
from pathlib import Path
from uuid import uuid4
SCRIPTS=Path(__file__).resolve().parents[1]/'scripts';sys.path.insert(0,str(SCRIPTS))
from common import write_private,process_identity
spec=importlib.util.spec_from_file_location('fixture_card_fd',SCRIPTS/'card-admin-common.py')
card=importlib.util.module_from_spec(spec);spec.loader.exec_module(card)
def run():
    if os.getpid()!=1:raise RuntimeError('OWN_NAMESPACE_REQUIRED')
    cases=[]
    for count in [1,3,5]:
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);guards=[];target=root/'config.json';write_private(target,{'fixture':True})
            try:
                for i in range(count):
                    lock=root/(str(i)+'.lock');lock.touch(mode=0o600);fd=os.open(lock,os.O_RDWR);fcntl.flock(fd,fcntl.LOCK_EX)
                    guards.append({**card.binding(lock),'fd':fd})
                request={'operation_id':str(uuid4()),'nonce':'b'*64,'guardian':process_identity(os.getpid()),
                    'guard':guards[0],'guards':guards,'targets':[card.binding(target),*[card.binding(g['path']) for g in guards]],
                    'census_namespace':{'pid_namespace':os.readlink('/proc/self/ns/pid'),'user_namespace':os.readlink('/proc/self/ns/user')}}
                file=root/'request.json';write_private(file,request)
                def census():
                    result=subprocess.run([sys.executable,SCRIPTS/'held-fd-inventory.py',file],capture_output=True,timeout=10)
                    if result.returncode:raise RuntimeError(result.stderr.decode())
                    return json.loads(result.stdout)
                proof=census();card.validate_fd(request,proof);card.check_held(guards);negatives=0
                for case in ['denial','race','error','holder','control','guard','inventory','nonce','uid','namespace']:
                    broken=copy.deepcopy(proof)
                    if case in ['denial','race','error']:broken['after']['errors'].append({'error':case})
                    elif case=='holder':broken['before']['holders'].append({'pid':999,'fd':999,'device':0,'inode':0})
                    elif case=='control':broken['after']['control_observed']=False
                    elif case=='guard':broken['before']['holders'].remove({'pid':1,**{k:guards[-1][k] for k in ['fd','device','inode']}})
                    elif case=='inventory':broken['after']['visible_pids'].append(3)
                    elif case=='nonce':broken['nonce']='0'*64
                    elif case=='uid':broken['privileged_census']['euid']=1000
                    else:broken['privileged_census']['pid_namespace']='pid:[foreign]'
                    try:card.validate_fd(request,broken)
                    except RuntimeError:negatives+=1
                    else:raise RuntimeError('NEGATIVE_ADMITTED:'+case)
                fd=os.open(target,os.O_RDONLY)
                try:
                    try:card.validate_fd(request,census())
                    except RuntimeError as error:
                        if str(error)!='CARD_FOREIGN_FD_PRESENT':raise
                    else:raise RuntimeError('REAL_EXTRA_HOLDER_ADMITTED')
                finally:os.close(fd)
                cases.append({'guard_count':count,'proof':proof,'negatives':negatives,'real_extra_holder':'REJECTED'})
            finally:
                for g in guards:os.close(g['fd'])
    return {'strict_validation':'PASS','scope':'isolated-user-pid-mount-namespace','cases':cases,'host_absence':'NOT_PROVED','server_absence':'NOT_PROVED'}
if __name__=='__main__':print(json.dumps(run()))
