import {javascriptMappingState} from './javascript-mapping-state.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {createJavascriptColdSource} from './javascript-cold-source.mjs';
import {javascriptColdNodes,observeJavascriptWizardBinding} from './javascript-cold-binding.mjs';
import {javascriptSourceSettings} from './javascript-source-cycle.mjs';
import {requireJavascriptSavedPackagePath} from './javascript-package-binding.mjs';
import {observeJavascriptSource,observeJavascriptSourceProcesses} from '../../client/lib/javascript-source-browser.mjs';
import {createRedactor} from '../../client/lib/redact.mjs';
import {sourceFixture} from '../../client/test/javascript-source-read.test.mjs';
import {runJavascriptOperator} from './javascript-live.mjs';

const source='import {InputTable} from "builtIn/Data";\nconst text="Фактический текст 😀";';
const path='/jsteach/js-g2-9150c962-ad60-4cd4-a13e-bcba89b982d8/JavaScript-9150c962-ad60-4cd4-a13e-bcba89b982d8.lgp';
const schema=()=>({verified:true,generation:{checked:false},grids:[{tid:'cold;columns',fields:[{Name:'Actual',DataType:1}]}]});
const same=(a,b)=>assert.equal(JSON.stringify(a),JSON.stringify(b));

// The actual operator helper, production admission/reader and serialized native
// source/process observers. Navigation transport is synthetic; no browser starts.
for(const fault of ['ok','configured-before','configured-after','configured-foreign','configured-header','open-lost','close-lost','unlock-lost','execute-lost','source','settings','process','ack','stale','foreign','output-lost'])
  test('cold actual operator read/execute flow: '+fault,async()=>{
    const code=await readFile(new URL('./javascript-live.mjs',import.meta.url),'utf8');
    const body=code.slice(code.indexOf('const runColdRead=async'),code.indexOf('const runExecutionTrial=async'));
    const f=sourceFixture(source),calls=[],events=[],report={},node={document_id:'document',workflow_id:'workflow',node_id:'node'};
    const graph={nodes:['observed']},output={actual:'table'},deadline=Date.now()+60000;
    let opens=0,executes=0;
    const page={evaluateHandle:async(fn,args)=>{const held=fn===observeJavascriptSourceProcesses?f.processes(args):f.observe(args);held.dispose=async()=>{};return held;},
      evaluate:async(fn,args)=>fn===observeJavascriptSourceProcesses?f.processes(args):f.observe(args)};
    const env={javascriptMappingState,createJavascriptColdSource,observeJavascriptSource,observeJavascriptSourceProcesses,javascriptSourceSettings,
      structuredClone,Math,Date,Error,JSON,report,page,batchDeadline:deadline,
      executionPrepared:{document_id:'document',workflow_ref:{workflow_id:'workflow'},package_ref:{path}},executionNode:node,
      ownedPackagePath:()=>path,redactor:createRedactor(),schemaContext:()=>f.context,
      remainingBatch:()=>{assert.ok(Date.now()<deadline);return deadline-Date.now();},phaseDeadline:ms=>Math.min(deadline,Date.now()+ms),
      wizardAddressEpoch:0,wizardHandle:null,wizardRoot:null,openedWizard:false,closeDispatched:false,closeConfirmed:false,
      closeDeadline:0,wizardDeadline:0,sourceCycleUncertain:false,save:async()=>{},waitWizardReady:async()=>{},
      inspectWizardPages:async()=>{report.execution_existing_schema=schema();if(fault==='settings'&&opens===2)report.execution_existing_schema.generation.checked=true;},
      closeWizardOnce:async()=>{calls.push('close');if(fault==='close-lost')throw Error('Lost Close');if(fault==='process')f.processRecord.data.Status=1;},
      executionRecord:async event=>{events.push(event);return fault==='ack'&&event.phase==='javascript_source_effect_dispatch'?{}:event;},
      executionRuntime:{
        captureExecutionBoundary:async()=>({before:graph,native:{dispose:async()=>{}}}),verifyExecutionBoundary:async()=>{},settleClosedExecutionBoundary:async()=>{calls.push('unlock');if(fault==='unlock-lost')throw Error('Close unlock unconfirmed');},
        graph:async()=>graph,readPortMapping:async(n,direction,options)=>{same(n,node);assert.equal(options.operationDeadline,deadline);calls.push('mapping-'+direction);const mapping={direction,actual:true,verified:true,source_identity_verified:true,inventory_complete:true,state_source:'cached_mapping_stores',
          autosync:true,settings_applied:false,package_saved:false,node_context:{...node,verified:true,surface:'wizard'},source_fields:[{name:'Actual'}],target_fields:[{name:'Actual'}]};
          if(direction==='output'&&fault.startsWith('configured-')&&(fault==='configured-after'?executes>0:executes===0)){
            assert.equal(options.allowConfiguredOnly,executes===0);
            Object.assign(mapping,{verified:false,source_identity_verified:false,configured_inventory_verified:true,
              reason:'mapping_source_pending',mapping_wizard:'DataSetOutputSocketWizard',source_fields:[],
              target_fields:[{name:'Actual',source:null,exclusion_source:null,excluded:false}],rendered_indices:[0]});
            Object.assign(mapping.node_context,{tid:'cold;WizrdMCF',output_port:{direction:'output',port:0,port_guid:'output-guid'}});
            mapping.source_pending={kind:'hidden_source_column',native_header_verified:true,
              header_tid:'cold;WizrdMCF;DataSetOutputSocketWizard;grdTargetColumns;headercontainer',
              column_tid:'cold;WizrdMCF;DataSetOutputSocketWizard;colSourceDisplayName',data_index:'SourceDisplayName',
              item_id:'colSourceDisplayName',hidden:true,visible:false,source_count:0,target_count:1};
            if(fault==='configured-foreign')mapping.node_context.node_id='foreign';
            if(fault==='configured-header')mapping.source_pending.native_header_verified=false;
          }
          return mapping;},
        handoffReopenedWizard:async()=>{},reopen:async(n,until)=>{same(n,node);assert.equal(until,deadline);calls.push('open');opens++;f.binding.wizardAddress.epoch=opens;
          if(fault==='open-lost')throw Error('Lost Open');if(fault==='source'&&opens===2)f.setSource(source+' ');},
        executeNode:async(n,until,sha)=>{executes++;calls.push('execute');same(n,node);assert.equal(until,deadline);assert.equal(sha,report.cold.source.source_sha256);
          if(fault==='execute-lost')throw Error('Lost Execute');
          return {verified:true,owner_verified:true,cleanup_complete:true,status:'completed',execution_id:'new',group_id:'2',
            trial:{node_id:fault==='foreign'?'foreign':'node',source_sha256:sha},
            fresh_baseline:{node,roots:[{process_id:fault==='stale'?'2':'1'}]},launch_identity:{node,execution_id:'new',group_id:'2'}};},
        readOutput:async(n,until)=>{calls.push('output');same(n,node);assert.equal(until,deadline);if(fault==='output-lost')throw Error('Lost output');return output;},
      }};
    const realm=vm.createContext(env);vm.runInContext(body+'\nglobalThis.run=runColdRead;',realm);
    if(['ok','configured-before'].includes(fault)){
      await env.run();assert.equal(report.cold.source.source_text,source);same(report.cold.source.settings,javascriptSourceSettings(schema()));
      assert.equal(report.cold.output,output);assert.equal(report.cold.status,'COLD_OBSERVED');assert.equal(report.cold.persistence_verified,false);
      assert.equal(opens,3);assert.equal(executes,1);assert.equal(calls.filter(x=>x==='close').length,3);
      assert.equal(calls.indexOf('execute')>calls.lastIndexOf('close'),true);assert.equal(env.sourceCycleUncertain,false);
      if(fault==='configured-before'){assert.equal(report.cold.mappings_before.output.verified,false);assert.equal(report.cold.mappings_after.output.source_identity_verified,true);}
    }else{
      await assert.rejects(env.run());assert.ok(executes<=1);
      if(['configured-foreign','configured-header'].includes(fault))assert.equal(executes,0);
      if(fault==='configured-after')assert.equal(executes,1);assert.notEqual(report.cold?.status,'COLD_OBSERVED');
      if(['open-lost','close-lost','execute-lost','source','settings','process','ack'].includes(fault))assert.equal(env.sourceCycleUncertain,true);
      if(['stale','foreign'].includes(fault))assert.equal(calls.includes('output'),false);
    }
    assert.equal(JSON.stringify(events).includes('Фактический текст'),false);
  });

