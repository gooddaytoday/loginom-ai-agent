import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {openJavascriptNativeRoundtripPreview,parseJavascriptNativePreviewDiagnostic} from './javascript-native-roundtrip-opening.mjs';
import {createExecutionJournal} from '../../client/lib/execution-journal.mjs';

function fixture({fault,record,afterClick}={}){
  const tid='MF;TF-1;Graph;JavaScript',events=[],gestures=[],states=[];
  let renderChild=null;
  const element=(id)=>({isConnected:true,getAttribute:k=>k==='data-tid'?id:null,
    getBoundingClientRect:()=>({x:100,y:100,width:15,height:24}),contains:e=>e===shape||e===nodeShape||e===renderChild,
    closest:q=>q==='[data-tid]'?shape:null,querySelectorAll:q=>q.includes('Output_Data-0')?[shape]:[nodeShape]});
  let shape=element(tid+';Output_Data-0');
  const nodeShape=element(tid),container=element('container'),body=element('body');
  const node={FGuid:'js',FStatus:1,FRunning:false,FCell:{},data:{}};
  const port={FGuid:'port',parent:node,FCell:{parent:node.FCell},data:{},FType:1,FSubType:1,FParam:2,FPortIndex:0,FStatus:1};
  node.FPorts=[{FCollection:[]},{FCollection:[port,{}]}];
  let selected=[],overlay=null,blockers=[],expired=false;
  const graph={container,view:{getState:cell=>({shape:{node:cell===node.FCell?nodeShape:shape}})},getSelectionCells:()=>selected};
  const diagram={FmxGraph:graph,selectedPorts:[]},model={FDiagram:diagram,FPreviewManager:{FPreviewVisible:false}},workflow={};
  const execution={verified:true,owner_verified:true,status:'completed',execution_id:'e',process_id:'3.1',group_id:'3',trial:{source_sha256:'a'.repeat(64)}};
  const document={body,activeElement:body,querySelectorAll:()=>blockers,elementFromPoint:()=>overlay??shape};
  const capability={document,stage:'completed',binding:{document_id:'d',workflow_id:'w'},node,source_sha256:execution.trial.source_sha256,execution,
    input:{model,workflow,card:{Controller:{Node:{data:{node:workflow}}}}},check:()=>{if(fault==='graph')throw Error('graph/edge identity');}};
  const env=vm.createContext({document,location:{origin:'http://test'},bg:{app:{Version:'7.4.2'}},innerWidth:1000,innerHeight:1000,
    getComputedStyle:()=>({visibility:'visible',display:'block'}),__loginomJavascriptNativeRoundtripV1:capability});
  const page={evaluate:async(fn,args)=>{env.args=args;return vm.runInContext('('+fn.toString()+')(args)',env);},
    mouse:{click:async()=>{gestures.push('click');if(fault==='lost-select')throw Error('lost select');
      diagram.selectedPorts=[fault==='wrong-selected'?{}:port];selected=[port.FCell];if(fault==='focus')document.activeElement={closest:()=>true};afterClick?.();}},
    keyboard:{press:async key=>{gestures.push(key);if(fault==='lost-F3')throw Error('lost F3');model.FPreviewManager.FPreviewVisible=true;}}};
  const owner={document_id:'d',workflow_id:'w',node_id:'js',tid,verified:true,surface:'graph'};
  const output={index:0,native_index:0,port_guid:'port',tid:tid+';Output_Data-0',active:true};
  const control={tid:output.tid,allowed_actions:[],enabled:true,visible:true,kind:'port',scope:'graph'};
  const state={prepared_node_context:owner,wizard:{status:'absent'},node_outputs:{verified:true,ports:[output]},ui:{elements:[control]}};
  const operation={id:'op'},ctx={document_id:'d',node:{document_id:'d',workflow_id:'w',node_id:'js'},workflow_ref:{workflow_id:'w'},execution,deadline:Date.now()+30000};
  const input={binding:{deadline:ctx.deadline}};
  const options={operation,now:()=>expired?Infinity:Date.now(),exclusiveNodeOperation:()=>true,execute:async code=>vm.runInNewContext('('+code+')',{ })(page),
    onRecord:async event=>{
      events.push(event);
      if(event.step==='select'&&event.phase.endsWith('intent')){
        if(fault==='late-port')port.data={};if(fault==='late-shape')shape.isConnected=false;
        if(fault==='overlay')overlay={closest:()=>null};if(fault==='expired')expired=true;
      }
      if(event.step==='preview'&&event.phase.endsWith('intent')){
        if(fault==='late-status')port.FStatus=2;
        if(fault==='late-process')capability.execution={...execution,process_id:'9.1'};
      }
      const saved=record?await record(event):JSON.parse(JSON.stringify(event));
      if(fault==='ack-'+event.step&&event.phase.endsWith('intent'))saved.binding.node_id='wrong';
      if(fault==='result-'+event.step&&event.phase.endsWith('gesture'))saved.result.node_id='wrong';
      return saved;
    }};
  const run=()=>openJavascriptNativeRoundtripPreview({options,ctx,input,port:output,state,deadline:ctx.deadline,targetOrigin:'http://test/',targetBuild:'7.4.2',onState:async s=>states.push(s)});
  return {run,options,state,output,control,ctx,input,capability,port,node,get shape(){return shape;},document,diagram,events,gestures,states,operation,
    repaint:()=>{renderChild={closest:q=>q==='[data-tid]'?shape:null};overlay=renderChild;},
    replaceShape:()=>{shape.isConnected=false;shape=element(tid+';Output_Data-0');},
    block:()=>{blockers=[shape];}};
}

