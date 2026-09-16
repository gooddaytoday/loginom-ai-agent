import {createActionRuntime} from '../../client/lib/executor.mjs';
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
 const prep=await execute(makeWorkspacePrepareCode({loginomUrl,compatibility:{profile_id:'loginom-7.4.2-macos-chromium',loginom_build:'7.4.2',platform:'macos',browser:'chromium'},sessionId:session.metadata.sessionId,operationId:'prepare',timeoutMs:15000}));
 console.log(JSON.stringify({prepared:prep.status,window:prep.window,evidence:dir}));
 const actions=JSON.parse(await fs.readFile('executor/catalog/actions.json','utf8')).actions;const selectors=JSON.parse(await fs.readFile('executor/catalog/selectors.json','utf8')).selectors;
 const adapter=createNodeTargetBrowserAdapter({execute,pinned:{actions:new Map(actions.map(a=>[a.action_key,a])),selectors:new Map(selectors.map(s=>[s.symbol,s]))},origin:new URL(loginomUrl).origin,build:'7.4.2'});
 const runtime=process.argv.includes('--runtime')?createActionRuntime({pinned:{actions:new Map(actions.map(a=>[a.action_key,a])),selectors:new Map(selectors.map(s=>[s.symbol,s])),pins:{}},execute,onRecord:record,targetOrigin:new URL(loginomUrl).origin,targetBuild:'7.4.2'}):null;
 const reorder=v=>Array.isArray(v)?v.map(reorder):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).reverse().map(([k,x])=>[k,reorder(x)])):v;
 const perform=async options=>{if(process.argv.includes('--reorder-keys'))options={...options,request:reorder(options.request)};return runtime?(await runtime.runNodeTarget(options.request,{operationId:options.operation.id})).output:prepareNodeTarget(options);};
 const targets=[['imports.text','Source',96,80],['transform.calculator','Calc',416,80],['transform.union_data','Union',736,80],['transform.reform_columns','Fields',96,320],['transform.filter_data','Filter',416,320],['transform.group_data','Group',736,320],['transform.sorting','Sort',96,560],['transform.join_data','Join',416,560]];let source,filter;let passed=0;
 for(const [type,label,x,y]of targets){const request={document_id:prep.document_id,workflow_ref:prep.workflow_ref,target:{kind:'new',type,label,position:{x,y}},inputs:source?(['transform.union_data','transform.join_data'].includes(type)?(type==='transform.union_data'?[0,1,2]:[0,1]).map(input=>({source,output:0,input})):[{source:process.argv.includes('--alternate-output')&&type==='transform.sorting'?filter:source,output:process.argv.includes('--alternate-output')&&type==='transform.sorting'?1:0,input:0}]):[]};const operation={id:label,deadline:Date.now()+45000};
  const result=await perform({request,operation,adapter,record});await fs.writeFile(dir+'/'+label+'.json',JSON.stringify({request,operation,result},null,2));console.log(JSON.stringify(result));if(result.status!=='SUCCEEDED'){console.log(JSON.stringify(await execute('async page => page.locator("[data-tid]").evaluateAll(es=>es.filter(e=>/Input_Add|AddPort|InputAdd|MessageBox/.test(e.getAttribute("data-tid"))).map(e=>({tid:e.getAttribute("data-tid"),text:e.textContent.slice(0,140)})))')));break;}source??=result.node.ref;if(type==='transform.filter_data')filter=result.node.ref;passed++;const replay=await perform({request,operation,adapter,record});if(replay.status!=='SUCCEEDED'||replay.replayed!==true)throw new Error('Replay did not preserve graph');}
 const independentCode=async page => page.evaluate(()=>{
   const d=bg.app.Application.FInstance.FMainForm.Items.Workspace.getActiveTab().Controller.FController.FDiagram;
   return {types:d.FNodes.FCollection.map(n=>n.FIconCls).filter(t=>t!=='bg-vendor-icon-modelvariables').sort(),
     labels:[...d.FmxGraph.container.querySelectorAll('[data-tid$=";Label;Label"]')].map(e=>e.textContent),
     links:[...d.FmxGraph.container.querySelectorAll('[data-tid]')].map(e=>e.getAttribute('data-tid')).filter(t=>{const suffix=t.split(';Graph;')[1];return suffix&&!suffix.includes(';')&&suffix.split('|').length===4;})};
 });
 const independent=await execute(independentCode.toString());
 assert.equal(passed,8);
 const expectedTypes=['importtextfile','calcdata','uniondata','reformcolumns','filterdata','groupdata','sorting','joindata'].map(t=>'bg-vendor-icon-'+t).sort();
 assert.deepEqual(independent.types,expectedTypes);assert.deepEqual([...independent.labels].sort(),targets.map(t=>t[1]).sort());
 const expectedEdges=['Calc|Input_Data-0','Union|Input_Data-0','Union|Input_Data-1','Union|Input_Data-3','Fields|Input_Data-0','Filter|Input_Data-0','Group|Input_Data-0','Sort|Input_Data-0','Join|Input_Data-0','Join|Input_Data-1'].map(t=>process.argv.includes('--alternate-output')&&t==='Sort|Input_Data-0'?'Filter|Output_Data-1|'+t:'Source|Output_Data-0|'+t).sort();
 assert.deepEqual(independent.links.map(t=>t.split(';Graph;')[1]).sort(),expectedEdges);
 await fs.writeFile(dir+'/independent.json',JSON.stringify({status:'PASS',passed,independent},null,2));console.log(JSON.stringify({status:'PASS',passed,independent}));
}finally{await client.close();}
