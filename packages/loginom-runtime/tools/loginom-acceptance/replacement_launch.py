"""Explicit Node 11 launch gate. Preflight starts neither Hermes model nor browser."""
import argparse,json,subprocess,sys
from pathlib import Path
from preflight import runtime_pin
from replacement_acceptance import CODE,RUNTIME
from replacement_upload_probe import validate_catalog
ROOT=Path(__file__).resolve().parents[2]
def command(pin=None):
 args=[sys.executable,str(ROOT/'tools/loginom-acceptance/run.py'),'--goal','replacement-node-complete','--model-profile','chatgpt-sol','--loginom-user','test-2','--storage-directory','/test-2','--loginom-url','http://logi-test-plan.bg.local/app/?testable=true','--timeout','3600','--max-turns','100','--node','/Users/kartamyshev/.loginom-dock/releases/0.1.0-dev.20260910.3-80ca61417ec7/runtime/node','--browsers','/Users/kartamyshev/.loginom-dock/runtime/browsers','--dock-config',str(ROOT/'.dock/stream-runtime/config.json'),'--hermes-home','/Users/kartamyshev/.hermes','--hermes','/Users/kartamyshev/.local/bin/hermes','--hermes-python','/Users/kartamyshev/.hermes/hermes-agent/venv/bin/python','--hermes-source','/Users/kartamyshev/.hermes/hermes-agent','--runs-root',str(ROOT/'.dock/replacement/acceptance-runs')]
 if pin:args+=['--manifest-uri',pin['manifest_uri'],'--manifest-sha256',pin['manifest_sha256']]
 return args
def validate_pin(pin):
 validate_catalog(pin['manifest_uri'],pin['manifest_sha256'],'/test-2')
 if not (pin['staged'] is True and pin['readback_verified'] is True and pin['activated'] is False and pin['code_commit']==CODE and pin['runtime_revision']==RUNTIME and set(pin['save_revisions'])=={'package.save_checkpoint','package.save_as'}):raise ValueError('Coordinator stage/readback pin required')
 if any(not isinstance(x,str) or not x for x in pin['save_revisions'].values()):raise ValueError('Observed save revisions required')
 return pin
if __name__=='__main__':
 p=argparse.ArgumentParser();m=p.add_mutually_exclusive_group(required=True);m.add_argument('--preflight',action='store_true');m.add_argument('--run',action='store_true');p.add_argument('--output',type=Path);p.add_argument('--candidate-pin',type=Path);p.add_argument('--slot-id');a=p.parse_args()
 if runtime_pin(ROOT)['client_revision']!=RUNTIME:raise SystemExit('Node 11 source differs from pinned code')
 if a.preflight:
  if a.output is None:p.error('--preflight requires --output')
  args=command()+['--preflight','--output',str(a.output)]
 else:
  if not a.candidate_pin or not a.slot_id:p.error('Coordinator candidate pin and explicit slot ID are required')
  pin=validate_pin(json.loads(a.candidate_pin.read_text()))
  args=command(pin)+['--run']
 raise SystemExit(subprocess.call(args,cwd=ROOT))
