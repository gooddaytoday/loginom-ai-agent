# Manual Linux PTY acceptance. Runtime fixture uses no Chromium or external provider.
import os, json, pathlib, tempfile, subprocess, pty, select, time, fcntl, termios, struct, signal, shutil, sys, threading, sqlite3
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
prompt_mode = "--prompt" in sys.argv
cancel_startup = "--cancel-startup" in sys.argv
cancel_stdin = "--cancel-stdin" in sys.argv or cancel_startup
assert not cancel_stdin or not prompt_mode, "--cancel-stdin does not run a prompt"
invalid_session = "--invalid-session" in sys.argv
assert not invalid_session or not prompt_mode, "--invalid-session does not run a prompt"
attachment_mode = "--attachment" in sys.argv
resume_mode = "--resume" in sys.argv
latest_mode = "--latest" in sys.argv
assert not latest_mode or resume_mode, "--latest requires --resume"
assert not resume_mode or (prompt_mode and not attachment_mode), "--resume requires --prompt without --attachment"
assert not attachment_mode or prompt_mode, "--attachment requires --prompt"
unconfigured = "--unconfigured" in sys.argv
cancel_setup = "--cancel-setup" in sys.argv
password_setup = "--password" in sys.argv
onboarding = "--setup" in sys.argv or cancel_setup
assert not (cancel_setup and prompt_mode), 'Cancellation does not run a prompt'
assert not password_setup or onboarding, '--password requires --setup'
assert not (unconfigured and onboarding), 'Choose --unconfigured or --setup'

root=pathlib.Path(tempfile.mkdtemp(prefix='loginom-cli-tui-'))
repo=pathlib.Path(__file__).resolve().parents[5]
bundle=root/'bundle'; profile=root/'profile'
workspace=root/'workspace'; workspace.mkdir()
csv=b'amount\n10\n20\n25\n'
if attachment_mode: (workspace/'sales.csv').write_bytes(csv)
(bundle/'bin').mkdir(parents=True); (bundle/'runtime/src').mkdir(parents=True)
(bundle/'bin/node').symlink_to(repo/'packages/desktop/resources/loginom/bin/node')
(bundle/'resource-manifest.json').write_text(json.dumps({'endpoint':'https://example.test'}))
(bundle/'runtime/src/managed-entry.mjs').write_text('''import { appendFileSync, existsSync } from 'node:fs';
appendFileSync(new URL('../../fixture-pids.jsonl', import.meta.url),JSON.stringify([process.pid,process.ppid])+'\\n');
process.on('message', m => {
 if(m.operation==='start')appendFileSync(new URL('../../fixture-starts.jsonl', import.meta.url),JSON.stringify({chat:m.input.chat,headless:m.input.headless})+'\\n');
 if(m.operation==='start'){const delayed=existsSync(new URL('../../delay-start',import.meta.url));if(delayed)appendFileSync(new URL('../../starting',import.meta.url),'1');setTimeout(()=>process.send({id:m.id,result:{protocol:1,generation:m.input.connection.apiKey==='fixture-key' && m.input.connection.password==='' ? m.input.generation : -1,chat:m.input.chat,checked:true,ready:true}}),delayed?2000:0);}
 if(m.operation==='list')process.send({id:m.id,result:{tools:[{name:'probe',description:'Probe the private TUI host',inputSchema:{type:'object',properties:{}}}]}});
 if(m.operation==='call'){appendFileSync(new URL('../../fixture-calls.jsonl',import.meta.url),JSON.stringify(m.input)+'\\n');process.send({id:m.id,result:{recoveryPending:false,result:{content:[{type:'text',text:'TUI private host completed'}]}}});}
 if(m.operation==='admit')process.send({id:m.id,result:{admitted:true}});
 if(m.operation==='interrupt')process.send({id:m.id,result:{interrupted:true}});
 if(m.operation==='close'){const delayed=existsSync(new URL('../../delay-start',import.meta.url));if(delayed)appendFileSync(new URL('../../closing',import.meta.url),'1');setTimeout(()=>process.send({id:m.id,result:{closed:true}},()=>process.disconnect()),delayed?500:0);}
});'''.replace("m.input.connection.password===''", "m.input.connection.password==='fixture-password'" if password_setup else "m.input.connection.password===''"))
bun=shutil.which('bun')
assert bun, 'Bun is required'
binary=os.environ.get('LOGINOM_AI_AGENT_TEST_CLI_EXE')
if binary: assert pathlib.Path(binary).is_absolute() and pathlib.Path(binary).is_file()
command=[binary] if binary else [bun,'run','src/standalone.ts']
subprocess.run([bun,'script/build-node-host.ts',str(bundle/'host')],cwd=repo/'packages/loginom-host',check=True,capture_output=True)
env=dict(os.environ,LOGINOM_AI_AGENT_CLI_PROFILE=str(profile),LOGINOM_AI_AGENT_CLI_BUNDLE=str(bundle),LOGINOM_AI_AGENT_PURE='1',BUN_RUNTIME_TRANSPILER_CACHE_PATH='0',TERM='xterm-256color')
if not unconfigured and not onboarding:
 setup=subprocess.run(command+['loginom','setup','--stdin-json','--format','json'],input='{"apiKey":"fixture-key"}',text=True,capture_output=True,cwd=repo/'packages/agent',env=env,timeout=15)
 assert setup.returncode==0,setup.stderr
