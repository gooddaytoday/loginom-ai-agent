"""Native Hermes corpus runs. No oracle or scenario recipe enters the model prompt."""
import argparse
import fcntl
import json
import os
from pathlib import Path
import shlex
import shutil
import signal
import sqlite3
import subprocess
import time
import uuid

import run as common
from preflight import runtime_pin
from node_efficiency import node_efficiency, USAGE_KEYS
from scenario_answer import export_final_answer
from scenario_private_cleanup import cleanup_completed_run
from scenario_profile import effective_profile, hermes_command, openrouter_connection, validate_profile
from scenario_usage import session_usage

ROOT = Path(__file__).resolve().parents[2]
PRIMARY = {2, 47, 21, 19, 34, 38}
CANDIDATES = {2,4,14,16,17,19,20,21,23,24,25,27,28,29,32,34,36,38,39,42,43,45,47,48,49,50}
SKIPS = {
 1:'Не определены границы категорий оценок и аномалий',3:'Коэффициент корреляции не проверен поддержанными операциями',
 5:'Нет принятого обучения/классификации',6:'Нет принятого теста статистической значимости',
 7:'Нет истории активности для матрицы удержания; противоречие cohort/signup_date',8:'Нет обработчика кластеризации',
 9:'Извлечение ключевых слов не проверено',10:'Токенизация покупок и парные формулы не проверены',
 11:'Нет обработчика регрессии',12:'Не определены и не проверены методы обнаружения аномалий',
 13:'Нет обработки цензурирования и survival',15:'Нет статистических тестов',18:'Нет плановых/фактических сроков доставки',
 22:'Корреляция не проверена',26:'Корреляция не проверена',30:'Нет статистического теста нескольких вариантов',
 31:'Корреляция не проверена',33:'Период противоречив, month_num одинаков для всех строк',
 35:'Заявлен месяц, даты охватывают больше года',37:'Нет затрат; медиана не поддержана',
 40:'Период противоречив, нет дат использования',41:'Не определён Sharpe секторного портфеля',
 44:'Нет названий каналов и истории промежуточного выпадения',46:'improvement противоречит baseline−final',
}

def package_cleanup_evidence(dock):
    """A successful model process does not establish a released Loginom session."""
    dock=dock.resolve()
    receipts=[]
    for metadata_path in sorted((dock/'sessions').glob('*/session.json')):
        metadata=json.loads(metadata_path.read_text())
        if not metadata.get('workspacePreparation',{}).get('attempted'):
            continue
        cleanup_path=metadata_path.parent/'package-cleanup.json'
        receipt=json.loads(cleanup_path.read_text()) if cleanup_path.is_file() else dict(status='MISSING')
        receipts.append(dict(session_id=metadata.get('sessionId'),
            profile_owned=metadata.get('sessionId')==metadata_path.parent.name
                and isinstance(metadata.get('profile'),str) and Path(metadata['profile']).is_absolute()
                and Path(metadata['profile']).resolve()==metadata_path.parent/'browser-profile',
            receipt=receipt))
    return dict(status='PASS' if receipts and all(r['profile_owned'] and r['receipt'].get('status')=='SUCCEEDED'
        and r['receipt'].get('session_id')==r['session_id'] and r['receipt'].get('package_closed') is True
        and r['receipt'].get('logged_out') is True and r['receipt'].get('unsaved_changes_discarded') is False
        for r in receipts) else 'UNCONFIRMED',sessions=receipts)

def inventory(root):
    rows=[]
    for folder in sorted(root.glob('task[0-9][0-9]-*')):
        number=int(folder.name[4:6]);description=folder/'description.md';dataset=folder/'data/dataset.csv'
        if not description.is_file() or not dataset.is_file():
            raise ValueError('Task input missing: '+folder.name)
        rows.append(dict(task=folder.name,number=number,status='candidate' if number in CANDIDATES else 'skipped',
                         reason=SKIPS.get(number),repetitions=3 if number in PRIMARY else 1 if number in CANDIDATES else 0,
                         description_sha256=common.sha(description),dataset_sha256=common.sha(dataset),dataset_bytes=dataset.stat().st_size))
    if {x['number'] for x in rows}!=set(range(1,51)):raise ValueError('Expected exactly the reviewed 50 tasks')
    return rows

