// Direct Codex live diagnosis. Results are not autonomous Hermes acceptance.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {Client} from '../../client/node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js';
import {StdioClientTransport,getDefaultEnvironment} from '../../client/node_modules/@modelcontextprotocol/sdk/dist/esm/client/stdio.js';
import {loadConfig} from '../../client/lib/config.mjs';
import {produceHostInputTicket} from '../../client/lib/host-inputs.mjs';
import {createRedactor} from '../../client/lib/redact.mjs';
process.umask(0o077);
const [configPath,out,extraProbe]=process.argv.slice(2);
if(!path.isAbsolute(configPath??'')||!path.isAbsolute(out??''))throw Error('Absolute isolated config/output required');
await fs.mkdir(out,{mode:0o700});await fs.mkdir(path.join(out,'runtime'));
await fs.symlink(path.join(process.env.HOME,'.loginom-dock/runtime/browsers'),path.join(out,'runtime/browsers'));
const config=await loadConfig({configPath,stateDir:out,agent:'hermes',adapterRevision:'mimo-contract-probe'});
assert.equal(config.replayLoginUser,'mimo');
const redactor=createRedactor([config.apiKey]);
const ticket=await produceHostInputTicket(config,{session_id:'operator-contract',turn_id:'probe',paths:['/Users/kartamyshev/Git/analitic/task02-group-analysis/data/dataset.csv']});
const client=new Client({name:'mimo-contract-probe',version:'1'});
const transport=new StdioClientTransport({command:process.execPath,args:[path.resolve('client/bin/loginom-dock.mjs'),'--config',configPath,'--state-dir',out,'--agent','hermes','--adapter-revision','mimo-contract-probe'],env:getDefaultEnvironment(),stderr:'pipe'});
transport.stderr.on('data',()=>{});
let seq=0;
async function call(name,args){
 const id=++seq;const result=await client.callTool({name,arguments:args},undefined,{timeout:180000});
 await fs.writeFile(path.join(out,id+'.json'),JSON.stringify(redactor.redact({name,args,result}),null,2));
 const value=result.structuredContent??JSON.parse(result.content.find(x=>x.type==='text').text);
 console.log(JSON.stringify({id,name,status:value.status??value.state??value.prepared,isError:result.isError??false}));
 assert.notEqual(result.isError,true);return value;
}
async function settle(value,delivery=false){
 while(value.state==='running'){
  if(delivery)await new Promise(r=>setTimeout(r,1000));
  value=await call(delivery?'dock_artifact_delivery_status':'dock_node_wait',delivery?{operation_id:value.operation_id}:{operation_id:value.operation_id,timeout_ms:60000});
 }
 return value;
}
try{
 await client.connect(transport);
 const prepared=await call('dock_prepare',{host_context_token:ticket.token});assert.equal(prepared.prepared,true);
 const artifact=prepared.input_artifacts[0];assert.ok(artifact);
 const delivered=await settle(await call('dock_artifact_deliver',{operation_id:'probe-deliver',artifact_id:artifact.artifact_id,upload_grant_id:artifact.upload.grant_id,budget_ms:120000}),true);
 assert.equal(delivered.status,'SUCCEEDED');
 const fields=[['transaction_id','integer'],['category','string'],['region','string'],['quantity','integer'],['unit_price','real'],['date','string'],['total','real']];
 const request={operation_id:'probe-invalid',contract_revision:'1.0.0',document_id:prepared.workspace.document_id,workflow_ref:{workflow_id:prepared.workspace.workflow_ref.workflow_id},
  target:{kind:'new',type:'imports.text',label:'Диагностика импорта'},inputs:[],mode:'delimited',finish:'execute',
  parameters:{source:{artifact_id:artifact.artifact_id,upload_operation_id:delivered.output.upload_operation_id},settings:{
   source:{source_path:delivered.output.destination,encoding:'UTF-8',rows_to_skip:0,first_line_as_title:true},
   format:{delimiter:',',decimal_separator:'.',null_marker:'',text_qualifier:'"'},columns:[]}}};
 const refused=await call('dock_node_apply',request);assert.equal(refused.status,'NOT_APPLIED');assert.equal(refused.effect_possible,false);
 assert.equal(refused.next_step.tool,'dock_action_describe');
 request.operation_id='probe-import';request.parameters.settings.columns=fields.map(([name,type])=>({source_name:name,name,label:name,type,data_kind:type==='real'?'Непрерывный':'Дискретный',used:true}));
 if(extraProbe==='defaults')request.parameters.settings={columns:fields.map(([name,type])=>({name,type}))};
 const imported=await settle(await call('dock_node_apply',request));
 if(imported.status!=='SUCCEEDED'){
  await call('dock_operation_inspect',{operation_id:request.operation_id});
  await new Promise(r=>setTimeout(r,15000));
  await call('dock_operation_inspect',{operation_id:request.operation_id});
  await call('dock_workspace_observe',{scope:'all'});
 }
 assert.equal(imported.status,'SUCCEEDED',JSON.stringify(imported.error));
 assert.equal(imported.output.ports[0].row_count,500);
 const replay=await settle(await call('dock_node_apply',request));assert.deepEqual(replay.node,imported.node);
 if(['export-pair','export-triple','export-defaults'].includes(extraProbe)){
  const raw=JSON.parse(await fs.readFile(configPath,'utf8')),directory=raw.workflow_profile.storage_directories.exports;
  for(let index=0;index<(extraProbe==='export-triple'?3:extraProbe==='export-defaults'?1:2);index++){
   const exp={operation_id:'export-'+index,contract_revision:'1.0.0',document_id:request.document_id,workflow_ref:request.workflow_ref,
    target:{kind:'new',type:'exports.text',label:'Диагностика экспорта '+index},inputs:[{source:imported.node,output:0,input:0}],mode:'delimited',finish:'execute',
    parameters:{destination:directory+'/'+path.basename(out)+'-'+index+'.csv',overwrite:'reject',encoding:'UTF-8',delimiter:',',header:'names',bom:false,line_ending:'LF',decimal_separator:'.',null_marker:'',text_qualifier:'"'}};
   if(extraProbe==='export-defaults')exp.parameters={destination:exp.parameters.destination};
   const result=await settle(await call('dock_node_apply',exp));
   if(result.status!=='SUCCEEDED'){
    await call('dock_operation_inspect',{operation_id:exp.operation_id});
    await call('dock_workspace_observe',{scope:'roots'});
    await call('dock_workspace_observe',{scope:'all'});
   }
   assert.equal(result.status,'SUCCEEDED',JSON.stringify(result.error));
   assert.equal(result.output.file_artifacts.length,1);
  }
 }
 if(extraProbe==='duplicate-label'){
  for(let index=0;index<2;index++){
   const group={operation_id:'same-label-'+index,contract_revision:'1.0.0',document_id:request.document_id,workflow_ref:request.workflow_ref,
    target:{kind:'new',type:'transform.group_data',label:'Отклонения по категориям и кварталам'},inputs:[{source:imported.node,output:0,input:0}],mode:'aggregate',finish:'execute',
    parameters:{group_by:[{kind:'input_field',name:'category'}],measures:[{field:{kind:'input_field',name:'total'},function:'sum',name:'Revenue',label:'Revenue'}]}};
   const result=await settle(await call('dock_node_apply',group));
   if(result.status!=='SUCCEEDED')await call('dock_workspace_observe',{scope:'all'});
   assert.equal(result.status,'SUCCEEDED',JSON.stringify(result.error));
   assert.equal(result.output.ports[0].row_count,5);
   const retained=await call('dock_node_resume',{operation_id:group.operation_id});
   assert.equal(retained.status,'SUCCEEDED');assert.deepEqual(retained.node,result.node);assert.equal(retained.attempt,1);
  }
 }
 if(['calculator','output-changes','calculator-contract'].includes(extraProbe)){
  const calculator={operation_id:'calc-incomplete',contract_revision:'1.0.0',document_id:request.document_id,workflow_ref:request.workflow_ref,
   target:{kind:'new',type:'transform.calculator',label:'Проверка выходных полей'},inputs:[{source:imported.node,output:0,input:0}],mode:'expression',finish:'execute',
   parameters:{expressions:[{target:{kind:'new'},name:'calculated_total',label:'Расчётная сумма',type:'real',formula:'quantity * unit_price',replace:false}]},
   mappings:[{direction:'output',port:0,fields:[{source:{kind:'configured_field',name:'calculated_total'}}]}]};
  if(extraProbe==='calculator-contract'){
   const missing=structuredClone(calculator);delete missing.mappings;missing.inputs=[];missing.operation_id='calc-no-input';
   const refusal=await call('dock_node_apply',missing);assert.equal(refusal.status,'NOT_APPLIED');assert.equal(refusal.effect_possible,false);assert.equal(refusal.error.parameter_path,'inputs');
   missing.inputs=calculator.inputs;missing.operation_id='calc-wrong-order';missing.parameters.order=['calculated_total',...fields.map(([name])=>name)];
   const order=await call('dock_node_apply',missing);assert.equal(order.status,'NOT_APPLIED');assert.equal(order.effect_possible,false);assert.equal(order.error.parameter_path,'parameters.order');
  }
  const rejected=await settle(await call('dock_node_apply',calculator));
  assert.equal(rejected.status,'NOT_APPLIED');assert.equal(rejected.effect_possible,false);assert.equal(rejected.cleanup_complete,true);
  calculator.operation_id='calc-corrected';delete calculator.mappings;
  if(extraProbe==='output-changes'){
   calculator.parameters.expressions.push({target:{kind:'new'},name:'temporary_copy',label:'temporary_copy',type:'real',formula:'total',replace:false});
   calculator.mappings=[{direction:'output',port:0,changes:[
    {source:{kind:'configured_field',name:'calculated_total'},name:'VerifiedTotal',label:'Проверенная сумма'},
    {source:{kind:'configured_field',name:'transaction_id'},excluded:true}]}];
  }
  const calculated=await settle(await call('dock_node_apply',calculator));
  assert.equal(calculated.status,'SUCCEEDED',JSON.stringify(calculated.error));assert.equal(calculated.output.ports[0].row_count,500);
  if(extraProbe==='output-changes')assert.deepEqual(calculated.output.ports[0].schema.map(f=>f.name),['VerifiedTotal','temporary_copy',...fields.slice(1).map(([name])=>name)]);
  const repeated=await settle(await call('dock_node_apply',calculator));assert.deepEqual(repeated.node,calculated.node);
  await fs.writeFile(path.join(out,'calculator-summary.json'),JSON.stringify({status:'PASS',manual:true,node:calculated.node,rows:500,checks:['incomplete output rejected before mutation','corrected with new ID','default full output','same operation replay']}));
 }
 await fs.writeFile(path.join(out,'summary.json'),JSON.stringify({status:'PASS',manual:true,autonomous_acceptance:false,node:imported.node,rows:500,checks:['pre-effect repair','automatic placement','technical defaults','same-request replay']}));
}finally{await client.close();}
