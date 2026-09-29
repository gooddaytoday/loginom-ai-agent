import test from 'node:test';
import assert from 'node:assert/strict';
import {createNodeProcedure} from '../lib/node-procedure.mjs';

const port='58f7e6c3-511e-39d7-8853-036e0a1a7612';
function fixture(mode='ready',{bound=true}={}) {
  let clock=0,gestures=0;const records=[];
  const workflow_ref={workflow_id:'wf',prefix:'MF;TF-1',tab_tid:'MF;cntMain;cntWorkspace;Workspace;t.br;tb-1',navigation_path:[{tid:'flow',label:'Scenario'}]};
  const binding={document_id:'doc',workflow_ref,node:{document_id:'doc',workflow_id:'wf',node_id:'node'}};
  const operation={id:'table-add',deadline:90000,action:{action_key:'node.apply',revision:'1'}};
  const controller=new AbortController();
  const state=()=>({authenticated:true,origin:'http://example.test',loginom_build:'7.4.2',workflow_ref,dom_epoch:{document:'dom',revision:clock},
    prepared_node_context:{verified:true,document_id:'doc',workflow_id:'wf',node_id:mode==='foreign_node'&&clock>=10000?'foreign':'node',surface:'views',tid:'MF;TF-1;ViewsForm'},
    scan:{complete:true},wizard:{status:'absent'},ui:{elements:[{ref:'ui-safe',allowed_actions:['click']}],
      masks:clock<60000||mode==='permanent'?[{kind:'busy',ref:'views',target_tid:mode==='foreign_mask'&&clock>=10000?'foreign':'MF;TF-1;ViewsForm'}]:[],
      dialogs:mode==='foreign_dialog'&&clock>=10000?[{ref:'foreign',title:'Other'}]:[],truncated:{dialogs:false,masks:false}}});
  const channel=createNodeProcedure({operation,...(bound?{preparedNodeContext:binding}:{}),targetOrigin:'http://example.test',targetBuild:'7.4.2',
    signal:controller.signal,now:()=>clock,monotonicNow:()=>clock,wait:async ms=>{clock+=ms;if(mode==='cancel'&&clock>=10000)controller.abort();},
    record:async e=>{records.push(e);return structuredClone(e);},execute:async code=>{
      assert.equal(typeof code,'string');
      if(code.includes('async function readOutputContext'))return {verified:true,surface:'views',
        port_panels:[{port_guid:mode==='foreign_port'&&clock>=10000?'foreign':port,tid:'MF;TF-1;ViewsForm;cntPorts;'+port}],
        tables:clock>=60000?[{view_guid:'new',port_guid:port}]:[]};
      if(code.includes('"mode":"act"')){gestures++;throw Error('Settlement must be read-only');}
      return {status:'SUCCEEDED',output:state()};
    }});
  return {channel,operation,records,get clock(){return clock;},get gestures(){return gestures;},run:()=>channel.observe({
    condition:'new Table card bound to output',readOutputs:true,settleOutputPort:port,
    ready:s=>s.node_outputs.tables.length===1,confirmIdentity:s=>({tables:s.node_outputs.tables})})};
}

test('owned output settlement waits past ordinary readiness within the unchanged parent deadline',async()=>{
  const f=fixture();const observed=await f.run();assert.equal(observed.node_outputs.tables[0].view_guid,'new');
  assert.ok(f.clock>=60000&&f.clock<90000);assert.equal(f.operation.deadline,90000);assert.equal(f.gestures,0);
  assert.equal(f.records.at(-1).readiness.timeout_ms,90000);
  assert.equal(f.records.at(-1).readiness.settle_output_port,port);
});
for(const mode of ['foreign_node','foreign_port','foreign_mask','foreign_dialog','cancel'])test('output settlement stops on '+mode,async()=>{
  const f=fixture(mode);await assert.rejects(f.run());assert.equal(f.clock,10000);assert.equal(f.gestures,0);
  await assert.rejects(f.channel.act({verb:'click',ref:'ui-safe'}),/observation|aborted/i);
});
test('permanent output loading expires at the original parent deadline and leaves no usable snapshot',async()=>{
  const f=fixture('permanent');await assert.rejects(f.run(),/readiness timeout/);assert.equal(f.clock,90000);
  assert.equal(f.operation.deadline,90000);assert.equal(f.gestures,0);
  await assert.rejects(f.channel.act({verb:'click',ref:'ui-safe'}),/budget|deadline|observation/i);
});
test('output settlement cannot extend unrelated, unbound or caller supplied invalid reads',async()=>{
  const f=fixture();
  for(const options of [{readOutputs:false},{settleOutputPort:'invalid'},{tableDialog:{kind:'format',table:{}}}])
    await assert.rejects(f.channel.observe({condition:'wrong output',ready:()=>true,readOutputs:true,settleOutputPort:port,...options}),/prepared native port/);
  await assert.rejects(fixture('ready',{bound:false}).run(),/prepared native port/);
  assert.equal(f.clock,0);assert.equal(f.gestures,0);
});