function graphFixture(){
  const prepared={document_id:'doc',workflow_ref:{workflow_id:'workflow',prefix:'prefix'}};
  const node=(id,inputs,outputs)=>({ref:{document_id:'doc',workflow_id:'workflow',node_id:id},inputs,outputs,other_ports:[],locked:false});
  const graph={document_id:'doc',workflow_ref:prepared.workflow_ref,complete:true,interaction_ready:true,
    nodes:[{...node('js',[0],[0]),other_ports:['Input_Add','Input_Var-1','Output_Add']},
      {...node('input',[],[0]),other_ports:['Input_Connection-0','Input_Var-1']}],links:[{source:'input',target:'js',input:0,output:0}],foreign_links:[]};
  const observed={native_model:true,prefix:'prefix',running:false,nodes:[
    {id:'input',rendered:true,tid:'input-tid',icon_class:'bg-vendor-icon-importtextfile'},
    {id:'js',rendered:true,tid:'js-tid',icon_class:'bg-vendor-icon-javascript'}]};
  return {prepared,graph,observed};
}
test('cold discovery selects unique native icons/GUIDs without ordinal or label assumptions',()=>{
  const f=graphFixture();const result=javascriptColdNodes(f.graph,f.observed,f.prepared);
  assert.equal(result.node.node_id,'js');assert.equal(result.input.node_id,'input');
  f.graph.nodes.reverse();f.observed.nodes.reverse();same(javascriptColdNodes(f.graph,f.observed,f.prepared),result);
  result.node.node_id='changed';assert.equal(f.graph.nodes.find(n=>n.ref.node_id==='js').ref.node_id,'js');
});
for(const fault of ['node','icon','hidden','duplicate','foreign-link','edge','port','locked','document','workflow','running','extra'])test('cold discovery refuses '+fault,()=>{
  const f=graphFixture();
  if(fault==='node')f.observed.nodes[1].id='unknown';if(fault==='icon')f.observed.nodes[1].icon_class='other';
  if(fault==='hidden')f.observed.nodes[1].rendered=false;if(fault==='duplicate')f.observed.nodes[1].id='input';
  if(fault==='foreign-link')f.graph.foreign_links.push({});if(fault==='edge')f.graph.links[0].source='js';
  if(fault==='port')f.graph.nodes[0].inputs=[1];if(fault==='locked')f.graph.nodes[0].locked=true;
  if(fault==='document')f.prepared.document_id='other';if(fault==='workflow')f.prepared.workflow_ref={...f.prepared.workflow_ref,prefix:'other'};
  if(fault==='running')f.observed.running=true;if(fault==='extra')f.observed.nodes.push({...f.observed.nodes[0],id:'extra'});
  assert.throws(()=>javascriptColdNodes(f.graph,f.observed,f.prepared));
});

