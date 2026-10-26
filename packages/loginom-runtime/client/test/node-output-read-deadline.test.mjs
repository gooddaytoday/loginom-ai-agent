import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {createNodeProcedure} from '../lib/node-procedure.mjs';
import {makeWorkspaceUiCode,workspaceUiCapability} from '../lib/workspace-ui.mjs';
import {readPreparedNodeContext} from '../lib/node-context.mjs';
const port='58f7e6c3-511e-39d7-8853-036e0a1a7612';
const workflow_ref={workflow_id:'wf',prefix:'MF;TF-1',tab_tid:'MF;cntMain;cntWorkspace;Workspace;t.br;tb-1',navigation_path:[{tid:'flow',label:'Scenario'}]};
const binding={document_id:'doc',workflow_ref,node:{document_id:'doc',workflow_id:'wf',node_id:'node'}};
function replay({delay='owner',fault}={}) {
  let clock=1000,delayed=false,ownerReads=0,monotonicReads=0;const records=[],budgets=[];
  const operation={id:'table-read',deadline:601000,action:{action_key:'node.apply',revision:'1'}};
  const context=()=>({verified:true,...binding.node,surface:'views',tid:'MF;TF-1;ViewsForm'});
  const outputs=()=>({verified:true,surface:'views',port_panels:[{port_guid:fault==='foreign_port'?'foreign':port}],tables:clock>=28000?[{view_guid:'new',port_guid:port}]:[]});
  const slow=stage=>{if(!delayed&&delay===stage){delayed=true;clock+=fault==='allowance'?35001:26950;}};
  const readOwner=async()=>{ownerReads++;slow('owner');
    if(fault==='port_owner_expiry'&&ownerReads===3)clock=operation.deadline+1;
    return {...context(),...(fault==='foreign_owner'||fault==='changed_owner'&&ownerReads>1?{node_id:'other'}:{})};};
  const page={evaluate:async(_fn,args)=>{if(args?.binding)return outputs();slow('DOM');return {authenticated:true,origin:'http://example.test',loginom_build:'7.4.2',workflow_ref,
    dom_epoch:{document:'dom',revision:1},wizard:{status:'absent'},scan:{complete:true},
    ui:{elements:[{tid:'MF;TF-1;ViewsForm',ref:'ui-views',allowed_actions:[]}],dialogs:fault==='dialog'?[{ref:'foreign'}]:[],
      masks:clock<28000||fault==='foreign_mask'?[{kind:'busy',target_tid:fault==='foreign_mask'?'foreign':'MF;TF-1;ViewsForm'}]:[],truncated:{dialogs:false,masks:false}}};}};
  const sandbox=vm.createContext({Date:{now:()=>clock},readOwner});
  const channel=createNodeProcedure({operation,preparedNodeContext:binding,targetOrigin:'http://example.test',targetBuild:'7.4.2',
    now:()=>clock,monotonicNow:()=>{monotonicReads++;return clock;},wait:async ms=>{clock+=ms;},
    record:async e=>{records.push(e);return structuredClone(e);},execute:async(code,options)=>{
      budgets.push(options.timeout);assert.ok(!code.includes('"mode":"act"'),'no second Add or Enter');
      if(code.includes('function workspaceUiCapability')) {
        if(fault==='transport_expiry')clock=operation.deadline+1;
        if(fault==='dispatch_allowance')clock+=10000;
        if(fault==='unknown')return null;
        const script=code.replace(readPreparedNodeContext.toString(),'readOwner');
        const r=await vm.runInContext('('+script+')',sandbox)(page);
        if(fault==='response_expiry')clock=operation.deadline+1;
        return r;
      }
      return outputs();
    }});
  return {channel,operation,records,budgets,get clock(){return clock;},get ownerReads(){return ownerReads;},get monotonicReads(){return monotonicReads;},run:()=>channel.observe({
    condition:'new Table card bound to output',readOutputs:true,settleOutputPort:port,
    ready:s=>s.node_outputs.tables.length===1,confirmIdentity:s=>s.node_outputs.tables})};
}
for(const delay of ['owner','DOM'])test('D79 reviewer 26950ms '+delay+' read settles within original deadline',async()=>{
  const f=replay({delay});const s=await f.run();assert.equal(s.node_outputs.tables[0].view_guid,'new');
  assert.equal(f.monotonicReads,0);assert.ok(f.clock>=28000&&f.clock<601000);assert.equal(f.operation.deadline,601000);
  assert.ok(f.budgets.every(n=>n>0&&n<=35000));
  const good=f.records.filter(e=>e.phase==='node_observation_sample'&&e.readiness.satisfied);
  assert.ok(good.length>=2);assert.equal(f.records.at(-1).phase,'node_observation_completed');
});
for(const fault of ['foreign_owner','changed_owner','foreign_port','foreign_mask','dialog','unknown','allowance','dispatch_allowance','transport_expiry','response_expiry','port_owner_expiry'])
test('D79 bound read refuses '+fault+' without a usable observation',async()=>{
  const f=replay({fault});await assert.rejects(f.run());
  assert.ok(!f.records.some(e=>e.phase==='node_observation_completed'));
  await assert.rejects(f.channel.act({verb:'click',ref:'ui-views'}),/observation|budget|deadline/i);
  if(fault==='transport_expiry')assert.equal(f.ownerReads,0);
});
test('private Table read cannot be supplied to ordinary or unbounded UI calls',()=>{
  const options={mode:'observe',prepared_node_context:binding,deadline:61000,output_settlement_read:{port_guid:port,timeout_ms:35000}};
  assert.throws(()=>makeWorkspaceUiCode(options,{snapshotArgument:true}));
  for(const patch of [{mode:'act'},{prepared_node_context:undefined},{deadline:undefined},
    {output_settlement_read:{port_guid:'foreign',timeout_ms:35000}},
    {output_settlement_read:{port_guid:port,timeout_ms:35001}}])assert.throws(()=>makeWorkspaceUiCode({...options,...patch}));
});
test('ordinary reviewer replay retains the 15000ms browser read limit',async()=>{
  let clock=0;
  const capability=vm.runInContext('('+workspaceUiCapability.toString()+')',vm.createContext({Date:{now:()=>clock}}));
  const outcome=await capability({}, {mode:'observe',prepared_node_context:binding,discover_roots:true},async()=>{clock+=26950;return {verified:true,surface:'views'};});
  assert.equal(outcome.status,'NOT_APPLIED');assert.equal(outcome.error.code,'UI_DEADLINE_EXCEEDED');
});
