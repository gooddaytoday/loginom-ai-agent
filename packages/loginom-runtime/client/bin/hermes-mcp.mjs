#!/usr/bin/env node
import {parseArgs} from 'node:util';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {InMemoryTransport} from '@modelcontextprotocol/sdk/inMemory.js';
import {StdioServerTransport} from '@modelcontextprotocol/sdk/server/stdio.js';
import {loadConfig} from '../lib/config.mjs';
import {createSession} from '../lib/session.mjs';
import {createBridge} from '../lib/bridge.mjs';
import {createHermesRouter} from '../lib/hermes-router.mjs';
import {installManagedShutdown} from '../lib/managed-shutdown.mjs';
import {observeMcpTransport} from '../lib/mcp-origin.mjs';
process.umask(0o077);
let router,starting;
const clients=new Set();
const shutdown=installManagedShutdown({close:async()=>{
 await starting?.catch(()=>{});
 if(router)return router.close();
 const results=await Promise.allSettled([...clients].map(item=>item.close()));
 const confirmed=results.every(r=>r.status==='fulfilled'&&r.value?.browser_transport_closed===true&&r.value.browser_process_terminated===true&&r.value.clipboard_leases_retained===0);
 return {browser_transport_closed:confirmed,browser_process_terminated:confirmed,clipboard_leases_retained:confirmed?0:null};
}});
try{
 const {values}=parseArgs({options:{config:{type:'string'},'state-dir':{type:'string'},agent:{type:'string'},'adapter-revision':{type:'string'},'acceptance-cleanup-package':{type:'string'}}});
 const config=await loadConfig({configPath:values.config,stateDir:values['state-dir'],agent:values.agent,adapterRevision:values['adapter-revision'],acceptanceCleanupPackage:values['acceptance-cleanup-package']??null});
 if(config.agent!=='hermes')throw Error('Hermes router requires Hermes');
 starting=createHermesRouter({config,async createClient(native){
  const session=await createSession(config);
  if(native)session.metadata.hostInputOwner={agent:'hermes',session_id:native.session_id};
  const bridge=await createBridge(config,session),client=new Client({name:'loginom-dock-native-hermes-router',version:config.adapterRevision});
  let closing;
  const item={client,close(){closing??=(async()=>{const result=await bridge.close();if(result.browser_transport_closed===true&&result.browser_process_terminated===true&&result.clipboard_leases_retained===0)await client.close();return result;})();return closing;}};
  clients.add(item);
  const [local,remote]=InMemoryTransport.createLinkedPair();
  try{await bridge.server.connect(observeMcpTransport(remote,session,{source:'native_hermes_router'}));await client.connect(local);}
  catch(error){await item.close();throw error;}
  return item;
 }});
 router=await starting;
 await router.server.connect(new StdioServerTransport());
}catch{process.stderr.write('Loginom Dock: не удалось запустить изолированные сессии Hermes.\n');process.exitCode=1;await shutdown.shutdown(1);}
