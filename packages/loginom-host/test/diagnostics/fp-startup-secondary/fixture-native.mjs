import {mkdir,writeFile} from 'node:fs/promises'
import {join} from 'node:path'
let resolveLogin,rejectLogin,owner,session,resolveResources
process.on('message',m=>{
 if(m.fixture==='resolve-resources')resolveResources?.()
 if(m.fixture==='resolve'){if(m.rejection)rejectLogin(m.rejection.kind==='Error'?new Error(m.rejection.message,{cause:m.rejection.cause}):m.rejection.value);else resolveLogin?.({context:m.foreignContext?{pages:()=>[owner.page]}:owner.context})}
 if(m.fixture==='drift-owner' && owner)owner.chat='foreign'
 if(m.fixture==='drift-session' && session)session.metadata.sessionId='foreign'
 if(m.fixture==='finish'){process.removeAllListeners('disconnect');process.disconnect()}
})
export function loginomAddress(){return 'https://labelled.invalid/'}
export async function verifyResources(){if(process.argv.includes('hold-resources')){process.send({fixture:'resource-entered'});await new Promise(resolve=>resolveResources=resolve);process.send({fixture:'resource-settled'})};return {manifest:{files:[]},browserPath:'LABELLED_BROWSER',browserRoot:'LABELLED_ROOT',manifestHash:'labelled',browserHash:'labelled'}}
export async function checkConnection(){throw Error('LABELLED_VALIDATION_FORBIDDEN')}
export async function loginBrowser({owner:value,candidate}){
 owner=value;owner.close=async()=>{process.send({fixture:'native-close-called'});throw Error('LABELLED_NATIVE_CLOSE_FORBIDDEN')};owner.id='labelled-owner';owner.account=candidate.username;owner.origin='https://labelled.invalid';owner.page={evaluate:async(_,o)=>({documentId:o.documentId,account:o.account,loginomBuild:'7.4.2'})};owner.context={pages:()=>[owner.page]}
 process.send({fixture:'native-entered',deadline:owner.deadline,generation:owner.generation,chat:owner.chat,signal_aborted:owner.signal.aborted})
 owner.signal.addEventListener('abort',()=>process.send({fixture:'native-aborted',reason:owner.signal.reason instanceof Error?{message:owner.signal.reason.message}:owner.signal.reason}),{once:true})
 try{return await new Promise((resolve,reject)=>{resolveLogin=resolve;rejectLogin=reject})}finally{process.send({fixture:'native-settled'})}
}
export async function createSession(_,options){const directory=options.managed.directory;await mkdir(directory,{recursive:true});await writeFile(join(directory,'labelled-browser.json'),'{}');session={directory,metadata:{sessionId:'labelled-session',clientRevision:'labelled'},browserConfig:join(directory,'labelled-browser.json')};return session}
export async function createBridge(){return {server:{connect:async()=>{}},hasActiveWork:()=>false,hasUnsettledWork:()=>false,readPreReady:()=>{throw Error('LABELLED_READ_AUTHORITY_NOT_PROVIDED')}}}
export const fixtureRequire=name=>{
 if(name.includes('client/index'))return {Client:class{async connect(){}}}
 if(name.includes('inMemory'))return {InMemoryTransport:{createLinkedPair:()=>[{},{}]}}
 if(name==='@playwright/mcp')return {createConnection:async()=>({connect:async()=>{process.send({fixture:'managed-late-await'});await new Promise(resolve=>setTimeout(resolve,100))}})}
 throw Error('Unexpected labelled require '+name)
}
