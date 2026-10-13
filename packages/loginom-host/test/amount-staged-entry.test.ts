import {test,expect,mock} from 'bun:test'
import * as filesystem from 'node:fs/promises'
import * as children from 'node:child_process'
import {join} from 'node:path'
const read=filesystem.readFile,realpath=filesystem.realpath
let fault: undefined | {pending:boolean;entered?:()=>void;reply?:()=>Promise<unknown>},reads=0,forks=0
// FS read/parse boundary faults are labelled doubles, not provider callbacks.
mock.module('node:fs/promises',()=>({...filesystem,readFile:async(...args:any[])=>{
 reads++;if(fault&&String(args[0]).endsWith('cli-manifest.json')){fault.entered?.();return await fault.reply!()}
 return read(...args as Parameters<typeof read>)
},realpath:async(...args:any[])=>{reads++;return realpath(...args as Parameters<typeof realpath>)}}))
mock.module('node:child_process',()=>({...children,fork:()=>{forks++;throw Error('UNEXPECTED_COMPONENT_FORK')}}))
const api=await import(process.env.AMOUNT_STAGED_BUNDLE??'../src/amount-private-launcher-entry')
const launch=api.launchAmountDiagnostic
const product=process.env.AMOUNT_COMPONENT_PRODUCT!,resources=join(product,'resources/loginom')
let sequence=0
function fixture(){return {input:{node:join(resources,'bin/node'),entry:join(resources,'host/node-host.mjs'),root:'/fixture-not-launched',resources,headless:true,packagePath:'/own/never-opened.lgp',environment:{}},control:{signal:new AbortController().signal,deadline:Date.now()+60000,operation:'component-operation',request:'component-request-'+(++sequence)}}}
async function caught(work:Promise<unknown>){try{await work;return {present:false,value:undefined}}catch(value){return {present:true,value}}}
test('fixed Amount export retains stage A before inventory; absent provider never forks or invents stage B',async()=>{
 const {input,control}=fixture(),result=await caught(launch(input,control))
 expect(result.present).toBe(true);expect(String(result.value)).toContain('ORIGINAL_BOUND_TUPLE_PROVIDER_UNAVAILABLE')
 const root=launch.retained(input,control);expect(root.original.signal).toBe(control.signal);expect(root.original.deadline).toBe(control.deadline)
 expect(root.original.operation).toBe(control.operation);expect(root.original.request).toBe(control.request)
 expect(root.authorization).toMatch(/^[a-f0-9]{64}$/);expect(root.bindingPhase).toBe('unavailable');expect(root.nativeOwnerVerified).toBe(false)
 expect(root.evidenceSettled).toBe(false);expect(root.cleanupSettled).toBe(false);expect(root.acknowledged).toBe(false);expect(root.pending).toBe(false)
 expect(api.launchFieldParametersDiagnostic).toBeUndefined();expect(api.launchCalculatorDiagnostic).toBeUndefined();expect(forks).toBe(0)
 await expect(launch({...input},{...control})).rejects.toThrow('LOGINOM_RECOVERY_REQUIRED');expect(launch.retained(input,control).primaryFailure).toBe(result.value)
})
for(const scenario of ['absent','expired','preabort','extra'])test('stage A '+scenario+' refuses before IO/fork',async()=>{
 const {input,control}=fixture(),before=reads
 let value:any=control;if(scenario==='absent')value=undefined;if(scenario==='expired')control.deadline=0
 if(scenario==='preabort')control.signal=AbortSignal.abort(0)
 if(scenario==='extra')value={...control,run:'unacquired'}
 const result=await caught(launch(input,value));expect(result.present).toBe(true);if(scenario==='preabort')expect(result.value).toBe(0)
 expect(reads).toBe(before);expect(forks).toBe(0)
})
for(const key of ['signal','deadline','operation','request'])test('original control '+key+' drift after first await refuses',async()=>{
 const {input,control}=fixture(),first=launch(input,control)
 ;(control as any)[key]=key==='signal'?new AbortController().signal:key==='deadline'?control.deadline+1:'substituted'
 await expect(first).rejects.toThrow('LOGINOM_AMOUNT_STARTUP_CHANGED');expect(forks).toBe(0)
 expect(launch.retained(input,control).primaryFailurePresent).toBe(true)
})
for(const primary of [undefined,null,false,0,'',new Error('owned',{cause:0})])test('first owned IO failure with explicit presence '+String(primary),async()=>{
 const {input,control}=fixture();fault={pending:false,reply:async()=>{throw primary}}
 const result=await caught(launch(input,control));fault=undefined
 expect(result.present).toBe(true);expect(result.value).toBe(primary)
 const root=launch.retained(input,control);expect(root.primaryFailurePresent).toBe(true);expect(root.primaryFailure).toBe(primary);expect(root.secondaryFailurePresent).toBe(false)
 await expect(launch({...input},{...control})).rejects.toThrow('LOGINOM_RECOVERY_REQUIRED');expect(forks).toBe(0)
})
for(const secondary of [false,undefined,new Error('late',{cause:0})])test('pending cancelled original retains genuine late secondary '+String(secondary),async()=>{
 const {input,control}=fixture(),controller=new AbortController();control.signal=controller.signal
 let reject!:(e:unknown)=>void,entered!:()=>void;const seen=new Promise<void>(r=>{entered=r})
 fault={pending:true,entered,reply:()=>new Promise((_,r)=>{reject=r})}
 const first=caught(launch(input,control));await seen;controller.abort(false)
 expect(launch.retained(input,control).pending).toBe(true);expect(launch.retained(input,control).acknowledged).toBe(false)
 await expect(launch({...input},{...control,signal:new AbortController().signal})).rejects.toThrow('LOGINOM_RECOVERY_REQUIRED')
 reject(secondary);const result=await first;fault=undefined;expect(result.present).toBe(true);expect(result.value).toBe(false)
 const root=launch.retained(input,control);expect(root.pending).toBe(false);expect(root.primaryFailure).toBe(false);expect(root.secondaryFailurePresent).toBe(true);expect(root.secondaryFailure).toBe(secondary);expect(forks).toBe(0)
})
test('different original requests preserve independent roots without creating phase B',async()=>{
 const a=fixture(),b={input:a.input,control:{...a.control,request:a.control.request+'-independent'}}
 await Promise.all([caught(launch(a.input,a.control)),caught(launch(b.input,b.control))])
 expect(launch.retained(a.input,a.control).original.request).toBe(a.control.request);expect(launch.retained(b.input,b.control).original.request).toBe(b.control.request)
 expect(launch.retained(a.input,{...a.control})).toBeUndefined();expect(forks).toBe(0)
})
test('original cancellation plus fulfilled owned read has no fabricated secondary',async()=>{
 const {input,control}=fixture(),controller=new AbortController();control.signal=controller.signal
 let finish!:(v:unknown)=>void,entered!:()=>void;const seen=new Promise<void>(r=>{entered=r})
 fault={pending:true,entered,reply:()=>new Promise(r=>{finish=r})}
 const first=caught(launch(input,control));await seen;controller.abort(false);finish(await read(join(product,'cli-manifest.json'),'utf8'))
 const result=await first;fault=undefined;expect(result.present).toBe(true);expect(result.value).toBe(false)
 const root=launch.retained(input,control);expect(root.secondaryFailurePresent).toBe(false);expect(root.originalControlRetained).toBe(true);expect(root.acknowledged).toBe(false);expect(forks).toBe(0)
})
test('original control/authorization already retained at the first await; no startup mutation of caller',async()=>{
 const {input,control}=fixture(),copy={...input},first=caught(launch(input,control)),root=launch.retained(input,control)
 expect(root.phase).toBe('inventory');expect(root.pending).toBe(true);expect(root.original.signal).toBe(control.signal);expect(root.authorization).toMatch(/^[a-f0-9]{64}$/)
 expect(input).toEqual(copy);expect(Object.isFrozen(input)).toBe(false);await first;expect(forks).toBe(0)
})