test('actual denied JS port shape selects once then F3 through serialized private route and production ACK',async t=>{
  const directory=await mkdtemp(join(tmpdir(),'js-native-opening-'));t.after(()=>rm(directory,{recursive:true,force:true}));
  const f=fixture({record:createExecutionJournal({directory,metadata:{sessionId:'test',clientRevision:'test'}})});
  await f.run();assert.deepEqual(f.gestures,['click','F3']);assert.equal(f.operation.transportUncertain,undefined);
  assert.equal(f.capability.previewOpening.status,'preview-dispatched');assert.equal(f.states.length,0);
  const log=(await readFile(join(directory,'execution-events.jsonl'),'utf8')).trim().split('\n').map(JSON.parse);
  assert.equal(log.length,6);assert.deepEqual(log.map(e=>e.step),['prepare','prepare','select','select','preview','preview']);
  await assert.rejects(f.run);assert.deepEqual(f.gestures,['click','F3']);
});
for(const [name,change]of Object.entries({wrongOwner:f=>f.state.prepared_node_context.node_id='foreign',wrongPort:f=>f.output.port_guid='foreign',
  wrongExecution:f=>f.ctx.execution={...f.ctx.execution,process_id:'9.1'},inactive:f=>f.port.FStatus=2,
  wrongNode:f=>f.capability.node={...f.node,FGuid:'other'},wrongWorkflow:f=>f.capability.input.card.Controller.Node.data.node={},
  wrongIndex:f=>f.output.native_index=1,extraControl:f=>f.state.ui.elements.push({...f.control}),
  enabledPublicAction:f=>f.control.allowed_actions=['click'],hidden:f=>f.control.visible=false,disabled:f=>f.control.enabled=false,
  notPort:f=>f.control.kind='button',wrongShape:f=>f.shape.getAttribute=()=> 'foreign',modal:f=>f.block(),
  deadline:f=>f.ctx.deadline=0,lock:f=>f.options.exclusiveNodeOperation=()=>false,source:f=>f.capability.source_sha256='wrong',
  wrongDataParam:f=>f.port.FParam=0,extraOutput:f=>f.node.FPorts[1].FCollection.push({})})){
  test('private opener refuses '+name+' before effects',async()=>{const f=fixture();change(f);await assert.rejects(f.run);assert.deepEqual(f.gestures,[]);});
}
for(const fault of ['graph','late-port','late-shape','overlay','expired','ack-prepare','ack-select','result-prepare']){
  test(fault+' refuses before port click',async()=>{const f=fixture({fault});await assert.rejects(f.run);assert.deepEqual(f.gestures,[]);});
}
for(const fault of ['lost-select','wrong-selected','focus','late-status','late-process','ack-preview','result-select']){
  test(fault+' prevents F3 and forbids selection replay',async()=>{
    const f=fixture({fault});await assert.rejects(f.run);assert.deepEqual(f.gestures,['click']);
    assert.equal(f.operation.transportUncertain,true);assert.equal(f.states.at(-1).uncertain,true);
    await assert.rejects(f.run);assert.deepEqual(f.gestures,['click']);
  });
}
for(const fault of ['lost-F3','result-preview'])test(fault+' preserves unknown effect without replay',async()=>{
  const f=fixture({fault});await assert.rejects(f.run);assert.deepEqual(f.gestures,['click','F3']);
  assert.equal(f.operation.transportUncertain,true);await assert.rejects(f.run);assert.deepEqual(f.gestures,['click','F3']);
});

