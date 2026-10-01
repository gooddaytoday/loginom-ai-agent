import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyJavascriptNewDoneGraph} from './javascript-public-new-done.mjs';
import {runJavascriptOperator} from './javascript-live.mjs';

const input={node:{document_id:'doc',workflow_id:'flow',node_id:'source'}};
const node={document_id:'doc',workflow_id:'flow',node_id:'new-js'};
const before={complete:true,document_id:'doc',workflow_ref:{workflow_id:'flow'},foreign_links:[],links:[],
  nodes:[{ref:input.node,type:'imports.text',locked:false,dom_epoch:'before',inputs:[],outputs:[0],position:{x:20,y:20}}]};
const after={...structuredClone(before),nodes:[{...before.nodes[0],dom_epoch:'after'},
  {ref:node,type:'programming.javascript',locked:false,inputs:[0],outputs:[0],position:{x:256,y:256}}],
  links:[{source:'source',target:'new-js',input:0,output:0}]};

test('new Done graph requires exactly its own added node/link and preserves the full prior graph',()=>{
  assert.equal(verifyJavascriptNewDoneGraph(before,after,node,input).verified,true);
  for(const mutate of [g=>g.complete=false,g=>g.document_id='foreign',g=>g.workflow_ref.workflow_id='foreign',
    g=>g.foreign_links.push({source:'foreign'}),g=>g.nodes.push(structuredClone(g.nodes[1])),
    g=>g.nodes[0].ref.node_id='foreign',g=>g.nodes[0].locked=true,g=>g.nodes[0].position.x++,
    g=>g.nodes[0].outputs.push(1),g=>g.nodes[1].type='transforms.calculator',
    g=>g.nodes[1].ref.node_id='foreign',g=>g.links[0].source='foreign',g=>g.links[0].target='foreign',
    g=>g.links[0].input=1,g=>g.links[0].output=1,g=>g.links.push(structuredClone(g.links[0]))]){
    const changed=structuredClone(after);mutate(changed);
    assert.throws(()=>verifyJavascriptNewDoneGraph(before,changed,node,input),/Public new Done/);
  }
  const prior={...structuredClone(before),links:[{source:'prior',target:'source',input:0,output:0}]};
  const final={...structuredClone(after),links:structuredClone([...prior.links,...after.links])};
  assert.equal(verifyJavascriptNewDoneGraph(prior,final,node,input).verified,true);
  final.links[0].source='changed';
  assert.throws(()=>verifyJavascriptNewDoneGraph(prior,final,node,input),/prior graph/);
});

const paths=['--config','/not-read/private.json','--profile','/not-created/profile',
  '--browser','/not-opened/chrome','--evidence','/not-created/evidence'];
for(const mode of ['code','declared'])test('new Done rejects mixed modes, source, Save and hidden browser flags before private config '+mode,async()=>{
  const args=[...paths,'--execution-case',mode+'-table-execute','--verify-public-'+mode+'-lifecycle'];
  for(const patch of [{publicNewDoneMode:'unknown'},{coldReader:true},{packageFile:true},{batchCases:[]},
    {nativeInputOnly:true},{nativeRoundtrip:true},{sourceReadCycle:true},{persistenceMode:mode},{existingLifecycle:mode},
    {existingInputVariant:'changed'},{publicProbeId:'g5-null-empty'},{publicSourceCaseId:'fidelity-bound-code'},
    {publicSchemaRefusalCaseId:'code-to-declared'},{publicWizardRefusalCaseId:'syntax-'+mode},
    {publicStopCaseId:'stop-code'},{publicCancelResumeCaseId:'cancel-resume-code'},
    {publicLostReplyCaseId:'lost-apply-execute-code'},{publicRequiredCaseId:'required-'+mode},
    {publicContextCaseId:'context-'+mode},{uiProfileMode:mode},{publicPolicyMode:mode},
    {publicFidelitySave:true},{publicConfigurationCaseId:'configuration-'+mode}])
    await assert.rejects(()=>runJavascriptOperator(args,{publicNewDoneMode:mode,...patch}),/Public new Done/);
  for(const extra of [['--source','payload'],['--headless'],['--x11-no-focus'],['--package','/jsteach/old.lgp'],
    ['--verify-public-'+mode+'-save']])
    await assert.rejects(()=>runJavascriptOperator([...args,...extra],{publicNewDoneMode:mode}));
  await assert.rejects(()=>runJavascriptOperator(args,{publicNewDoneMode:mode==='code'?'declared':'code'}),/fixed public lifecycle/);
});
