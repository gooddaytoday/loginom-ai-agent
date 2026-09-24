#!/usr/bin/env node
// Read exact hook definitions through the desktop binary's normal API.
// --trust records the user's explicit approval using returned keys/currentHash.
// This does not reload the running app or start any thread/model.
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const option = name => { const i=process.argv.indexOf(name); return i<0?null:process.argv[i+1]; };
if (!option('--manifest')) throw new Error('Pass the exact prepared --manifest path');
const manifestPath = resolve(option('--manifest'));
const rollout = resolve(manifestPath, '..');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const root = manifest.deployment.projectRoot;
const generation = manifest.generation;
if (manifest.deployment.generation !== generation || manifest.expected_hook_count !== 5)
  throw new Error('Expected the prepared five-hook deployment');
const expected = JSON.parse(readFileSync(join(rollout, 'hooks.json.pending'), 'utf8'));
const eventNames = {SessionStart:'sessionStart', UserPromptSubmit:'userPromptSubmit', Stop:'stop',
  PreCompact:'preCompact', SessionEnd:'sessionEnd'};
if (readFileSync(manifest.canonical_hooks_path, 'utf8') !== readFileSync(join(rollout,'hooks.json.pending'),'utf8'))
  throw new Error('Canonical hook definitions differ from the reviewed preparation');
const child = spawn('/Applications/ChatGPT.app/Contents/Resources/codex', ['app-server','--listen','stdio://'],
  {cwd:root,stdio:['pipe','pipe','pipe']});
let id = 0; const pending = new Map(); let stderrBytes = 0;
child.stderr.on('data', b => {stderrBytes += b.length;});
createInterface({input:child.stdout}).on('line', line => {
  let message; try {message=JSON.parse(line);} catch{return;}
  if (message.id !== undefined && pending.has(message.id)) {
    const p=pending.get(message.id);pending.delete(message.id);clearTimeout(p.timer);
    if(message.error) p.reject(new Error(`RPC ${message.error.code}; no response body logged`)); else p.resolve(message.result);
  }
});
child.on('exit', code => {for(const p of pending.values()){clearTimeout(p.timer);p.reject(new Error(`App API exited ${code}; stderrBytes=${stderrBytes}`));}pending.clear();});
function request(method,params){return new Promise((accept,reject)=>{const seq=++id;const timer=setTimeout(()=>{pending.delete(seq);reject(new Error(`RPC timeout: ${method}`));},20000);pending.set(seq,{resolve:accept,reject,timer});child.stdin.write(JSON.stringify({id:seq,method,params})+'\n');});}
const extra = option('--workspace');
const cwds = [...new Set([root, ...manifest.tasks.map(x=>x.cwd), ...(extra?[resolve(extra)]:[])])];
const expectedCount=Object.values(expected.hooks).reduce((n,groups)=>n+groups.reduce((m,g)=>m+g.hooks.length,0),0);
function checkedHooks(result, trusted = false) {
  if(result.data.length!==cwds.length) throw new Error('Missing workspace hook inventory');
  const keys = new Map();
  const summaries = [];
  for (const entry of result.data) {
    if(!cwds.includes(entry.cwd)||entry.errors.length||entry.warnings.length) throw new Error('Workspace hook inventory needs reconciliation');
    const hooks=entry.hooks.filter(x=>x.sourcePath===manifest.canonical_hooks_path);
    if(hooks.length!==expectedCount) throw new Error('Canonical project hook inventory differs from reviewed definitions');
    for(const [event,groups] of Object.entries(expected.hooks)) for(const group of groups) for(const definition of group.hooks) {
      const h=hooks.find(x=>x.eventName===eventNames[event] && x.command===definition.command);
      if(!h||h.source!=='project'||h.isManaged||!h.enabled||h.handlerType!=='command'||h.async||
          h.command!==definition.command||h.timeoutSec!==definition.timeout||
          !/^sha256:[0-9a-f]{64}$/.test(h.currentHash)||(trusted&&h.trustStatus!=='trusted'))
        throw new Error('A discovered definition does not match its approved hook');
      if(keys.has(h.key)&&keys.get(h.key)!==h.currentHash) throw new Error('Hook identity differs between worktrees');
      keys.set(h.key,h.currentHash);
    }
    summaries.push({cwd:entry.cwd,projectHooks:hooks.map(x=>({key:x.key,event:x.eventName,trustStatus:x.trustStatus,currentHash:x.currentHash})),
      originalMemoryHooks:entry.hooks.filter(x=>x.pluginId==='openviking-memory@openviking').map(x=>({event:x.eventName,enabled:x.enabled}))});
  }
  if(keys.size!==expectedCount) throw new Error('Worktrees do not share the reviewed canonical hook identities');
  return {keys,summaries};
}
try {
 await request('initialize',{clientInfo:{name:'loginom_memory_hook_review',version:'1.0'},capabilities:{experimentalApi:true}});
 child.stdin.write(JSON.stringify({method:'initialized'})+'\n');
 const before=checkedHooks(await request('hooks/list',{cwds}));
 if(process.argv.includes('--trust')) {
   const value=Object.fromEntries([...before.keys].map(([key,currentHash])=>[key,{trusted_hash:currentHash,enabled:true}]));
   await request('config/batchWrite',{edits:[{keyPath:'hooks.state',value,mergeStrategy:'upsert'}],filePath:null,expectedVersion:null,reloadUserConfig:false});
   const after=checkedHooks(await request('hooks/list',{cwds}),true);
   const receipt={generation,trusted_hooks:after.keys.size,checkedAt:new Date().toISOString(),
     hooksSha256:createHash('sha256').update(readFileSync(manifest.canonical_hooks_path)).digest('hex'),
     mechanism:'normal hooks/list + config/batchWrite',runtimeReloaded:false,workspaces:after.summaries};
   const receiptPath=option('--output')?resolve(option('--output')):join(rollout,'hooks-trust-verified.json');
   writeFileSync(receiptPath,JSON.stringify(receipt,null,2)+'\n',{mode:0o600});
   process.stdout.write(JSON.stringify({generation,trusted_hooks:receipt.trusted_hooks,runtimeReloaded:false,
     workspaces:after.summaries.map(x=>({cwd:x.cwd,trustedProjectHooks:x.projectHooks.length,originalMemoryHooks:x.originalMemoryHooks.length})),
     receipt:receiptPath})+'\n');
 } else process.stdout.write(JSON.stringify({generation,trustChanged:false,workspaces:before.summaries.map(x=>({cwd:x.cwd,
     projectHooks:x.projectHooks.length,trustStatus:[...new Set(x.projectHooks.map(h=>h.trustStatus))],originalMemoryHooks:x.originalMemoryHooks.length}))})+'\n');
} catch(e){process.stderr.write(e.message+'\n');process.exitCode=1;}
finally {child.stdin.end();child.kill();}
