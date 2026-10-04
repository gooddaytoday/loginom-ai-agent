"""Prepare the source-only fixture in the actor's own managed runtime.

Uses the pinned installed operator bundle; does not change role configs or
ownership markers. Reviewer must run this in their own checkout/runtime.
"""
import argparse
import json
import os
from pathlib import Path
import shutil
import sys

parser = argparse.ArgumentParser()
parser.add_argument('--worktree', type=Path, required=True)
parser.add_argument('--config', type=Path, required=True)
parser.add_argument('--out', type=Path, required=True)
parser.add_argument('--operator-scripts', type=Path, default=Path.home()/'.local/share/loginom-multica/scripts')
args = parser.parse_args()
sys.path.insert(0, str(args.operator_scripts))
from common import managed_root, read_private, write_private, artifact_lock, verify_candidate, checked_path, ops_identity
from accept import prepare_profile
from linux import run

worktree=args.worktree.resolve()
config=read_private(args.config)
root,owner=managed_root(worktree,config)
attempt=checked_path(args.out.resolve(),root/'attempts')
payload=root/'current'
lock=artifact_lock(root)
try:
    if verify_candidate(worktree,payload).returncode:
        raise RuntimeError('CANDIDATE_INVALID_REBUILD_REQUIRED')
    manifest=json.loads((payload/'cli-manifest.json').read_text())
    if manifest['metadata']['sourceDirty']:
        raise RuntimeError('COMMITTED_SOURCE_REQUIRED')
    attempt.parent.mkdir(mode=0o700,exist_ok=True)
    attempt.mkdir(mode=0o700)
    login=config['loginom']
    source=worktree/'docs/node-development/nodes/transform-crosstable/acceptance/data'
    fixture=json.loads((source/'source-manifest.json').read_text())
    name=fixture['package_basename']
    if name!='lab12-stage2-source-v3.lgp' or fixture['kind']!='source_only' or fixture['derived_reports'] is not False:
        raise RuntimeError('SOURCE_ONLY_MANIFEST_INVALID')
    write_private(attempt/'config.json',dict(url=login['url'],username=login['username'],password=login['password'],api_key=login['api_key'],source_name=name[:-4]))
    shutil.copyfile(source/'variant-source.csv',attempt/'types.csv')
    import hashlib
    data=(attempt/'types.csv').read_bytes()
    if len(data)!=fixture['file']['bytes'] or hashlib.sha256(data).hexdigest()!=fixture['file']['sha256']:
        raise RuntimeError('SOURCE_FIXTURE_HASH_MISMATCH')
    profile=attempt/'profile'
    prepare_profile(profile,manifest['metadata']['channel'],config.get('model_cache_file'))
    launcher=dict(attempt=attempt,payload=payload,profile=profile,cwd=attempt,auth=Path(config['provider_auth_file']),pass_fds=(lock,))
    cli=payload/'bin/loginom-ai-agent-cli'
    setup=dict(url=login['url'],username=login['username'],password=login['password'],apiKey=login['api_key'])
    for step in ['setup','status']:
        command=[cli,'loginom',step,'--format','json']
        if step=='setup':command+=['--stdin-json']
        with (attempt/(step+'.stdout')).open('wb') as out,(attempt/(step+'.stderr')).open('wb') as err:
            code=run(command,**launcher,input=json.dumps(setup).encode() if step=='setup' else None,stdout=out,stderr=err,timeout=240)
        if code:raise RuntimeError('SOURCE_CLI_'+step.upper()+'_FAILED')
    if json.loads((attempt/'status.stdout').read_text()).get('state')!='ready':
        raise RuntimeError('SOURCE_CLI_NOT_READY')
    script=worktree/'scripts/node-acceptance/prepare-variant-source.mjs'
    with (attempt/'stdout.raw').open('wb') as out,(attempt/'stderr.raw').open('wb') as err:
        code=run([payload/'resources/loginom/bin/node',script,payload/'resources/loginom',attempt],attempt=attempt,payload=payload,cwd=attempt,read_only=[worktree],stdout=out,stderr=err,timeout=1800,pass_fds=(lock,))
    result=read_private(attempt/'result.json') if (attempt/'result.json').exists() else {}
    passed=code==0 and result.get('status')=='PASS' and result.get('cleanup')=={'package_closed':True,'logged_out':True}
    write_private(attempt/'preparation.json',dict(status='PASS' if passed else 'FAIL',source_sha=manifest['metadata']['sourceCommit'],role=config['role'],owner=owner,ops=ops_identity(),result=result,exit=code))
    print(json.dumps(dict(status='PASS' if passed else 'FAIL',source_sha=manifest['metadata']['sourceCommit'],phase='source_only_preparation')))
    if not passed:raise SystemExit(1)
finally:
    os.close(lock)