elif prompt_mode:
 status=subprocess.run(command+['loginom','status','--format','json'],text=True,capture_output=True,cwd=repo/'packages/agent',env=env,timeout=15)
 assert status.returncode==0,status.stderr
if cancel_stdin:
 if cancel_startup: (bundle/'delay-start').write_text('1')
 child=subprocess.Popen(command+['run','--headless','--format','json','--','pending input'],cwd=repo/'packages/agent',env=env,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
 try:
  deadline=time.monotonic()+30
  ready=(bundle/'starting') if cancel_startup else (profile/'data/loginom-ai-agent.db')
  while not ready.exists() and child.poll() is None and time.monotonic()<deadline: time.sleep(0.05)
  assert ready.exists() and child.poll() is None
  if not cancel_startup: time.sleep(2)
  child.send_signal(signal.SIGINT)
  if cancel_startup:
   while not (bundle/'closing').exists() and child.poll() is None and time.monotonic()<deadline: time.sleep(0.02)
   assert (bundle/'closing').exists() and child.poll() is None and (profile/'.writer').exists()
   child.send_signal(signal.SIGINT)
  child.wait(timeout=30)  # Keep the writer open: cancellation must not rely on EOF.
  output=child.stdout.read(); errors=child.stderr.read()
  pids={pid for line in (bundle/'fixture-pids.jsonl').read_text().splitlines() for pid in json.loads(line)}
  alive=[pid for pid in pids if pathlib.Path('/proc',str(pid)).exists()]
  result={'directory':str(root),'code':child.returncode,'guard':(profile/'.writer').exists(),'alive':alive,'cancelled':b'"name":"CLI_CANCELLED"' in output,'tool_called':(bundle/'fixture-calls.jsonl').exists()}
  (root/'result.json').write_text(json.dumps(result)); print(json.dumps(result))
  assert child.returncode==130 and result['cancelled'] and not result['guard'] and not alive and not result['tool_called']
  assert b'fixture-key' not in output+errors
 finally:
  if child.poll() is None: child.kill(); child.wait()
  child.stdin.close(); child.stdout.close(); child.stderr.close()
 sys.exit(0)
state = {"tool_advertised": False, "tool_result": False, "finished": False}
phase = {"call": "call_tui"}
class Provider(BaseHTTPRequestHandler):
 def log_message(self, *args): pass
 def do_POST(self):
  body = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
  title = "Generate a title for this conversation" in json.dumps(body)
  state["tool_advertised"] |= any(t.get("function", {}).get("name") == "loginom_probe" for t in body.get("tools", []))
  tool_result = any(m.get("role") == "tool" and m.get("tool_call_id") == phase["call"] and "TUI private host completed" in str(m.get("content")) for m in body.get("messages", []))
  state["tool_result"] |= tool_result
  delta = {"content": "TUI fixture title" if title else "standalone tui completed"}
  finish = "stop"
  if not title and not tool_result and not unconfigured:
   delta = {"tool_calls": [{"index": 0, "id": phase["call"], "type": "function", "function": {"name": "loginom_probe", "arguments": "{}"}}]}
   finish = "tool-calls"
  chunks = [{"id": "tui-test", "object": "chat.completion.chunk", "choices": [{"index": 0, "delta": value, "finish_reason": reason}]} for value, reason in [(delta, None), ({}, finish)]]
  data = ("".join("data: " + json.dumps(chunk) + "\n\n" for chunk in chunks) + "data: [DONE]\n\n").encode()
  self.send_response(200); self.send_header("Content-Type", "text/event-stream"); self.send_header("Content-Length", str(len(data))); self.end_headers(); self.wfile.write(data)
  if (tool_result or unconfigured) and not title: state["finished"] = True
server = None
if prompt_mode:
 server = ThreadingHTTPServer(("127.0.0.1", 0), Provider)
 threading.Thread(target=server.serve_forever, daemon=True).start()
 config = {"model":"test/test-model", "formatter":False,"lsp":False,"permission":{"loginom_*":"ask"},"provider":{"test":{"name":"Test","id":"test","env":[],"npm":"@ai-sdk/openai-compatible","models":{"test-model":{"id":"test-model","name":"Test Model","attachment":False,"reasoning":False,"temperature":False,"tool_call":True,"release_date":"2025-01-01","limit":{"context":100000,"output":10000},"cost":{"input":0,"output":0},"options":{}}},"options":{"apiKey":"test-key","baseURL":f"http://127.0.0.1:{server.server_port}/v1"}}}}
 (profile/'config/loginom-ai-agent.json').write_text(json.dumps(config))
session_id = None
if resume_mode:
 seed = subprocess.run(command+['run','--headless','--model','test/test-model','--dangerously-skip-permissions','--','Call loginom_probe and report the result'],cwd=repo/'packages/agent',env=env,text=True,capture_output=True,timeout=60)
 assert seed.returncode==0, seed.stderr
 with sqlite3.connect('file:' + str(profile/'data/loginom-ai-agent.db') + '?mode=ro', uri=True) as db:
  sessions=list(db.execute('select id from session'))
 assert len(sessions)==1
 session_id=sessions[0][0]
 phase['call']='call_resume'
 state.update(tool_advertised=False,tool_result=False,finished=False)
master,slave=pty.openpty(); fcntl.ioctl(slave,termios.TIOCSWINSZ,struct.pack('HHHH',35,120,0,0))
child=subprocess.Popen(command+(['--session','not-a-session'] if invalid_session else [])+([str(workspace)] if attachment_mode else [])+(['--no-headless'] + (['--continue'] if latest_mode else ['--session',session_id]) if resume_mode else ['--headless']) + (['--model','test/test-model','--dangerously-skip-permissions'] + ([] if attachment_mode or resume_mode else ['--prompt',('Say hello without Loginom' if unconfigured else 'Call loginom_probe and report the result')]) if prompt_mode else []),cwd=repo/'packages/agent',env=env,stdin=slave,stdout=slave,stderr=slave,start_new_session=True)
os.close(slave); output=bytearray(); start=time.monotonic(); sent=0; setup_skipped=False; ready_at=None; setup_step=0; attachment_step=0; attachment_at=None; resumed=False
setup_steps=[('Настроить Loginom сейчас?',b'\x1b[D\r'),('API-ключ',b'\x03' if cancel_setup else b'fixture-key\r'),('URL Loginom',b'\r'),('Имя пользователя',b'\r'),('Пароль Loginom',b'\x1b[B\r' if password_setup else b'\r')]
if password_setup: setup_steps.append(('Новый пароль',b'fixture-password\r'))
while child.poll() is None and time.monotonic()-start<(90 if attachment_mode else 30):
 if select.select([master],[],[],0.1)[0]:
  try: chunk=os.read(master,65536)
  except OSError: break
  output.extend(chunk)
  if onboarding and setup_step<len(setup_steps) and setup_steps[setup_step][0].encode() in output:
   os.write(master,setup_steps[setup_step][1]);setup_step+=1
  if unconfigured and not setup_skipped and 'Настроить Loginom сейчас?'.encode() in output:
   os.write(master,b'\r');setup_skipped=True
  if b'\x1b[6n' in chunk: os.write(master,b'\x1b[1;1R')
  if b'\x1b[c' in chunk: os.write(master,b'\x1b[?1;2c')
 if attachment_mode and (not onboarding or setup_step==len(setup_steps)):
  if attachment_step==0 and b'Ask anything' in output:
   os.write(master,b'@sales.csv');attachment_step=1;attachment_at=time.monotonic()
  elif attachment_step==1 and time.monotonic()-attachment_at>3:
   os.write(master,b'\r');attachment_step=2;attachment_at=time.monotonic()
  elif attachment_step==2 and time.monotonic()-attachment_at>2:
   os.write(master,b' Call loginom_probe and report the result\r');attachment_step=3
 if resume_mode and not resumed and b'standalone tui completed' in output:
  os.write(master,b'Call loginom_probe again and report the result\r');resumed=True
 if ready_at is None and (state["finished"] if prompt_mode else b'Connect a provider' in output):
  ready_at=time.monotonic()
 if ready_at is not None and time.monotonic()-ready_at>3 and sent==0:
  os.write(master,b'\x1b');sent=1
 if ready_at is not None and time.monotonic()-ready_at>5 and sent==1:
  os.write(master,b'\x04');sent=2
(root/"terminal.txt").write_bytes(output)
forced=child.poll() is None
if forced: os.killpg(child.pid,signal.SIGTERM)
try: child.wait(timeout=5)
except subprocess.TimeoutExpired:
 os.killpg(child.pid,signal.SIGKILL);child.wait()
os.close(master)
(root/'terminal.txt').write_bytes(output)
pids=set(pid for line in ((bundle/'fixture-pids.jsonl').read_text().splitlines() if (bundle/'fixture-pids.jsonl').exists() else []) for pid in json.loads(line))
alive=[]
for pid in pids:
 try: os.kill(pid,0);alive.append(pid)
 except ProcessLookupError: pass
result={'binary':binary,'directory':str(root),'code':child.returncode,'forced':forced,'bytes':len(output),'guard':(profile/'.writer').exists(),'alive':alive,'provider_dialog':b'Connect a provider' in output}
if server: server.shutdown(); server.server_close()
result.update(state)
result['unconfigured'] = unconfigured
result['setup_skipped'] = setup_skipped
result['setup_completed'] = onboarding and setup_step==len(setup_steps)
result['secret_visible'] = b'fixture-key' in output or b'fixture-password' in output
if onboarding and not cancel_setup: assert result['setup_completed'] and not result['secret_visible'], 'Setup must complete without displaying the key'
if unconfigured: assert setup_skipped and not (bundle/'fixture-pids.jsonl').exists(), 'Unconfigured TUI must offer setup without launching a runtime'
result['tool_called'] = (bundle/'fixture-calls.jsonl').exists()
result['history_verified'] = False
if prompt_mode:
 with sqlite3.connect('file:' + str(profile/'data/loginom-ai-agent.db') + '?mode=ro', uri=True) as db:
  parts = [json.loads(row[0]) for row in db.execute('select data from part')]
 result['history_verified'] = (unconfigured or any(p.get('tool') == 'loginom_probe' and p.get('state', {}).get('status') == 'completed' and p.get('state', {}).get('output') == 'TUI private host completed' for p in parts)) and any(p.get('type') == 'text' and p.get('text') == 'standalone tui completed' for p in parts)
if resume_mode:
 with sqlite3.connect('file:' + str(profile/'data/loginom-ai-agent.db') + '?mode=ro', uri=True) as db:
  sessions=list(db.execute('select id from session'))
 starts=[json.loads(line) for line in (bundle/'fixture-starts.jsonl').read_text().splitlines()]
 chats=[item for item in starts if len(item['chat'])==64]
 result['resume_verified']=resumed and sessions==[(session_id,)] and sum(p.get('tool')=='loginom_probe' and p.get('state',{}).get('status')=='completed' for p in parts)==2
 result['mode_changed']=len(chats)==2 and chats[0]['chat']==chats[1]['chat'] and [item['headless'] for item in chats]==[True,False]
 assert result['resume_verified'] and result['mode_changed'], json.dumps(result)
if attachment_mode:
 identities=list((profile/'loginom/inputs').glob('*/identity.json'))
 result['attachment_verified']=len(identities)==1 and (identities[0].parent/'0').read_bytes()==csv
 (root/'result.json').write_text(json.dumps(result))
 assert result['attachment_verified'], 'TUI attachment must reach private admission as exact original bytes'
 assert any(p.get('type')=='file' and p.get('url')=='data:text/plain;base64,'+__import__('base64').b64encode(csv).decode() for p in parts), 'TUI history must retain the snapshot'
print(json.dumps(result))
if invalid_session:
 sys.exit(0 if child.returncode==2 and not forced and not result['guard'] and not alive and b'CLI_ARGUMENT_INVALID' in output else 1)
if cancel_setup:
 sys.exit(0 if child.returncode==130 and not forced and not result['guard'] and not alive and not result['secret_visible'] and not result['tool_called'] else 1)
sys.exit(0 if child.returncode==0 and not forced and not result['guard'] and not alive and ((state['finished'] and not state['tool_advertised'] and not result['tool_called'] and result['history_verified'] if unconfigured else all(state.values()) and result['tool_called'] and result['history_verified']) if prompt_mode else result['provider_dialog']) else 1)