for(const args of [[],['--package',path,'--execution-case','code-table-execute'],['--package',path,'--create-node'],
  ['--package',path,'--source','anything'],['--package','/other/unknown.lgp']])test('cold operator rejects configuration or unassigned path '+args.join(' '),async()=>{
    await assert.rejects(runJavascriptOperator(args,{coldReader:true}));
  });
test('strict owned path validation works before UI or preparation receipt exists',()=>{
  assert.equal(requireJavascriptSavedPackagePath(path),path);
  for(const input of [undefined,null,'',path+'/..',path.replace('/jsteach/','/other/'),path.toUpperCase()])assert.throws(()=>requireJavascriptSavedPackagePath(input));
});

test('cold discovery retains the observed workflow-variables node and service ports',()=>{
  const f=graphFixture();
  f.graph.nodes.push({ref:{document_id:'doc',workflow_id:'workflow',node_id:'vars'},inputs:[],outputs:[],other_ports:['Output_Var-0'],locked:false});
  f.observed.nodes.push({id:'vars',rendered:true,tid:'vars-tid',icon_class:'bg-vendor-icon-modelvariables'});
  assert.equal(javascriptColdNodes(f.graph,f.observed,f.prepared).node.node_id,'js');
  f.observed.nodes[2].icon_class='unknown';assert.throws(()=>javascriptColdNodes(f.graph,f.observed,f.prepared));
});

