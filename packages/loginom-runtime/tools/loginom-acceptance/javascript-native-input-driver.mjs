import {createHash} from 'node:crypto';
import {createTextImportNodeSupport} from '../../client/lib/text-import-node.mjs';
import {createNodeProcedure} from '../../client/lib/node-procedure.mjs';
import {withBrowserReceipt} from '../../client/lib/executor.mjs';
import {nativeFrontendPins} from '../../client/lib/collapse-native-output.mjs';
import {decodeVariantFrame} from '../../client/lib/variant-native-decode.mjs';
import {javascriptNativeInputCode,javascriptNativeRuntimeCode} from './javascript-native-input-binding.mjs';
import {verifyLoadedNativeRuntime} from '../../client/lib/collapse-native-runtime.mjs';
import {readJavascriptNativeInput,cancelJavascriptNativeInput,javascriptNativeInputStatus} from './javascript-native-input-read.mjs';
import {nativeInputProvenance,verifyNativeInputUi,verifyNativeInputRead,nativeInputFixture} from './javascript-native-input-contract.mjs';

const need=(v,m)=>{if(!v)throw Error('Native input driver: '+m);};
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');

export function verifyNativeInputCountLoaders(sources){
  const pins={PrepareColumnInfoAndRowCount:'d952415558676c3caf569a51d88bf026e661abdaaf08842d870ddba139730e3f',
    InitOutput:'c01544ac551e88997f9cea9b62314234ad435bc7632357861cdfc6013e89960e',
    DataSourceProxyRead:'6206671eaf111d80459c3ed1d5878125ef37918fb1abacc1cd19ce42c7fdf91d'};
  for(const [key,pin]of Object.entries(pins))need(typeof sources?.[key]==='string'&&hash(sources[key])===pin,'count loader changed: '+key);
  return pins;
}

export async function verifyNativeInputFrontends(execute,origin,deadline,signal){
  const urls=await execute(`async page=>page.evaluate(names=>Object.fromEntries(names.map(name=>{
    const urls=[...document.scripts].map(s=>s.src).filter(u=>u&&new URL(u).pathname.split('/').at(-1)===name);
    if(urls.length!==1)throw Error('Unique pinned frontend required');return [name,urls[0]];
  })),${JSON.stringify(Object.keys(nativeFrontendPins))})`,{timeout:Math.min(10000,deadline-Date.now())});
  const proofs=[];
  for(const [name,url]of Object.entries(urls)){
    signal?.throwIfAborted();need(Date.now()<deadline,'original deadline expired');need(new URL(url).origin===origin,'foreign frontend');
    const timeout=AbortSignal.timeout(Math.min(10000,Math.max(1,deadline-Date.now())));
    const response=await fetch(url,{redirect:'error',signal:signal?AbortSignal.any([signal,timeout]):timeout});
    need(response.ok,'frontend download');let size=0;const digest=createHash('sha256');
    for await(const chunk of response.body){size+=chunk.length;need(size<=10000000&&Date.now()<deadline,'frontend byte/time bound');digest.update(chunk);}
    const sha256=digest.digest('hex');need(sha256===nativeFrontendPins[name],'frontend pin changed: '+name);proofs.push({name,url,sha256});
  }
  need(proofs.length===5,'complete frontend provenance');return proofs;
}

