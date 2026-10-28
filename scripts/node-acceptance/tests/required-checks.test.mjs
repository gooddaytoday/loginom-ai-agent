import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import test from 'node:test';

const script=fileURLToPath(new URL('../required-checks.py',import.meta.url));
function repo(t) {
 const cwd=mkdtempSync(join(tmpdir(),'required-checks-'));
 t.after(()=>rmSync(cwd,{recursive:true,force:true}));
 const git=(...args)=>{
  const r=spawnSync('git',args,{cwd,encoding:'utf8'});
  assert.equal(r.status,0,r.stderr);return r.stdout.trim();
 };
 git('init','-q');git('config','user.name','Test');git('config','user.email','test@example.invalid');
 const commit=(path,body='changed')=>{
  mkdirSync(dirname(join(cwd,path)),{recursive:true});writeFileSync(join(cwd,path),body);
  git('add','--all');git('commit','-qm','fixture');return git('rev-parse','HEAD');
 };
 commit('README.md','base');git('branch','base');
 const run=(...args)=>spawnSync('python3',[script,...args],{cwd,encoding:'utf8'});
 const list=(...args)=>{
  const r=run('list','--base','base',...args);assert.equal(r.status,0,r.stderr);return r.stdout;
 };
 return {cwd,git,commit,run,list};
}
const rows=text=>text.split('\n').filter(line=>/^\| `[a-z-]+` \|/.test(line));
const ids=text=>rows(text).map(line=>line.split('`')[1]);
const result=(row,status='exit 0')=>`${row} ${status} |`;

for(const [path,id,command] of [
 ['packages/loginom-runtime/src/connection-check.mjs','host-unit','cd packages/loginom-host && bun test'],
 ['packages/loginom-runtime/client/test/login-retry.test.mjs','client-full','nice -n 19 node --test test/*.test.mjs'],
 ['scripts/node-acceptance/run-check.md','acceptance-tests','node --test scripts/node-acceptance/tests/*.test.mjs'],
]) test(`path requires full suite: ${path}`,t=>{
 const r=repo(t);r.commit(path);const text=r.list();
 assert.ok(ids(text).includes(id));assert.ok(text.includes(command));
 if(id==='client-full')assert.match(text,/LOGINOM_DOCK_TEST_BROWSER=.*chromium-1246\/chrome-linux64\/chrome/);
});

for(const path of ['packages/opencode/src/tool.ts','packages/protocol/src/index.ts',
 'packages/loginom-host/src/host-port.ts','packages/loginom-runtime/executor/schemas/action-catalog.schema.json',
 'packages/loginom-runtime/client/lib/node-contracts.mjs']) test(`public/agent stop: ${path}`,t=>{
 const r=repo(t);r.commit(path);const row=rows(r.list()).find(x=>x.includes('main-chat-approval'));
 assert.ok(row);assert.match(row,/стоп: нужно разрешение основного чата/);
 assert.equal(row.split('|')[2].trim(),'—');
});

for(const [path,scenario] of [
 ['packages/loginom-runtime/client/lib/workspace-ui.mjs','s5'],
 ['packages/loginom-runtime/client/lib/observation-pages.mjs','s5'],
 ['packages/loginom-runtime/client/lib/node-procedure.mjs','s1'],
 ['packages/loginom-runtime/client/lib/node-port-output.mjs','n19'],
 ['packages/loginom-runtime/client/lib/crosstable-readback.mjs','n13'],
 ['packages/loginom-runtime/client/lib/rest-connection.mjs','n11'],
 ['packages/loginom-runtime/client/lib/text-export-node.mjs','s8'],
]) test(`live reading/node rule: ${path}`,t=>{
 const r=repo(t);r.commit(path);const text=r.list();
 assert.ok(ids(text).includes('live-ui'));assert.match(text,/run-check.py start/);
 assert.ok(text.includes(scenario));assert.match(text,/--cold/);assert.match(text,/офлайн-replay не заменяет/);
 if(path.includes('text-export')){assert.ok(ids(text).includes('cold-export'));assert.match(text,/--csv/);}
});

test('empty/unrelated diff, explicit head, subdirectory and uncommitted files',t=>{
 const r=repo(t);assert.deepEqual(ids(r.list()),[]);
 r.commit('unrelated file.md');const head=r.git('rev-parse','HEAD');
 writeFileSync(join(r.cwd,'untracked'),'not committed');
 r.commit('packages/loginom-runtime/src/managed-entry.mjs');
 assert.deepEqual(ids(r.list('--head',head)),[]);
 const sub=spawnSync('python3',[script,'list','--base','base'],{cwd:join(r.cwd,'packages'),encoding:'utf8'});
 assert.equal(sub.status,0,sub.stderr);assert.ok(ids(sub.stdout).includes('host-unit'));
 assert.notEqual(r.run('list','--base','missing-ref').status,0);
});