for(const step of [2,3])test('lost transport response after actual gesture '+step+' never replays',async()=>{
  const f=fixture(),execute=f.options.execute;let calls=0;
  f.options.execute=async code=>{const result=await execute(code);if(++calls===step)throw Error('lost transport reply');return result;};
  await assert.rejects(f.run,/lost transport reply/);
  assert.deepEqual(f.gestures,step===2?['click']:['click','F3']);assert.equal(f.operation.transportUncertain,true);
  await assert.rejects(f.run);assert.equal(f.gestures.length,step-1);
});

for(const at of ['before','after'])test('same native child repaint '+at+' selection preserves root shape and fresh hit-test',async()=>{
  const f=fixture({afterClick:()=>{if(at==='after')f.repaint();}});
  if(at==='before'){const record=f.options.onRecord;f.options.onRecord=async e=>{if(e.step==='select'&&e.phase.endsWith('intent'))f.repaint();return record(e);};}
  const original=f.shape;await f.run();assert.equal(f.shape,original);assert.deepEqual(f.gestures,['click','F3']);
});
for(const at of ['before','after'])test('root shape replacement '+at+' selection remains refused with exact phase diagnostic',async()=>{
  const f=fixture({afterClick:()=>{if(at==='after')f.replaceShape();}});
  if(at==='before'){const record=f.options.onRecord;f.options.onRecord=async e=>{if(e.step==='select'&&e.phase.endsWith('intent'))f.replaceShape();return record(e);};}
  let error;try{await f.run();}catch(e){error=e;}
  assert.ok(error);assert.ok(error.message.length<500);
  const diagnostic=parseJavascriptNativePreviewDiagnostic(error.message);
  assert.equal(diagnostic.p,at==='before'?'select':'selected');assert.equal(diagnostic.h,at==='before'?'prepared':'selection-dispatched');
  assert.deepEqual(Object.entries(diagnostic.c).filter(([,v])=>!v).map(([k])=>k),['shape']);
  assert.equal(f.events.at(-1).phase,'native_roundtrip_preview_refused');assert.deepEqual(f.events.at(-1).diagnostic,diagnostic);
  assert.equal(f.operation.transportUncertain,true);assert.equal(f.capability.previewOpening.shape.isConnected,false);
  const count=f.gestures.length;await assert.rejects(f.run);assert.equal(f.gestures.length,count);
});
for(const key of ['fingerprint','model','diagram','graph','container','node','port','portData','cell','shape']){
  test('bounded predicate identifies held '+key+' mismatch without replacing reservation',async()=>{
    const f=fixture(),record=f.options.onRecord;let held;
    f.options.onRecord=async event=>{if(event.step==='select'&&event.phase.endsWith('intent')){held=f.capability.previewOpening;held[key]=key==='fingerprint'?'untrusted-value':{};}return record(event);};
    let error;try{await f.run();}catch(e){error=e;}
    const diagnostic=parseJavascriptNativePreviewDiagnostic(error.message),expected={fingerprint:'binding',portData:'data'}[key]??key;
    assert.deepEqual(Object.entries(diagnostic.c).filter(([,v])=>!v).map(([k])=>k),[expected]);
    assert.equal(diagnostic.p,'select');assert.equal(diagnostic.h,'prepared');assert.equal(f.capability.previewOpening,held);
    assert.equal(error.message.includes('untrusted-value'),false);assert.deepEqual(f.gestures,[]);
  });
}
test('bounded NP1 parser rejects arbitrary payloads and corrupted schemas',()=>{
  const c=Object.fromEntries(['binding','model','diagram','graph','container','node','port','data','cell','shape'].map(k=>[k,true]));
  for(const value of [{p:'select',h:'prepared',c:{...c,shape:'secret'}},{p:'foreign',h:'prepared',c},
    {p:'select',h:'prepared',c,extra:'secret'},{p:'select',h:'prepared',c:{...c,extra:true}}])assert.equal(parseJavascriptNativePreviewDiagnostic('NP1 '+JSON.stringify(value)),null);
  for(const message of ['NP1 {oops}','NP1 '+ 'x'.repeat(800),'lost transport',null])assert.equal(parseJavascriptNativePreviewDiagnostic(message),null);
});
test('refusal diagnostic survives production journal and incorrect refusal ACK cannot report success',async t=>{
  const directory=await mkdtemp(join(tmpdir(),'js-native-refusal-'));t.after(()=>rm(directory,{recursive:true,force:true}));
  const journal=createExecutionJournal({directory,metadata:{sessionId:'test',clientRevision:'test'}});
  const f=fixture({fault:'late-port',record:async event=>{const saved=await journal(event);if(event.phase.endsWith('refused'))saved.diagnostic=null;return saved;}});
  await assert.rejects(f.run,error=>error instanceof AggregateError&&error.errors.some(e=>/refusal journal ACK/.test(e.message)));
  assert.deepEqual(f.gestures,[]);assert.equal(f.operation.transportUncertain,true);
  const log=(await readFile(join(directory,'execution-events.jsonl'),'utf8')).trim().split('\n').map(JSON.parse);
  assert.equal(log.at(-1).diagnostic.p,'select');assert.equal(log.at(-1).diagnostic.c.data,false);
});

