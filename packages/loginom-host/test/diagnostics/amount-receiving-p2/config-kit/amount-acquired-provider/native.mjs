import * as filesystem from 'node:fs/promises'
import {mock} from 'node:test'
import vm from 'node:vm'
import {createRequire} from 'node:module'
import {join} from 'node:path'
import {pathToFileURL} from 'node:url'
import {mkdir,writeFile} from 'node:fs/promises'
function emit(value){if(process.connected)process.send(value,()=>{})}
const root=process.env.FP_BOUND_RUNTIME,mode=process.env.FP_BOUND_CASE,require=createRequire(join(root,'client/package.json'))
let owner,session,releaseRead,releaseLogin
let rejectConfig
const fsExports={...filesystem};delete fsExports.default
const ownedRead=async(...args)=>{
 if(owner?.chat!=='readiness' && session && String(args[0])===session.browserConfig && mode.startsWith('owned-config')){
  emit({fixture:'owned-config-pending',chat:owner.chat})
  return await new Promise((resolve,reject)=>rejectConfig=reject)
 }
 return filesystem.readFile(...args)
}
mock.module('node:fs/promises',{namedExports:{...fsExports,readFile:ownedRead},defaultExport:{...filesystem.default,readFile:ownedRead}})
process.on('message',m=>{if(m.fixture==='owned-config-reject'){
 const value=mode==='owned-config-error'?new Error('labelled owned browser config',{cause:0}):mode.endsWith('false')?false:undefined
 emit({fixture:'owned-config-rejection-introduced',isUndefined:value===undefined,isFalse:value===false})
 rejectConfig?.(value)
}})
const target={profile_id:'labelled-service',loginom_build:'7.4.2',platform:'linux',browser:'chromium'}
class ExternalClient{
 constructor(identity){this.browser=identity.name==='loginom-dock-browser'}
 async connect(){} async close(){throw Error('LABELLED_CLOSE_FORBIDDEN')}
 async listTools(){return {tools:[{name:this.browser?'browser_run_code_unsafe':'read',inputSchema:{type:'object'}}]}}
 async callTool({name,arguments:args},unused,options){
  if(name!=='browser_run_code_unsafe'||!args.code.includes('bootstrapWorkspace'))throw Error('LABELLED_MUTATION_FORBIDDEN')
  emit({fixture:'bound-read-entered',chat:owner.chat,deadline_remaining:options.timeout,aborted:options.signal.aborted})
  if(['abort','late-page','late-metadata','late-deadline','lost', 'late-false','late-zero','late-undefined','late-error'].includes(mode))await new Promise(resolve=>releaseRead=resolve)
  if(mode==='late-page')owner.page={}
  if(mode==='late-metadata')session.metadata.sessionId='replaced'
  if(mode==='late-deadline')await new Promise(resolve=>setTimeout(resolve,options.timeout+5))
  if(mode==='lost')throw new Error('labelled transport lost',{cause:false})
  if(mode==='late-false')throw false
  if(mode==='late-zero')throw 0
  if(mode==='late-undefined')throw undefined
  if(mode==='late-error')throw new Error('labelled read',{cause:0})
  const value=await vm.runInThisContext('('+args.code+')')(page)
  return {content:[{type:'text',text:JSON.stringify(value)}]}
 }
}
class ExternalTransport{}
const sdk=p=>pathToFileURL(require.resolve('@modelcontextprotocol/sdk/'+p).replace('/dist/cjs/','/dist/esm/')).href
mock.module(sdk('client/index.js'),{namedExports:{Client:ExternalClient}})
mock.module(sdk('client/stdio.js'),{namedExports:{StdioClientTransport:ExternalTransport,getDefaultEnvironment:()=>({})}})
mock.module(sdk('client/streamableHttp.js'),{namedExports:{StreamableHTTPClientTransport:ExternalTransport}})
const catalog=await import(pathToFileURL(join(root,'client/lib/action-catalog.mjs')))
mock.module(pathToFileURL(join(root,'client/lib/action-catalog.mjs')).href,{namedExports:{...catalog,pinActionCatalog:async()=>({pins:{},compatibility:target,manifest:{compatibility:target},actions:new Map(),selectors:new Map()})}})
const skill=await import(pathToFileURL(join(root,'client/lib/skill.mjs')))
mock.module(pathToFileURL(join(root,'client/lib/skill.mjs')).href,{namedExports:{...skill,skillTransport:()=>({}),createSkillLoader:()=>({})}})
mock.module(require.resolve('@playwright/mcp'),{namedExports:{createConnection:async()=>({connect:async()=>{}})}})
const avatar={getAttribute:()=> 'MF;cntMain;tlbMainToolbar;btnAvatar',matches:()=>false,getBoundingClientRect:()=>({width:10,height:10}),hasAttribute:()=>false}
const realm=vm.createContext({URL,Date,location:{origin:'https://labelled.invalid'},bg:{app:{Version:'7.4.2'}},getComputedStyle:()=>({visibility:'visible',opacity:'1'}),document:{documentElement:{},createTreeWalker:()=>{let i=0;return {nextNode:()=>i++===0?avatar:null}}}})
const page={url:()=> 'https://labelled.invalid/app/',isClosed:()=>{emit({fixture:'lender-original-page-guard',owner:owner.id,chat:owner.chat});return false},evaluate:async(fn,args)=>fn.toString().includes('__loginomDockReadinessV1')?{documentId:args.documentId,account:args.account,loginomBuild:'7.4.2'}:vm.runInContext('('+fn.toString()+')',realm)(args)}
const context={pages:()=>mode==='multiple-pages'?[page,{}]:[page]}
mock.module(pathToFileURL(join(root,'src/connection-check.mjs')).href,{namedExports:{loginomAddress:x=>x,checkConnection:async()=>{throw Error('LABELLED_NATIVE_VALIDATION_FORBIDDEN')},loginBrowser:async({owner:value,candidate})=>{
 owner=value;Object.assign(owner,{id:'labelled-original-owner',account:candidate.username,origin:'https://labelled.invalid',page,context});
 emit({fixture:'bound-owner',chat:owner.chat,generation:owner.generation,deadline:owner.deadline})
 if(owner.chat!=='readiness' && mode.startsWith('phase-held')){
 emit({fixture:'phase-login-pending',chat:owner.chat});await new Promise(resolve=>releaseLogin=resolve);
 if(mode==='phase-held-false')throw false; if(mode==='phase-held-undefined')throw undefined; if(mode==='phase-held-zero')throw 0; if(mode==='phase-held-undefined-primary')throw undefined; if(mode==='phase-held-error')throw Error('labelled owned login',{cause:0});
 }
 return {context}
}}})
mock.module(pathToFileURL(join(root,'client/lib/session.mjs')).href,{namedExports:{createSession:async(config,{managed})=>{
 await mkdir(managed.directory,{recursive:true});const browserConfig=join(managed.directory,'labelled-browser.json');await writeFile(browserConfig,'{}')
 session={directory:managed.directory,browserConfig,browserCli:'labelled',browserRoot:'labelled',metadata:{client:'labelled',sessionId:'labelled-'+owner.chat,clientRevision:'labelled'},save:async()=>{},artifactStore:{list:()=>[],releaseUploads:async()=>{throw Error('LABELLED_RELEASE_FORBIDDEN')}}}
 return session
}}})
process.on('message',m=>{
 if(m.operation==='readonly.preReady'||m.operation==='readonly.preReady.cancel')emit({fixture:'bound-managed-request',requestId:m.id,operation:m.operation,input:m.input})
 if(m.operation==='start')emit({fixture:'bound-start',requestId:m.id,deadline:m.deadline,binding:m.input.acceptanceCapture??null,startup:m.input.amountStartup??null,fpStartupPresent:!!m.input.fpStartup})
 if(m.fixture==='bound-resolve'){releaseRead?.();releaseLogin?.()}
 if(m.fixture==='bound-drift'){
  if(m.key==='owner')owner.id='foreign'
  if(m.key==='page')owner.page={}
  if(m.key==='context')owner.context={pages:()=>[page]}
  if(m.key==='account')owner.account='foreign'
  if(m.key==='generation')owner.generation++
  if(m.key==='chat')owner.chat='foreign'
  if(m.key==='metadata')session.metadata={...session.metadata}
  if(m.key==='session')session.metadata.sessionId='foreign'
  if(m.key==='document')session.metadata.workspacePreparation={attempted:true,state:{document_id:'foreign'}}
  if(m.key==='workflow')session.metadata.workspacePreparation={attempted:true,state:{workflow_ref:{workflow_id:'foreign'}}}
  if(m.key==='storage')session.metadata.storageBinding={nonce:'fixture-is-not-authority'}
  if(m.key==='ready')session.metadata.workspaceReady=true
  emit({fixture:'bound-drifted',key:m.key})
 }
 if(m.fixture==='bound-lost' && owner.chat!=='readiness'){process.removeAllListeners('disconnect');process.disconnect();releaseLogin?.()}
 if(m.fixture==='bound-finish'){releaseLogin?.();releaseRead?.();process.removeAllListeners('disconnect');process.disconnect()}
})
