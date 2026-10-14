#!/usr/bin/python3
"""Synthetic external CLI, only mounted in the no-network source-test namespace."""
import os,json,pathlib,sys,time
assert os.environ.get('EVAL_CLI_MODE')=='fake'
source=os.environ['EVAL_ARTIFACT_SOURCE'];assert source.startswith('dir:')
root=pathlib.Path(source[4:]);data=json.loads((root/'pages.json').read_bytes())
args=sys.argv[1:]
with (root/'requests.jsonl').open('a') as log:log.write(json.dumps(args)+'\n')
time.sleep(.03)
if args==['agent','list','--output','json']:
    print(json.dumps(data['roster']));sys.exit(0)
assert args[:2]==['agent','tasks'] and args[3:7]==['--limit','200','--output','json']
before=None if len(args)==7 else args[8]
assert len(args)==7 or len(args)==9 and args[7]=='--before'
page=next(p for p in data['agents'] if p['id']==args[2])['pages']
page=next(p for p in page if p['before']==before)
sys.stdout.write(page['stdout']);sys.stderr.write(page['stderr'])