test('deleted and renamed source paths still require their suites',t=>{
 const r=repo(t),path='packages/loginom-runtime/src/managed-entry.mjs';
 r.commit(path);r.git('branch','-f','base','HEAD');
 r.git('mv',path,'moved.mjs');r.git('commit','-qm','move');
 assert.ok(ids(r.list()).includes('host-unit'));
 r.git('rm','moved.mjs');r.git('commit','-qm','delete');
 assert.ok(ids(r.list()).includes('host-unit'));
});

test('head-retest only when base advanced over the same paths',t=>{
 const r=repo(t),path='packages/loginom-runtime/src/managed-entry.mjs';
 r.commit(path,'original');r.git('branch','-f','base','HEAD');r.git('branch','topic');
 r.commit(path,'head');const head=r.git('rev-parse','HEAD');
 assert.ok(!ids(r.list()).includes('head-retest'));
 r.git('checkout','-q','base');r.commit('other.md');
 assert.ok(!ids(r.list('--head',head)).includes('head-retest'));
 r.commit(path,'base advanced');const text=r.list('--head',head);
 assert.ok(ids(text).includes('head-retest'));assert.match(text,/MERGED_HEAD_REPO/);
 assert.match(rows(text).find(x=>x.includes('head-retest')),/bun test/);
 assert.ok(text.includes(path));
});

test('verify requires per-ID command and exact outcome; FAIL needs journal line',t=>{
 const r=repo(t);r.commit('packages/loginom-runtime/src/managed-entry.mjs');
 r.commit('scripts/node-acceptance/run-check.md');
 const checks=rows(r.list()),report=join(r.cwd,'report.md');
 const verify=text=>{writeFileSync(report,text);return r.run('verify','--base','base','--report',report);};
 assert.equal(verify(checks.map(row=>result(row)).join('\n')).status,0);
 const missing=verify(result(checks[0]));assert.equal(missing.status,1);
 assert.ok(missing.stdout.includes(checks[1].split('`')[1]));
 for(const bad of ['exit 01','exit 0abc','FAIL','FAIL; журнал: run.log','FAIL; журнал: run.log:0'])
  assert.equal(verify(checks.map(row=>result(row,bad)).join('\n')).status,1,bad);
 assert.equal(verify(checks.map(row=>result(row,'FAIL; журнал: run.log:12')).join('\n')).status,0);
 assert.equal(verify(checks.map(row=>result(row.replace('bun test','bun test subset'))).join('\n')).status,1);
 assert.equal(verify(checks.join('\n')+'\nexit 0').status,1);
 assert.equal(verify(checks.map(row=>result(row).replace('host-unit','host-unit-other')).join('\n')).status,1);
 assert.equal(verify(checks.map(row=>result(row)).join('\n').replace('exit 0','exit 0; FAIL')).status,1);
});

test('approval has no executable command and cannot be cleared with exit 0',t=>{
 const r=repo(t);r.commit('packages/opencode/src/example.ts');const [row]=rows(r.list());
 const report=join(r.cwd,'report.md');writeFileSync(report,result(row));
 assert.equal(r.run('verify','--base','base','--report',report).status,1);
 writeFileSync(report,result(row,'FAIL; журнал: owner-decision.md:3'));
 assert.equal(r.run('verify','--base','base','--report',report).status,0);
});

test('live/cold/full-client reports preserve complete commands and multiple IDs',t=>{
 const r=repo(t);r.commit('packages/loginom-runtime/client/lib/text-export-node.mjs');
 const checks=rows(r.list()),report=join(r.cwd,'report.md');
 writeFileSync(report,checks.map(row=>result(row)).join('\n'));
 assert.equal(r.run('verify','--base','base','--report',report).status,0);
 writeFileSync(report,checks.filter(row=>!row.includes('`live-ui`')).map(row=>result(row)).join('\n'));
 const missing=r.run('verify','--base','base','--report',report);
 assert.equal(missing.status,1);assert.match(missing.stdout,/live-ui/);
 assert.equal(r.run('verify','--base','base','--report','absent-report.md').status,2);
});

