import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {javascriptBatchOrder,javascriptBatchCases,javascriptBatchVerdict,runJavascriptBatch,caseEffect,javascriptDropPoint,javascriptBatchInputIdentity} from './javascript-batch-plan.mjs';
import {createJavascriptEffectJournal,javascriptSentinelOutcome} from './javascript-execution-evidence.mjs';

const settled={owner_verified:true,wizard_closed:true,quiet:true,node_count:2};
const identity={effect_id:'case:next',node_id:'node',source_sha256:'a'.repeat(64)};
const observation=(messages=[],stage='next')=>({outcome:javascriptSentinelOutcome({stage,identity,messages,baselineIds:[],ownerVerified:true,terminal:true})});

test('bounded unique plan prioritizes positive execution probes',()=>{
  assert.equal(javascriptBatchOrder.length,11);
  assert.equal(javascriptBatchOrder[0],'code-table-execute');
  for(const plan of [[],['unknown'],['code-table-execute','code-table-execute'],Array(12).fill('code-table-execute')])
    assert.throws(()=>javascriptBatchCases(plan));
  assert.deepEqual(javascriptBatchCases(['declared-sentinel-done']),['declared-sentinel-done']);
});

test('sentinel absence permits a settled independent case without granting execution proof',()=>{
  const verdict=javascriptBatchVerdict('code-sentinel-next',observation(),settled);
  assert.equal(verdict.safe_to_continue,true);
  assert.equal(verdict.gate_passed,false);
  assert.equal(verdict.execution,'ambiguous');
  assert.equal(verdict.absence_proves_no_execution,false);
  const positive=observation([{...identity,id:'fresh',text:'JS_G2_EXECUTION_SENTINEL_V1'}]);
  assert.equal(javascriptBatchVerdict('code-sentinel-next',positive,settled).gate_passed,true);
  assert.equal(javascriptBatchVerdict('code-sentinel-done',positive,settled).gate_passed,false);
  for(const bad of [{quiet:false},{wizard_closed:false},{owner_verified:false},{node_count:21}])
    assert.throws(()=>javascriptBatchVerdict('code-sentinel-next',positive,{...settled,...bad}));
  for(const bad of [{terminal_observed:false},{owner_verified:false}])
    assert.throws(()=>javascriptBatchVerdict('code-sentinel-next',{outcome:{...positive.outcome,...bad}},settled));
});

test('table and mismatch verdicts require typed output, execution and source/mapping readback',()=>{
  const output={sample_complete:true,row_count:6,sample_rows:6,schema:[{name:'ObservedID',type:'integer'},{name:'PhaseMarker',type:'string'}],
    sample:['1','2','3','4','5','6'].map(id=>[{type:'integer',value:id,is_null:false,precision:'exact_integer'},{type:'string',value:'JS_G2_TABLE_V1',is_null:false}])};
  const probe={status:'typed_output_verified',output,execution:{verified:true,status:'completed',owner_verified:true},
    existing_readback:{source_verified:true,mode_verified:true,port_mappings_unchanged:true}};
  assert.equal(javascriptBatchVerdict('code-table-execute',probe,settled).gate_passed,true);
  assert.throws(()=>javascriptBatchVerdict('code-table-execute',{...probe,execution:{status:'failed'}},settled));
  assert.throws(()=>javascriptBatchVerdict('code-table-mismatch',probe,settled));
  assert.throws(()=>javascriptBatchVerdict('code-table-execute',{...probe,output:{...output,row_count:5}},settled),/oracle/);
  const mismatch={status:'observed',mapping_preserved:false,reset_dispatched:false,execution_started:false};
  assert.throws(()=>javascriptBatchVerdict('code-table-mismatch',{...probe,existing_readback:{...probe.existing_readback,generated_schema_mismatch_trial:mismatch}},settled),/materialization/);
});

test('batch allocates independent cases and never continues an unknown mutation or lost owner',async()=>{
  const cases=['code-sentinel-next','declared-sentinel-next','code-sentinel-done'];
  for(const failure of ['none','dispatch','owner','duplicate','begin','observation-cleanup']){
    const started=[],finished=[];
    const run=runJavascriptBatch({cases,deadline:100,now:()=>1,
      begin:async entry=>{started.push(entry);if(failure==='begin'&&started.length===2)throw Error('input replaced');},
      run:async()=>{
        if(failure==='dispatch'&&started.length===2)throw Error('lost click response');
        if(failure==='observation-cleanup'&&started.length===2)throw Object.assign(Error('read timeout'),{
          observationError:Error('read timeout'),cleanupError:Object.assign(Error('close ambiguous'),{receipt:{status:'AMBIGUOUS'}})});
        return {node_id:failure==='duplicate'?'same':'node-'+started.length,probe:observation()};
      },
      settle:async()=>({...settled,owner_verified:!(failure==='owner'&&started.length===2)}),
      record:async event=>finished.push(event)});
    if(failure==='none')await run;else await assert.rejects(run);
    assert.equal(started.length,failure==='none'?3:2);
    assert.equal(new Set(started.map(e=>e.case_id)).size,started.length);
    assert.equal(finished.at(-1).status,failure==='none'?'OBSERVED':'FAILED');
    if(failure==='observation-cleanup'){
      assert.equal(finished.at(-1).failure.observation_error.message,'read timeout');
      assert.equal(finished.at(-1).failure.cleanup_error.receipt.status,'AMBIGUOUS');
    }
  }
});

