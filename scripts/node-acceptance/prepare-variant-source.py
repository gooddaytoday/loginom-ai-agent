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
os.umask(0o077)

parser = argparse.ArgumentParser()
parser.add_argument('--worktree', type=Path, required=True)
parser.add_argument('--config', type=Path, required=True)
parser.add_argument('--out', type=Path, required=True)
parser.add_argument('--operator-scripts', type=Path, default=Path.home()/'.local/share/loginom-multica/scripts')
parser.add_argument('--reuse-existing', action='store_true', help='Read-only verify the existing own source; never bootstrap or save it')
args = parser.parse_args()
sys.path.insert(0, str(args.operator_scripts))
from common import managed_root, read_private, write_private, artifact_lock, verify_candidate, checked_path, ops_identity
from accept import prepare_profile
from linux import run

worktree=args.worktree.resolve()
config=read_private(args.config)
root,owner=managed_root(worktree,config)
attempt=checked_path(args.out.resolve(),root/'attempts')
if attempt.parent!=root/'attempts':
    raise RuntimeError('MANAGED_ATTEMPT_REQUIRED')
payload=root/'current'
lock=artifact_lock(root)
created=False
manifest={};result={};code=None
try:
    attempt.parent.mkdir(mode=0o700,exist_ok=True)
    attempt.mkdir(mode=0o700)
    created=True
    if verify_candidate(worktree,payload).returncode:
        raise RuntimeError('CANDIDATE_INVALID_REBUILD_REQUIRED')
    manifest=json.loads((payload/'cli-manifest.json').read_text())
    if manifest['metadata']['sourceDirty']:
        raise RuntimeError('COMMITTED_SOURCE_REQUIRED')
    login=config['loginom']
    source=worktree/'docs/node-development/nodes/transform-crosstable/acceptance/data'
    fixture=json.loads((source/'source-manifest.json').read_text())
    name=fixture['package_basename']
    if name!='lab12-stage2-source-v3.lgp' or fixture['kind']!='source_only' or fixture['derived_reports'] is not False:
        raise RuntimeError('SOURCE_ONLY_MANIFEST_INVALID')
    write_private(attempt/'config.json',dict(url=login['url'],username=login['username'],password=login['password'],api_key=login['api_key'],source_name=name[:-4],reuse_existing=args.reuse_existing))
    write_private(attempt/'fixture.json',fixture)
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
    if not passed:raise RuntimeError('SOURCE_PREPARATION_FAILED')
    from source_manifest import actor_source_manifest
    actor=actor_source_manifest(read_private(attempt/'source-manifest.json'),fixture,login['username'])
    write_private(source/'actor-source.json',actor)
    write_private(attempt/'preparation.json',dict(status='PASS',source_sha=manifest['metadata']['sourceCommit'],role=config['role'],owner=owner,ops=ops_identity(),result=result,exit=code))
    print(json.dumps(dict(status='PASS',source_sha=manifest['metadata']['sourceCommit'],phase='source_only_preparation')))
except Exception as error:
    # A rejected private result/manifest is a failed preparation even when the
    # browser saved a package successfully. Keep that negative outcome private
    # and do not export identities or claim a successful wrapper result.
    reason=str(error) if isinstance(error,RuntimeError) else 'SOURCE_PREPARATION_FAILED'
    if created:
        write_private(attempt/'preparation.json',dict(status='FAIL',source_sha=manifest.get('metadata',{}).get('sourceCommit'),role=config['role'],owner=owner,ops=ops_identity(),result=result,exit=code,error=reason))
    print(json.dumps(dict(status='FAIL',phase='source_only_preparation',error=reason)))
    raise SystemExit(1)
finally:
    os.close(lock)
