import {test,expect} from 'bun:test'
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises'
import {join,resolve} from 'node:path'
import {tmpdir} from 'node:os'
import {launchNodeHost} from '../src/node-client'
import {mintOriginalRunControl,retainOriginalRunOrigin} from '../src/original-run-control'
import {connect,acquire,disconnect} from '../src/adapter'
import {parseExpressionAt} from 'acorn'
test('fixed parent→stock Node entry/host-port→supervisor→managed listener/SDK original association across two real IPC children',async()=>{
 const node=process.env.LOGINOM_AI_AGENT_TEST_NODE;if(!node)throw Error('Pinned Node required')
 const repo=resolve(import.meta.dir,'../..'),runtime=process.env.ROOT_RUNTIME_ROOT??join(repo,'loginom-runtime'),dir=await mkdtemp(join(tmpdir(),'root-linked-'))
 const factory=`async function createLoginomHost(options){const rootOrigin=rootHostOptions(options);let child;const rows=new Set();return {settled:async()=>{},recoveries:new Map(),acquire:()=>({generation:1,release(){},holdRecovery(){},reconciled(){}}),retireRuntime:async()=>{},resetRestarts(){},markRuntimeStale(){},journal:{pending:()=>[...rows],begin:async()=>{rows.add('own');return 'own'},settle:async(id,complete)=>{if(complete)rows.delete(id)}},runtime:async(generation,chat)=>{if(!child)child=await supervise({node:${JSON.stringify(node)},entry:${JSON.stringify(join(dir,'managed.mjs'))},resources:options.resources,stateDir:${JSON.stringify(dir)},generation,chat,endpoint:'labelled',connection:{generation:1,apiKey:'double',password:'double',url:'https://labelled.invalid',username:'double'}},undefined,rootOrigin);return child},interruptAll:async()=>{},close:async()=>{await child?.close()}}}`
 let host:any
 try {
  const managed=`import fs from 'node:fs/promises';import vm from 'node:vm';import * as rootApi from ${JSON.stringify('file://'+join(runtime,'src/terminal-root-association.mjs'))};
 const source=await fs.readFile(${JSON.stringify(join(runtime,'src/managed-entry.mjs'))},'utf8');let helper=(await fs.readFile(${JSON.stringify(join(runtime,'src/terminal-managed-call.mjs'))},'utf8')).replace(/^import .*$/m,'').replaceAll('export function','function');
 let handle=source.slice(source.indexOf('async function handle(message)'));const first=handle.indexOf('    if (message.operation === "start")'),last=handle.indexOf("    if(message.operation==='readonly.preReady.cancel'");handle=handle.slice(0,first)+'if(message.operation===\"start\"){send({id:message.id,result:{protocol:1,generation:message.input.generation,ready:true,chat:message.input.chat}});return}'+handle.slice(last);
 const listener=source.slice(source.indexOf('process.on("message"'),source.indexOf('async function handle(message)'));
 const state={controller:undefined,session:{},bridge:{hasUnsettledWork:()=>false,hasActiveWork:()=>false},client:{callTool(){const t=context.custody.terminalManagedCallForBridge(state.bridge),r=t.facts.rootAssociation;return Promise.resolve({originId:r.wire.originId,deadline:r.wire.deadline,parentRequestId:r.wire.parentRequestId,childRequestId:r.wire.requestId,handleRetained:!!t.inspect().handleTask,controllerRetained:t.inspect().controller===state.controller,nativeAuthority:false,parentSignalSameReference:false})}}};
 const context={state,requests:new Set(),process,Error,AbortController,AbortSignal,...rootApi,recordClose:async()=>{},close:async()=>{},send:(m,disconnect=false)=>process.send(m,()=>{if(disconnect)process.disconnect()})};vm.runInNewContext(helper+';'+listener+handle+';globalThis.custody={terminalManagedCallForBridge}',context);`
  await writeFile(join(dir,'managed.mjs'),managed)
  const entry=join(dir,'host.mjs')
  if(process.env.ROOT_NODE_HOST){const source=await readFile(process.env.ROOT_NODE_HOST,'utf8'),start=source.indexOf('async function createLoginomHost('),ast=parseExpressionAt(source,start,{ecmaVersion:'latest'});await writeFile(entry,source.slice(0,start)+factory+source.slice(ast.end))}
  else {const result=await Bun.build({entrypoints:[join(repo,'loginom-host/src/node-entry.ts')],target:'node',plugins:[{name:'labelled-host-services',setup(build){build.onLoad({filter:/\/loginom-host\/src\/host\.ts$/},()=>({contents:`import {rootHostOptions} from ${JSON.stringify(join(repo,'loginom-host/src/original-root-association.ts'))};import {supervise} from ${JSON.stringify(join(repo,'loginom-host/src/supervisor.ts'))};export ${factory}`,loader:'ts'}))}}]});if(!result.success)throw result.logs;await writeFile(entry,await result.outputs[0].text())}
  const controller=new AbortController(),control=mintOriginalRunControl(controller.signal,Date.now()+7200000),origin=retainOriginalRunOrigin(control).origin
  host=await launchNodeHost({node,entry,root:dir,resources:dir,headless:true,environment:{}},control)
  const owner={deferRelease:true,leases:new Set<any>()};connect(host.port,owner,control);const lease=await acquire('original-chat');if(!lease)throw Error('Missing lease');const result:any=await lease.call('dock_prepare',{intent:'new_draft',operation_id:'same'},'original-message');expect(result.originId).toBe(origin.id);expect(result.deadline).toBe(control.deadline);expect(result.handleRetained).toBe(true);expect(result.controllerRetained).toBe(true);expect(result.nativeAuthority).toBe(false);expect(result.parentSignalSameReference).toBe(false);expect(result.parentRequestId).not.toBe(result.childRequestId);expect(retainOriginalRunOrigin(control).origin).toBe(origin);expect(control.signal).toBe(controller.signal)
 } finally {disconnect();await host?.close();await rm(dir,{recursive:true,force:true})}
},20000)
