import {Server} from '@modelcontextprotocol/sdk/server/index.js';
import {CallToolRequestSchema,ListToolsRequestSchema} from '@modelcontextprotocol/sdk/types.js';
import {readHostSession} from './host-session.mjs';
export const nativeSessionKey='_dock_session_token';
const routingFailureSchema={type:'object',properties:{kind:{const:'dock_routing_failure'},status:{enum:['FAILED','AMBIGUOUS']},effect_possible:{type:'boolean'},error:{type:'object',properties:{code:{type:'string'},message:{type:'string'}},required:['code','message']}},required:['kind','status','effect_possible','error']};
const failure=(code,message,effect=false)=>{
 const value={kind:'dock_routing_failure',status:effect?'AMBIGUOUS':'FAILED',effect_possible:effect,error:{code,message}};
 return {content:[{type:'text',text:JSON.stringify(value)}],structuredContent:value};
};

// Hermes Desktop shares one named MCP connection across tasks. Each native
// conversation gets an independent Dock bridge, artifact store and browser.
// Entries are never evicted/reassigned after a failed call or an idle period.
export async function createHermesRouter({config,createClient,limit=16,readSession=readHostSession}) {
 const routes=new Map();let closed=false,closing;
 const discovery=await createClient(null);
 let tools;
 try{tools=(await discovery.client.listTools()).tools;}finally{const result=await discovery.close();if(result?.browser_transport_closed!==true||result.browser_process_terminated!==true||result.clipboard_leases_retained!==0)throw Error('Discovery cleanup unconfirmed');}
 const names=new Set(tools.map(tool=>tool.name));
 const server=new Server({name:'loginom-dock',version:config.adapterRevision},{capabilities:{tools:{}},instructions:'Use dock_prepare. The native Hermes adapter supplies task routing; never construct routing tokens.'});
 server.setRequestHandler(ListToolsRequestSchema,async()=>({tools:tools.map(tool=>({...structuredClone(tool),...(tool.outputSchema?{outputSchema:{type:'object',anyOf:[structuredClone(tool.outputSchema),routingFailureSchema]}}:{}),inputSchema:{...structuredClone(tool.inputSchema),properties:{...structuredClone(tool.inputSchema.properties),[nativeSessionKey]:{type:'string',description:'Private native Hermes routing. Filled by the installed hook; do not set this field.'}}}}))}));
 server.setRequestHandler(CallToolRequestSchema,async(request,extra)=>{
  if(closed)return failure('DOCK_ROUTER_CLOSED','The Dock connection has closed.');
  if(!names.has(request.params.name))return failure('UNKNOWN_TOOL','Unknown Dock tool.');
  let native;
  try{native=await readSession(config,request.params.arguments?.[nativeSessionKey]);}
  catch{return failure('NATIVE_SESSION_REQUIRED','The native Hermes task identity is missing or expired. Check that the matching Dock plugin is loaded; attaching the file again does not fix plugin routing.');}
  extra.signal.throwIfAborted();
  if(closed)return failure('DOCK_ROUTER_CLOSED','The Dock connection has closed.');
  let route=routes.get(native.session_id);
  if(!route){
   if(routes.size>=limit)return failure('DOCK_SESSION_LIMIT','Dock has reached its active task limit. Existing task state has been preserved.');
   // Retain rejected creation promises: a new ID or automatic retry must not
   // silently replace a possibly prepared session after a lost response.
   route=Promise.resolve().then(()=>createClient(native));routes.set(native.session_id,route);
  }
  let selected;
  try{selected=await route;}catch{return failure('DOCK_SESSION_START_FAILED','This task could not start its isolated Dock session. Its failed attempt has been retained for diagnosis.');}
  if(closed)return failure('DOCK_ROUTER_CLOSED','The Dock connection has closed.');
  extra.signal.throwIfAborted();
  const args={...request.params.arguments};delete args[nativeSessionKey];
  try{return await selected.client.callTool({...request.params,arguments:args},undefined,{signal:extra.signal,timeout:1800000});}
  catch{return failure('DOCK_SESSION_CALL_UNCERTAIN','The isolated Dock call could not be confirmed. Inspect the original operation in this task; do not repeat a mutation under a new ID.',true);}
 });
 return {server,close(){
  closed=true;
  closing??=(async()=>{
   const results=await Promise.allSettled([...routes.entries()].map(async([session_id,pending])=>{const item=await pending;return {session_id,...await item.close()};}));
   const confirmed=results.every(r=>r.status==='fulfilled'&&r.value?.browser_transport_closed===true&&r.value.browser_process_terminated===true&&r.value.clipboard_leases_retained===0);
   if(confirmed)await server.close();
   return {browser_transport_closed:confirmed,browser_process_terminated:confirmed,
    clipboard_leases_retained:confirmed?0:null,task_cleanup:results.map(r=>r.status==='fulfilled'?r.value:{status:'UNCONFIRMED'})};
  })();
  return closing;
 }};
}
