import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {javascriptCreatedTopology,connectJavascriptInput,captureJavascriptNativeTopology,requireJavascriptGraphUnchanged} from './javascript-link-topology.mjs';
import {createJavascriptEffectJournal} from './javascript-execution-evidence.mjs';

function fixture() {
  const node=(id,type='imports.text')=>({ref:{document_id:'doc',workflow_id:'flow',node_id:id},
    type,label:id,dom_epoch:1,position:{x:0,y:0},inputs:[0],outputs:[0,1],other_ports:[],locked:false});
  const source=node('source'),old=node('old'),created={...node('js','bg-vendor-icon-javascript'),outputs:[0]};
  const before={complete:true,interaction_ready:true,document_id:'doc',workflow_ref:{workflow_id:'flow'},dom_epoch:1,
    nodes:[old,source],links:[{source:'source',output:1,target:'old',input:0}],foreign_links:['retained-variable-link']};
  const after=structuredClone(before);after.nodes=[created,...after.nodes];
  const edge={source:'source',output:0,target:'js',input:0};
  return {before,after,edge,source:source.ref};
}

test('palette delta accepts only the desired link or no link, preserving the old graph',()=>{
  const f=fixture();
  assert.equal(javascriptCreatedTopology(f.before,f.after,f.source,'js').adopt,false);
  f.after.links.push(f.edge);
  assert.equal(javascriptCreatedTopology(f.before,f.after,f.source,'js').adopt,true);
  f.after.nodes[1].dom_epoch=2;
  assert.equal(javascriptCreatedTopology(f.before,f.after,f.source,'js').adopt,true);
});

test('wrong/extra links, changed old topology, ports and foreign owners refuse adoption',()=>{
  const changes=[
    f=>f.after.links.push({...f.edge,source:'old'}),
    f=>f.after.links.push({...f.edge,output:1}),
    f=>f.after.links.push({...f.edge,input:1}),
    f=>f.after.links.push(f.edge,f.edge),
    f=>f.after.links.push(f.edge,{source:'js',output:0,target:'old',input:0}),
    f=>f.after.links.splice(0,1),
    f=>f.after.links[0].output=0,
    f=>f.after.nodes[1].outputs=[0],
    f=>f.after.nodes[1].position.x=80,
    f=>f.after.nodes[0].inputs=[0,1],
    f=>f.after.foreign_links.push('new-variable-link'),
    f=>f.after.workflow_ref.workflow_id='foreign',
    f=>f.after.complete=false,
  ];
  for(const change of changes){const f=fixture();change(f);assert.throws(()=>javascriptCreatedTopology(f.before,f.after,f.source,'js'));}
});

test('proven auto-created link sends zero gestures and rechecks after journaling',async()=>{
  const f=fixture();f.after.links.push(f.edge);const events=[];let native=0,reads=0,gestures=0;
  const result=await connectJavascriptInput({source:f.source,id:'js',drop:f.before,
    graph:async()=>{reads++;return structuredClone(f.after);},checkNative:async()=>{native++;},
    connect:async()=>{gestures++;},record:async e=>events.push(e)});
  assert.equal(result.node_id,'js');assert.equal(gestures,0);assert.equal(native,2);assert.equal(reads,2);
  assert.equal(events.find(e=>e.phase==='javascript_input_link_adopted').effect_dispatched,false);
});

test('empty new input uses exactly one existing connect effect and verifies preserved topology',async()=>{
  const f=fixture();let gestures=0;const events=[];
  const once=createJavascriptEffectJournal({record:async e=>events.push(e),deadline:100,now:()=>0});
  await connectJavascriptInput({source:f.source,id:'js',drop:f.before,graph:async()=>structuredClone(f.after),checkNative:async()=>{},
    connect:effect=>once(effect.id,effect.parameters,async()=>{gestures++;assert.deepEqual(effect.parameters.edge,f.edge);
      f.after.links.push(f.edge);return {status:'SUCCEEDED'};}),record:async e=>events.push(e)});
  assert.equal(gestures,1);assert.ok(events.some(e=>e.phase==='input_link_verified'));
});

