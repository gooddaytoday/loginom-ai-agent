// Operator-only graph-phase acceptance surface. Never shipped as node.apply.
import fs from 'node:fs/promises';
import {Server} from '../../client/node_modules/@modelcontextprotocol/sdk/dist/esm/server/index.js';
import {StdioServerTransport} from '../../client/node_modules/@modelcontextprotocol/sdk/dist/esm/server/stdio.js';
import {ListToolsRequestSchema,CallToolRequestSchema} from '../../client/node_modules/@modelcontextprotocol/sdk/dist/esm/types.js';
import {Client} from '../../client/node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js';
import {StdioClientTransport,getDefaultEnvironment} from '../../client/node_modules/@modelcontextprotocol/sdk/dist/esm/client/stdio.js';
import {createSession} from '../../client/lib/session.mjs';
import {createExecutionJournal} from '../../client/lib/execution-journal.mjs';
import {makeWorkspacePrepareCode} from '../../client/lib/workspace.mjs';
import {createActionRuntime,parseCapabilityResult} from '../../client/lib/executor.mjs';
import {NODE_TYPES} from '../../client/lib/node-contracts.mjs';
process.umask(0o077);
const dir=process.env.DOCK_NODE_ACCEPTANCE_DIR,url=process.env.DOCK_NODE_ACCEPTANCE_URL,user=process.env.DOCK_NODE_ACCEPTANCE_USER;
if(!dir||!url||!user)throw new Error('Explicit operator directory, URL and Loginom user required');
await fs.mkdir(dir+'/runtime',{recursive:true});await fs.symlink(process.env.HOME+'/.loginom-dock/runtime/browsers',dir+'/runtime/browsers');
const session=await createSession({stateDir:dir,agent:'hermes',adapterRevision:'node-target-source-acceptance',mode:'executor-replay'});
if(session.metadata.clientRevision!==process.env.DOCK_NODE_ACCEPTANCE_SHA)throw new Error('Source runtime changed');
await fs.writeFile(dir+'/session.json',JSON.stringify(session.metadata,null,2),{flag:'wx'});
const record=createExecutionJournal({directory:dir,metadata:session.metadata});
const browser=new Client({name:'node-target-source',version:'1'});
const transport=new StdioClientTransport({command:process.execPath,args:[session.browserCli,'--config',session.browserConfig],env:{...getDefaultEnvironment(),PLAYWRIGHT_BROWSERS_PATH:session.browserRoot},stderr:'pipe'});transport.stderr?.on('data',()=>{});await browser.connect(transport);
let seq=0,prep;
const raw=async code=>{const response=await browser.callTool({name:'browser_run_code_unsafe',arguments:{code}},undefined,{timeout:90000});
 const text=response.content.filter(c=>c.type==='text').map(c=>c.text).join('\n'),match=text.match(/^### Result\n([\s\S]*?)(?:\n### |$)/);if(!match)throw new Error(text.slice(0,1000));return JSON.parse(match[1]);};
const actions=JSON.parse(await fs.readFile(new URL('../../executor/catalog/actions.json',import.meta.url))).actions;
const selectors=JSON.parse(await fs.readFile(new URL('../../executor/catalog/selectors.json',import.meta.url))).selectors;
const runtime=createActionRuntime({pinned:{actions:new Map(actions.map(a=>[a.action_key,a])),selectors:new Map(selectors.map(s=>[s.symbol,s])),pins:session.metadata},targetOrigin:new URL(url).origin,targetBuild:'7.4.2',onRecord:record,
 execute:async(code,options)=>parseCapabilityResult(await browser.callTool({name:'browser_run_code_unsafe',arguments:{code}},undefined,options))});
const independent=async()=>raw(`async page=>page.evaluate(()=>{const d=bg.app.Application.FInstance.FMainForm.Items.Workspace.getActiveTab().Controller.FController.FDiagram;
 const nodes=d.FNodes.FCollection.filter(n=>n.FIconCls!=='bg-vendor-icon-modelvariables').map(n=>{const tid=d.FmxGraph.view.getState(n.FCell).shape.node.getAttribute('data-tid');return {id:n.FGuid,type:n.FIconCls,position:{x:n.FCell.geometry.x,y:n.FCell.geometry.y,width:n.FCell.geometry.width,height:n.FCell.geometry.height},tid:tid.split(';Graph;')[1],label:document.querySelector('[data-tid='+JSON.stringify(tid+';Label;Label')+']')?.textContent};});
 const links=[...d.FmxGraph.container.querySelectorAll('[data-tid]')].map(e=>e.getAttribute('data-tid').split(';Graph;')[1]).filter(t=>t&&!t.includes(';')&&t.split('|').length===4);
 return {nodes,links,system_nodes:d.FNodes.FCollection.filter(n=>n.FIconCls==='bg-vendor-icon-modelvariables').map(n=>({id:n.FGuid,type:n.FIconCls})),build:bg.app.Version,window:{width:innerWidth,height:innerHeight,outer_width:outerWidth,outer_height:outerHeight}};})`);
const str={type:'string'},ref={type:'object',properties:{document_id:str,workflow_id:str,node_id:str},required:['document_id','workflow_id','node_id'],additionalProperties:false};
const requestSchema={type:'object',properties:{document_id:str,workflow_ref:{type:'object',description:'Copy the complete workflow_ref returned by dock_prepare, including navigation_path.'},target:{type:'object',properties:{kind:{enum:['new','existing']},type:{enum:Object.keys(NODE_TYPES)},label:str,ref,position:{type:'object',properties:{x:{type:'number'},y:{type:'number'}},required:['x','y'],additionalProperties:false}},required:['kind','type'],additionalProperties:false},inputs:{type:'array',items:{type:'object',properties:{source:ref,output:{type:'integer',minimum:0},input:{type:'integer',minimum:0}},required:['source','output','input'],additionalProperties:false}}},required:['document_id','workflow_ref','target','inputs'],additionalProperties:false};
const tools=[{name:'dock_prepare',description:'Prepare one isolated Loginom draft for this graph-phase acceptance. Returns document_id and complete workflow_ref. Repeated calls return the same draft.',inputSchema:{type:'object',properties:{},additionalProperties:false}},
{name:'dock_action_describe',description:'Read selected node type cards. node_types is an array of type IDs. Configuration is outside this graph-only acceptance.',inputSchema:{type:'object',properties:{node_types:{type:'array',items:{enum:Object.keys(NODE_TYPES)}}},required:['node_types'],additionalProperties:false}},
{name:'node_target',description:'Acceptance-only internal graph phase: create or find one typed node, optionally label/position it and connect requested inputs. No configuration, execution or saving. New targets require position; existing targets require exact ref. Port indexes are zero-based among tabular ports. Returns exact refs and effects. Use stable unique operation_id; replay never repeats gestures. Resume only after inspect confirms cleanup and the previous effect.',inputSchema:{type:'object',properties:{operation_id:str,request:requestSchema,resume:{type:'boolean'}},required:['operation_id','request'],additionalProperties:false}},
{name:'dock_operation_inspect',description:'Read-only reconciliation of an operation; never resumes remaining gestures.',inputSchema:{type:'object',properties:{operation_id:str},required:['operation_id'],additionalProperties:false}},
{name:'graph_observe',description:'Read the actual full small graph independently of operation summaries.',inputSchema:{type:'object',properties:{},additionalProperties:false}}];
const server=new Server({name:'loginom-dock',version:'node-target-acceptance'},{capabilities:{tools:{}}});server.setRequestHandler(ListToolsRequestSchema,async()=>({tools}));
server.setRequestHandler(CallToolRequestSchema,async({params:{name,arguments:a={}}})=>{
 const id=++seq;let result;
 try{
  if(name==='dock_prepare'){
   if(!prep){runtime.assertPreparationAllowed();await browser.callTool({name:'browser_navigate',arguments:{url}});await raw(`async page=>{await page.locator('[data-tid="LoginForm;Login;edtUsername"] input').fill(${JSON.stringify(user)});await page.locator('[data-tid="LoginForm;Login;btnLogin"]').click();await page.locator('[data-tid="MF;cntMain;tlbMainToolbar;btnAvatar"]').waitFor({timeout:15000});return true;}`);
    prep=await raw(makeWorkspacePrepareCode({loginomUrl:url,compatibility:{profile_id:'loginom-7.4.2-macos-chromium',loginom_build:'7.4.2',platform:'macos',browser:'chromium'},sessionId:session.metadata.sessionId,operationId:'prepare',timeoutMs:15000}));}
   result=prep;
  }else if(name==='dock_action_describe')result=runtime.describe(a);
  else if(name==='node_target')result=await runtime.runNodeTarget(a.request,{operationId:a.operation_id,resume:a.resume===true});
  else if(name==='dock_operation_inspect')result=await runtime.inspect({operationId:a.operation_id});
  else if(name==='graph_observe')result=await independent();
  else throw new Error('Unknown acceptance tool');
 }catch(error){result={status:'ERROR',error:String(error.message)};}
 const evidence={id,name,arguments:a,result};await fs.writeFile(dir+'/call-'+id+'.json',JSON.stringify(evidence,null,2),{flag:'wx'});
 if(prep){try{await fs.writeFile(dir+'/graph-'+id+'.json',JSON.stringify(await independent(),null,2),{flag:'wx'});}catch(error){await fs.writeFile(dir+'/graph-error-'+id+'.json',JSON.stringify({error:String(error.message)}),{flag:'wx'});}}
 return {content:[{type:'text',text:JSON.stringify(result)}]};
});
await server.connect(new StdioServerTransport());
let closing=false;const close=async()=>{if(closing)return;closing=true;await browser.close();process.exit(0);};process.stdin.on('end',close);process.on('SIGTERM',close);
