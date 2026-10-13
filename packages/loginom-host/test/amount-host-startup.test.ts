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
