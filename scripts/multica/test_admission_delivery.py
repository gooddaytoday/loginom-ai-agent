"""Offline SOURCE admit/claim/Popen/kernel peer; harmless bootstrap double only."""
import copy
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import types
import unittest
from unittest.mock import patch
import admit
import admission_delivery as delivery
from test_admit import AdmissionTest as _Fixture, pin

_RECEIVER = r'''
import hashlib,hmac,json,os,socket,sys,time
from pathlib import Path
def enc(x):return json.dumps(x,sort_keys=True,separators=(',',':'),ensure_ascii=True).encode()
fd=int(os.environ.pop('LOGINOM_PRIVATE_ADMISSION_FD'));os.set_inheritable(fd,False)
with os.fdopen(fd,'rb') as pipe:b=json.loads(pipe.readline())
key=bytes.fromhex(b['key']);s=socket.socket(socket.AF_UNIX,socket.SOCK_STREAM);s.settimeout(3)
def recv():
 data=b''
 while not data.endswith(b'\n'):
  x=s.recv(1)
  if not x:raise EOFError('parent refused')
  data+=x
 return json.loads(data)
def send(x):s.sendall(enc(x)+b'\n')
def mac(stage,t):return hmac.new(key,stage.encode()+b'\0'+enc(t),hashlib.sha256).hexdigest()
try:
 if MODE=='foreign':
  pid=os.fork()
  if pid:
   os.waitpid(pid,0);sys.exit(8)
 if MODE=='wrong-key':key=b'x'*32
 s.connect(b['endpoint']);send({'format':'multica-private-child-v1','nonce':'1'*64})
 if MODE=='lost-response':sys.exit(7)
 c=recv();t=c['transcript'];assert str(json.loads(t['origin_json'])['deadline_unix_ns'])==t['deadline_unix_ns'];assert hmac.compare_digest(c['mac'],mac('challenge',t))
 send({'mac':mac('response',t)})
 g=recv();assert g['stage']=='grant' and hmac.compare_digest(g['mac'],mac('grant',t))
 if MODE=='lost-ack':sys.exit(7)
 send({'mac':mac('ack',t)})
 a=recv();assert a['stage']=='accepted' and hmac.compare_digest(a['mac'],mac('accepted',t))
 Path(OUTPUT).write_text(json.dumps({'pid':os.getpid(),'parent':os.getppid(),'origin':json.loads(t['origin_json']),'argv':t['argv_sha256']}))
 if MODE=='repeat':send({'format':'multica-private-child-v1','nonce':'1'*64});time.sleep(.1)
 else:time.sleep(.08)
except Exception:sys.exit(9)
finally:s.close()
'''

