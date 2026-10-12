// Real entry dispatcher with an IO spy; no copied selector validator.
import {test,expect} from 'bun:test'
import vm from 'node:vm'
import {readFile} from 'node:fs/promises'
import {isAbsolute} from 'node:path'
import {validateStartInput} from '../../loginom-runtime/src/start-input.mjs'
const source=await readFile(new URL('../src/node-entry.ts',import.meta.url),'utf8')
const start=source.indexOf('async function dispatch('),end=source.indexOf('\nfunction stop()',start)
const js=new Bun.Transpiler({loader:'ts'}).transformSync(source.slice(start,end))
const base=()=>({authorization:'a'.repeat(64),packagePath:'/worker/result.lgp'})
const bad:Record<string,()=>any>={
 undefined:()=>({...base(),harness:undefined}),null:()=>({...base(),harness:null}),calculator:()=>({...base(),harness:'calculator-grouped-before-done-v1'}),foreign:()=>({...base(),harness:'foreign'}),extra:()=>({...base(),harness:'replacement-input0-readonly-v1',module:'user.mjs'}),
 authorization:()=>({...base(),authorization:'x'}),path:()=>({...base(),packagePath:'/worker/../x.lgp'}),array:()=>[],
 accessor:()=>Object.defineProperty(base(),'harness',{enumerable:true,get(){throw Error('GETTER_MUST_NOT_RUN')}}),
 operand_accessor:()=>Object.defineProperty({...base(),harness:'replacement-input0-readonly-v1'},'packagePath',{enumerable:true,get(){throw Error('GETTER_MUST_NOT_RUN')}}),
 hidden:()=>Object.defineProperty(base(),'harness',{value:'replacement-input0-readonly-v1'}),symbol:()=>({...base(),[Symbol('foreign')]:true}),
 inherited:()=>Object.assign(Object.create({harness:'replacement-input0-readonly-v1'}),base())
}
async function entry(capture:any,absent=false){let io=0,accepted:any;const replies:any[]=[]
 const ctx=vm.createContext({state:{closed:false},Error,Object,Reflect,isAbsolute,process:{env:{},pid:123},
 createLoginomHost:async(o:any)=>{io++;accepted=o;return {settled:async()=>{}}},cliCredentials:()=>({}),loginomHostPort:()=>({}),port:{},reply:(v:any)=>replies.push(v),hostError:()=> 'LOGINOM_HOST_REQUEST_FAILED'})
 const dispatch=vm.runInContext(js+';dispatch',ctx)
 await dispatch({id:'start',method:'start',input:{protocol:1,root:'/fixture',resources:'/fixture/resources',headless:true,...(absent?{}:{acceptanceCapture:capture})}})
 return {io,accepted,replies}
}
for(const [name,make] of Object.entries(bad))test('closed selector before IO '+name,async()=>{const r=await entry(make());expect(r.io).toBe(0);expect(r.replies[0].error).toBeDefined()})
for(const mode of ['replacement','legacy','no-capture'])test('entry Calculator compatibility '+mode,async()=>{
 const r=await entry(mode==='replacement'?{...base(),harness:'replacement-input0-readonly-v1'}:base(),mode==='no-capture')
 expect(r.io).toBe(1);expect(r.replies[0].result.ready).toBe(true)
 expect(r.accepted.acceptanceCapture?.harness).toBe(mode==='replacement'?'replacement-input0-readonly-v1':undefined)
})
const grant=()=>({revision:1,harness:'replacement-input0-readonly-v1',owner:'owner',run:'run',lease:'owner:run',generation:3,chat:'chat',account:'worker',packagePath:'/worker/result.lgp',admission:'admission',expires:Date.now()+30000})
for(const scenario of ['replacement','calculator','foreign','missing','expired','late','owner-lease','generation','chat','account','path','extra'])test('managed start selector/tuple '+scenario,()=>{
 const g:any=grant();if(scenario==='calculator')g.harness='calculator-grouped-before-done-v1';if(scenario==='foreign')g.harness='foreign';if(scenario==='missing')delete g.harness;
 if(scenario==='expired')g.expires=0;if(scenario==='late')g.expires=Date.now()+700000;if(scenario==='owner-lease')g.owner='foreign';if(scenario==='generation')g.generation++;if(scenario==='chat')g.chat='foreign';if(scenario==='account')g.account='foreign';if(scenario==='path')g.packagePath='/foreign/draft.lgp';if(scenario==='extra')g.callback='foreign'
 const input={protocol:1,stateDir:'/fixture',generation:3,chat:'chat',connection:{username:'worker'},acceptanceCapture:g}
 if(['replacement','calculator'].includes(scenario))expect(validateStartInput(input).acceptanceCapture).toBe(g);else expect(()=>validateStartInput(input)).toThrow('LOGINOM_START_INVALID')
})
