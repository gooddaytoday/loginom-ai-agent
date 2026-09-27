import {createHash} from 'node:crypto';
import {createNodeProcedure} from '../../client/lib/node-procedure.mjs';
import {withBrowserReceipt} from '../../client/lib/executor.mjs';
import {decodeVariantFrame} from '../../client/lib/variant-native-decode.mjs';
import {verifyNativeInputFrontends,verifyNativeInputCountLoaders} from './javascript-native-input-driver.mjs';
import {verifyNativeInputCookieRuntime} from './javascript-native-input-binding.mjs';
import {javascriptNativeRoundtripCode} from './javascript-native-roundtrip-binding.mjs';
import {readJavascriptNativeRoundtrip,cancelJavascriptNativeRoundtrip,javascriptNativeRoundtripStatus} from './javascript-native-roundtrip-read.mjs';
import {nativeRoundtripProbe,verifyNativeRoundtripRead,verifyNativeRoundtripAddPortRuntime} from './javascript-native-roundtrip-contract.mjs';
const need=(v,m)=>{if(!v)throw Error('Native roundtrip driver: '+m);};
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');

export async function readNativeRoundtrip({options,ctx,input,role,targetOrigin,targetBuild,onState},
  {createProcedure=createNodeProcedure,verifyFrontends=verifyNativeInputFrontends,
    verifyCountLoaders=verifyNativeInputCountLoaders,verifyCookieRuntime=verifyNativeInputCookieRuntime}={}){
  const {execute,operation,onRecord,now}=options;
  const deadline=Math.min(ctx.deadline,input.binding.deadline);
  const check=()=>{ctx.signal?.throwIfAborted();need(now()<deadline,'original deadline expired');
    need(options.exclusiveNodeOperation()===true,'owning read lock lost');
    need(['output','upstream'].includes(role),'private roundtrip role');};
  check();const frontends=await verifyFrontends(execute,targetOrigin,deadline,ctx.signal);check();
  const channel=createProcedure({operation,execute,record:onRecord,now,signal:ctx.signal,maxSteps:128,targetOrigin,targetBuild,
    preparedNodeContext:{document_id:ctx.document_id,workflow_ref:ctx.workflow_ref,node:ctx.node},
    wrapMutation:(code,r)=>withBrowserReceipt('('+code+')(page)',{...options.receiptOptions(r.id,r.action_key,r.signature),operation_id:r.id})});
  const same=s=>s.prepared_node_context?.verified===true&&s.prepared_node_context.surface==='graph'&&s.wizard?.status==='absent'
    &&['document_id','workflow_id','node_id'].every(k=>s.prepared_node_context[k]===ctx.node[k]);
  let state=await channel.observe({condition:'native roundtrip owned graph/output',readOutputs:true,ready:s=>same(s)&&s.node_outputs?.verified===true});
  const ports=state.node_outputs.ports.filter(p=>p.index===0);need(ports.length===1&&ports[0].active===true,'one active owned output');const port=ports[0];
  const control=(s,verb)=>{const es=s.ui.elements.filter(e=>e.tid===port.tid&&e.allowed_actions.includes(verb));need(es.length===1,'unique output control');return es[0];};
  check();await channel.perform({condition:'select owned roundtrip output Preview',initialObservation:state,ready:same,
    identity:()=>ctx.node,resolve:s=>({verb:'click',ref:control(s,'click').ref})});
  state=await channel.observe({condition:'owned roundtrip output Preview command',ready:s=>same(s)&&s.ui.elements.some(e=>e.tid===port.tid&&e.allowed_actions.includes('press'))});
  check();await channel.perform({condition:'open owned roundtrip native Preview',initialObservation:state,ready:same,
    identity:()=>ctx.node,resolve:s=>({verb:'press',ref:control(s,'press').ref,key:'F3'})});
  let lifecycle,observationError,preview,readDispatched=false;
  try{
    preview=await channel.observe({condition:'native roundtrip Preview schema',readPreview:true,ready:s=>s.node_preview_schema?.verified===true
      &&s.node_preview_schema.port_guid===port.port_guid&&s.node_preview_schema.port===0});
    need(preview.node_preview_schema.fields.length===1&&preview.node_preview_schema.fields[0].name==='Value'
      &&preview.node_preview_schema.fields[0].label==='Value'&&preview.node_preview_schema.fields[0].type==='real','Preview fixed schema');
    const readId='js-native-roundtrip-'+hash(operation.id+':'+role+':'+ctx.execution.execution_id).slice(0,40);
    const args={binding_id:readId,runtime_binding_id:input.binding.runtime_binding_id,roundtrip_role:role,source_sha256:nativeRoundtripProbe.source_sha256,document_id:ctx.document_id,workflow_id:ctx.workflow_ref.workflow_id,
      package_id:ctx.document_id+':'+ctx.workflow_ref.workflow_id,node_id:ctx.node.node_id,port_guid:port.port_guid,
      origin:targetOrigin,tab_tid:ctx.workflow_ref.tab_tid,prefix:ctx.workflow_ref.prefix,execution:ctx.execution,
      completed_child:ctx.execution,deadline,method:321,interface:116,port:0,offset:0,rows:4,row_count:4,columns:[0],
      schema:[{name:'Value',label:'Value',type:3}]};
    check();
    // Retain the original attested runtime; page-local checks reject rebinding.
    const runtime=input.runtime;
    const binding=await execute(javascriptNativeRoundtripCode(args),{timeout:Math.min(10000,deadline-now())});
    const addPortPins=verifyNativeRoundtripAddPortRuntime(binding.add_port_sources);delete binding.add_port_sources;
    const cookiePins=verifyCookieRuntime(binding.cookie_sources);delete binding.cookie_sources;
    const pins=verifyCountLoaders(binding.count_loader_sources);
    delete binding.count_loader_sources;check();
    let cancellation;
    const abort=()=>{operation.transportUncertain=true;cancellation=execute(`async page=>(${cancelJavascriptNativeRoundtrip.toString()})(page,${JSON.stringify(readId)})`,{timeout:5000}).catch(()=>null);};
    ctx.signal?.addEventListener('abort',abort,{once:true});
    let raw,readError;
    try{
      check();readDispatched=true;await onState({uncertain:true});
      raw=await execute(`async page=>(${readJavascriptNativeRoundtrip.toString()})(page,${JSON.stringify(binding)},${decodeVariantFrame.toString()},${JSON.stringify({operationId:readId,timeoutMs:Math.min(30000,Math.max(1,deadline-now())),maxBytes:65536})})`,{timeout:Math.min(30000,deadline-now())+5000});
    }catch(error){readError=error;throw error;
    }finally{ctx.signal?.removeEventListener('abort',abort);if(cancellation)await cancellation;
      try{lifecycle=await execute(`async page=>(${javascriptNativeRoundtripStatus.toString()})(page)`,{timeout:5000});await onState(lifecycle);}
      catch(statusError){if(!readError)throw statusError;
        throw Object.assign(new AggregateError([readError,statusError],readError.message),{observationError:readError,cleanupError:statusError});}}
    check();const expected={...binding,read_id:readId};
    const exact=verifyNativeRoundtripRead(raw,{binding:expected,lifecycle,input,role});
    const proof={exact,raw,add_port_source_sha256:addPortPins,binding:{...expected,origin:new URL(expected.origin).href},runtime,frontends,subscription_proxy_source_sha256:cookiePins,count_loader_sha256:pins,lifecycle};
    const event={phase:'javascript_native_roundtrip_'+role+'_cells_verified',operation_id:operation.id,proof};
    const saved=await onRecord(event);need(saved?.phase===event.phase&&JSON.stringify(saved.proof)===JSON.stringify(proof),'native journal acknowledgement differs');
    return proof;
  }catch(error){observationError=error;throw error;
  }finally{
    if(readDispatched&&(!lifecycle||lifecycle.retired||lifecycle.pending||lifecycle.status!=='completed'
      ||lifecycle.releasedRequests!==4||lifecycle.releasedResponses!==4)){
      operation.transportUncertain=true;await onState({...lifecycle,uncertain:true});
    }
    else if(preview){
      try{
        check();const root=preview.node_preview_schema.root_tid;
        const owned=s=>s.node_preview_schema?.verified===true&&s.node_preview_schema.port_guid===port.port_guid&&s.node_preview_schema.root_tid===root;
        const closing=await channel.observe({condition:'owned native roundtrip Preview before Close',readPreview:true,ready:owned});
        await channel.perform({condition:'close owned native roundtrip Preview once',initialObservation:closing,ready:owned,
          identity:()=>({node:ctx.node,port_guid:port.port_guid,root}),resolve:s=>{
            const es=s.ui.elements.filter(e=>e.tid===root+';p.h;close'&&e.allowed_actions.includes('click'));need(es.length===1,'owned Preview Close');return {verb:'click',ref:es[0].ref};}});
        await channel.observe({condition:'same roundtrip graph after Preview',ready:same});check();
        await onRecord({phase:'javascript_native_roundtrip_'+role+'_preview_closed',operation_id:operation.id,node:ctx.node});
      }catch(cleanupError){operation.transportUncertain=true;await onState({...lifecycle,uncertain:true});if(!observationError)throw cleanupError;
        throw Object.assign(new AggregateError([observationError,cleanupError],observationError.message),{observationError,cleanupError});}
    }
  }
}
