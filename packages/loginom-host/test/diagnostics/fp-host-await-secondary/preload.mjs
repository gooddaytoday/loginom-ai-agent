import cp from 'node:child_process'
import {syncBuiltinESMExports} from 'node:module'
import {readFileSync} from 'node:fs'
const {managed,derived,mode}=JSON.parse(readFileSync(process.env.FP_FIXTURE_MAP,'utf8')),original=cp.fork,children=[]
cp.fork=(entry,args,options)=>{if(entry!==managed)throw Error('Unexpected managed entry');const child=original(derived,mode?[mode]:args,options);children.push(child);const send=child.send.bind(child);child.send=(m,...rest)=>{if(m.operation==='start')child.originalStart=m;return send(m,...rest)};child.on('message',m=>{if(m.fixture)process.send(m);if(m.id==='wrong-cancel')process.send({fixture:'wrong-cancel-result',error:m.error})});child.on('exit',(code,signal)=>process.send({fixture:'managed-exit',code,signal}));return child}
syncBuiltinESMExports()
const originalSend=process.send.bind(process);let startupId,dropped
process.send=(m,...rest)=>{if(mode==='drop-start-reply' && m.id===startupId && m.result?.ready===true){dropped=m;originalSend({fixture:'dropped-start-reply'});return true}return originalSend(m,...rest)}
process.on('message',m=>{if(m.method==='start')startupId=m.id;if(m.fixture==='deliver-late' && dropped){originalSend(dropped);dropped=undefined}})

process.on('message',m=>{if(m.fixture){for(const child of children)if(child.connected){if(m.fixture==='wrong-cancel'){const start=child.originalStart;child.send({id:'wrong-cancel',operation:'readonly.preReady.cancel',input:{phase:'startup',requestId:start.id,startupRequestId:start.input.fpStartup.requestId,authorization:'f'.repeat(64),harness:'field-parameters-preservation-v1',deadline:start.deadline,rejection:{kind:'value',is_undefined:false,value:false}}})}else child.send(m)};if(m.fixture==='finish'){process.removeAllListeners('disconnect');Promise.all(children.map(child=>child.exitCode===null?new Promise(resolve=>child.once('exit',resolve)):Promise.resolve())).then(()=>process.disconnect())}}})

import fsp from 'node:fs/promises'
const originalRead=fsp.readFile;let manifestReject,manifestResolve
fsp.readFile=(path,...args)=>{if(mode==='hold-host-manifest' && String(path).endsWith('/resource-manifest.json')) {
 process.send({fixture:'host-manifest-entered'})
 return new Promise((resolve,reject)=>{manifestReject=reject;manifestResolve=()=>originalRead(path,...args).then(resolve,reject)})
}return originalRead(path,...args)}
syncBuiltinESMExports()
process.on('message',m=>{if(m.fixture==='reject-host-read'){const x=m.rejection;manifestReject(x.is_undefined?undefined:x.value)}if(m.fixture==='resolve-host-read')manifestResolve()})
