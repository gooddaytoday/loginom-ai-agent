import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
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
 await assert.rejects(checkSupernodeRun(events,new URL('../../../docs/node-development/nodes/control-supernode/acceptance/',import.meta.url)),/COMPLETE_TYPED_TABLE_5/);
});