export async function readNativeInputDuringImport({options,ctx,provenance,targetOrigin,targetBuild,onState},
  {createProcedure=createNodeProcedure,verifyFrontends=verifyNativeInputFrontends,verifyRuntime=verifyLoadedNativeRuntime,
    verifyCountLoaders=verifyNativeInputCountLoaders}={}){
  const {execute,operation,onRecord,now}=options;
  const deadline=ctx.deadline;
  const check=()=>{ctx.signal?.throwIfAborted();need(now()<deadline,'original deadline expired');
    need(options.exclusiveNodeOperation()===true,'owning read lock lost');
    // Revalidate ordered upload history even after entering the native read.
    nativeInputProvenance({...options,ctx,execution:provenance.execution});};
  check();const frontends=await verifyFrontends(execute,targetOrigin,deadline,ctx.signal);check();
  const channel=createProcedure({operation,execute,record:onRecord,now,signal:ctx.signal,maxSteps:128,targetOrigin,targetBuild,
    preparedNodeContext:{document_id:ctx.document_id,workflow_ref:ctx.workflow_ref,node:ctx.node},
    wrapMutation:(code,r)=>withBrowserReceipt('('+code+')(page)',{...options.receiptOptions(r.id,r.action_key,r.signature),operation_id:r.id})});
  const same=s=>s.prepared_node_context?.verified===true&&s.prepared_node_context.surface==='graph'&&s.wizard?.status==='absent'
    &&['document_id','workflow_id','node_id'].every(k=>s.prepared_node_context[k]===ctx.node[k]);
  let state=await channel.observe({condition:'native input owned graph/output',readOutputs:true,ready:s=>same(s)&&s.node_outputs?.verified===true});
  const ports=state.node_outputs.ports.filter(p=>p.index===0);need(ports.length===1&&ports[0].active===true,'one active import output');const port=ports[0];
  const control=(s,verb)=>{const es=s.ui.elements.filter(e=>e.tid===port.tid&&e.allowed_actions.includes(verb));need(es.length===1,'unique output control');return es[0];};
  check();await channel.perform({condition:'select owned import output Preview',initialObservation:state,ready:same,
    identity:()=>ctx.node,resolve:s=>({verb:'click',ref:control(s,'click').ref})});
  state=await channel.observe({condition:'owned import output Preview command',ready:s=>same(s)&&s.ui.elements.some(e=>e.tid===port.tid&&e.allowed_actions.includes('press'))});
  check();await channel.perform({condition:'open owned import native Preview',initialObservation:state,ready:same,
    identity:()=>ctx.node,resolve:s=>({verb:'press',ref:control(s,'press').ref,key:'F3'})});
  let lifecycle,observationError,preview,readDispatched=false;
  try{
    preview=await channel.observe({condition:'native input Preview schema',readPreview:true,ready:s=>s.node_preview_schema?.verified===true
      &&s.node_preview_schema.port_guid===port.port_guid&&s.node_preview_schema.port===0});
    need(preview.node_preview_schema.fields.length===1&&preview.node_preview_schema.fields[0].name==='Value'
      &&preview.node_preview_schema.fields[0].label==='Value'&&preview.node_preview_schema.fields[0].type==='real','Preview fixed schema');
    const readId='js-native-input-'+hash(operation.id+':'+ctx.execution.execution_id).slice(0,40);
    const args={binding_id:readId,runtime_binding_id:readId,document_id:ctx.document_id,workflow_id:ctx.workflow_ref.workflow_id,
      package_id:ctx.document_id+':'+ctx.workflow_ref.workflow_id,node_id:ctx.node.node_id,port_guid:port.port_guid,
      origin:targetOrigin,tab_tid:ctx.workflow_ref.tab_tid,prefix:ctx.workflow_ref.prefix,execution:ctx.execution,
      completed_child:provenance.execution,deadline,method:321,interface:116,port:0,offset:0,rows:4,row_count:4,columns:[0],
      schema:[{name:'Value',label:'Value',type:3}]};
    check();
    // Fixed local builders, not user code. bind runtime needs the imported
    // verifier in the host, so return its proof through the owning transport.
    const runtime=verifyRuntime(await execute(javascriptNativeRuntimeCode(args),{timeout:Math.min(10000,deadline-now())}),args);
    check();
    const binding=await execute(javascriptNativeInputCode(args),{timeout:Math.min(10000,deadline-now())});
    const pins=verifyCountLoaders(binding.count_loader_sources);
    delete binding.count_loader_sources;check();
    let cancellation;
    const abort=()=>{operation.transportUncertain=true;cancellation=execute(`async page=>(${cancelJavascriptNativeInput.toString()})(page,${JSON.stringify(readId)})`,{timeout:5000}).catch(()=>null);};
    ctx.signal?.addEventListener('abort',abort,{once:true});
    let raw,readError;
    try{
      check();readDispatched=true;await onState({uncertain:true});
      raw=await execute(`async page=>(${readJavascriptNativeInput.toString()})(page,${JSON.stringify(binding)},${decodeVariantFrame.toString()},${JSON.stringify({operationId:readId,timeoutMs:Math.min(30000,Math.max(1,deadline-now())),maxBytes:65536})})`,{timeout:Math.min(30000,deadline-now())+5000});
    }catch(error){readError=error;throw error;
    }finally{ctx.signal?.removeEventListener('abort',abort);if(cancellation)await cancellation;
      try{lifecycle=await execute(`async page=>(${javascriptNativeInputStatus.toString()})(page)`,{timeout:5000});await onState(lifecycle);}
      catch(statusError){if(!readError)throw statusError;
        throw Object.assign(new AggregateError([readError,statusError],readError.message),{observationError:readError,cleanupError:statusError});}}
    check();const expected={...binding,read_id:readId};
    const exact=verifyNativeInputRead(raw,{binding:expected,lifecycle,provenance});
    const proof={exact,raw,binding:{...expected,origin:new URL(expected.origin).href},runtime,frontends,count_loader_sha256:pins,lifecycle};
    const event={phase:'javascript_native_input_cells_verified',operation_id:operation.id,proof};
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
        const closing=await channel.observe({condition:'owned native input Preview before Close',readPreview:true,ready:owned});
        await channel.perform({condition:'close owned native input Preview once',initialObservation:closing,ready:owned,
          identity:()=>({node:ctx.node,port_guid:port.port_guid,root}),resolve:s=>{
            const es=s.ui.elements.filter(e=>e.tid===root+';p.h;close'&&e.allowed_actions.includes('click'));need(es.length===1,'owned Preview Close');return {verb:'click',ref:es[0].ref};}});
        await channel.observe({condition:'same input-only graph after Preview',ready:same});check();
        await onRecord({phase:'javascript_native_input_preview_closed',operation_id:operation.id,node:ctx.node});
      }catch(cleanupError){operation.transportUncertain=true;await onState({...lifecycle,uncertain:true});if(!observationError)throw cleanupError;
        throw Object.assign(new AggregateError([observationError,cleanupError],observationError.message),{observationError,cleanupError});}
    }
  }
}

