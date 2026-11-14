import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {checkSupernodeGraph,checkSupernodeRun} from '../supernode-audit.mjs';

const graph={nodes:[{ref:{node_id:'input'},boundary_role:'input'},{ref:{node_id:'calc'},type:'transform.calculator'},
 {ref:{node_id:'output'},boundary_role:'output'}],links:[{source:'input',output:0,target:'calc',input:0},{source:'calc',output:0,target:'output',input:0}]};
test('supernode audit requires both native boundaries and both local links',()=>{
 assert.deepEqual(checkSupernodeGraph(graph),{input:'input',calculator:'calc',output:'output'});
 assert.throws(()=>checkSupernodeGraph({...graph,links:graph.links.slice(0,1)}),/LOCAL_LINKS/);
 assert.throws(()=>checkSupernodeGraph({...graph,nodes:graph.nodes.filter(n=>n.boundary_role!=='output')}),/BOUNDARIES/);
 assert.throws(()=>checkSupernodeGraph({...graph,links:[...graph.links.slice(0,1),{source:'foreign-calc',output:0,target:'output',input:0}]}),/LOCAL_LINKS/);
});
test('supernode audit consumes an ordinary NW1 workspace observation',()=>{
 const nodes=graph.nodes.map(n=>({node_id:n.ref.node_id,node_ref:{node_label:n.ref.node_id},...(n.boundary_role?{boundary_role:n.boundary_role}:{})}));
 const links=graph.links.map(e=>'MF;TF-2;Graph;'+e.source+'|Output_Data-0|'+e.target+'|Input_Data-0');
 assert.equal(checkSupernodeGraph({nodes,links},'calc').calculator,'calc');
 assert.throws(()=>checkSupernodeGraph({nodes,links},'foreign-calc'));
});
test('supernode audit requires the requested Calculator even when a typed Calculator is present',()=>{
 assert.throws(()=>checkSupernodeGraph(graph,'foreign-calc'),/BOUNDARIES_AND_CALCULATOR/);
 assert.equal(checkSupernodeGraph({...graph,nodes:[...graph.nodes,{ref:{node_id:'other'},type:'transform.calculator'}]},'calc').calculator,'calc');
});
test('supernode-calc delivers only the two approved inputs and excludes empty',()=>{
 const result=JSON.parse(execFileSync('python3',['-c',`import runpy,json; from pathlib import Path
m=runpy.run_path('scripts/node-acceptance/run-check.py'); s=m['scenario']('supernode-calc')
print(json.dumps(dict(files=s['input_files'],supernode=s['supernode'],initial=s['initial_table'],source=str(s['source']))))`],
  {cwd:new URL('../../../',import.meta.url),encoding:'utf8'}));
 assert.deepEqual(result.files,['input.csv','replacement.csv']);assert.equal(result.supernode,true);
 assert.equal(result.initial,'expected-initial.json');assert.ok(result.source.endsWith('control-supernode/acceptance'));
});
test('main audit recognizes original names after the stock attachment admission prefix',async t=>{
 const directory=await mkdtemp(join(tmpdir(),'supernode-audit-'));t.after(()=>rm(directory,{recursive:true,force:true}));
 const replies=[{kind:'supernode',node:{node_id:'parent'}},{kind:'calculator',node:{node_id:'calc'}},
  {kind:'text_import',node:{node_id:'import'},source:{source_path:'/worker/'+'a'.repeat(64)+'-0-input.csv'}},
  {kind:'text_import',node:{node_id:'import'},source:{source_path:'/worker/'+'b'.repeat(64)+'-0-replacement.csv'}},
  {nodes:graph.nodes.map(n=>({node_id:n.ref.node_id,node_ref:{node_label:n.ref.node_id},...(n.boundary_role?{boundary_role:n.boundary_role}:{})})),
   links:graph.links.map(e=>'MF;TF-1;Graph;'+e.source+'|Output_Data-0|'+e.target+'|Input_Data-0')}];
 const events=join(directory,'events.jsonl');
 await writeFile(events,replies.map(reply=>JSON.stringify({type:'tool_use',part:{state:{status:'completed',output:JSON.stringify(reply)}}})).join('\n'));
 const journal=join(directory,'execution-events.jsonl');
 await writeFile(journal,JSON.stringify({phase:'observation_completed',outcome:{status:'SUCCEEDED',output:replies.at(-1)}}));
 await assert.rejects(checkSupernodeRun(events,new URL('../../../docs/node-development/nodes/control-supernode/acceptance/',import.meta.url),[journal]),/COMPLETE_TYPED_TABLE_5/);
});

