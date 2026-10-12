import {test,expect} from 'bun:test'
import {readFile} from 'node:fs/promises'
import vm from 'node:vm'
import {EventEmitter} from 'node:events'
import * as LoginomHost from '../src/adapter'
// Actual standalone function/adapter; ordinary parser and application/services
// are fixtures. No model/browser/Loginom is started.
const original=await readFile(new URL('../../agent/src/cli/standalone-run.ts',import.meta.url),'utf8')
const code=new Bun.Transpiler({loader:'ts'}).transformSync(original.replace(/^import .*\n/gm,'').replace(/await import\(([^)]+)\)/g,'await load($1)').replace('export async function','async function'))
for(const phase of ['ordinary','capture'])for(const value of ['success',undefined,null,false,0,'',new Error('capture',{cause:0})])test('ordinary parse then retained '+phase+' handoff '+String(value),async()=>{
 const events:string[]=[],messages=new EventEmitter();let run=''
 const host:any={auditAuthorization:'minted-private',port:{on:messages.on.bind(messages),start(){},postMessage(m:any){
  events.push(m.method);if(m.method==='acquire')run=m.input.run;
  if(m.method==='acceptance.capture')expect(m.input.run).toBe(run);
  queueMicrotask(()=>messages.emit('message',{data:{id:m.id,result:m.method==='acquire'?{generation:7}:m.method==='acceptance.capture'?(value==='success'?{cleanupComplete:true}:value):{}}}))
 }},request:async()=>({state:'ready',hasApiKey:true,recoveries:[]}),close:async()=>{events.push('host-close')}}
 const parser:any={};for(const name of ['scriptName','parserConfiguration','exitProcess','help','version','strict','fail','command'])parser[name]=()=>parser;
 parser.parseAsync=async()=>{events.push('ordinary-parse');const lease=await LoginomHost.acquire('chat');await lease!.release();events.push('ordinary-complete');if(phase==='ordinary'&&value!=='success')throw value}
 const load=async(name:string)=>name==='yargs'?{default:()=>parser}:name==='./standalone-proxy'?{applyCliSystemProxy:async()=>{},systemProxyNoticeLine:()=>''}:name==='../effect/app-runtime'?{AppRuntime:{dispose:async()=>{events.push('dispose')}}}:name.includes('httpapi/server')?{HttpApiApp:{webHandler:{loaded:()=>false}}}:{RunCommand:{}}
 const runtime=vm.runInNewContext(code+';standaloneRun',{LOGINOM_AI_AGENT_SORTING_ACCEPTANCE:'sorting-before-close-v1',load,LoginomHost,
  launchSortingDiagnostic:async()=>host,launchNodeHost:async()=>{throw Error('wrong launcher')},standaloneBundle:async()=>({}),standaloneCancellation:()=>undefined,Product:{cliExecutable:'fixture'},Schema:{decodeUnknownOption:()=>(v:unknown)=>({value:v})},Option:{isNone:()=>false},Loginom:{View:{}},process:{env:{},stdin:{},stderr:{write:()=>{}},stdout:{write:()=>{}}},Error,Set,Promise,Object})
 try{
 if(value==='success'){await runtime([], {loginom:'/fixture'},'run','/user/test.lgp');expect(events).toEqual(['ordinary-parse','acquire','ordinary-complete','acceptance.capture','host-close','release','dispose'])}
 else{let refusal:any;try{await runtime([], {loginom:'/fixture'},'run','/user/test.lgp')}catch(e){refusal=e}expect(refusal.message).toBe('LOGINOM_SORTING_AUDIT_REFUSED');expect(refusal.host).toBe(host);expect(refusal.owner.leases.size).toBe(1);expect(refusal.owner.deferRelease).toBe(true);expect(events).toEqual(phase==='ordinary'?['ordinary-parse','acquire','ordinary-complete']:['ordinary-parse','acquire','ordinary-complete','acceptance.capture']);expect(phase==='ordinary'?refusal.rejectedValue:refusal.rejectedValue.rejectedValue).toBe(value);expect(refusal.cause).toBe(refusal.rejectedValue)}
 }finally{LoginomHost.disconnect()}
})
