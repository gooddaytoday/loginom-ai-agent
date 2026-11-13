import {pythonSourceIdentity,pythonObservedIdentity} from './python-source-policy.mjs';

const need=(v,m)=>{if(!v)throw Error('Python: '+m);};
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const STAGES=['input_mapping','python_columns','python_code'];

// Wizard pages: [input mapping] → columns (generation flag, declared grid) →
// code (CodeMirror, separate process forced on Linux) → done. Loginom runs the
// code only on Execute; this procedure never computes values.
export async function configurePython(channel,p,{request}){
 const one=(s,tid,verb)=>{const es=s.ui.elements.filter(e=>e.tid===tid&&e.allowed_actions.includes(verb));need(es.length===1,'unique control required: '+tid.split(';').slice(-3).join(';'));return es[0];};
 const next=(stage,destination)=>channel.perform({condition:'accept python '+stage,ready:s=>s.wizard?.stage===stage,identity:s=>s.prepared_node_context,
  resolve:s=>({verb:'wizard_step',ref:one(s,s.wizard.root_tid+';btnNext','wizard_step').ref,expected_stage:destination})});
 const ready=stage=>s=>s.wizard?.stage===stage&&s.node_python?.verified===true;
 const observe=(stage,condition)=>channel.observe({condition,readPython:true,ready:ready(stage)});
 let state=await channel.observe({condition:'python wizard page',ready:s=>STAGES.includes(s.wizard?.stage)});
 if(state.wizard.stage==='input_mapping'){await next('input_mapping','python_columns');}
 state=await observe('python_columns','python output columns');
 const columnsBefore=state.node_python;
 if(request.finish==='close')return {verified:true,cleanup_complete:true,effect_possible:false,configuration:{...columnsBefore,node_context:state.prepared_node_context},draft_edits_skipped:true};
 let edits=0;
 const wantedGeneration=p.schema_mode===undefined?columnsBefore.generation:p.schema_mode==='code';
 if(columnsBefore.generation!==wantedGeneration){
  need(columnsBefore.generation_disabled!==true,'output column generation flag is disabled');
  const tid=state.wizard.root_tid+';PythonColumnsWizard;BooleanPropEdit;ValueControl;InputEl';
  await channel.perform({condition:'set python column generation',initialObservation:state,ready:ready('python_columns'),identity:s=>s.prepared_node_context,
   resolve:s=>({verb:'set_checked',ref:one(s,tid,'set_checked').ref,checked:wantedGeneration})});
  state=await observe('python_columns','python generation readback');edits++;
  need(state.node_python.generation===wantedGeneration,'generation flag readback differs');
 }
 const columns=state.node_python.columns;
 if(p.columns){
  const wanted=p.columns.map(c=>({name:c.name,type:c.type}));
  need(same(columns.map(c=>({name:c.name,type:c.type})),wanted),
   'declared output columns must be edited in the Python wizard first; observed '+JSON.stringify(columns.map(c=>c.name+':'+c.type))+', requested '+JSON.stringify(wanted.map(c=>c.name+':'+c.type))+'. Declared column editing is not available in this build; refuse instead of writing values into differently typed fields');
 }
 const schemaMode=state.node_python.generation?'code':'declared';
 await next('python_columns','python_code');
 state=await observe('python_code','python code page');
 const before=pythonObservedIdentity(state.node_python.source);
 if(p.expected_source_sha256!==undefined)need(before.source_sha256===p.expected_source_sha256,'saved code changed: readback source_sha256 '+before.source_sha256+' differs from expected_source_sha256');
 let identity=before;
 if(p.source_text!==undefined&&p.source_text!==state.node_python.source){
  need(state.node_python.writable===true,'code editor is read-only');
  const target=pythonSourceIdentity(p.source_text);
  const editor=state.wizard.root_tid+';PythonCodeWizard;cmpCodeCM';
  await channel.perform({condition:'replace python code',initialObservation:state,ready:ready('python_code'),identity:s=>s.prepared_node_context,
   resolve:s=>({verb:'replace_expression',ref:one(s,editor,'replace_expression').ref,text:p.source_text})});
  state=await observe('python_code','python code readback');edits++;
  identity=pythonObservedIdentity(state.node_python.source);
  need(state.node_python.source===p.source_text&&same(identity,target),'saved code differs from source_text after replacement');
 }
 need(state.node_python.separate_process!==false,'separate process must stay enabled');
 const configuration={verified:true,schema_mode:schemaMode,...(schemaMode==='declared'?{columns}:{}),...identity,
  separate_process:state.node_python.separate_process,previous_source_sha256:before.source_sha256,node_context:state.prepared_node_context};
 await next('python_code','done');
 const done=await channel.observe({condition:'python settings accepted',ready:s=>s.wizard?.stage==='done'});
 return {verified:true,cleanup_complete:true,effect_possible:edits>0,configuration,settings_applied:false,validation:{status:'accepted_by_loginom_next',node_context:done.prepared_node_context}};
}
