// Actual bridge + real kernel clipboard lease; SDK/browser transport are doubles.
// No native Loginom, browser, system clipboard or model is used.
import test,{mock} from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm,mkdir} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';import {createRequire} from 'node:module';
import {Client as ProtocolClient} from '@modelcontextprotocol/sdk/client/index.js';
import {InMemoryTransport} from '@modelcontextprotocol/sdk/inMemory.js';
const root=process.env.CLASSIC_RUNTIME_CLIENT??fileURLToPath(new URL('../..',import.meta.url));
const lib=p=>pathToFileURL(join(root,'lib',p)).href,require=createRequire(join(root,'package.json'));
const clipboard=await import(lib('clipboard.mjs'));let current;
class ExternalClient{
 constructor(identity){this.browser=identity.name==='loginom-dock-browser';this.f=current}
 async connect(transport){this.transport=transport}
 async listTools(){return {tools:this.browser?[{name:'browser_run_code_unsafe',inputSchema:{type:'object'}}]:[]}}
 async callTool(){return {isError:true,content:[{type:'text',text:'fixture unconfirmed paste'}]}}
 async close(){if(this.browser){this.f.calls++;if(this.f.scenario.startsWith('browser-'))throw this.f.rejected}
 else if(this.f.scenario==='remote-failure')throw 0;
 if(this.f.scenario!=='missing-exit')this.transport?.onclose?.();}
}
class ExternalTransport{}
mock.module(require.resolve('@modelcontextprotocol/sdk/client/index.js').replace('/dist/cjs/','/dist/esm/'),{namedExports:{Client:ExternalClient}});
mock.module(require.resolve('@modelcontextprotocol/sdk/client/stdio.js').replace('/dist/cjs/','/dist/esm/'),{namedExports:{StdioClientTransport:ExternalTransport,getDefaultEnvironment:()=>({})}});
mock.module(require.resolve('@modelcontextprotocol/sdk/client/streamableHttp.js').replace('/dist/cjs/','/dist/esm/'),{namedExports:{StreamableHTTPClientTransport:ExternalTransport}});
mock.module(lib('clipboard.mjs'),{namedExports:{...clipboard,runClipboardTransfer:options=>clipboard.runClipboardTransfer({...options,acquire:async()=>{
 current.lease=await clipboard.acquireClipboard({port:0});return current.lease;
}})}});
const {createBridge}=await import(lib('bridge.mjs'));
async function fixture(scenario,rejected){const f=current={scenario,rejected,calls:0,releases:0},directory=await mkdtemp(join(tmpdir(),'classic-retention-'));
 f.directory=directory;f.bridge=await createBridge({endpoint:'https://dock.invalid/mcp',apiKey:'fixture-nonsecret',mode:'classic'},{directory,async save(){},metadata:{client:'fixture',clientRevision:'fixture',sessionId:'fixture'},browserCli:'/fixture/not-launched',browserConfig:'/fixture/not-read',browserRoot:'/fixture',artifactStore:{async releaseUploads(){f.releases++}}});
 f.client=new ProtocolClient({name:'fixture',version:'1'});const [a,b]=InMemoryTransport.createLinkedPair();await Promise.all([f.bridge.server.connect(b),f.client.connect(a)]);
 assert.equal((await f.client.callTool({name:'dock_clipboard_transfer',arguments:{copy:'async()=>{}',paste:'async()=>{}',confirm:'async()=>false'}})).isError,true);
 await assert.rejects(clipboard.acquireClipboard({port:f.lease.port,timeoutMs:20}),/holds the clipboard/);
 f.cleanup=async()=>{await f.lease?.release();await f.client.close();await rm(directory,{recursive:true,force:true})};return f;
}
for(const [label,value]of [['Error',Error('fixture lost browser reply')],['undefined',undefined],['null',null],['false',false],['zero',0],['empty','']])test('classic unknown browser close '+label+' keeps the first receipt and does not replay',async()=>{
 const f=await fixture('browser-'+label,value);try{const first=await f.bridge.close(),bytes=await readFile(join(f.directory,'shutdown-receipt.json'));assert.equal(first.cleanup_complete,false);assert.equal(first.browser_transport_closed,false);assert.equal(first.clipboard_leases_retained,1);assert.equal(f.releases,0);
 const r=first.rejection;if(value instanceof Error)assert.equal(r.message,value.message);else{assert.equal(r.is_undefined,value===undefined);assert.equal(r.value,value===undefined?null:value)}
 assert.strictEqual(await f.bridge.close(),first);assert.deepEqual(await readFile(join(f.directory,'shutdown-receipt.json')),bytes);assert.equal(f.calls,1,'same unknown transport must not be closed again');await assert.rejects(clipboard.acquireClipboard({port:f.lease.port,timeoutMs:20}),/holds the clipboard/);
 }finally{await f.cleanup()}
});
for(const scenario of ['missing-exit','remote-failure','success'])test('classic '+scenario+' concurrent close is one transaction',async()=>{
 const f=await fixture(scenario);try{const [a,b]=await Promise.all([f.bridge.close(),f.bridge.close()]);assert.strictEqual(a,b);assert.strictEqual(await f.bridge.close(),a);assert.equal(f.calls,1);const complete=scenario==='success';assert.equal(a.cleanup_complete,complete);assert.equal(f.releases,complete?1:0);assert.equal(a.clipboard_leases_retained,complete?0:1);
 if(!complete)await assert.rejects(clipboard.acquireClipboard({port:f.lease.port,timeoutMs:20}),/holds the clipboard/);else{const contender=await clipboard.acquireClipboard({port:f.lease.port,timeoutMs:20});await contender.release()}
 }finally{await f.cleanup()}
});
test('classic primary refusal survives receipt write failure and storage repair without transport replay',async()=>{
 const f=await fixture('browser-zero',0);try{await mkdir(join(f.directory,'shutdown-receipt.json'));let original;
 await assert.rejects(f.bridge.close(),error=>{original=error;assert.equal(error.cause,0);return true});const before=await readFile(join(f.directory,'bridge-shutdown-failure.json'));const proof=JSON.parse(before);assert.equal(proof.primary_rejection.value,0);
 await rm(join(f.directory,'shutdown-receipt.json'),{recursive:true});await assert.rejects(f.bridge.close(),error=>error===original);assert.equal(f.calls,1);assert.equal(f.releases,0);assert.deepEqual(await readFile(join(f.directory,'bridge-shutdown-failure.json')),before);await assert.rejects(clipboard.acquireClipboard({port:f.lease.port,timeoutMs:20}),/holds the clipboard/);
 }finally{await f.cleanup()}
});
