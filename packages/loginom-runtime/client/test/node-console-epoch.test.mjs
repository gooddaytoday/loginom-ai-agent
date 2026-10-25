import test from 'node:test';
import assert from 'node:assert/strict';
import {createNodeProcedure} from '../lib/node-procedure.mjs';

function replay(verb,{races=0,fault,deadline=6000}={}) {
  let time=1,launches=0,clicks=0,attempts=0,quietAfter=1200;
  const records=[],node={document_id:'doc',workflow_id:'wf',node_id:'node'};
  const workflow={workflow_id:'wf',prefix:'MF;TF-1',tab_tid:'MF;cntMain;cntWorkspace;Workspace;t.br;tb-1',navigation_path:[{tid:'flow',label:'Scenario'}]};
  const button={ref:'ui-progress',tid:'MF;cntMain;tlbMainToolbar;btnProgress',signature:{tag:'button'},allowed_actions:['click'],enabled:true};
  const state={origin:'http://example.test',loginom_build:'7.4.2',workflow_ref:workflow,
    dom_epoch:{document:'dom',revision:1},scan:{complete:true},wizard:{status:'absent'},
    prepared_node_context:{...node,verified:true,surface:'graph',tid:'MF;TF-1;Graph;Node',locked:false},
    ui:{elements:[button,{ref:'ui-launch',allowed_actions:[verb]}],masks:[],dialogs:[],truncated:{dialogs:false,masks:false}}};
  const operation={id:'parent',deadline,action:{action_key:'node.apply',revision:'1'}};
  const controller=new AbortController();
  const channel=createNodeProcedure({operation,preparedNodeContext:{document_id:'doc',workflow_ref:workflow,node},
    targetOrigin:state.origin,targetBuild:state.loginom_build,now:()=>time,monotonicNow:()=>time*20+100000,
    signal:controller.signal,wait:async ms=>{time+=ms;if(fault==='cancel')controller.abort(Error('cancelled'));},
    record:async row=>{records.push(structuredClone(row));return structuredClone(row);},
    wrapMutation:(code,reference)=>({code,reference}),execute:async code=>{
      if(typeof code==='string') {
        if(launches&&(time<quietAfter||fault==='unstable'))state.dom_epoch.revision++;
        if(launches&&fault==='foreign')state.prepared_node_context.node_id='other';
        if(launches&&fault==='control')button.signature.tag='other';
        return {status:'SUCCEEDED',output:structuredClone(state)};
      }
      const action=records.findLast(r=>r.phase==='node_step_prepared').action;
      if(action.verb===verb)launches++;
      else {
        attempts++;
        if(fault==='transport')throw Error('transport lost');
        if(time<quietAfter||attempts<=races||fault==='uncertain') {
          quietAfter=Math.max(quietAfter,time+400);state.dom_epoch.revision++;
          return {status:fault==='uncertain'?'AMBIGUOUS':'NOT_APPLIED',action_key:'ui.act',operation_id:code.reference.id,
            phase:'preconditions',effect_possible:fault==='uncertain',cleanup_complete:fault!=='uncertain',
            error:{code:'UI_EPOCH_CHANGED'},trace:[]};
        }
        clicks++;
      }
      return {status:'SUCCEEDED',action_key:'ui.act',operation_id:code.reference.id,cleanup_complete:true,effect_possible:true};
    }});
  return {channel,operation,records,button,node,async run(){
    await channel.observe({condition:'launch ready',ready:()=>true});
    await channel.act({verb,ref:'ui-launch'});
    const initial=await channel.observe({condition:'console available',readProcessControls:true,ready:()=>true});
    return channel.perform({condition:'execution control '+button.tid,initialObservation:initial,ready:()=>true,
      settleProcessConsole:{ref:button.ref,signature:{tag:'button'}},identity:()=>node,resolve:()=>({verb:'click',ref:button.ref})});
  },stats:()=>({time,launches,clicks,attempts})};
}

for(const verb of ['execute_graph_node','execute_wizard']) {
  test('D77 '+verb+' waits for post-launch epoch quiescence without another launch',async()=>{
    const f=replay(verb);await f.run();
    assert.equal(f.stats().launches,1);assert.equal(f.stats().clicks,1);assert.equal(f.stats().attempts,1);
    assert.ok(f.stats().time>=1200);assert.equal(f.operation.deadline,6000);
    assert.equal(f.channel.launchConfirmed,true);
  });
  test('D77 '+verb+' refreshes more than three strictly refused console clicks within the original budget',async()=>{
    const f=replay(verb,{races:4});await f.run();
    assert.equal(f.stats().launches,1);assert.equal(f.stats().clicks,1);assert.equal(f.stats().attempts,5);
    assert.equal(f.operation.deadline,6000);assert.ok(f.stats().time<6000);
  });
}
for(const fault of ['unstable','foreign','control','cancel','transport','uncertain']) {
  test('D77 retains guards and never replays launch after '+fault,async()=>{
    const f=replay('execute_graph_node',{fault});await assert.rejects(f.run());
    assert.equal(f.stats().launches,1);assert.equal(f.stats().clicks,0);assert.equal(f.operation.deadline,6000);
    if(['transport','uncertain'].includes(fault))assert.equal(f.stats().attempts,1);
    else assert.equal(f.stats().attempts,0);
  });
}