for(const fault of ['ok','ancestor','icon','guid','tid','duplicate'])test('serialized shared wizard binding: '+fault,()=>{
  const document={},owned={},cell={},data={},WorkFlowTreeNode=class {};
  const workflow=new WorkFlowTreeNode();workflow.ParentNode=fault==='ancestor'?{}:owned;
  const node={FGuid:fault==='guid'?'other':'node',FIconCls:fault==='icon'?'other':'js',FCell:cell,data};
  const diagram={FNodes:{FCollection:fault==='duplicate'?[node,{...node}]:[node]},FmxGraph:{view:{getState:()=>({shape:{node:{getAttribute:()=>fault==='tid'?'other':'tid'}}})}}};
  const tab={Controller:{Node:{data:{node:workflow}},FController:{FDiagram:diagram}}};
  const env={document,bg:{app:{WorkFlowTreeNode,Application:{FInstance:{FMainForm:{Items:{Workspace:{getActiveTab:()=>tab}}}}}}}};
  const observe=vm.runInNewContext('('+observeJavascriptWizardBinding.toString()+')',env);
  const call=()=>observe({id:'node',tid:'tid',icon:'js',owned});
  if(fault==='ok'){const result=call();assert.equal(result.native,node);assert.equal(result.document,document);assert.equal(result.workflow,workflow);}
  if(fault!=='ok')assert.throws(call);
});