for(const key of ['data','cell','port'])test('same-GUID native '+key+' replacement after click is diagnosed and never reaches F3',async()=>{
  const f=fixture({afterClick:()=>{
    if(key==='data')f.port.data={};
    if(key==='cell')f.port.FCell={parent:f.node.FCell};
    if(key==='port')f.node.FPorts[1].FCollection[0]={...f.port};
  }});
  let error;try{await f.run();}catch(e){error=e;}
  const diagnostic=parseJavascriptNativePreviewDiagnostic(error.message);
  assert.equal(diagnostic.p,'selected');assert.equal(diagnostic.h,'selection-dispatched');assert.equal(diagnostic.c[key],false);
  assert.deepEqual(f.gestures,['click']);assert.equal(f.operation.transportUncertain,true);
  await assert.rejects(f.run);assert.deepEqual(f.gestures,['click']);
});
test('unknown lost click remains unknown in bounded refusal record and retains dispatched reservation',async()=>{
  const f=fixture({fault:'lost-select'});await assert.rejects(f.run,/lost select/);
  assert.deepEqual(f.events.at(-1),{phase:'native_roundtrip_preview_refused',step:'select',effect_possible:true,diagnostic:null});
  assert.equal(f.capability.previewOpening.status,'selection-dispatched');assert.equal(f.operation.transportUncertain,true);
});
