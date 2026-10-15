import {test,expect} from 'bun:test'
import {mintOriginalRunControl} from '../src/original-run-control'
import {bindOriginalRootPort} from '../src/original-root-port'
for (const drift of ['none','shadow','prototype','flags']) test('original inherited connected accessor custody '+drift+' getter0',()=>{
 let getters=0
 const prototype=Object.defineProperty({},'connected',{get(){getters++;return true},configurable:true})
 const child=Object.assign(Object.create(prototype),{pid:123})
 const port={postMessage(){},on(){},start(){}}
 const controller=new AbortController(),control=mintOriginalRunControl(controller.signal,Date.now()+7200_000)
 const binding=bindOriginalRootPort(port,control,child)
 if(drift==='shadow')Object.defineProperty(child,'connected',{get(){getters++;return true}})
 if(drift==='prototype')Object.setPrototypeOf(child,{})
 if(drift==='flags')Object.defineProperty(prototype,'connected',{enumerable:true})
 if(drift==='none')binding.guard();else expect(()=>binding.guard()).toThrow('LOGINOM_ORIGINAL_OWNER_CHANGED')
 expect(getters).toBe(0)
})
