// Exact loader block executed on real verified FS inventory. No managed lifecycle.
import vm from 'node:vm';
import {readFile,realpath,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
let captureHarness,root;
process.on('message',async m=>{
 try{
  if(m.method==='start'){
   const source=await readFile(loaderSource,'utf8');
   const begin=source.indexOf('      let captureHarness'),end=source.indexOf('      // A new process',begin);
   if(begin<0||end<0)throw Error('EXACT_LOADER_BLOCK_UNAVAILABLE');
   const {verifyResources}=await import(pathToFileURL(resourceVerifier).href);
   root=m.input.resources;const resources=await verifyResources(root);
   const context=vm.createContext({acceptanceCapture:m.input.acceptanceCapture,resources,input:m.input,Error,join,pathToFileURL,realpath,readFile,createHash});
   captureHarness=await new vm.Script('(async()=>{'+source.slice(begin,end)+';return captureHarness})()', {importModuleDynamically:vm.constants.USE_MAIN_CONTEXT_DEFAULT_LOADER}).runInContext(context);
   process.send({id:m.id,result:{ready:true,protocol:1,pid:process.pid}});
  }else if(m.method==='acceptance.capture'){
   process.send({id:m.id,result:{...await captureHarness(),inventory:'runtime/src/acceptance/calculator-grouped-before-done-v1.mjs',loader:'runtime/src/acceptance/calculator-grouped-before-done-v1.mjs',fixture:true}});
  }else if(m.method==='close')process.send({id:m.id,result:{closed:true}},()=>process.disconnect());
 }catch(e){if(root)await writeFile(join(root,'path-loader-refusal.json'),JSON.stringify({fixture:true,loaded:false,message:e.message}));process.send({id:m.id,error:{code:'fixture',message:e.message}},()=>process.disconnect());}
});