for(const fault of ['ok','open','not-ready','foreign-path','binding','metadata','discovery'])test('actual cold open handoff: '+fault,async()=>{
  const source=await readFile(new URL('./javascript-live.mjs',import.meta.url),'utf8');
  const begin=source.indexOf("  if(coldReader){\n    report.stage='cold-open-package'"),end=source.indexOf("  if (options['--create-node']",begin);
  assert.ok(begin>0&&end>begin);
  const f=graphFixture(),calls=[],report={},deadline=Date.now()+60000;
  const prepared={...f.prepared,status:fault==='not-ready'?'FAILED':'READY',target_verified:true,
    package_ref:{name:'saved',persisted:true,path:fault==='foreign-path'?path.replace('/jsteach/','/other/'):path}};
  const observed={...f.observed,package_name:fault==='metadata'?'other':'saved'};
  const packageNode={};
  const env={coldReader:true,report,config:{url:'http://logi-test-plan.bg.local/app/',username:'jsteach'},options:{'--package':path},
    batchDeadline:deadline,directory:'/private/evidence',Math,Date,Error,JSON,Function,
    executionPrepared:null,packageHandle:null,owner:null,executionRuntime:null,executionNode:null,wizardBinding:null,coldOpenPending:false,
    guard:async()=>calls.push('guard'),remainingBatch:()=>deadline-Date.now(),waitGraphReady:async()=>{},save:async()=>{},
    makeWorkspacePrepareCode:options=>{
      assert.equal(options.intent,'open_package');assert.equal(options.packagePath,path);assert.equal(options.compatibility.platform,'linux');
      assert.ok(options.timeoutMs<=deadline-Date.now()+2);assert.equal('source_text' in options,false);calls.push('prepare');
      return fault==='open'?'async()=>{throw Error("Lost Open");}':'async()=>('+JSON.stringify(prepared)+')';
    },
    executionRecord:async event=>event,
    bindJavascriptPackage:async({savedPath,prepared:actual})=>{calls.push('bind');assert.equal(savedPath,path);
      if(fault==='binding'||actual.package_ref.path!==path)throw Error('Wrong binding');return {packageNode,dispose:async()=>calls.push('binding-dispose')};},
    observe:async()=>observed,
    page:{evaluateHandle:async(fn,args)=>{if(fn===observeJavascriptWizardBinding){calls.push('wizard-bind');return {};}
      return fn(args);}},observeJavascriptWizardBinding,
    createJavascriptSavedExecutionRuntime:async options=>{calls.push('runtime');assert.equal(options.deadline,deadline);
      assert.equal(options.savedPath,path);same(Object.keys(options).sort(),['page','prepared','directory','account','record','deadline','savedPath'].sort());
      return {graph:async()=>f.graph};},
    javascriptColdNodes:(...args)=>{calls.push('discover');if(fault==='discovery')throw Error('Wrong graph');return javascriptColdNodes(...args);},
    runColdRead:async()=>{calls.push('read');},
  };
  const realm=vm.createContext(env);vm.runInContext('globalThis.run=async()=>{'+source.slice(begin,end)+'};',realm);
  if(fault==='ok'){await env.run();assert.equal(env.coldOpenPending,false);assert.equal(calls.at(-1),'read');assert.equal(env.packageHandle,packageNode);}
  if(fault!=='ok'){await assert.rejects(env.run());assert.equal(calls.includes('read'),false);
    assert.equal(env.coldOpenPending,fault!=='discovery');}
});

for(const kind of ['cold-open','cold-source'])test('actual cold uncertain cleanup only closes own browser: '+kind,async()=>{
  const live=await readFile(new URL('./javascript-live.mjs',import.meta.url),'utf8');
  const start=live.lastIndexOf('} catch(error) {\n  report.status='),end=live.indexOf('  console.log(JSON.stringify({status:report.status',start),calls=[];
  const forbidden=name=>()=>{calls.push(name);throw Error('Unexpected '+name);};
  const report={stage:kind,cleanup:{package_closed:false,logged_out:false,browser_closed:false}};
  const env={report,coldReader:true,coldOpenPending:kind==='cold-open',sourceCycleUncertain:kind==='cold-source',sourceReaders:[],
    executionRuntime:undefined,page:{},owner:undefined,packageHandle:undefined,session:{context:{close:async()=>calls.push('browser-close')}},browserLifecycle:null,
    nativeRoundtrip:false,nativeClassifierBinding:undefined,captureJavascriptNativeClassifierDiagnostic:forbidden('classifier'),
    javascriptProbeFailure:e=>({message:e.message}),redactor:createRedactor(),discoveryProbe:null,
    snapshot:forbidden('snapshot'),paletteSnapshot:forbidden('palette'),refusalEvidence:forbidden('refusal'),
    guard:forbidden('guard'),observe:forbidden('observe'),click:forbidden('click'),settlePackageMetadata:forbidden('adopt-draft'),
    calibrationTrial:null,coercionTrial:null,namedTrial:null,telemetryTrial:null,save:async()=>{},Date,cleaning:false,persistence:null,cleanupDeadline:Infinity};
  const realm=vm.createContext(env);const cleanup=vm.runInContext('(async()=>{try{throw Error("lost");'+live.slice(start,end)+'}})',realm);
  await cleanup();assert.deepEqual(calls,['browser-close']);assert.equal(report.status,'CLEANUP_UNCONFIRMED');
  assert.equal(report.cleanup.package_closed,false);assert.equal(report.cleanup.browser_closed,true);
  assert.ok(env.cleanupDeadline<=Date.now()+180000);
});