const contract = 'packages/loginom-runtime/client/lib/';
for (const [name, before, after] of [
 ['node-contracts.mjs', "const definitions = [\n ['imports.text','Text'],\n];\n", "const definitions = [\n ['imports.text','Text'],\n ['transform.new_node','New'],\n];\n"],
 ['effect-contracts.mjs', "export const EFFECT_CONTRACTS = Object.freeze({inspect: {ownership:'none'}});\n", "export const EFFECT_CONTRACTS = Object.freeze({inspect: {ownership:'none'}, new_node: {ownership:'owned'}});\n"],
 ['node-result-schema.mjs', "const oldSchema=object({kind:values('old')});\nconst configurationReadback={anyOf:[oldSchema]};\n", "const oldSchema=object({kind:values('old')});\nconst newSchema=object({kind:values('new')});\nconst configurationReadback={anyOf:[oldSchema,newSchema]};\n"],
 ['node-read-contract.mjs', "export const MODE='read';\n", "export const MODE='read';\nconst newSchema=object({kind:values('new')});\n"],
 ['node-contracts.d.ts', "export type NodeType = 'imports.text';\n", "export type NodeType = 'imports.text' | 'transform.new_node';\n"],
]) test(`additive registration by diff: ${name}`, t => {
 const r=repo(t);r.commit(contract+name,before);r.git('branch','-f','base','HEAD');
 r.commit(contract+name,after);const text=r.list();
 assert.ok(!ids(text).includes('main-chat-approval'),text);
 for(const id of ['client-full','acceptance-tests','live-ui']) assert.ok(ids(text).includes(id),text);
 assert.match(text,/NODE_SCENARIOS/);
 // Editing or deleting any old entry still stops, even alongside additions.
 r.commit(contract+name,after.replace(/imports.text|ownership:'none'|kind:values\('old'\)|MODE='read'/, 'CHANGED'));
 assert.ok(ids(r.list()).includes('main-chat-approval'));
 r.commit(contract+name,'');assert.ok(ids(r.list()).includes('main-chat-approval'));
});

test('adding a property to an existing entry is not a new registration',t=>{
 const r=repo(t),path=contract+'effect-contracts.mjs';
 r.commit(path,"export const EFFECT_CONTRACTS=Object.freeze({inspect:{ownership:'none'}});\n");
 r.git('branch','-f','base','HEAD');
 r.commit(path,"export const EFFECT_CONTRACTS=Object.freeze({inspect:{ownership:'none',changed:true}});\n");
 assert.ok(ids(r.list()).includes('main-chat-approval'));
});

test('real production contracts permit new registrations and preserve old validators',t=>{
 for(const name of ['node-contracts.mjs','effect-contracts.mjs','node-result-schema.mjs','node-read-contract.mjs','node-contracts.d.ts']) {
  const r=repo(t),path=contract+name;
  const before=readFileSync(fileURLToPath(new URL('../../../'+path,import.meta.url)),'utf8');
  r.commit(path,before);r.git('branch','-f','base','HEAD');
  const after=name==='node-contracts.mjs'?before.replace('const definitions = [',"const definitions = [\n ['transform.new_node','New','new',1,1,false,['new'],'new.md'],"):
   name==='effect-contracts.mjs'?before.replace('Object.freeze({',"Object.freeze({\n new_node: Object.freeze({ownership:'owned'}),"):
   name==='node-result-schema.mjs'?before.replace('const configurationReadback={anyOf:[',"const newNodeSchema=object({kind:values('new_node')});\nconst configurationReadback={anyOf:[newNodeSchema,"):
   name==='node-read-contract.mjs'?before+"\nconst newNodeSchema=object({kind:values('new_node')});\n":
   before.replace('export type NodeType = ',"export type NodeType = 'transform.new_node' | ")+"\nexport interface NewNodeReadback { kind: 'new_node'; fields: {name: string}[] }\n";
  r.commit(path,after);assert.ok(!ids(r.list()).includes('main-chat-approval'), name);
  r.commit(path,after.replace(/NODE_POSITION_MIN = 64|resource !== 'package'|const str=|const need=|interface WorkflowRef/, 'CHANGED'));
  assert.ok(ids(r.list()).includes('main-chat-approval'),name);
 }
});

for(const after of [
 "export const EFFECT_CONTRACTS=Object.freeze({inspect:{ownership:'none'},inspect:{ownership:'other'}});\n",
 "export const EFFECT_CONTRACTS=Object.freeze({inspect:{ownership:'none'},__proto__:{ownership:'other'}});\n",
 "export const EFFECT_CONTRACTS=Object.freeze({inspect:{ownership:'changed'},new_node:{ownership:'other'}});\n",
]) test('duplicate/prototype/mixed edits preserve stop: '+after,t=>{
 const r=repo(t),path=contract+'effect-contracts.mjs';
 r.commit(path,"export const EFFECT_CONTRACTS=Object.freeze({inspect:{ownership:'none'}});\n");
 r.git('branch','-f','base','HEAD');r.commit(path,after);
 assert.ok(ids(r.list()).includes('main-chat-approval'));
});

test('a new key cannot execute a mutation of existing contracts',t=>{
 const r=repo(t),path=contract+'effect-contracts.mjs';
 r.commit(path,"export const EFFECT_CONTRACTS=Object.freeze({inspect:{ownership:'none'}});\n");
 r.git('branch','-f','base','HEAD');
 r.commit(path,"export const EFFECT_CONTRACTS=Object.freeze({inspect:{ownership:'none'},new_node:(existingSchema.changed=true)});\n");
 assert.ok(ids(r.list()).includes('main-chat-approval'));
});