const expectedDirectory=new URL('../../../docs/node-development/nodes/control-supernode/acceptance/',import.meta.url);
async function mainFixture(t){
 const directory=await mkdtemp(join(tmpdir(),'supernode-private-audit-'));t.after(()=>rm(directory,{recursive:true,force:true}));
 const replies=[{kind:'supernode',node:{node_id:'parent'}},{kind:'calculator',node:{node_id:'calc'}},
  ...['input.csv','replacement.csv'].map(name=>({kind:'text_import',node:{node_id:'import'},source:{source_path:'/worker/'+name}}))];
 for(const file of ['expected-initial.json','expected.json']){
  const expected=JSON.parse(await readFile(new URL(file,expectedDirectory),'utf8')).outputs[0];
  const data={row_count:expected.rows.length,sample_complete:true,precision:{numbers_verified:true},schema:expected.columns.map((c,index)=>({index,name:c.name,type:c.type})),
   sample:expected.rows.map(row=>expected.columns.map(c=>({type:c.type,value:row[c.name]===null?null:c.type==='integer'?String(row[c.name]):row[c.name],is_null:row[c.name]===null,
    ...(c.type==='datetime'?{precision:'millisecond',representation:'local_datetime',timezone:'unspecified'}:{})})))};
  replies.push({status:'SUCCEEDED',node:{node_id:'parent'},output:{ports:[data]}});
 }
 const events=join(directory,'model.stdout'),journal=join(directory,'execution-events.jsonl');
 await writeFile(events,replies.map(reply=>JSON.stringify({type:'tool_use',part:{state:{status:'completed',output:JSON.stringify(reply)}}})).join('\n'));
 const observation={phase:'observation_completed',outcome:{status:'SUCCEEDED',output:graph}};
 await writeFile(journal,JSON.stringify(observation));
 return {events,journal,observation};
}
test('main audit takes topology from the private journal with no public nodes array',async t=>{
 const f=await mainFixture(t),r=await checkSupernodeRun(f.events,expectedDirectory,[f.journal]);
 assert.equal(r.status,'PASS');assert.equal(r.topology[0].file,f.journal);assert.equal(r.topology[0].line,1);assert.equal(r.tables.length,2);
});
test('main audit retains MAIN_NESTED_OBSERVATION when the private journal has no graph',async t=>{
 const f=await mainFixture(t);await writeFile(f.journal,JSON.stringify({phase:'completed',outcome:{status:'SUCCEEDED'}}));
 await assert.rejects(checkSupernodeRun(f.events,expectedDirectory,[f.journal]),/SUPERNODE_MAIN_NESTED_OBSERVATION/);
 await assert.rejects(checkSupernodeRun(f.events,expectedDirectory),/SUPERNODE_MAIN_NESTED_OBSERVATION/);
});
test('main audit refuses failed observations and incomplete local links',async t=>{
 const f=await mainFixture(t);
 for(const observation of [{...f.observation,outcome:{...f.observation.outcome,status:'FAILED'}},
  {...f.observation,outcome:{status:'SUCCEEDED',output:{...graph,links:graph.links.slice(0,1)}}}]){
  await writeFile(f.journal,JSON.stringify(observation));await assert.rejects(checkSupernodeRun(f.events,expectedDirectory,[f.journal]),/SUPERNODE_MAIN_NESTED_OBSERVATION/);
 }
});
test('main audit retains boundary identity across journal observations',async t=>{
 const f=await mainFixture(t),other=JSON.parse(JSON.stringify(f.observation));
 other.outcome.output.nodes[0].ref.node_id='other-input';other.outcome.output.links[0].source='other-input';
 await writeFile(f.journal,[f.observation,other].map(x=>JSON.stringify(x)).join('\n'));
 await assert.rejects(checkSupernodeRun(f.events,expectedDirectory,[f.journal]),/SUPERNODE_BOUNDARY_IDENTITY/);
});
for(const fault of ['foreign-calculator','missing-link'])test('main audit refuses '+fault+' after a valid graph',async t=>{
 const f=await mainFixture(t),other=structuredClone(f.observation);
 if(fault==='missing-link')other.outcome.output.links.pop();
 else{
  other.outcome.output.nodes[1].ref.node_id='foreign-calc';
  other.outcome.output.links[0].target='foreign-calc';other.outcome.output.links[1].source='foreign-calc';
 }
 await writeFile(f.journal,[f.observation,other].map(x=>JSON.stringify(x)).join('\n'));
 await assert.rejects(checkSupernodeRun(f.events,expectedDirectory,[f.journal]),/SUPERNODE_(MAIN_NESTED_OBSERVATION|CALCULATOR_IDENTITY)/);
});
test('supernode frozen DateTime uses ISO civil representation checked by its independent oracle',async()=>{
 for(const [file,caseName] of [['expected-initial.json','initial'],['expected.json','final'],['expected-empty.json','empty']]){
  const expected=JSON.parse(await readFile(new URL(file,expectedDirectory),'utf8'));
  for(const row of expected.outputs[0].rows)if(row.Moment!==null)assert.match(row.Moment,/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}$/);
  assert.match(execFileSync('python3',[new URL('oracle.py',expectedDirectory).pathname,'--case',caseName,'--check'],{encoding:'utf8'}),/: OK/);
 }
});
