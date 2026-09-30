// Operator-only E scenario. Business source/oracle stay outside the runtime.
import {randomUUID} from 'node:crypto';
import {AjvJsonSchemaValidator} from '../../client/node_modules/@modelcontextprotocol/sdk/dist/esm/validation/ajv-provider.js';
import {createActionRuntime} from '../../client/lib/executor.mjs';
import {createCandidateNodeSupport} from '../../client/lib/node-support.mjs';
import {createJavascriptCodeNodeSupport} from '../../client/lib/javascript-code-node.mjs';
import {javascriptSourceIdentity} from '../../client/lib/javascript-source-read.mjs';
import {dispatchNodeApi} from '../../client/lib/node-api.mjs';
import {nodeApplyResultSchema} from '../../client/lib/node-result-schema.mjs';
import {nodeResultReply} from '../../client/lib/node-result-reply.mjs';
import {javascriptPublicCodePins} from './javascript-public-code-live.mjs';
import {javascriptDiscoveryProbe,javascriptDiscoveryOracle} from './javascript-discovery-probes.mjs';

const need=(condition,message)=>{if(!condition)throw Error(message);};

export async function runJavascriptPublicExistingLive({page,prepared,node,targetOrigin,redactor,record,
  report,save,deadline,onPending,schemaMode,graph}) {
  need(['code','declared'].includes(schemaMode)&&Date.now()+660000<deadline,
    'Public existing JavaScript mode/original budget unavailable');
  const probe=javascriptDiscoveryProbe('p1-business-'+schemaMode+'-base');
  const base=createCandidateNodeSupport({targetOrigin,targetBuild:'7.4.2'});
  const support=createJavascriptCodeNodeSupport({targetOrigin,targetBuild:'7.4.2',redactor});
  const runtime=createActionRuntime({pinned:await javascriptPublicCodePins(),allowCandidate:true,
    targetOrigin,targetBuild:'7.4.2',redactor,onRecord:record,
    execute:source=>Function('return ('+source+')')()(page),
    nodeApplyHandlers:new Map([...base.nodeApplyHandlers,...support.nodeApplyHandlers]),
    nodeApplyDriverFactory:options=>options.operation.parameters.target.type==='programming.javascript'
      ?support.nodeApplyDriverFactory(options):base.nodeApplyDriverFactory(options)});
  Object.assign(report,{scope:'isolated E existing source edit/Execute/full typed UI; current schema preserved',
    stage:'public-existing-source-before',original_deadline:deadline,explicit_execution_limit:2,
    candidate_verified:false,cli_verified:false,native_bytes_verified:false,gates_closed:[],
    public_existing:{status:'RUNNING',schema_mode:schemaMode,node,raw_source_in_report:false}});
  onPending(true);await save();
  const readSource=()=>dispatchNodeApi(runtime,'dock_node_read',{kind:'source',operation_id:'js-existing-source-'+randomUUID(),
    document_id:prepared.document_id,workflow_ref:prepared.workflow_ref,node,
    budget_ms:Math.max(1,Math.min(180000,deadline-Date.now()-30000))});
  const before=await readSource();
  need(before.source_text===probe.source&&before.source_sha256===probe.source_sha256
    &&before.cursor===null&&!runtime.hasUnsettledWork(),'Public existing initial source differs from assigned package');
  const source_text=before.source_text+'\n// E: existing node source revision; business logic preserved.\n';
  const expected=javascriptSourceIdentity(source_text),operation_id='js-public-existing-'+randomUUID();
  const remaining=deadline-Date.now()-60000;
  need(remaining>=600000,'Public existing original time budget unavailable');
  const request={operation_id,contract_revision:'1.0.0',document_id:prepared.document_id,
    workflow_ref:prepared.workflow_ref,target:{kind:'existing',type:'programming.javascript',ref:node},
    inputs:[],mode:'script',parameters:{source_text,expected_source_sha256:before.source_sha256,schema_mode:schemaMode},
    mappings:[],finish:'execute',read:{ports:[0],sample_rows:100,require_exact_numbers:true,coverage:'full'},
    budgets:{configure_ms:remaining,execute_ms:300000,total_ms:remaining}};
  Object.assign(report.public_existing,{operation_id,previous_source_sha256:before.source_sha256,
    source_sha256:expected.source_sha256,oracle_sha256:probe.oracle_sha256,graph_before:graph});
  report.stage='public-existing-apply';await save();
  await record({phase:'javascript_existing_workflow_blockers_observed',operation_id,
    blockers:await page.evaluate(()=>[...document.querySelectorAll('[role="dialog"],.bg-mask-message,.x-mask-msg')]
      .filter(e=>e.getBoundingClientRect().width>0&&e.getBoundingClientRect().height>0&&getComputedStyle(e).visibility!=='hidden')
      .map(e=>({tid:e.getAttribute('data-tid'),role:e.getAttribute('role'),classes:e.className,
        connected:e.isConnected,check_visibility:e.checkVisibility({checkOpacity:true,checkVisibilityCSS:true}),
        text:e.innerText?.slice(0,300),ancestors:Array.from((function*(node){while(node){yield node;node=node.parentElement;}})(e))
          .slice(0,12).map(node=>({tid:node.getAttribute('data-tid'),classes:node.className,
            display:getComputedStyle(node).display,visibility:getComputedStyle(node).visibility,
            opacity:getComputedStyle(node).opacity}))})))});
  let job=await dispatchNodeApi(runtime,'dock_node_apply',request);
  while(job.state==='running'){
    job=await dispatchNodeApi(runtime,'dock_node_wait',{operation_id,timeout_ms:30000});
    report.public_existing.progress=job.progress;await save();
  }
  report.public_existing.job=job;await save();
  if(job.state==='settled'&&job.outcome?.status==='NOT_APPLIED'&&job.outcome.effect_possible===false
    &&job.outcome.cleanup_complete===true&&!runtime.hasUnsettledWork())onPending(false);
  const result=job.outcome?.output,table=result?.output?.ports?.[0];
  need(job.outcome?.status==='SUCCEEDED'&&result.status==='SUCCEEDED'&&result.cleanup_complete===true
    &&JSON.stringify(result.node)===JSON.stringify(node)&&result.configuration?.readback?.schema_mode===schemaMode
    &&result.configuration.readback.source.sha256===expected.source_sha256
    &&result.execution.status==='completed'&&result.output.status==='complete'
    &&table?.fresh===true&&table.execution_id===result.execution.execution_id&&!runtime.hasUnsettledWork(),
  'Public existing execution/result boundary unconfirmed');
  onPending(false);await save();
  need(new AjvJsonSchemaValidator().getValidator(nodeApplyResultSchema)(result).valid,
    'Public existing result violates diagnostic schema');
  const oracle=javascriptDiscoveryOracle(probe,table);
  need(oracle.gate_passed===true,'Public existing full business oracle differs');
  const compact=nodeResultReply(job,{userProfile:true}).structuredContent;
  const delivered=compact?.output?.ports?.[0];
  need(delivered?.fresh===true&&delivered.execution_id===table.execution_id
    &&delivered.row_count===table.row_count&&delivered.sample_rows===table.sample_rows&&delivered.sample_complete===true
    &&delivered.schema.length===table.schema.length&&delivered.schema.every((column,index)=>
      ['index','name','label','type','data_kind'].every(key=>column[key]===table.schema[index][key]))
    &&delivered.sample.length===table.sample.length&&delivered.sample.every((row,index)=>row.length===table.sample[index].length
      &&row.every((cell,column)=>['type','value','is_null','precision'].every(key=>cell[key]===table.sample[index][column][key])))
    &&JSON.stringify(compact.configuration)===JSON.stringify(result.configuration),
  'Public existing user-v1 full output/configuration differs');
  report.stage='public-existing-source-after';onPending(true);await save();
  const after=await readSource();
  need(after.source_text===source_text&&after.source_sha256===expected.source_sha256
    &&after.cursor===null&&!runtime.hasUnsettledWork(),'Public existing independent final source differs');
  Object.assign(report.public_existing,{status:'OBSERVED',configuration:result.configuration,execution:result.execution,
    output:result.output,oracle,independent_source:{complete:true,...expected}});
  report.stage='public-existing-observed';onPending(false);await save();
}
