import vm from 'node:vm';
import {createRequire} from 'node:module';
import {readFile,writeFile,mkdir,mkdtemp} from 'node:fs/promises';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {randomUUID} from 'node:crypto';
import {InMemoryTransport} from '@modelcontextprotocol/sdk/inMemory.js';
const root=ROOT;
const {admitStartupArtifacts}=await import(pathToFileURL(join(root,'client/lib/artifacts.mjs')).href);
let admissionStarted=false,releaseAdmission;
const req=createRequire(pathToFileURL(join(root,'client/package.json')));
const state={inputs:new Map()},preReadyRequests=new Map();let mode='canonical',dispatches=0;
const page={isClosed:()=>false,url:()=> 'https://fixture.invalid/app/',evaluate:async(fn,o)=>fn.toString().includes('__loginomDockReadinessV1')?{documentId:o.documentId,account:o.account,loginomBuild:'7.4.2'}:{origin:'https://fixture.invalid',target_state:'ready_for_prepare',observation_only:true}};
const context={pages:()=>[page]};
class Client {async connect(){}async close(){throw Error('unexpected cleanup')}async listTools(){return {tools:[{name:'browser_run_code_unsafe',inputSchema:{type:'object'}}]}}async callTool({arguments:{code}},unused,{signal}){dispatches++;if(mode==='abort'||mode==='deadline')await new Promise((r,j)=>{signal.addEventListener('abort',()=>j(signal.reason),{once:true})});return {content:[{type:'text',text:JSON.stringify(await vm.runInThisContext('('+code+')')(page))}]}}}
const bridgePath=join(root,'client/lib/bridge.mjs');let body=await readFile(bridgePath,'utf8');const bindings={};
const imports=[...body.matchAll(/^import\s+([\s\S]*?)\s+from\s+['"]([^'"]+)['"];\n/gm)];
for(const entry of imports){const mod=await import(entry[2].startsWith('node:')?entry[2]:entry[2].startsWith('.')?new URL(entry[2],pathToFileURL(bridgePath)).href:pathToFileURL(req.resolve(entry[2])).href);for(const item of entry[1].replace(/[{}]/g,'').split(',')){const parts=item.trim().split(/\s+as\s+/);bindings[parts[1]??parts[0]]=mod[parts[0]]}body=body.replace(entry[0],'')}
Object.assign(bindings,{Client,pinActionCatalog:async()=>({pins:{},compatibility:{loginom_build:'7.4.2'},manifest:{compatibility:{loginom_build:'7.4.2'}},actions:new Map()}),connectRemote:async factory=>factory().client,createSkillLoader:()=>({}),skillTransport:()=>({}),createActionRuntime:()=>({tools:[],describe:()=>({}),hasActiveWork:()=>false,hasUnsettledWork:()=>false})});
const createBridge=Function(...Object.keys(bindings),body.replace(/^export /gm,'')+';return createBridge')(...Object.values(bindings));
const {decodePreReadyRejection}=await import(pathToFileURL(join(root,'src/qualified-pre-ready.mjs')).href);
const text=await readFile(join(root,'src/managed-entry.mjs'),'utf8');const code=text.slice(text.indexOf('async function handle(message)'))+';handle';
const send=v=>process.send(v);
const handle=vm.runInNewContext(code,{state,preReadyRequests,decodePreReadyRejection,setImmediate:()=>{},Error,AbortController,URL,Date,process:{platform:'linux'},join,mkdir,mkdtemp,readFile,randomUUID,send,admitStartupArtifacts,closeRejection:v=>v instanceof Error?{kind:'Error',name:v.name,message:v.message}:{kind:'value',value:v===undefined?null:v,is_undefined:v===undefined},validateStartInput:()=>({}),verifyResources:async()=>({browserPath:'double',browserRoot:'double'}),loginBrowser:async({owner})=>{Object.assign(owner,{id:'original',account:'worker',origin:'https://fixture.invalid',page,context});return {context}},loginomAddress:x=>x,createSession:async(config,{managed})=>{const browserConfig=join(managed.directory,'browser.json');await writeFile(browserConfig,'{}');return {directory:managed.directory,browserConfig,save:async()=>{},artifactStore:{async admit(request){admissionStarted=true;await new Promise(resolve=>releaseAdmission=resolve);await writeFile(join(managed.directory,'admitted.txt'),'fixture');return {artifact_id:'fixture',name:request.name}}},metadata:{sessionId:'original',clientRevision:'fixture'}}},createBridge,require:s=>s.includes('inMemory')?{InMemoryTransport}:s==='@playwright/mcp'?{createConnection:async()=>({connect:async()=>{}})}:{Client}});
process.on('message',m=>{if(m.operation==='fixture.mode'){mode=m.input;send({id:m.id,result:true});return}if(m.operation==='fixture.admitReady'){void (async()=>{const end=Date.now()+1000;while(!admissionStarted){if(Date.now()>=end)throw Error('fixture admission not entered');await new Promise(resolve=>setImmediate(resolve))}send({id:m.id,result:true})})();return}if(m.operation==='fixture.releaseAdmission'){releaseAdmission?.();send({id:m.id,result:true});return}if(m.operation==='fixture.exit'){process.send({id:m.id,result:{dispatches,held:state.preReadyReadHeld,inputsPublished:state.inputs.has('original'),marker:state.session?.metadata.workspaceReady}},()=>process.exit(0));return}void handle(m)});
