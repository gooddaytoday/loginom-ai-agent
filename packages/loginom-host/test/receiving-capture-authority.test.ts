import {test,expect} from 'bun:test'
import {readFile} from 'node:fs/promises'
import vm from 'node:vm'
const source=await readFile(process.env.REVIEW_HOST_BUNDLE??new URL('../src/host.ts',import.meta.url),'utf8')
const begin=source.indexOf('authorizeCapture(authorization'),end=source.indexOf('bindCapture(',begin)
if(begin<0||end<begin)throw Error('exact published authorizeCapture body unavailable')
const method=source.slice(begin,end).trim().replace(/,$/,'')
const code=new Bun.Transpiler({loader:'ts'}).transformSync('globalThis.api={'+method+'};')+'\napi'
// Exact source/installed body VM: labelled closure maps and native identity; no admission claim.
for(const scenario of ['matching','foreign-owner','foreign-run','foreign-chat','foreign-lease','expired','account-drift','lost','stale'])test('exact authority closure '+scenario,()=>{
 const lease={},bound={owner:'owner',run:'run',chat:'chat',generation:7,account:'account',expires:Date.now()+60000}
 const connection={username:bound.account},lost=new Set(),stale=new Set();let owner=bound.owner,run=bound.run,chat=bound.chat,provided:any=lease
 if(scenario==='foreign-owner')owner='foreign';if(scenario==='foreign-run')run='foreign';if(scenario==='foreign-chat')chat='foreign';if(scenario==='foreign-lease')provided={};if(scenario==='expired')bound.expires=0;if(scenario==='account-drift')connection.username='foreign';if(scenario==='lost')lost.add(chat);if(scenario==='stale')stale.add(chat)
 const service=vm.runInNewContext(code,{options:{acceptanceCapture:{authorization:'trusted'}},captures:new Map([[bound.chat,bound]]),captureLeases:new Map([[bound.chat,lease]]),generations:new Map([[7,{connection}]]),lost,stale,Date})
 expect(service.authorizeCapture('trusted',owner,run,chat,provided)).toBe(scenario==='matching')
})
