import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {Client} from '../../client/node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js';
import {StdioClientTransport,getDefaultEnvironment} from '../../client/node_modules/@modelcontextprotocol/sdk/dist/esm/client/stdio.js';
import {createSession} from '../../client/lib/session.mjs';
import {makeWorkspacePrepareCode} from '../../client/lib/workspace.mjs';
import {createNodeTargetBrowserAdapter} from '../../client/lib/node-target-browser.mjs';
import {createExecutionJournal} from '../../client/lib/execution-journal.mjs';
import {prepareNodeTarget} from '../../client/lib/node-target.mjs';
process.umask(0o077);
const option=name=>{const i=process.argv.indexOf(name);if(i<0||!process.argv[i+1])throw new Error('Required '+name);return process.argv[i+1];};
const loginomUrl=option('--loginom-url'),loginomUser=option('--loginom-user');
if(new URL(loginomUrl).username||new URL(loginomUrl).password)throw new Error('Credentials must not be in URL');
const dir=process.cwd()+'/.dock/add-nodes-v2/mcp-'+Date.now();await fs.mkdir(dir+'/runtime',{recursive:true,mode:0o700});await fs.symlink(process.env.HOME+'/.loginom-dock/runtime/browsers',dir+'/runtime/browsers');
const session=await createSession({stateDir:dir,agent:'codex',adapterRevision:'nodes-v2-diagnostic',mode:'executor-replay'});
const record=createExecutionJournal({directory:dir,metadata:session.metadata});
await fs.writeFile(dir+'/session.json',JSON.stringify(session.metadata,null,2));
const client=new Client({name:'node-target-diagnostic',version:'1'});
const transport=new StdioClientTransport({command:process.execPath,args:[session.browserCli,'--config',session.browserConfig],env:{...getDefaultEnvironment(),PLAYWRIGHT_BROWSERS_PATH:session.browserRoot},stderr:'pipe'});transport.stderr?.on('data',()=>{});
let sequence=0;
try{
 await client.connect(transport);
 const execute=async(code,opts={})=>{const reply=await client.callTool({name:'browser_run_code_unsafe',arguments:{code}},undefined,{timeout:opts.timeout??120000});await fs.writeFile(dir+'/'+(++sequence)+'.json',JSON.stringify(reply));const text=reply.content.filter(x=>x.type==='text').map(x=>x.text).join('\n');const raw=text.match(/^### Result\n([\s\S]*?)(?:\n### |$)/)?.[1];if(!raw)throw new Error(text);return JSON.parse(raw);};
 await client.callTool({name:'browser_navigate',arguments:{url:loginomUrl}});
 const loginCode=async(page,user)=>{await page.locator('[data-tid="LoginForm;Login;edtUsername"] input').fill(user);await page.locator('[data-tid="LoginForm;Login;btnLogin"]').click();return true;};
 await execute(`async page => (${loginCode.toString()})(page,${JSON.stringify(loginomUser)})`);
 await execute('async page => {await page.locator("[data-tid=\\"MF;cntMain;tlbMainToolbar;btnAvatar\\"]").waitFor({timeout:15000});return true;}');
 let prep=await execute(makeWorkspacePrepareCode({loginomUrl,compatibility:{profile_id:'loginom-7.4.2-macos-chromium',loginom_build:'7.4.2',platform:'macos',browser:'chromium'},sessionId:session.metadata.sessionId,operationId:'prepare',timeoutMs:15000}));
 console.log(JSON.stringify({prepared:prep.status,window:prep.window,evidence:dir}));
 const actions=JSON.parse(await fs.readFile('executor/catalog/actions.json','utf8')).actions;const selectors=JSON.parse(await fs.readFile('executor/catalog/selectors.json','utf8')).selectors;
 const adapter=createNodeTargetBrowserAdapter({execute,pinned:{actions:new Map(actions.map(a=>[a.action_key,a])),selectors:new Map(selectors.map(s=>[s.symbol,s]))},origin:new URL(loginomUrl).origin,build:'7.4.2'});
 const allCases=[['right64',64,0],['right96',96,0],['right160',160,0],['right240',240,0],['below96',0,96],['diagonal',96,96],['left96',-96,0],['above96',0,-96],['new_source_left',-96,0,'imports.text','transform.calculator'],['move_near',96,0,'transform.calculator','imports.text',true]];
 const cases=process.argv.includes('--extended')?[['alt',96,0],['union',96,0,'transform.union_data'],['two_sources',160,0],['retain',96,0],['remove',96,0],['move_near',96,0,'transform.calculator','imports.text',true]]:allCases.filter(c=>c[0]!=='move_near');
 const results=[];
 for(const [name,dx,dy,type='transform.calculator',baseType='imports.text',move=false]of cases.filter(c=>process.argv.includes('--probe')?c[0]==='move_near':!process.argv.includes('--finish')||['move_near','remove'].includes(c[0]))){
  if(results.length)prep=await execute(makeWorkspacePrepareCode({loginomUrl,compatibility:{profile_id:'loginom-7.4.2-macos-chromium',loginom_build:'7.4.2',platform:'macos',browser:'chromium'},sessionId:session.metadata.sessionId,operationId:'prepare-'+name,timeoutMs:15000}));
  const request={document_id:prep.document_id,workflow_ref:prep.workflow_ref,target:{kind:'new',type:baseType,label:'Base',position:{x:320,y:280}},inputs:[]};
  const base=await prepareNodeTarget({request,operation:{id:name+'-base',deadline:Date.now()+45000},adapter,record});assert.equal(base.status,'SUCCEEDED',JSON.stringify(base));
  if(name==='two_sources'){const second=await prepareNodeTarget({request:{...request,target:{...request.target,label:'Second',position:{x:360,y:240}}},operation:{id:name+'-second',deadline:Date.now()+45000},adapter,record});assert.equal(second.status,'SUCCEEDED',JSON.stringify(second));}
  request.target={kind:'new',type,position:move?{x:720,y:480}:{x:320+dx,y:280+dy}};
  if(name==='retain'||name==='remove'){request.target.label='Target';request.inputs=name==='retain'?[{source:base.node.ref,output:0,input:0}]:[];const operation={id:name+'-target',deadline:Date.now()+45000};const result=await prepareNodeTarget({request,operation,adapter,record});await fs.writeFile(dir+'/'+name+'-operation.json',JSON.stringify({result,operation},null,2));assert.equal(result.status,'SUCCEEDED',JSON.stringify(result));assert.equal(result.auto_created_links.length,1);assert.equal(result.effects.filter(e=>e.kind==='connect').length,0);assert.equal(result.effects.filter(e=>e.kind==='remove_link').length,name==='remove'?1:0);const replay=await prepareNodeTarget({request,operation,adapter,record});assert.equal(replay.replayed,true);results.push({name,result,replay});await fs.writeFile(dir+'/autolink-study.json',JSON.stringify(results,null,2));console.log(JSON.stringify({name,result}));continue;}
  let before=await adapter.observe(request,Date.now()+20000),receipt;
  try{
   if(name==='alt')await execute('async page=>{await page.keyboard.down("Alt");return true;}');
   for(let attempt=0;attempt<3;attempt++){
    const fresh=await adapter.observe(request,Date.now()+20000);assert.deepEqual(fresh,before);
    receipt=await adapter.mutate({id:name+'-drop-'+attempt,kind:'create',parameters:request.target,before},Date.now()+30000);
    if(!(receipt.status==='NOT_APPLIED'&&receipt.effect_possible===false&&receipt.cleanup_complete===true))break;
   }
  }finally{if(name==='alt')await execute('async page=>{await page.keyboard.up("Alt");return true;}');}
  assert.equal(receipt.status,'SUCCEEDED',JSON.stringify(receipt));let after=await adapter.observe(request,Date.now()+20000);
  const added=after.nodes.find(n=>!before.nodes.some(b=>b.ref.node_id===n.ref.node_id));
  if(move&&process.argv.includes('--probe')){const probe=await execute(`async page=>page.evaluate(id=>{const d=bg.app.Application.FInstance.FMainForm.Items.Workspace.getActiveTab().Controller.FController.FDiagram;const n=d.FNodes.FCollection.find(n=>n.FGuid===id),e=d.FmxGraph.view.getState(n.FCell).shape.node;return {html:e.outerHTML,scale:d.FmxGraph.view.scale,initial:d.FInitialScale,elements:[e,...e.parentElement.querySelectorAll('[data-tid]')].map(e=>{const b=e.getBoundingClientRect(),hit=document.elementFromPoint(b.x+b.width/2,b.y+b.height/2);return {tid:e.getAttribute('data-tid'),box:{x:b.x,y:b.y,width:b.width,height:b.height},hit:hit?.outerHTML.slice(0,1000)}})};},${JSON.stringify(added.ref.node_id)})`);await fs.writeFile(dir+'/move-hit-test.json',JSON.stringify(probe,null,2));console.log(JSON.stringify({probe:dir+'/move-hit-test.json'}));continue;}
  if(move){before=after;const moveResult=await prepareNodeTarget({request:{...request,target:{kind:'existing',type,ref:added.ref,position:{x:416,y:280}}},operation:{id:name+'-move',deadline:Date.now()+30000},adapter,record});await fs.writeFile(dir+'/move-operation.json',JSON.stringify(moveResult,null,2));assert.equal(moveResult.status,'SUCCEEDED',JSON.stringify(moveResult));after=await adapter.observe(request,Date.now()+20000);assert.deepEqual(after.links,before.links);}


  const result={name,before,after,receipt};results.push(result);await fs.writeFile(dir+'/autolink-study.json',JSON.stringify(results,null,2));console.log(JSON.stringify({name,nodes:after.nodes.map(n=>({id:n.ref.node_id,type:n.type,position:n.position})),links:after.links}));
 }
 console.log(JSON.stringify({status:'PASS',cases:results.length,evidence:dir}));
}finally{await client.close();}