test('original total deadline stops the next case without extending its budget',async()=>{
  let clock=0,started=0;
  await assert.rejects(runJavascriptBatch({cases:['code-sentinel-next','declared-sentinel-next'],deadline:10,now:()=>clock,
    begin:async()=>{started++;},run:async()=>({node_id:'node',probe:observation()}),settle:async()=>settled,
    record:async()=>{clock=10;}}),/deadline/);
  assert.equal(started,1);
});

test('case namespace preserves once-only admission and independent schema effects',async()=>{
  const records=[];let gestures=0;
  const once=createJavascriptEffectJournal({record:async e=>records.push(e),deadline:100,now:()=>0});
  await assert.rejects(once(caseEffect('a','schema-mode'),{},async()=>{gestures++;throw Error('response lost');}));
  await assert.rejects(once(caseEffect('a','schema-mode'),{},async()=>{gestures++;}),/Duplicate/);
  await once(caseEffect('b','schema-mode'),{},async()=>{gestures++;});
  assert.equal(caseEffect('a','a:schema-mode'),'a:schema-mode');
  assert.equal(gestures,2);
  assert.deepEqual(records.map(e=>e.state),['dispatching','unconfirmed','dispatching','observed']);
});

test('visible placement fits eleven distinct nodes and refuses a full or covered graph',()=>{
  const nodes=[],graph={getBoundingClientRect:()=>({left:100,top:0,right:1500,bottom:850}),contains:e=>e===graph||nodes.some(n=>n.element===e)};
  const diagram={FNodes:{FCollection:nodes},FmxGraph:{container:graph,view:{getState:cell=>({shape:{node:cell.element}})}}};
  graph.closest=()=>null;
  const realm=vm.createContext({innerWidth:1600,innerHeight:900,
    bg:{app:{Application:{FInstance:{FMainForm:{Items:{Workspace:{getActiveTab:()=>({Controller:{FController:{FDiagram:diagram}}})}}}}}}},
    document:{elementFromPoint:()=>graph},graph});
  const points=[];
  for(let i=0;i<12;i++){
    const point=vm.runInContext('('+javascriptDropPoint.toString()+')(graph)',realm);points.push(point);
    const element={isConnected:true,getBoundingClientRect:()=>({left:point.x-55,right:point.x+55,top:point.y-40,bottom:point.y+40})};
    const cell={element};nodes.push({FCell:cell,element});
  }
  assert.equal(new Set(points.map(p=>p.x+','+p.y)).size,12);
  realm.document.elementFromPoint=()=>({closest:()=>({})});
  assert.throws(()=>vm.runInContext('('+javascriptDropPoint.toString()+')(graph)',realm),/empty drop/);
});

test('input identity rejects substitution despite identical native GUIDs',()=>{
  const port={FGuid:'port'},node={FGuid:'input',data:{},FCell:{},FPorts:[{FCollection:[port]}]};
  const diagram={FNodes:{FCollection:[node]}},controller={FController:{FDiagram:diagram}},tab={Controller:controller},document={};
  const held={document,tab,controller,diagram,node,data:node.data,cell:node.FCell,port};
  const realm=vm.createContext({document,args:{held,input:{node:{node_id:'input'},table:{port_guid:'port'}}},
    bg:{app:{Application:{FInstance:{FMainForm:{Items:{Workspace:{getActiveTab:()=>tab}}}}}}}});
  const check=()=>vm.runInContext('('+javascriptBatchInputIdentity.toString()+')(args)',realm);
  assert.equal(check(),true);
  diagram.FNodes.FCollection=[{...node}];assert.equal(check(),false);diagram.FNodes.FCollection=[node];
  node.data={};assert.equal(check(),false);node.data=held.data;
  node.FCell={};assert.equal(check(),false);node.FCell=held.cell;
  node.FPorts=[{FCollection:[{FGuid:'port'}]}];assert.equal(check(),false);
});