export function createJavascriptNativeInputSupport({targetOrigin,targetBuild,onProof,onState,
  createSupport=createTextImportNodeSupport,readNative=readNativeInputDuringImport}){
  const support=createSupport({targetOrigin,targetBuild});
  return {...support,nodeApplyDriverFactory:options=>{
    const base=support.nodeApplyDriverFactory(options);let executed=false,readStarted=false,execution;
    return {...base,
      verifySource:async parameters=>{
        need(parameters.source?.bytes===nativeInputFixture.bytes&&parameters.source.sha256===nativeInputFixture.sha256,'fixture admission');
        return base.verifySource(parameters);
      },
      finish:async(mode,ctx)=>{need(mode==='execute'&&!executed,'one import Execute only');executed=true;return base.finish(mode,ctx);},
      waitExecution:async ctx=>(execution=await base.waitExecution(ctx)),
      readOutput:async(read,ctx)=>{
        need(!readStarted,'native input read already reserved; no replay');readStarted=true;
        const ui=await base.readOutput(read,ctx);verifyNativeInputUi(ui.ports?.[0]);
        const provenance=nativeInputProvenance({...options,ctx,execution});
        const proof=await readNative({options,ctx,provenance,targetOrigin,targetBuild,onState});
        await onProof({ui,native:proof});return ui;
      }};
  }};
}
