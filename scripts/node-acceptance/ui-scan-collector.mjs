// Internal diagnostic harness. It neither opens a Page nor changes the shipped observer.
import {createHash} from 'node:crypto';
import {makeWorkspaceUiCode,workspaceUiCapability} from '../../packages/loginom-runtime/client/lib/workspace-ui.mjs';
const hash=s=>createHash('sha256').update(s).digest('hex');
const observer=workspaceUiCapability.toString();
export const observerSha256=hash(observer);
const start=observer.indexOf('const observed = await page.evaluate(')+'const observed = await page.evaluate('.length;
const end=observer.indexOf('  },{rootRef:',start)+3;
const callback=observer.slice(start,end);
const callbackSha256=hash(callback);

function collectorRuntime() {
 const read=()=>performance.now();
 const start=read(),stages=[],calls={geometry:{count:0,ms:0},style:{count:0,ms:0},hit_test:{count:0,ms:0}};
 let active=null,candidate=null,filtered=null,returned=null,scan=null;
 const close=(work,visited)=>{if(active){active.ms+=Math.max(0,read()-active.start);active.work_end=work;active.visited_end=visited;delete active.start;active=null;}};
 return {
  stage(name,work,visited){close(work,visited);active={name,start:read(),ms:0,work_start:work,visited_start:visited};stages.push(active);},
  counters(data){scan=data;close(data.work,data.visited_elements);},
  call(name,fn){const began=read();calls[name].count++;try{return fn();}finally{calls[name].ms+=Math.max(0,read()-began);}},
  counts(c,f,r){if(c!==null)candidate=c;if(f!==null)filtered=f;if(r!==null)returned=r;},
  finish(){close();return {clock:'performance.now',instrumented:true,elapsed_ms:Math.max(0,read()-start),stages,calls,counts:{candidate,filtered,returned},scan};}
 };
}
const replaceOnce=(s,from,to)=>{
 if(s.split(from).length!==2)throw Error('Collector anchor changed; review the exact observer before capture');
 return s.replace(from,to);
};

function instrument(fn) {
 let text=fn.toString();
 if(hash(text)!==callbackSha256)throw Error('Collector callback identity differs');
 const brace=text.indexOf('=> {')+3,head=text.slice(0,brace),body=text.slice(brace+1,-1);
 let code=body;
 code=replaceOnce(code,"    try {\n    const charge", "    try {\n    __diag.stage('collect',work,visitedElements);\n    const charge");
 for(const [native,name] of [['metadata','metadata'],['output_definitions','output_definitions'],['import_definitions','import_definitions'],['controls','filter'],['data_views','data_views']])
  code=replaceOnce(code,`scanStage='${native}';`,`scanStage='${native}';__diag.stage('${name}',work,visitedElements);`);
 code=replaceOnce(code,'const controls = candidates.filter(interesting)',"__diag.counts(candidates.length,null,null);\n    const controls = candidates.filter(interesting)");
 code=replaceOnce(code,'.sort((left, right) => controlPriority(left) - controlPriority(right));',";\n    __diag.counts(null,controls.length,null);__diag.stage('sort',work,visitedElements);\n    controls.sort((left, right) => controlPriority(left) - controlPriority(right));\n    __diag.stage('controls_setup',work,visitedElements);");
 code=replaceOnce(code,'const elements = controls.slice(0, 240).map(element => {',"__diag.stage('render',work,visitedElements);\n    const elements = controls.slice(0, 240).map(element => {");
 code=replaceOnce(code,"scanStage='data_views';__diag.stage('data_views',work,visitedElements);","__diag.counts(null,null,elements.length);scanStage='data_views';__diag.stage('data_views',work,visitedElements);");
 code=code.replace(/(?:globalThis\.)?getComputedStyle\(/g,'__diagStyle(')
  .replaceAll('element.getBoundingClientRect()','__diagGeometry(element)')
  .replaceAll('document.elementFromPoint(','__diagHit(');
 code=code.trimEnd()+` finally {__diag.counters({work,visited_elements:visitedElements,max_ms:maxMs,max_work:maxWork,max_elements:maxElements,root_ref:rootRef??null,root_tid:scanRootTid,document_epoch:documentEpoch,global_scan:!rootRef&&!discoverRoots,discover_roots:discoverRoots});}`;
 const wrapped=`${head}{
 const __diag=(${collectorRuntime.toString()})();
 const __diagStyle=e=>__diag.call('style',()=>getComputedStyle(e));
 const __diagGeometry=e=>__diag.call('geometry',()=>e.getBoundingClientRect());
 const __diagHit=(x,y)=>__diag.call('hit_test',()=>document.elementFromPoint(x,y));
 try {const nativeResult=(()=>{${code}})();return {nativeResult,measurement:__diag.finish()};}
 catch(error){__diag.finish();throw error;}
 }`;
 return Function('return ('+wrapped+')')();
}

export async function collectUiScan(page,options,executeSerialized,{expectedObserverSha256}={}) {
 if(expectedObserverSha256!==observerSha256)throw Error('Explicit exact observer SHA256 required');
 const source=makeWorkspaceUiCode(options),scans=[];let omitted=0;
 const facade=new Proxy(page,{get(target,key){
  if(key==='evaluate')return async(fn,arg)=>{
   if(hash(fn.toString())!==callbackSha256)return target.evaluate(fn,arg);
   const result=await target.evaluate(instrument(fn),arg);
   result.measurement.counts.returned=result.nativeResult.ui?.elements?.length??0;
   if(scans.length<8)scans.push(result.measurement);else omitted++;
   return result.nativeResult;
  };
  const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;
 }});
 const receipt=await executeSerialized(source,facade);
 if(scans.length===0)throw Error('No exact serialized observer scan was collected');
 return {observer_sha256:observerSha256,serialized_sha256:hash(source),scans,omitted_scans:omitted,
  receipt:{status:receipt.status,phase:receipt.phase,effect_possible:receipt.effect_possible,cleanup_complete:receipt.cleanup_complete,
   error_code:receipt.error?.code??null,scan:receipt.output?.scan??null,
   failed_scans:(receipt.trace??[]).filter(e=>e.event==='ui_scan_limit').map(e=>({...e}))}};
}