test('lost link reply is not replayed, and post-gesture topology changes cannot pass',async()=>{
  for(const fault of ['lost','ambiguous','old-link']){
    const f=fixture();let gestures=0;const events=[];
    await assert.rejects(connectJavascriptInput({source:f.source,id:'js',drop:f.before,
      graph:async()=>structuredClone(f.after),checkNative:async()=>{},record:async e=>events.push(e),connect:async()=>{
        gestures++;f.after.links.push(f.edge);
        if(fault==='lost')throw Error('Lost gesture response');
        if(fault==='ambiguous')return {status:'AMBIGUOUS'};
        f.after.links[0].output=0;return {status:'SUCCEEDED'};
      }}));
    assert.equal(gestures,1);assert.ok(events.some(e=>e.phase==='javascript_input_link_refused'));
    assert.equal(events.some(e=>e.phase==='input_link_verified'),false);
  }
});

test('adoption refuses changed native owner and graph after its observation without a gesture',async()=>{
  for(const fault of ['owner','journal-change']){
    const f=fixture();f.after.links.push(f.edge);let gestures=0;
    await assert.rejects(connectJavascriptInput({source:f.source,id:'js',drop:f.before,graph:async()=>structuredClone(f.after),
      checkNative:async()=>{if(fault==='owner')throw Error('Native owner changed');},connect:async()=>{gestures++;},
      record:async e=>{if(fault==='journal-change'&&e.phase==='javascript_input_link_adoption_prepared')f.after.links.pop();}}));
    assert.equal(gestures,0);
  }
});

test('native snapshot retains every old node/data/cell and port even if GUIDs are reused',()=>{
  const native=id=>{const n={FGuid:id,data:{},FCell:{},FPorts:[]};
    n.FPorts=[{FCollection:[{FGuid:id+'-port',data:{},FCell:{},parent:n,FType:0,FSubType:0}]}];return n;};
  const source=native('source'),old=native('old'),nodes=[source,old],graph={container:{}},diagram={FNodes:{FCollection:nodes},FmxGraph:graph};
  const model={FDiagram:diagram},controller={FController:model},tab={Controller:controller},document={};
  const realm=vm.createContext({document,args:{},bg:{app:{Application:{FInstance:{FMainForm:{Items:{Workspace:{getActiveTab:()=>tab}}}}}}}});
  const call=args=>{realm.args=args;return vm.runInContext('('+captureJavascriptNativeTopology.toString()+')(args)',realm);};
  const before=call({});nodes.push(native('js'));
  const after=call({previous:before,addedId:'js'});assert.equal(after.nodes.length,3);
  assert.equal(call({previous:after,checkOnly:true}).verified,true);
  for(const field of ['data','FCell']){const saved=source[field];source[field]={};assert.throws(()=>call({previous:after,checkOnly:true}),/prior native/);source[field]=saved;}
  const port=source.FPorts[0].FCollection[0];source.FPorts[0].FCollection[0]={...port};
  assert.throws(()=>call({previous:after,checkOnly:true}),/prior native/);source.FPorts[0].FCollection[0]=port;
  nodes[1]={...old};assert.throws(()=>call({previous:after,checkOnly:true}),/prior native/);nodes[1]=old;
  tab.Controller={...controller};assert.throws(()=>call({previous:after,checkOnly:true}),/owner changed/);
});

test('pre-drag check rejects topology changes while allowing only DOM repaint epochs',()=>{
  const f=fixture(),same=structuredClone(f.before);same.nodes[0].dom_epoch=42;
  requireJavascriptGraphUnchanged(f.before,same);
  same.links=[];assert.throws(()=>requireJavascriptGraphUnchanged(f.before,same));
});
