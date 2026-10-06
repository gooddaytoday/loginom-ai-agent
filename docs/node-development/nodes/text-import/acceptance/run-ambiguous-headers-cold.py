from pathlib import Path
import sys,json,shutil,subprocess,os,argparse
OPS=Path.home()/'.local/share/loginom-multica/scripts';sys.path.insert(0,str(OPS))
from common import read_private,write_private,artifact_lock,verify_candidate
from linux import run
p=argparse.ArgumentParser();p.add_argument('--attempt',required=True,type=Path);p.add_argument('--config',required=True,type=Path);a=p.parse_args();root=Path.cwd();attempt=a.attempt.resolve();cfg=read_private(a.config);res=read_private(attempt/'evidence/result.json');assert res['status']=='CHECK_NEGATIVE' and res['case_id']=='ambiguous_headers' and res['negative_audit']['status']=='PASS'
payload=root/'.multica-node/current';assert verify_candidate(root,payload).returncode==0
resources=payload/'resources/loginom';node=resources/'bin/node';tmp=attempt/'tmp';s=cfg['loginom'];lock=artifact_lock(root/'.multica-node')
acceptance=root/'docs/node-development/nodes/text-import/acceptance'
case=next(c for c in json.loads((acceptance/'matrix/manifest.json').read_text())['cases'] if c['case_id']=='ambiguous_headers');scenario=json.loads((acceptance/'negative/ambiguous-headers.settings.json').read_text());case['columns']=scenario['columns']
write_private(tmp/'expected-negative.json',case);write_private(tmp/'cold-config.json',{'api_key':s['api_key'],'loginom_url':s['url'],'workflow_profile':{'passwordless_login':s['password']=='','loginom_user':s['username'],'password':s['password']}});write_private(tmp/'saved.json',{'path':res['package_path']});operator=read_private(Path(cfg['operator_file']));write_private(tmp/'admin.json',{k:operator[k] for k in ['url','admin_user','admin_password']})
def invoke(command,where,timeout,**kw):
 where.mkdir(mode=0o700)
 with (where/'stdout').open('wb') as out,(where/'stderr').open('wb') as err:return run(command,stdout=out,stderr=err,attempt=attempt,payload=payload,cwd=where,timeout=timeout,pass_fds=(lock,),**kw)
try:
 release=tmp/'release-negative';code=invoke([node,OPS/'release-sessions.mjs','--resources',resources,'--accounts',tmp/'admin.json','--user',s['username'],'--output',release],release,180);assert code==0,'OWN_SESSION_RELEASE_FAILED'
 cold=attempt/'evidence/oracle';code=invoke([node,acceptance/'ambiguous-headers-cold-check.mjs','--config',tmp/'cold-config.json','--resources',resources,'--saved',tmp/'saved.json','--expected',tmp/'expected-negative.json','--output',cold],cold,1200,read_only=[root]);value=json.loads((cold/'result.json').read_text());print(json.dumps({'native_observer_exit':code,'status':value['status'],'error':value.get('error'),'cleanup':value['cleanup']}));assert code==0,'NEGATIVE_COLD_OBSERVATION_FAILED'
 res['cleanup']=value['cleanup'];res['oracle_exit']=code;res['oracle']={'status':'PASS','native_source':value['source'],'import_nodes':value['import_nodes'],'execute_started':False};res['status']='PASS';res.pop('error',None);write_private(attempt/'evidence/result.json',res)
finally:os.close(lock)