def execute(args):
    os.umask(0o077)
    validate_profile(args.provider,args.model)
    if args.provider!='xiaomi' and args.phase!='diagnostic':
        raise ValueError('Ling comparison is diagnostic only; MiMo acceptance unchanged')
    tasks=inventory(args.corpus)
    if args.inventory:
        common.write(args.inventory,dict(tasks=tasks,classification='preliminary; each candidate requires full independent audit'))
        return 0
    selected=next(x for x in tasks if x['number']==args.task)
    if selected['status']!='candidate':raise ValueError('Task skipped: '+selected['reason'])
    if not args.storage or not args.storage.startswith('/mimo/MiMo-'):raise ValueError('Explicit verified isolated storage required')
    args.runs_root.mkdir(parents=True,exist_ok=True)
    with (args.runs_root/'hermes.lock').open('a') as lock:
        fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
        return launch(args,selected)

def launch(args,task):
    run_id=time.strftime('%Y%m%d-%H%M%S')+'-'+uuid.uuid4().hex[:8]
    out=args.runs_root/run_id;out.mkdir(mode=0o700)
    home=out/'private/hermes-home';dock=out/'private/dock-state'
    for p in [home/'plugins',home/'skills/loginom',dock/'bin',dock/'runtime']:p.mkdir(parents=True,exist_ok=True)
    node=Path.home()/'.loginom-dock/current/runtime/node'
    (dock/'runtime/browsers').symlink_to(Path.home()/'.loginom-dock/runtime/browsers')
    config=json.loads(args.dock_config.read_text())
    config['loginom_url']=args.loginom_url
    config['workflow_profile'].update(passwordless_login=True,loginom_user='mimo',storage_directories={k:args.storage for k in ['packages','inputs','exports']})
    common.write(dock/'config.json',config)
    launcher=dock/'bin/loginom-dock'
    launcher.write_text('#!/bin/sh\nexport LOGINOM_DOCK_HOME='+shlex.quote(str(dock))+'\nexec '+shlex.quote(str(node))+' '+shlex.quote(str(ROOT/'client/bin/dispatch.mjs'))+' "$@"\n');launcher.chmod(0o700)
    shutil.copytree(ROOT/'plugins/loginom-dock-hermes',home/'plugins/loginom-dock',ignore=shutil.ignore_patterns('__pycache__'))
    common.write(home/'skills/loginom/SKILL.md',(ROOT/'plugins/loginom-dock-hermes/skills/loginom/SKILL.md').read_text())
    package=args.storage+'/scenario.lgp'
    hc={'fallback_providers':[],'mcp_single_query_discovery_timeout':180,'mcp_servers':{'loginom-dock':{
        'command':str(launcher),'args':['mcp','hermes','mimo-stability','--acceptance-cleanup-package',package],
        'connect_timeout':180,'timeout':360,'enabled':True}},
        'agent':{'max_turns':args.max_turns,'reasoning_effort':'medium'},'terminal':{'env':'local'},
        'tools':{'tool_search':{'enabled':'off'}},'memory':{'provider':'none'},'plugins':{'enabled':['loginom-dock']},
        'display':{'compact':True},'checkpoints':{'enabled':False}}
    common.write(home/'config.yaml',hc)
    folder=args.corpus/task['task'];dataset=folder/'data/dataset.csv'
    prompt=(folder/'description.md').read_text().rstrip()+'\n\nПострой и выполни сценарий в Loginom. Сохрани готовый пакет: '+package+'.\n\n@file:'+str(dataset)+'\n'
    common.write(out/'scenario.txt',prompt)
    expansion=subprocess.run([str(Path.home()/'.hermes/hermes-agent/venv/bin/python'),
        str(ROOT/'tools/loginom-acceptance/scenario-native-prompt.py'),str(out/'scenario.txt'),
        str(out/'scenario-native.txt'),str(folder)],capture_output=True,text=True,timeout=60)
    if expansion.returncode:raise RuntimeError('Native Hermes attachment expansion failed; model not started')
    common.write(out/'attachment-expansion.json',json.loads(expansion.stdout))
    prompt=(out/'scenario-native.txt').read_text()
    frozen=runtime_pin(ROOT);model_env=(common.xiaomi_connection if args.provider=='xiaomi' else openrouter_connection)(Path.home()/'.hermes')
    secrets=[config.get('api_key'),model_env.get('XIAOMI_API_KEY'),model_env.get('OPENROUTER_API_KEY')]
    common.write(out/'request.json',dict(run_id=run_id,task=task,provider=args.provider,model=args.model,reasoning_effort='medium',
        loginom_url=args.loginom_url,loginom_user='mimo',storage=args.storage,package=package,runtime_source_pin=frozen,
        prompt_sha256=common.sha(out/'scenario-native.txt'),fallback_allowed=False,native_hooks=True,phase=args.phase))
    env=common.environment(model_env,home,out);env['LOGINOM_DOCK_HOME']=str(dock)
    argv=hermes_command(Path.home()/'.local/bin/hermes',out/'scenario-native.txt',args.max_turns,provider=args.provider,model=args.model)
    subprocess.run([str(node),str(ROOT/'tools/loginom-acceptance/scenario-preflight.mjs'),str(launcher),package],cwd=out,env=env,check=True,timeout=180)
    started=time.time();timed_out=False
    child=subprocess.Popen(argv,cwd=out,env=env,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,start_new_session=True)
    common.write(out/'process.json',dict(pid=child.pid,started_at=started))
    print(json.dumps(dict(run_id=run_id,pid=child.pid,directory=str(out),provider=args.provider,model=args.model,stage='model_started')),flush=True)
    try:child.wait(timeout=args.timeout)
    except (subprocess.TimeoutExpired,KeyboardInterrupt):
        timed_out=True;os.killpg(child.pid,signal.SIGTERM)
        try:child.wait(timeout=15)
        except subprocess.TimeoutExpired:os.killpg(child.pid,signal.SIGKILL);child.wait(timeout=15)
    usage_path=out/'private/usage.json';usage=json.loads(usage_path.read_text()) if usage_path.exists() else {}
    calls,results=common.export_history(home,secrets)
    usage_recovery=session_usage(home,[c['session_id'] for c in calls],provider=args.provider,model=args.model)
    if not usage and usage_recovery['status']=='RECOVERED':usage=usage_recovery['usage']
    common.write(out/'final-answer.json',export_final_answer(home,secrets))
    evidence=dict(run_id=run_id,export_complete=True,runtime_source_unchanged=runtime_pin(ROOT)==frozen,
        process=dict(returncode=child.returncode,timed_out=timed_out,seconds=time.time()-started,usage={k:usage.get(k) for k in USAGE_KEYS}),
        calls=calls,tools=results,events=common.exported_events(dock,secrets),audit_status='PENDING_INDEPENDENT_AUDIT')
    evidence['efficiency']=node_efficiency(evidence)
    evidence['session_teardown']=package_cleanup_evidence(dock)
    evidence['effective_profile']=effective_profile(home,provider=args.provider,model=args.model)
    evidence['usage_source']='hermes_session_sqlite' if usage_recovery['status']=='RECOVERED' else 'unavailable'
    db=sqlite3.connect((home/'state.db').resolve().as_uri()+'?mode=ro',uri=True)
    evidence['effective_models']=[dict(zip(['model','count'],r)) for r in db.execute('SELECT model, count(*) FROM sessions GROUP BY model')];db.close()
    common.write(out/'evidence.json',common.clean(evidence,secrets))
    cleanup_completed_run(out)
    print(json.dumps(dict(run_id=run_id,stage='exported',returncode=child.returncode,timed_out=timed_out,calls=len(calls))),flush=True)
    return 0 if not timed_out and child.returncode==0 else 1

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--corpus',type=Path,default=Path('/Users/kartamyshev/Git/analitic'))
    parser.add_argument('--inventory',type=Path)
    parser.add_argument('--task',type=int)
    parser.add_argument('--provider',default='xiaomi')
    parser.add_argument('--model',default='mimo-v2.5')
    parser.add_argument('--storage')
    parser.add_argument('--phase',choices=['baseline','diagnostic','acceptance'],default='diagnostic')
    parser.add_argument('--loginom-url',default='http://10.200.11.224/app/?testable=true')
    parser.add_argument('--dock-config',type=Path,default=Path.home()/'.loginom-dock/profiles/hermes-user.json')
    parser.add_argument('--runs-root',type=Path,default=ROOT/'.dock/mimo-stability-20260916/runs')
    parser.add_argument('--timeout',type=int,default=3600)
    parser.add_argument('--max-turns',type=int,default=120)
    args=parser.parse_args()
    if not args.inventory and args.task is None:parser.error('--task or --inventory required')
    return execute(args)

if __name__=='__main__':raise SystemExit(main())
