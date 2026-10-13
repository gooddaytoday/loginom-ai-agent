import {test,expect} from 'bun:test'
import {retainAmountStartup,bindAmountHostStartup,getAmountHostStartup,getFPHostStartup} from '../src/fp-startup-control'
function fixture(){
 const deadline=Date.now()+60000,acceptanceCapture={authorization:'a'.repeat(64),harness:'amount-import-type-v1',packagePath:'/worker/amount.lgp'}
 const input={root:'/own',resources:'/resources',headless:true,acceptanceCapture,amountStartup:{purpose:'amount-import-type-v1' as const,authorization:acceptanceCapture.authorization,operation:'original_op',request:'original_request',deadline}}
 const startup=retainAmountStartup({id:'outer_original',deadline},input),options={root:input.root,resources:input.resources,headless:input.headless,strictRecovery:false,acceptanceCapture}
 return {input,startup,options}
}
test('private Amount host binding never creates FP lineage',()=>{const {startup,options}=fixture();try{bindAmountHostStartup(options,startup);expect(getAmountHostStartup(options)?.tuple).toEqual(startup.tuple);expect(getFPHostStartup(options)).toBeUndefined();expect(getAmountHostStartup({...options})).toBeUndefined()}finally{startup.settle(false)}})
for(const key of ['root','resources','headless','strictRecovery','acceptanceCapture'])test('foreign host options '+key,()=>{const {startup,options}=fixture();try{expect(()=>bindAmountHostStartup({...options,[key]:key==='headless'||key==='strictRecovery'?!options[key as 'headless']:key==='acceptanceCapture'?{...options.acceptanceCapture,authorization:'b'.repeat(64)}:'/foreign'},startup)).toThrow('LOGINOM_HANDSHAKE_INVALID')}finally{startup.settle(false)}})
test('bound original host options drift refuses',()=>{const {startup,options}=fixture();try{bindAmountHostStartup(options,startup);options.root='/replaced';expect(()=>getAmountHostStartup(options)!.guard()).toThrow('LOGINOM_HANDSHAKE_INVALID')}finally{startup.settle(false)}})
test('bound Amount getters keep settlement state instead of a copied snapshot',()=>{const {startup,options}=fixture();bindAmountHostStartup(options,startup);expect(getAmountHostStartup(options)!.pending).toBe(true);startup.settle(false);expect(getAmountHostStartup(options)!.pending).toBe(false);expect(getAmountHostStartup(options)!.accepted).toBe(false)})

test('disposed or already bound Amount startup cannot create another host',()=>{const a=fixture();a.startup.settle(false);expect(()=>bindAmountHostStartup(a.options,a.startup)).toThrow('LOGINOM_HANDSHAKE_INVALID');const b=fixture();try{bindAmountHostStartup(b.options,b.startup);expect(()=>bindAmountHostStartup({...b.options},b.startup)).toThrow('LOGINOM_HANDSHAKE_INVALID')}finally{b.startup.settle(false)}})

test('bound unaccepted settlement refuses and cannot be rearmed',()=>{
 const {startup,options}=fixture();bindAmountHostStartup(options,startup);startup.settle(false)
 startup.settle(true);expect(startup.accepted).toBe(false)
 let first:unknown;try{getAmountHostStartup(options)!.guard()}catch(error){first=error}
 expect(first).toBeInstanceOf(Error);expect((first as Error).message).toBe('LOGINOM_HOST_NOT_READY')
 try{getAmountHostStartup(options)!.guard()}catch(error){expect(error).toBe(first)}
 expect(startup.secondary).toBeUndefined()
})
test('accepted bound phase preserves original control and currentness',()=>{
 const {startup,options,input}=fixture();bindAmountHostStartup(options,startup)
 const bound=getAmountHostStartup(options)!;startup.settle(true);startup.settle(false)
 expect(bound.accepted).toBe(true);expect(bound.control).toBe(startup.control)
 expect(()=>bound.guard()).not.toThrow();input.amountStartup.request='replaced'
 expect(()=>bound.guard()).toThrow('LOGINOM_HANDSHAKE_INVALID')
})
for(const reason of [false,0,undefined,new Error('original',{cause:false})])test('disposed bound first boxed reason '+String(reason),()=>{
 const {startup,options}=fixture();bindAmountHostStartup(options,startup);startup.propagate(reason);startup.settle(false)
 let caught=false;try{getAmountHostStartup(options)!.guard()}catch(error){caught=true;expect(error).toBe(reason)}
 expect(caught).toBe(true);expect(startup.secondary).toBeUndefined()
 startup.reject(reason);expect(startup.secondary).toEqual({value:reason})
})