class DeliveryTest(unittest.TestCase):
 def setUp(self):
  self.f=_Fixture();self.f.setUp();self.root=self.f.root;self.children=[]
  self.f.contract['business_execution_seconds']=90
  self.args=types.SimpleNamespace(manifest=str(self.root/'manifest'),receipt=str(self.root/'receipt'))
  self.configure('canonical')
 def tearDown(self):
  for c in self.children:self.assertIsNotNone(c.poll(),'Foreground child must be drained')
  self.assertFalse((self.root/'calls').exists(),'No model/mock CLI invoked');self.f.tearDown()
 def configure(self,mode):
  p=self.f.candidate/'bin/loginom-ai-agent-cli'
  p.write_text('#!'+sys.executable+'\nMODE='+repr(mode)+'\nOUTPUT='+repr(str(self.root/'observed'))+'\n'+_RECEIVER)
  m=self.f.candidate/'cli-manifest.json';data=json.loads(m.read_text());data['files'][0]['sha256']=pin(p)['sha256'];m.write_text(json.dumps(data))
  self.f.spec['candidate']['manifest_sha256']=pin(m)['sha256'];self.f.evidence['binding']['candidate']=dict(self.f.spec['candidate']);self.f.write()
 def spawn(self,d,ch):
  c=subprocess.Popen(d.consume_birth(),cwd=self.f.cwd,env=ch.locator_env({'PATH':os.environ['PATH']}),stdin=subprocess.DEVNULL,pass_fds=ch.pass_fds)
  self.children.append(c);ch.bind_child(c);return c
 def test_original_kernel_child_exchange_exit_once(self):
  with admit.admission_decision(self.args) as d:
   origin=json.loads(Path(self.args.receipt).read_text())['execution_origin']
   with delivery.private_child_delivery(d) as ch:
    directory=ch.directory.name;self.assertEqual(os.stat(directory).st_mode&0o777,0o700)
    self.assertFalse(Path(directory).is_relative_to(self.f.cwd));c=self.spawn(d,ch)
    self.assertEqual(ch.settle_child(c),0);self.assertTrue(ch.accepted)
    observed=json.loads((self.root/'observed').read_text());self.assertEqual(observed['pid'],c.pid);self.assertEqual(observed['parent'],os.getpid());self.assertEqual(observed['origin'],origin)
    self.assertEqual(observed['argv'],hashlib.sha256(delivery._bytes(d._argv)).hexdigest());self.assertFalse(origin['sdk_authority'])
    with self.assertRaises(admit.DeliveryError):ch.settle_child(c)
    with self.assertRaises(admit.DeliveryError):ch.bind_child(c)
    with self.assertRaises(admit.DeliveryError):d.consume_birth()
    d.exited(c.returncode)
   self.assertFalse(Path(directory).exists())
  self.assertEqual(json.loads(Path(self.args.receipt).read_text())['state'],'exited')
 def test_foreign_fork_key_lost_response_ack_repeat(self):
  for mode in ('foreign','wrong-key','lost-response','lost-ack','repeat'):
   with self.subTest(mode=mode):
    self.configure(mode);self.args.receipt=str(self.root/('receipt-'+mode))
    with admit.admission_decision(self.args) as d:
     with delivery.private_child_delivery(d) as ch:
      c=self.spawn(d,ch)
      with self.assertRaises((admit.DeliveryError,OSError,ValueError)):ch.settle_child(c)
      self.assertIsNotNone(c.poll())
      if mode!='repeat':self.assertFalse(ch.accepted)
     self.assertEqual(json.loads(Path(self.args.receipt).read_text())['state'],'launching')
     with self.assertRaises(admit.DeliveryError):delivery.private_child_delivery(d)
    (self.root/'observed').unlink(missing_ok=True)
 def test_missing_copy_expired_consumed_no_remint(self):
  with self.assertRaises(admit.DeliveryError):delivery.private_child_delivery(types.SimpleNamespace())
  with admit.admission_decision(self.args) as d:
   with patch.object(admit.time,'time_ns',return_value=d._claim.record['execution_origin']['deadline_unix_ns']):
    with self.assertRaises(admit.DeliveryError):delivery.private_child_delivery(d)
   with delivery.private_child_delivery(d) as ch:
    with self.assertRaises(admit.DeliveryError):copy.copy(ch)
    with self.assertRaises(admit.DeliveryError):copy.deepcopy(ch)
    with self.assertRaises(admit.DeliveryError):ch.locator_env({'LOGINOM_PRIVATE_ADMISSION_FD':'foreign'})
   with self.assertRaises(admit.DeliveryError):delivery.private_child_delivery(d)
  self.assertEqual(len(self.children),0)
 def test_replaced_claim_after_spawn_no_publish_or_edit(self):
  with admit.admission_decision(self.args) as d:
   with delivery.private_child_delivery(d) as ch:
    c=self.spawn(d,ch);original=Path(self.args.receipt).read_bytes();p=self.root/'foreign';p.write_bytes(original);p.chmod(0o600);p.replace(self.args.receipt)
    with self.assertRaises(admit.DeliveryError):ch.settle_child(c)
    self.assertFalse(ch.accepted);self.assertEqual(Path(self.args.receipt).read_bytes(),original);self.assertFalse((self.root/'observed').exists());self.assertIsNotNone(c.poll())
 def test_argv_and_pid_reuse_drift(self):
  for fault in ('argv','spec-copy','pid-reuse'):
   self.args.receipt=str(self.root/('receipt-'+fault))
   with admit.admission_decision(self.args) as d:
    with delivery.private_child_delivery(d) as ch:
     c=self.spawn(d,ch)
     if fault=='argv':d._argv.append('foreign')
     elif fault=='spec-copy':d._spec=dict(d._spec)
     else:ch.identity=(c.pid,(os.getpid(),ch.identity[1][1]+1,os.getuid())) # named kernel fault
     with self.assertRaises(admit.DeliveryError):ch.settle_child(c)
     self.assertFalse(ch.accepted);self.assertIsNotNone(c.poll())
 def test_original_clocks_after_spawn_rollback_no_reset(self):
  for clock in ('wall','monotonic'):
   self.args.receipt=str(self.root/('receipt-'+clock))
   with admit.admission_decision(self.args) as d:
    with delivery.private_child_delivery(d) as ch:
     c=self.spawn(d,ch);before=d._claim.bytes
     wall=d._claim.record['execution_origin']['deadline_unix_ns'] if clock=='wall' else 0
     mono=d._monotonic_deadline if clock=='monotonic' else admit.time.monotonic_ns()
     with patch.object(admit.time,'time_ns',return_value=wall),patch.object(admit.time,'monotonic_ns',return_value=mono):
      with self.assertRaises(admit.DeliveryError):ch.settle_child(c)
     self.assertEqual(d._claim.bytes,before);self.assertFalse(ch.accepted)
 def test_pre_post_spawn_first_exception_drains(self):
  first=ValueError('original');cause=RuntimeError('cause');first.__cause__=cause
  with admit.admission_decision(self.args) as d:
   with self.assertRaises(ValueError) as result:
    with delivery.private_child_delivery(d) as ch:
     c=self.spawn(d,ch);raise first
   self.assertIs(result.exception,first);self.assertIs(result.exception.__cause__,cause);self.assertIsNotNone(c.poll());self.assertFalse(ch.accepted)
  self.args.receipt=str(self.root/'receipt-pre-spawn')
  with admit.admission_decision(self.args) as d:
   with self.assertRaises(ValueError):
    with delivery.private_child_delivery(d):raise first
   with self.assertRaises(admit.DeliveryError):delivery.private_child_delivery(d)
 def test_production_launch_hunk_with_harmless_fixed_executable(self):
  # Actual source launch/Popen, no admit CLI command or model executable.
  self.assertEqual(admit.launch(self.args),0)
  receipt=json.loads(Path(self.args.receipt).read_text())
  self.assertEqual(receipt['state'],'exited');self.assertEqual(receipt['returncode'],0)
  with self.assertRaises(FileExistsError):admit.launch(self.args)
  self.assertEqual(json.loads((self.root/'observed').read_text())['origin'],receipt['execution_origin'])
 def test_late_response_claim_drift_and_budget_refuse(self):
  for fault in ('claim','deadline'):
   self.args.receipt=str(self.root/('receipt-late-'+fault))
   with admit.admission_decision(self.args) as d:
    with delivery.private_child_delivery(d) as ch:
     c=self.spawn(d,ch);real=ch._send
     def send_then_fault(frame):
      real(frame)
      if 'transcript' in frame:
       if fault=='claim':Path(self.args.receipt).write_text('{}')
       else:d._monotonic_deadline=0
     with patch.object(ch,'_send',side_effect=send_then_fault):
      with self.assertRaises(admit.DeliveryError):ch.settle_child(c)
     self.assertFalse(ch.accepted);self.assertFalse((self.root/'observed').exists())
     self.assertIsNotNone(c.poll())
 def test_primary_preserved_with_secondary_disposal_refusal(self):
  first=ValueError('first');cause=RuntimeError('original cause');first.__cause__=cause
  second=OSError('labelled disposal fault')
  with admit.admission_decision(self.args) as d:
   ch=delivery.private_child_delivery(d);real=ch._dispose
   def dispose_then_refuse():real();raise second
   with patch.object(ch,'_dispose',side_effect=dispose_then_refuse):
    with self.assertRaises(ValueError) as result:
     with ch:
      c=self.spawn(d,ch);raise first
   self.assertIs(result.exception,first);self.assertIs(first.__cause__,cause)
   self.assertIs(first._admission_delivery_disposal_failure,second);self.assertIsNotNone(c.poll())
 def test_missing_receiver_ordinary_exit_is_unknown_not_delivery(self):
  # Real, unmodified source launch around a harmless ordinary fixture executable.
  p=self.f.candidate/'bin/loginom-ai-agent-cli';p.write_text('#!'+sys.executable+'\npass\n')
  m=self.f.candidate/'cli-manifest.json';data=json.loads(m.read_text());data['files'][0]['sha256']=pin(p)['sha256'];m.write_text(json.dumps(data))
  self.f.spec['candidate']['manifest_sha256']=pin(m)['sha256'];self.f.evidence['binding']['candidate']=dict(self.f.spec['candidate']);self.f.write()
  with self.assertRaises(admit.DeliveryError):admit.launch(self.args)
  self.assertEqual(json.loads(Path(self.args.receipt).read_text())['state'],'launching')
  self.assertFalse((self.root/'observed').exists())
 def test_enter_refusal_disposes_before_spawn(self):
  with admit.admission_decision(self.args) as d:
   ch=delivery.private_child_delivery(d);directory=ch.directory.name
   d._spec=dict(d._spec)
   with self.assertRaises(admit.DeliveryError):
    with ch:pass
   self.assertTrue(ch.closed);self.assertFalse(Path(directory).exists())
 def test_interrupted_wait_still_drains_and_preserves_first(self):
  first=ValueError('original');second=InterruptedError('labelled wait interruption')
  with admit.admission_decision(self.args) as d:
   ch=delivery.private_child_delivery(d);c=self.spawn(d,ch);real=c.wait;calls=[]
   def interrupted_wait():
    calls.append(True)
    if len(calls)==1:raise second
    return real()
   with patch.object(c,'wait',side_effect=interrupted_wait):
    with self.assertRaises(ValueError) as result:
     with ch:raise first
   self.assertIs(result.exception,first);self.assertEqual(first._admission_delivery_failures,(second,))
   self.assertEqual(len(calls),2);self.assertIsNotNone(c.poll());self.assertTrue(ch.closed)
 def test_inherited_process_allocation_refuses(self):
  with admit.admission_decision(self.args) as d:
   pid=os.fork()
   if pid==0:
    try:delivery.private_child_delivery(d)
    except admit.DeliveryError:os._exit(0)
    os._exit(1)
   _,status=os.waitpid(pid,0);self.assertEqual(os.waitstatus_to_exitcode(status),0);self.assertFalse(d._consumed)

if __name__=='__main__':unittest.main()
