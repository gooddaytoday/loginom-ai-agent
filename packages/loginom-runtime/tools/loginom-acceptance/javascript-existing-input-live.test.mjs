import test from 'node:test';
import assert from 'node:assert/strict';
import {javascriptExistingInputRequest,runJavascriptExistingInputLive} from './javascript-existing-input-live.mjs';
import {validateNodeApplyRequest} from '../../client/lib/node-apply.mjs';
import {createCandidateNodeSupport} from '../../client/lib/node-support.mjs';
import {validateTextImportNodeParameters} from '../../client/lib/text-import-node.mjs';
import {validateActionParameters} from '../../client/lib/action-catalog.mjs';
import {nodeApplyInputSchema} from '../../client/lib/node-api.mjs';
import {runJavascriptOperator} from './javascript-live.mjs';

const prepared={document_id:'doc',workflow_ref:{workflow_id:'flow',tab_tid:'tab',prefix:'MF;TF-1',
  navigation_path:[{tid:'MF;TF-1;cnrNaviMode;b.s_Сценарий',label:'Сценарий'}]}};
const node={document_id:'doc',workflow_id:'flow',node_id:'input'};
const storage='/jsteach/js-g2-9150c962-ad60-4cd4-a13e-bcba89b982d8';
const artifact={artifact_id:'artifact',bytes:157,sha256:'a'.repeat(64)};
const input={prepared,node,storage,artifact,uploadOperationId:'uploaded',totalMs:1200000};

for(const variant of ['changed','reordered'])test('existing input request passes actual full API and import validators: '+variant,()=>{
  const request=javascriptExistingInputRequest({...input,inputVariant:variant});
  validateActionParameters(nodeApplyInputSchema,request);
  validateTextImportNodeParameters(request.parameters,request.mode,request);
  const support=createCandidateNodeSupport({targetOrigin:'http://logi-test-plan.bg.local',targetBuild:'7.4.2'});
  validateNodeApplyRequest(request,support.nodeApplyHandlers);
  assert.deepEqual(request.target,{kind:'existing',type:'imports.text',ref:node});
  assert.equal(request.parameters.settings.source.source_path,storage+'/sales-'+variant+'.csv');
  assert.equal(request.parameters.source.upload_operation_id,'uploaded');
  assert.equal(request.read.coverage,'sample');assert.equal(request.read.sample_rows,100);
  assert.equal(request.read.require_exact_numbers,true);assert.equal(request.finish,'execute');
  if(variant==='reordered')assert.deepEqual(request.mappings[0].fields.map(f=>f.source.name),['DiscountPct','Customer','UnitPriceCents','RowID','Qty']);
  if(variant==='changed')assert.deepEqual(request.mappings,[]);
});

test('existing input refuses foreign node, unassigned fixture and shared folder before mutation',()=>{
  for(const extra of [{node:{...node,document_id:'foreign'}},{node:{...node,workflow_id:'foreign'}},
    {inputVariant:'base'},{inputVariant:'unknown'},{storage:'/jsteach/shared'}])
    assert.throws(()=>javascriptExistingInputRequest({...input,inputVariant:'changed',...extra}));
});

test('existing input graph/lineage/budget refusals happen before any page access',async()=>{
  const graph={complete:true,document_id:'doc',nodes:[{type:'imports.text',ref:node},
    {type:'programming.javascript',ref:{...node,node_id:'js'}}],links:[{source:'input',target:'js',input:0,output:0}],foreign_links:[]};
  for(const extra of [{inputVariant:'unknown'},{deadline:Date.now()+100},
    {graph:{...graph,complete:false}},{graph:{...graph,links:[{source:'foreign',target:'js',input:0,output:0}]}},
    {graph:{...graph,foreign_links:[{}]}}])
    await assert.rejects(()=>runJavascriptExistingInputLive({prepared,graph,inputVariant:'changed',deadline:Date.now()+1800000,...extra}));
});

test('freshness entrypoint flags cannot enable writes in the private cold reader',async()=>{
  for(const options of [{coldReader:true,existingInputVariant:'changed'},
    {coldReader:true,existingLifecycle:'code',existingInputVariant:'base'},
    {coldReader:true,existingLifecycle:'declared',existingInputVariant:'unknown'}])
    await assert.rejects(()=>runJavascriptOperator(['--config','/not-read/private.json'],options),/Existing input freshness requires/);
});
